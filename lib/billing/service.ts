import { randomUUID } from "node:crypto";
import { databaseClient } from "../db";
import { deliverBillingEmail } from "./email-outbox";
import { billingConfiguration, paystack, PaystackError, type PaystackSubscription, type PaystackTransaction, validatePlan } from "./paystack";
import { hasPremiumAccess, premiumAccessUntil, MONTHLY_AMOUNT, TRIAL_MS, VERIFICATION_AMOUNT } from "./policy";

interface BillingRow {
  user_id: string; state: string; trial_started_at: number | null; trial_ends_at: number | null;
  paid_through: number | null; paystack_customer_code: string | null; paystack_subscription_code: string | null;
  current_reference: string | null; refund_state: string | null;
}
interface AttemptRow { reference: string; user_id: string; kind: string; state: string; email: string }

export async function getBillingAccount(userId: string): Promise<BillingRow | null> {
  const result = await databaseClient().execute({ sql: "SELECT * FROM billing_account WHERE user_id = ?", args: [userId] });
  return (result.rows[0] as unknown as BillingRow | undefined) ?? null;
}

export async function billingStatus(userId: string) {
  const account = await getBillingAccount(userId);
  let canResume = false;
  if (account?.state === "pending" && account.current_reference) {
    const result = await databaseClient().execute({ sql: "SELECT l.reference FROM billing_checkout_link l JOIN billing_attempt a ON a.reference = l.reference WHERE l.reference = ? AND a.user_id = ? AND a.state = 'pending'", args: [account.current_reference, userId] });
    canResume = result.rows.length > 0;
  }
  return {
    state: account?.state ?? "new",
    hasAccess: hasPremiumAccess(account ? { state: account.state, trialEndsAt: account.trial_ends_at, paidThrough: account.paid_through } : null),
    accessUntil: premiumAccessUntil(account ? { state: account.state, trialEndsAt: account.trial_ends_at, paidThrough: account.paid_through } : null),
    trialEndsAt: account?.trial_ends_at ?? null,
    paidThrough: account?.paid_through ?? null,
    trialUsed: account?.trial_started_at != null,
    refundState: account?.refund_state ?? null,
    canManage: Boolean(account?.paystack_subscription_code),
    canResume,
  };
}

export async function startCheckout(user: { id: string; email: string }, kind: "trial" | "paid") {
  const config = billingConfiguration();
  if (process.env.BILLING_ENABLED !== "true") throw new Error("Billing is not configured.");
  if (config.domain === "live" && process.env.PAYSTACK_ALLOW_LIVE !== "true") throw new Error("Live billing has not been enabled.");
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) throw new Error("Subscription emails are not configured.");
  if (!process.env.CRON_SECRET || process.env.CRON_SECRET.length < 32) throw new Error("Billing notifications are not configured.");
  await validatePlan();
  const db = databaseClient();
  const now = Date.now();
  await db.execute({ sql: "INSERT OR IGNORE INTO billing_account (user_id, state, updated_at) VALUES (?, 'new', ?)", args: [user.id, now] });
  const account = await getBillingAccount(user.id);
  if (!account || hasPremiumAccess({ state: account.state, trialEndsAt: account.trial_ends_at, paidThrough: account.paid_through })) {
    throw new Error("You already have access. Manage your existing subscription instead.");
  }
  if (account.paystack_subscription_code) {
    if (kind !== "paid" || account.state !== "cancelled") throw new Error("Manage your existing subscription before starting another one.");
    const previous = await paystack<PaystackSubscription>(`/subscription/${encodeURIComponent(account.paystack_subscription_code)}`);
    const customer = typeof previous.customer === "object" ? previous.customer : null;
    const plan = typeof previous.plan === "object" ? previous.plan : null;
    if (!["cancelled", "completed"].includes(previous.status) || previous.subscription_code !== account.paystack_subscription_code || previous.domain !== config.domain || customer?.customer_code !== account.paystack_customer_code || plan?.plan_code !== config.plan) {
      throw new Error("Your previous subscription must be fully cancelled before starting another one.");
    }
    const detached = await db.execute({ sql: "UPDATE billing_account SET paystack_subscription_code = NULL, updated_at = ? WHERE user_id = ? AND state = 'cancelled' AND paystack_subscription_code = ?", args: [now, user.id, account.paystack_subscription_code] });
    if (detached.rowsAffected !== 1) throw new Error("Subscription status changed. Please refresh and try again.");
  }
  if (kind === "trial" && account.trial_started_at !== null) throw new Error("The free trial has already been used on this account.");
  const reference = `sokafix-${randomUUID()}`;
  const claim = await db.execute({
    sql: "UPDATE billing_account SET state = 'initializing', current_reference = ?, consent_at = ?, updated_at = ? WHERE user_id = ? AND state IN ('new', 'cancelled') AND paystack_subscription_code IS NULL",
    args: [reference, now, now, user.id],
  });
  if (claim.rowsAffected !== 1) throw new Error("A payment is already in progress or needs review. Please contact support.");
  await db.execute({ sql: "INSERT INTO billing_attempt (reference, user_id, kind, state, created_at, updated_at) VALUES (?, ?, ?, 'initializing', ?, ?)", args: [reference, user.id, kind, now, now] });
  try {
    const response = await paystack<{ authorization_url: string; reference: string }>("/transaction/initialize", {
      method: "POST",
      body: {
        email: user.email,
        amount: String(kind === "trial" ? VERIFICATION_AMOUNT : MONTHLY_AMOUNT),
        currency: "NGN",
        reference,
        channels: ["card"],
        callback_url: `${config.baseUrl}/billing/callback`,
        ...(kind === "paid" ? { plan: config.plan } : {}),
        metadata: { purpose: kind === "trial" ? "sokafix_trial_verification" : "sokafix_monthly_subscription" },
      },
    });
    const checkoutUrl = new URL(response.authorization_url);
    if (response.reference !== reference || checkoutUrl.protocol !== "https:" || checkoutUrl.hostname !== "checkout.paystack.com") throw new Error("Invalid checkout response.");
    await db.batch([
      { sql: "INSERT INTO billing_checkout_link (reference, url) VALUES (?, ?)", args: [reference, checkoutUrl.toString()] },
      { sql: "UPDATE billing_attempt SET state = 'pending', updated_at = ? WHERE reference = ?", args: [Date.now(), reference] },
      { sql: "UPDATE billing_account SET state = 'pending', updated_at = ? WHERE user_id = ? AND current_reference = ?", args: [Date.now(), user.id, reference] },
    ], "write");
    return checkoutUrl.toString();
  } catch (error) {
    // An unknown outcome must be reconciled rather than retried automatically.
    const safeFailure = error instanceof PaystackError && error.definitive;
    await db.batch([
      { sql: "UPDATE billing_attempt SET state = ?, updated_at = ? WHERE reference = ?", args: [safeFailure ? "failed" : "needs_review", Date.now(), reference] },
      { sql: "UPDATE billing_account SET state = ?, updated_at = ? WHERE user_id = ? AND current_reference = ?", args: [safeFailure ? "new" : "needs_review", Date.now(), user.id, reference] },
    ], "write");
    throw new Error(safeFailure ? "Paystack could not start checkout. Please try again later." : "Checkout needs review. Please contact support before trying again.");
  }
}

async function getAttempt(reference: string): Promise<AttemptRow | null> {
  const result = await databaseClient().execute({
    sql: "SELECT a.reference, a.user_id, a.kind, a.state, u.email FROM billing_attempt a JOIN user u ON u.id = a.user_id WHERE a.reference = ?",
    args: [reference],
  });
  return (result.rows[0] as unknown as AttemptRow | undefined) ?? null;
}

export async function confirmCheckout(reference: string, expectedUserId?: string) {
  const attempt = await getAttempt(reference);
  if (!attempt || (expectedUserId && attempt.user_id !== expectedUserId)) throw new Error("Payment reference was not found.");
  if (attempt.state === "completed" || attempt.state === "paid_verified") return billingStatus(attempt.user_id);
  if (attempt.state !== "pending") throw new Error("Payment is processing or needs review. Please contact support if it does not update.");
  const db = databaseClient();
  const claim = await db.execute({ sql: "UPDATE billing_attempt SET state = 'verifying', updated_at = ? WHERE reference = ? AND state = 'pending'", args: [Date.now(), reference] });
  if (claim.rowsAffected !== 1) throw new Error("Payment is already being processed.");
  let transaction: PaystackTransaction;
  try {
    transaction = await paystack<PaystackTransaction>(`/transaction/verify/${encodeURIComponent(reference)}`);
  } catch {
    await db.execute({ sql: "UPDATE billing_attempt SET state = 'pending', updated_at = ? WHERE reference = ? AND state = 'verifying'", args: [Date.now(), reference] });
    throw new Error("Unable to verify payment. Please try again.");
  }
  if (transaction.status !== "success") {
    const terminal = ["failed", "abandoned", "reversed"].includes(transaction.status);
    await db.batch([
      { sql: "UPDATE billing_attempt SET state = ?, updated_at = ? WHERE reference = ?", args: [terminal ? "failed" : "pending", Date.now(), reference] },
      ...(terminal ? [{ sql: "UPDATE billing_account SET state = 'new', updated_at = ? WHERE user_id = ? AND current_reference = ?", args: [Date.now(), attempt.user_id, reference] }] : []),
    ], "write");
    throw new Error(terminal ? "Payment was not successful." : "Payment has not completed yet.");
  }
  const config = billingConfiguration();
  const expectedAmount = attempt.kind === "trial" ? VERIFICATION_AMOUNT : MONTHLY_AMOUNT;
  if (transaction.reference !== reference || transaction.amount !== expectedAmount || transaction.currency !== "NGN" || transaction.domain !== config.domain || transaction.channel !== "card" || typeof transaction.customer?.email !== "string" || transaction.customer.email.toLowerCase() !== attempt.email.toLowerCase() || !transaction.customer.customer_code || !transaction.authorization?.authorization_code || !transaction.authorization.reusable || transaction.authorization.channel !== "card") {
    if (attempt.kind === "trial" && transaction.reference === reference && transaction.amount === VERIFICATION_AMOUNT && transaction.currency === "NGN" && transaction.domain === config.domain) {
      // Even an unusable card authorization must not turn the disclosed refundable fee into a retained charge.
      await requestTrialRefund(attempt).catch(() => console.error("Verification refund needs review."));
    }
    await markReview(attempt);
    throw new Error("Payment details need review. Please contact support.");
  }

  if (attempt.kind === "paid") {
    // Paystack creates the subscription itself for a transaction initialized with a plan.
    // Activation waits for a separately verified subscription.create event.
    await db.batch([
      { sql: "UPDATE billing_attempt SET state = 'paid_verified', updated_at = ? WHERE reference = ?", args: [Date.now(), reference] },
      { sql: "UPDATE billing_account SET state = 'paid_pending', paystack_customer_code = ?, updated_at = ? WHERE user_id = ? AND current_reference = ?", args: [transaction.customer.customer_code, Date.now(), attempt.user_id, reference] },
    ], "write");
    return billingStatus(attempt.user_id);
  }

  try {
    // Only this claimed attempt may request a refund or create a subscription.
    // Unknown provider outcomes are not retried automatically, avoiding duplicate billing.
    await db.execute({ sql: "UPDATE billing_attempt SET state = 'processing', updated_at = ? WHERE reference = ? AND state = 'verifying'", args: [Date.now(), reference] });
    await requestTrialRefund(attempt);
    const startedAt = Date.now();
    const endsAt = Math.ceil((startedAt + TRIAL_MS) / 1000) * 1000;
    const created = await paystack<{ subscription_code: string; domain: string; status: string; email_token: string }>("/subscription", {
      method: "POST",
      body: { customer: transaction.customer.customer_code, plan: config.plan, authorization: transaction.authorization.authorization_code, start_date: new Date(endsAt).toISOString() },
    });
    if (!created.subscription_code || created.domain !== config.domain) throw new Error("Subscription response needs review.");
    const subscription = await paystack<PaystackSubscription>(`/subscription/${encodeURIComponent(created.subscription_code)}`);
    const nextPayment = subscription.next_payment_date ? Date.parse(subscription.next_payment_date) : NaN;
    const customer = typeof subscription.customer === "object" ? subscription.customer : null;
    const plan = typeof subscription.plan === "object" ? subscription.plan : null;
    if (subscription.subscription_code !== created.subscription_code || subscription.domain !== config.domain || subscription.status !== "active" || customer?.customer_code !== transaction.customer.customer_code || plan?.plan_code !== config.plan || plan.amount !== MONTHLY_AMOUNT || plan.currency !== "NGN" || plan.interval !== "monthly" || !Number.isFinite(nextPayment) || nextPayment < endsAt) {
      // Attempt to stop a schedule that cannot be verified; any uncertainty needs manual review.
      if (created.email_token) await paystack("/subscription/disable", { method: "POST", body: { code: created.subscription_code, token: created.email_token } }).catch(() => undefined);
      throw new Error("Subscription schedule needs review.");
    }
    const emailKey = `trial-started/${reference}`;
    await db.batch([
      { sql: "UPDATE billing_account SET state = 'trialing', trial_started_at = ?, trial_ends_at = ?, paystack_customer_code = ?, paystack_subscription_code = ?, updated_at = ? WHERE user_id = ? AND current_reference = ?", args: [startedAt, endsAt, transaction.customer.customer_code, created.subscription_code, Date.now(), attempt.user_id, reference] },
      { sql: "UPDATE billing_attempt SET state = 'completed', updated_at = ? WHERE reference = ?", args: [Date.now(), reference] },
      { sql: "INSERT OR IGNORE INTO billing_email (event_key, recipient, subject, body, state, created_at) VALUES (?, ?, ?, ?, 'pending', ?)", args: [emailKey, attempt.email, "Your SokaFix trial has started", `Your seven-day SokaFix trial is active until ${new Date(endsAt).toISOString()}. Your ₦50 card verification refund has been requested. Your ₦5,000 monthly subscription is scheduled to start after the trial unless you cancel. Manage it from your SokaFix billing page.`, Date.now()] },
    ], "write");
    await deliverBillingEmail(emailKey).catch(() => console.error("Trial confirmation email is pending."));
    return billingStatus(attempt.user_id);
  } catch {
    await markReview(attempt);
    throw new Error("Your card verification or subscription needs review. Please contact support before trying again.");
  }
}

async function requestTrialRefund(attempt: AttemptRow) {
  const db = databaseClient();
  await db.execute({ sql: "UPDATE billing_account SET refund_state = 'requesting', updated_at = ? WHERE user_id = ? AND current_reference = ?", args: [Date.now(), attempt.user_id, attempt.reference] });
  await paystack<unknown>("/refund", { method: "POST", body: { transaction: attempt.reference, amount: VERIFICATION_AMOUNT, reference: `refund-${attempt.reference}` } });
  await db.execute({ sql: "UPDATE billing_account SET refund_state = 'requested', updated_at = ? WHERE user_id = ? AND current_reference = ? AND refund_state = 'requesting'", args: [Date.now(), attempt.user_id, attempt.reference] });
}

async function markReview(attempt: AttemptRow) {
  const now = Date.now();
  await databaseClient().batch([
    { sql: "UPDATE billing_attempt SET state = 'needs_review', updated_at = ? WHERE reference = ?", args: [now, attempt.reference] },
    { sql: "UPDATE billing_account SET state = 'needs_review', updated_at = ? WHERE user_id = ? AND current_reference = ?", args: [now, attempt.user_id, attempt.reference] },
  ], "write");
}

export async function subscriptionManagementLink(userId: string): Promise<string> {
  const account = await getBillingAccount(userId);
  if (!account?.paystack_subscription_code) throw new Error("No subscription is available to manage.");
  const data = await paystack<{ link: string }>(`/subscription/${encodeURIComponent(account.paystack_subscription_code)}/manage/link`);
  const url = new URL(data.link);
  if (url.protocol !== "https:" || url.hostname !== "paystack.com") throw new Error("Invalid management link.");
  return url.toString();
}

export async function resumeCheckoutLink(userId: string): Promise<string> {
  const result = await databaseClient().execute({
    sql: "SELECT l.url FROM billing_checkout_link l JOIN billing_attempt a ON a.reference = l.reference JOIN billing_account b ON b.current_reference = a.reference AND b.user_id = a.user_id WHERE a.user_id = ? AND a.state = 'pending' AND b.state = 'pending'",
    args: [userId],
  });
  const value = result.rows[0]?.url;
  if (typeof value !== "string") throw new Error("No pending checkout is available.");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "checkout.paystack.com") throw new Error("Invalid checkout link.");
  return url.toString();
}

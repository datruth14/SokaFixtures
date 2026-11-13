import { databaseClient } from "../db";
import { deliverBillingEmail, queueBillingEmail } from "./email-outbox";
import { billingConfiguration, paystack, type PaystackSubscription, type PaystackTransaction } from "./paystack";
import { confirmCheckout } from "./service";
import { MONTHLY_AMOUNT } from "./policy";

type PaystackEvent = { event?: string; data?: Record<string, unknown> };
type ObjectValue = Record<string, unknown>;
const object = (value: unknown): ObjectValue => value && typeof value === "object" ? value as ObjectValue : {};

async function verifiedSubscription(code: string): Promise<{ subscription: PaystackSubscription; next: number | null }> {
  const config = billingConfiguration();
  const subscription = await paystack<PaystackSubscription>(`/subscription/${encodeURIComponent(code)}`);
  const plan = typeof subscription.plan === "object" ? subscription.plan : null;
  const next = subscription.next_payment_date ? Date.parse(subscription.next_payment_date) : null;
  if (subscription.subscription_code !== code || subscription.domain !== config.domain || !plan || plan.plan_code !== config.plan || plan.amount !== MONTHLY_AMOUNT || plan.currency !== "NGN" || plan.interval !== "monthly" || (next !== null && !Number.isFinite(next))) {
    throw new Error("Subscription verification failed.");
  }
  return { subscription, next };
}

export async function processPaystackEvent(event: PaystackEvent): Promise<void> {
  const db = databaseClient();
  const data = object(event.data);
  const type = event.event ?? "";
  if (["refund.processed", "refund.failed", "refund.needs-attention"].includes(type)) {
    const reference = data.transaction_reference;
    const config = billingConfiguration();
    if (typeof reference !== "string" || data.domain !== config.domain || data.currency !== "NGN" || Number(data.amount) !== 5000) return;
    const state = type === "refund.processed" ? "processed" : "needs_attention";
    await db.execute({
      sql: "UPDATE billing_account SET refund_state = ?, updated_at = ? WHERE user_id = (SELECT user_id FROM billing_attempt WHERE reference = ? AND kind = 'trial') AND (refund_state IN ('requesting', 'requested') OR (? = 'processed' AND refund_state = 'needs_attention'))",
      args: [state, Date.now(), reference, state],
    });
    if (state === "needs_attention") {
      const account = await db.execute({ sql: "SELECT u.email FROM billing_attempt a JOIN user u ON u.id = a.user_id JOIN billing_account b ON b.user_id = a.user_id WHERE a.reference = ? AND a.kind = 'trial' AND b.refund_state = 'needs_attention'", args: [reference] });
      if (account.rows[0]) {
        const key = `refund-attention/${reference}`;
        await queueBillingEmail(key, String(account.rows[0].email), "Your SokaFix verification refund needs attention", "The ₦50 card-verification refund could not be completed automatically. Please contact SokaFix support to arrange the refund. Do not send card details by email.");
        await deliverBillingEmail(key);
      }
    }
    return;
  }
  if (type === "charge.success" && typeof data.reference === "string") {
    const result = await db.execute({ sql: "SELECT reference FROM billing_attempt WHERE reference = ?", args: [data.reference] });
    if (result.rows.length) {
      await confirmCheckout(data.reference);
      await deliverBillingEmail(`trial-started/${data.reference}`);
    }
    return;
  }

  if (type === "subscription.create" && typeof data.subscription_code === "string") {
    const { subscription, next } = await verifiedSubscription(data.subscription_code);
    if (subscription.status !== "active" || next === null || next <= Date.now() || typeof subscription.customer !== "object") return;
    const customer = subscription.customer;
    const match = await db.execute({
      sql: "SELECT b.user_id, b.current_reference, b.paystack_subscription_code, a.kind FROM billing_account b JOIN user u ON u.id = b.user_id LEFT JOIN billing_attempt a ON a.reference = b.current_reference WHERE lower(u.email) = lower(?)",
      args: [customer.email],
    });
    const row = match.rows[0];
    if (!row || row.kind !== "paid" || typeof row.current_reference !== "string" || (row.paystack_subscription_code && row.paystack_subscription_code !== subscription.subscription_code)) return;
    await confirmCheckout(row.current_reference);
    const verifiedAccount = await db.execute({ sql: "SELECT paystack_customer_code FROM billing_account WHERE user_id = ? AND current_reference = ?", args: [String(row.user_id), row.current_reference] });
    if (verifiedAccount.rows[0]?.paystack_customer_code !== customer.customer_code) throw new Error("Subscription customer did not match the verified payment.");
    const now = Date.now();
    const activated = await db.execute({
      sql: "UPDATE billing_account SET state = 'active', paystack_customer_code = ?, paystack_subscription_code = ?, paid_through = ?, updated_at = ? WHERE user_id = ? AND current_reference = ? AND state = 'paid_pending' AND EXISTS (SELECT 1 FROM billing_attempt WHERE reference = ? AND state = 'paid_verified')",
      args: [customer.customer_code, subscription.subscription_code, next, now, String(row.user_id), row.current_reference, row.current_reference],
    });
    if (activated.rowsAffected || (await db.execute({ sql: "SELECT user_id FROM billing_account WHERE user_id = ? AND paystack_subscription_code = ? AND state = 'active'", args: [String(row.user_id), subscription.subscription_code] })).rows.length) {
      const key = `subscription-started/${subscription.subscription_code}`;
      await queueBillingEmail(key, customer.email, "Your SokaFix subscription is active", `Your ₦5,000 SokaFix subscription is active. Your next scheduled payment date is ${new Date(next).toISOString()}. Manage or cancel your subscription from your SokaFix billing page.`);
      await deliverBillingEmail(key);
    }
    return;
  }

  if (type === "invoice.update" && (data.paid === true || data.paid === 1)) {
    const code = object(data.subscription).subscription_code;
    const reference = object(data.transaction).reference;
    if (typeof code !== "string" || typeof reference !== "string") return;
    const accountResult = await db.execute({
      sql: "SELECT b.user_id, b.paystack_customer_code, b.paid_through, u.email FROM billing_account b JOIN user u ON u.id = b.user_id WHERE b.paystack_subscription_code = ?",
      args: [code],
    });
    const account = accountResult.rows[0];
    if (!account) return;
    const config = billingConfiguration();
    const transaction = await paystack<PaystackTransaction>(`/transaction/verify/${encodeURIComponent(reference)}`);
    const { subscription, next } = await verifiedSubscription(code);
    if (transaction.status !== "success" || transaction.reference !== reference || transaction.amount !== MONTHLY_AMOUNT || transaction.currency !== "NGN" || transaction.domain !== config.domain || transaction.customer?.customer_code !== account.paystack_customer_code || subscription.status !== "active" || next === null || next <= Date.now()) throw new Error("Subscription payment verification failed.");
    const eventKey = `invoice-paid/${reference}`;
    await db.batch([
      { sql: "UPDATE billing_account SET state = 'active', paid_through = MAX(COALESCE(paid_through, 0), ?), updated_at = ? WHERE user_id = ? AND paystack_subscription_code = ? AND NOT EXISTS (SELECT 1 FROM billing_event WHERE event_key = ?)", args: [next, Date.now(), String(account.user_id), code, eventKey] },
      { sql: "INSERT OR IGNORE INTO billing_event (event_key, received_at) VALUES (?, ?)", args: [eventKey, Date.now()] },
      { sql: "INSERT OR IGNORE INTO billing_email (event_key, recipient, subject, body, state, created_at) VALUES (?, ?, ?, ?, 'pending', ?)", args: [eventKey, String(account.email), "SokaFix subscription payment received", `Your ₦5,000 SokaFix subscription payment was received. Your next scheduled payment date is ${new Date(next).toISOString()}. Manage your subscription from your SokaFix billing page.`, Date.now()] },
    ], "write");
    await deliverBillingEmail(eventKey);
    return;
  }

  if (["subscription.not_renew", "subscription.disable", "invoice.payment_failed"].includes(type)) {
    const code = type.startsWith("subscription.") ? data.subscription_code : object(data.subscription).subscription_code;
    if (typeof code !== "string") return;
    const { subscription } = await verifiedSubscription(code);
    const state = subscription.status === "non-renewing" ? "nonrenewing" : subscription.status === "cancelled" || subscription.status === "completed" ? "cancelled" : subscription.status === "attention" ? "past_due" : null;
    if (state) {
      await db.execute({ sql: "UPDATE billing_account SET state = ?, updated_at = ? WHERE paystack_subscription_code = ?", args: [state, Date.now(), code] });
      if (type === "subscription.not_renew" || type === "invoice.payment_failed") {
        const account = await db.execute({ sql: "SELECT u.email FROM billing_account b JOIN user u ON u.id = b.user_id WHERE b.paystack_subscription_code = ?", args: [code] });
        if (account.rows[0]) {
          const identifier = String(data.invoice_code ?? subscription.next_payment_date ?? code);
          const key = `${type === "invoice.payment_failed" ? "payment-failed" : "subscription-cancelled"}/${code}/${identifier}`;
          const subject = type === "invoice.payment_failed" ? "Your SokaFix payment needs attention" : "Your SokaFix subscription will not renew";
          const text = type === "invoice.payment_failed" ? "Your SokaFix subscription payment could not be collected. Visit your SokaFix billing page to review your subscription and update your payment method." : "Your SokaFix subscription is set not to renew. You can view its status from your SokaFix billing page.";
          await queueBillingEmail(key, String(account.rows[0].email), subject, text);
          await deliverBillingEmail(key);
        }
      }
    }
  }
}

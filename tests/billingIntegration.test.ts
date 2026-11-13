import { strict as assert } from "node:assert";
import { mkdirSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { databaseClient } from "../lib/db";
import { billingStatus, confirmCheckout, resumeCheckoutLink, startCheckout } from "../lib/billing/service";
import { processPaystackEvent } from "../lib/billing/webhook";

test("trial, refunds, renewals and duplicate events use verified provider data", async () => {
  const testDirectory = join(tmpdir(), "opencode");
  mkdirSync(testDirectory, { recursive: true });
  process.env.TURSO_DATABASE_URL = `file:${join(testDirectory, `sokafix-billing-${randomUUID()}.db`)}`;
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
  process.env.PAYSTACK_SECRET_KEY = "sk_test_mock";
  process.env.PAYSTACK_PLAN_CODE = "PLN_test";
  process.env.BILLING_ENABLED = "true";
  process.env.RESEND_API_KEY = "re_test_mock";
  process.env.RESEND_FROM_EMAIL = "SokaFix <billing@example.com>";
  process.env.CRON_SECRET = "test-cron-secret-at-least-32-characters";
  const db = databaseClient();
  const sql = readFileSync("db/migrations/0001_accounts_and_billing.sql", "utf8");
  await db.batch(sql.split("-- statement-breakpoint").map((statement) => statement.trim()).filter(Boolean), "write");
  const now = Date.now();
  await db.execute({ sql: 'INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") VALUES (?, ?, ?, 1, ?, ?)', args: ["user-1", "Test", "trial@example.com", now, now] });
  await db.execute({ sql: 'INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") VALUES (?, ?, ?, 1, ?, ?)', args: ["user-2", "Test", "paid@example.com", now, now] });
  await db.execute({ sql: 'INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") VALUES (?, ?, ?, 1, ?, ?)', args: ["user-3", "Test", "unusable@example.com", now, now] });
  await db.execute({ sql: 'INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") VALUES (?, ?, ?, 1, ?, ?)', args: ["user-4", "Test", "timeout@example.com", now, now] });
  const plan = { plan_code: "PLN_test", amount: 500000, currency: "NGN", interval: "monthly", domain: "test" };
  const users = new Map<string, { email: string; kind: string; customer: string }>();
  let refunds = 0;
  let subscriptions = 0;
  let refundTimeout = false;
  let nextPayment = "";
  let subscriptionStatus = "active";
  let selectedCustomer = { customer_code: "CUS_trial", email: "trial@example.com" };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    let data: unknown;
    if (url === "https://api.resend.com/emails") return Response.json({ id: "mock-email" });
    if (url.endsWith("/plan/PLN_test")) data = plan;
    else if (url.endsWith("/transaction/initialize")) {
      const reference = String(body.reference);
      const email = String(body.email);
      users.set(reference, { email, kind: body.plan ? "paid" : "trial", customer: body.plan ? "CUS_paid" : "CUS_trial" });
      data = { reference, authorization_url: "https://checkout.paystack.com/mock" };
    } else if (url.includes("/transaction/verify/")) {
      const reference = decodeURIComponent(url.split("/").at(-1)!);
      const user = users.get(reference) ?? (reference === "renewal-1" ? { email: "trial@example.com", kind: "paid", customer: "CUS_trial" } : null);
      assert.ok(user, `Unknown transaction ${reference}`);
      data = { status: "success", reference, amount: user.kind === "trial" ? 5000 : 500000, currency: "NGN", domain: "test", channel: "card", paid_at: new Date().toISOString(), customer: { id: 42, customer_code: user.customer, email: user.email }, authorization: { authorization_code: "AUTH_mock", reusable: user.email !== "unusable@example.com", channel: "card" } };
    } else if (url.endsWith("/refund")) {
      refunds += 1;
      assert.match(String(body.reference), /^refund-sokafix-/);
      if (refundTimeout) throw new Error("Simulated timeout after refund request");
      data = { id: 1, status: "pending" };
    } else if (url.endsWith("/subscription") && init?.method === "POST") {
      subscriptions += 1;
      nextPayment = String(body.start_date);
      data = { subscription_code: "SUB_trial", domain: "test", status: "active", email_token: "mock" };
    } else if (url.includes("/subscription/")) {
      const code = url.split("/").at(-1)!;
      data = { subscription_code: code, domain: "test", status: subscriptionStatus, next_payment_date: nextPayment, customer: selectedCustomer, plan };
    } else throw new Error(`Unexpected network request: ${url}`);
    return Response.json({ status: true, data });
  };
  try {
    await startCheckout({ id: "user-1", email: "trial@example.com" }, "trial");
    const trialRef = (await db.execute("SELECT current_reference FROM billing_account WHERE user_id = 'user-1'")).rows[0].current_reference as string;
    assert.equal((await billingStatus("user-1")).canResume, true);
    assert.equal(await resumeCheckoutLink("user-1"), "https://checkout.paystack.com/mock");
    await assert.rejects(resumeCheckoutLink("user-2"));
    await assert.rejects(confirmCheckout(trialRef, "user-2"));
    const results = await Promise.allSettled([confirmCheckout(trialRef, "user-1"), confirmCheckout(trialRef, "user-1")]);
    assert.ok(results.some((result) => result.status === "fulfilled"));
    assert.equal(refunds, 1);
    assert.equal(subscriptions, 1);
    assert.equal((await billingStatus("user-1")).hasAccess, true);
    await processPaystackEvent({ event: "refund.processed", data: { transaction_reference: trialRef, domain: "test", currency: "NGN", amount: "5000" } });
    assert.equal((await billingStatus("user-1")).refundState, "processed");
    await processPaystackEvent({ event: "refund.failed", data: { transaction_reference: trialRef, domain: "test", currency: "NGN", amount: "5000" } });
    assert.equal((await billingStatus("user-1")).refundState, "processed");
    await processPaystackEvent({ event: "charge.success", data: { reference: trialRef } });
    assert.equal(refunds, 1);
    process.env.BILLING_ENABLED = "false";
    await assert.rejects(startCheckout({ id: "user-2", email: "paid@example.com" }, "paid"));
    nextPayment = new Date(Date.now() + 35 * 24 * 60 * 60 * 1000).toISOString();
    await processPaystackEvent({ event: "invoice.update", data: { paid: true, subscription: { subscription_code: "SUB_trial" }, transaction: { reference: "renewal-1" } } });
    assert.equal((await billingStatus("user-1")).state, "active");
    const paidThrough = (await billingStatus("user-1")).paidThrough;
    nextPayment = new Date(Date.now() + 65 * 24 * 60 * 60 * 1000).toISOString();
    await processPaystackEvent({ event: "invoice.update", data: { paid: true, subscription: { subscription_code: "SUB_trial" }, transaction: { reference: "renewal-1" } } });
    assert.equal((await billingStatus("user-1")).paidThrough, paidThrough, "replayed invoices cannot extend access");
    process.env.BILLING_ENABLED = "true";
    subscriptionStatus = "non-renewing";
    await processPaystackEvent({ event: "subscription.not_renew", data: { subscription_code: "SUB_trial" } });
    assert.equal((await billingStatus("user-1")).hasAccess, true);

    subscriptionStatus = "active";
    selectedCustomer = { customer_code: "CUS_paid", email: "paid@example.com" };
    await startCheckout({ id: "user-2", email: "paid@example.com" }, "paid");
    const paidRef = (await db.execute("SELECT current_reference FROM billing_account WHERE user_id = 'user-2'")).rows[0].current_reference as string;
    selectedCustomer = { customer_code: "CUS_wrong", email: "paid@example.com" };
    await assert.rejects(processPaystackEvent({ event: "subscription.create", data: { subscription_code: "SUB_paid" } }));
    assert.equal((await billingStatus("user-2")).hasAccess, false);
    selectedCustomer = { customer_code: "CUS_paid", email: "paid@example.com" };
    await processPaystackEvent({ event: "subscription.create", data: { subscription_code: "SUB_paid" } });
    assert.equal((await billingStatus("user-2")).hasAccess, true);
    await processPaystackEvent({ event: "charge.success", data: { reference: paidRef } });
    assert.equal((await billingStatus("user-2")).hasAccess, true);
    subscriptionStatus = "cancelled";
    nextPayment = "";
    await processPaystackEvent({ event: "subscription.disable", data: { subscription_code: "SUB_paid" } });
    assert.equal((await billingStatus("user-2")).state, "cancelled");
    assert.equal((await billingStatus("user-2")).hasAccess, true, "paid access remains until its expiry");
    await db.execute("UPDATE billing_account SET paid_through = 1 WHERE user_id = 'user-2'");
    await startCheckout({ id: "user-2", email: "paid@example.com" }, "paid");
    assert.equal((await billingStatus("user-2")).canResume, true);

    await startCheckout({ id: "user-3", email: "unusable@example.com" }, "trial");
    const unusableRef = (await db.execute("SELECT current_reference FROM billing_account WHERE user_id = 'user-3'")).rows[0].current_reference as string;
    await assert.rejects(confirmCheckout(unusableRef, "user-3"));
    assert.equal(refunds, 2, "an unusable card still receives a refund request");
    assert.equal((await billingStatus("user-3")).state, "needs_review");
    assert.equal((await billingStatus("user-3")).hasAccess, false);

    await startCheckout({ id: "user-4", email: "timeout@example.com" }, "trial");
    const timeoutRef = (await db.execute("SELECT current_reference FROM billing_account WHERE user_id = 'user-4'")).rows[0].current_reference as string;
    refundTimeout = true;
    await assert.rejects(confirmCheckout(timeoutRef, "user-4"));
    await assert.rejects(confirmCheckout(timeoutRef, "user-4"));
    assert.equal(refunds, 3, "an uncertain refund is not automatically retried");
    assert.equal((await billingStatus("user-4")).state, "needs_review");
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
  }
});

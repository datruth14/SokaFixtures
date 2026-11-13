import { strict as assert } from "node:assert";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { hasPremiumAccess, MONTHLY_AMOUNT, TRIAL_MS, VERIFICATION_AMOUNT, verifyWebhookSignature } from "../lib/billing/policy";

test("trial and paid access expire without another verified payment", () => {
  const now = 100000;
  assert.equal(hasPremiumAccess(null, now), false);
  assert.equal(hasPremiumAccess({ state: "trialing", trialEndsAt: now + 1, paidThrough: null }, now), true);
  assert.equal(hasPremiumAccess({ state: "trialing", trialEndsAt: now, paidThrough: null }, now), false);
  assert.equal(hasPremiumAccess({ state: "active", trialEndsAt: null, paidThrough: now + 1 }, now), true);
  assert.equal(hasPremiumAccess({ state: "active", trialEndsAt: null, paidThrough: now }, now), false);
  assert.equal(hasPremiumAccess({ state: "nonrenewing", trialEndsAt: now + 1, paidThrough: null }, now), true);
  assert.equal(hasPremiumAccess({ state: "needs_review", trialEndsAt: now + 1, paidThrough: null }, now), false);
  assert.equal(MONTHLY_AMOUNT, 500000);
  assert.equal(VERIFICATION_AMOUNT, 5000);
  assert.equal(TRIAL_MS, 7 * 24 * 60 * 60 * 1000);
});

test("legacy Paystack signatures reject tampering", () => {
  const raw = Buffer.from('{"event":"charge.success"}');
  const signature = createHmac("sha512", "sk_test_key").update(raw).digest("hex");
  assert.equal(verifyWebhookSignature(raw, new Headers({ "x-paystack-signature": signature }), "sk_test_key"), true);
  assert.equal(verifyWebhookSignature(Buffer.from("changed"), new Headers({ "x-paystack-signature": signature }), "sk_test_key"), false);
  assert.equal(verifyWebhookSignature(raw, new Headers({ "x-paystack-signature": "invalid" }), "sk_test_key"), false);
});

test("timestamped Paystack signatures enforce freshness and exact raw bytes", () => {
  const raw = Buffer.from('{"event":"charge.success"}');
  const timestamp = 1700000000;
  const signature = createHmac("sha512", "whsec_secret").update(`${timestamp}.`).update(raw).digest("hex");
  const headers = new Headers({ "paystack-signature": `t=${timestamp},v1=whk_test:${signature}` });
  assert.equal(verifyWebhookSignature(raw, headers, "sk_test", "whsec_secret", timestamp + 300), true);
  assert.equal(verifyWebhookSignature(raw, headers, "sk_test", "whsec_secret", timestamp + 301), false);
  assert.equal(verifyWebhookSignature(Buffer.from("changed"), headers, "sk_test", "whsec_secret", timestamp), false);
});

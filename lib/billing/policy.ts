import { createHmac, timingSafeEqual } from "node:crypto";

export const MONTHLY_AMOUNT = 500000; // kobo: ₦5,000
export const VERIFICATION_AMOUNT = 5000; // kobo: ₦50, refunded
export const TRIAL_MS = 7 * 24 * 60 * 60 * 1000;

export interface BillingAccess {
  state: string;
  trialEndsAt: number | null;
  paidThrough: number | null;
}

export function premiumAccessUntil(account: BillingAccess | null): number | null {
  if (!account) return null;
  const dates: number[] = [];
  if (account.state === "trialing" || account.state === "nonrenewing") {
    if (account.trialEndsAt !== null) dates.push(account.trialEndsAt);
  }
  if (["active", "nonrenewing", "past_due", "cancelled"].includes(account.state) && account.paidThrough !== null) dates.push(account.paidThrough);
  return dates.length ? Math.max(...dates) : null;
}

export function hasPremiumAccess(account: BillingAccess | null, now = Date.now()): boolean {
  const until = premiumAccessUntil(account);
  return until !== null && until > now;
}

export function verifyWebhookSignature(raw: Buffer, headers: Headers, secretKey: string, signingSecret?: string, now = Math.floor(Date.now() / 1000)): boolean {
  const modern = headers.get("paystack-signature");
  if (modern && signingSecret) {
    let timestamp: number | undefined;
    const signatures: string[] = [];
    for (const part of modern.split(",")) {
      const [key, ...rest] = part.trim().split("=");
      const value = rest.join("=");
      if (key === "t") {
        if (timestamp !== undefined || !/^\d+$/.test(value)) return false;
        timestamp = Number(value);
      } else if (key === "v1") {
        const separator = value.indexOf(":");
        if (separator !== -1) signatures.push(value.slice(separator + 1));
      }
    }
    if (timestamp === undefined || Math.abs(now - timestamp) > 300) return false;
    const expected = createHmac("sha512", signingSecret).update(`${timestamp}.`).update(raw).digest();
    return signatures.some((signature) => /^[a-f0-9]{128}$/.test(signature) && timingSafeEqual(expected, Buffer.from(signature, "hex")));
  }
  const legacy = headers.get("x-paystack-signature") ?? "";
  if (!/^[a-f0-9]{128}$/.test(legacy)) return false;
  const expected = createHmac("sha512", secretKey).update(raw).digest();
  return timingSafeEqual(expected, Buffer.from(legacy, "hex"));
}

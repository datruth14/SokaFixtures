import { timingSafeEqual } from "node:crypto";
import { databaseClient } from "@/lib/db";
import { deliverBillingEmail, queueBillingEmail } from "@/lib/billing/email-outbox";
import { PAYMENTS_ENABLED } from "@/lib/features";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!PAYMENTS_ENABLED) return Response.json({ skipped: "Payments are disabled." }, { headers: { "Cache-Control": "no-store" } });
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response("Cron is not configured", { status: 503 });
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return new Response("Unauthorized", { status: 401 });
  try {
    const db = databaseClient();
    const now = Date.now();
    const trials = await db.execute({
      sql: "SELECT b.user_id, b.trial_ends_at, u.email FROM billing_account b JOIN user u ON u.id = b.user_id WHERE b.state = 'trialing' AND b.trial_ends_at > ? AND b.trial_ends_at <= ? AND NOT EXISTS (SELECT 1 FROM billing_email e WHERE e.event_key = 'trial-reminder/' || b.user_id || '/' || b.trial_ends_at) ORDER BY b.trial_ends_at LIMIT 100",
      args: [now, now + 3 * 24 * 60 * 60 * 1000],
    });
    for (const trial of trials.rows) {
      const endsAt = Number(trial.trial_ends_at);
      const key = `trial-reminder/${String(trial.user_id)}/${endsAt}`;
      await queueBillingEmail(key, String(trial.email), "Your SokaFix trial is ending", `Your SokaFix trial ends on ${new Date(endsAt).toISOString()}. Unless you cancel, your ₦5,000 monthly subscription is scheduled to start after the trial. Visit your SokaFix billing page to manage or cancel it.`);
    }
    const pending = await db.execute("SELECT event_key FROM billing_email WHERE state = 'pending' ORDER BY created_at LIMIT 100");
    let failed = 0;
    for (const email of pending.rows) {
      try { await deliverBillingEmail(String(email.event_key)); } catch { failed += 1; }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    return Response.json({ processed: pending.rows.length, failed }, { status: failed ? 503 : 200, headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Billing email processing failed." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

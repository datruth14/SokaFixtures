import { billingConfiguration } from "@/lib/billing/paystack";
import { verifyWebhookSignature } from "@/lib/billing/policy";
import { processPaystackEvent } from "@/lib/billing/webhook";
import { paymentsDisabled } from "@/lib/billing/request";
import { PAYMENTS_ENABLED } from "@/lib/features";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!PAYMENTS_ENABLED) return paymentsDisabled();
  try {
    const { secret } = billingConfiguration();
    const raw = Buffer.from(await request.arrayBuffer());
    if (!verifyWebhookSignature(raw, request.headers, secret, process.env.PAYSTACK_WEBHOOK_SECRET)) return new Response("Invalid signature", { status: 401 });
    const event = JSON.parse(raw.toString("utf8"));
    await processPaystackEvent(event);
    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("Paystack webhook processing failed", error instanceof Error ? error.message : "unknown error");
    return new Response("Processing failed", { status: 503 });
  }
}

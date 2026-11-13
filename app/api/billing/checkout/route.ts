import { authenticatedUser, sameOrigin } from "@/lib/billing/request";
import { startCheckout } from "@/lib/billing/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  try {
    const user = await authenticatedUser(request);
    if (!user) return Response.json({ error: "Sign in to continue." }, { status: 401 });
    const body = await request.json() as { kind?: unknown; consent?: unknown };
    if ((body.kind !== "trial" && body.kind !== "paid") || body.consent !== true) return Response.json({ error: "Please choose a plan and agree to the billing terms." }, { status: 400 });
    const url = await startCheckout(user, body.kind);
    return Response.json({ url }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const safeMessages = ["Billing is not configured.", "Live billing has not been enabled.", "Subscription emails are not configured.", "Billing notifications are not configured.", "You already have access. Manage your existing subscription instead.", "Manage your existing subscription before starting another one.", "The free trial has already been used on this account.", "Your previous subscription must be fully cancelled before starting another one.", "Subscription status changed. Please refresh and try again.", "A payment is already in progress or needs review. Please contact support.", "Paystack could not start checkout. Please try again later.", "Checkout needs review. Please contact support before trying again."];
    const message = error instanceof Error && safeMessages.includes(error.message) ? error.message : "Unable to start checkout. Please contact support.";
    return Response.json({ error: message }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}

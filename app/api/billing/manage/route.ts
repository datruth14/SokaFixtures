import { authenticatedUser, paymentsDisabled, sameOrigin } from "@/lib/billing/request";
import { subscriptionManagementLink } from "@/lib/billing/service";
import { PAYMENTS_ENABLED } from "@/lib/features";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!PAYMENTS_ENABLED) return paymentsDisabled();
  if (!sameOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  try {
    const user = await authenticatedUser(request);
    if (!user) return Response.json({ error: "Sign in to continue." }, { status: 401 });
    return Response.json({ url: await subscriptionManagementLink(user.id) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Subscription management is unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

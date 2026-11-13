import { authenticatedUser } from "@/lib/billing/request";
import { billingStatus } from "@/lib/billing/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await authenticatedUser(request);
    if (!user) return Response.json({ error: "Sign in to continue." }, { status: 401, headers: { "Cache-Control": "no-store" } });
    return Response.json(await billingStatus(user.id), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Account service is unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

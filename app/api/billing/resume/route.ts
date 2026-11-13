import { authenticatedUser, sameOrigin } from "@/lib/billing/request";
import { resumeCheckoutLink } from "@/lib/billing/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  try {
    const user = await authenticatedUser(request);
    if (!user) return Response.json({ error: "Sign in to continue." }, { status: 401 });
    return Response.json({ url: await resumeCheckoutLink(user.id) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Pending checkout is unavailable." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}

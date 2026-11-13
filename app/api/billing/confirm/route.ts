import { authenticatedUser, sameOrigin } from "@/lib/billing/request";
import { confirmCheckout } from "@/lib/billing/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  try {
    const user = await authenticatedUser(request);
    if (!user) return Response.json({ error: "Sign in to continue." }, { status: 401 });
    const body = await request.json() as { reference?: unknown };
    if (typeof body.reference !== "string" || !/^sokafix-[a-f0-9-]{36}$/.test(body.reference)) return Response.json({ error: "Invalid payment reference." }, { status: 400 });
    return Response.json(await confirmCheckout(body.reference, user.id), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const safeMessages = ["Payment reference was not found.", "Payment is processing or needs review. Please contact support if it does not update.", "Payment is already being processed.", "Unable to verify payment. Please try again.", "Payment was not successful.", "Payment has not completed yet.", "Payment details need review. Please contact support.", "Your card verification or subscription needs review. Please contact support before trying again."];
    return Response.json({ error: error instanceof Error && safeMessages.includes(error.message) ? error.message : "Payment could not be verified. Please contact support." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}

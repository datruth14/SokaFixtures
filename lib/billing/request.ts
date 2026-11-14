import { NextResponse } from "next/server";
import { getSession } from "../auth";
import { billingStatus } from "./service";

export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const configured = process.env.BETTER_AUTH_URL;
  if (!origin || !configured) return false;
  try { return origin === new URL(configured).origin; } catch { return false; }
}

export async function authenticatedUser(request: Request) {
  const session = await getSession(request.headers);
  if (!session?.user) return null;
  return { id: session.user.id, email: session.user.email };
}

export async function requirePremium(request: Request): Promise<NextResponse | null> {
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  if (!(await billingStatus(user.id)).hasAccess) return NextResponse.json({ error: "An active trial or subscription is required." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  return null;
}

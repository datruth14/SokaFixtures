import { NextResponse } from "next/server";
import { getFixtures } from "@/lib/scraper";
import { parsePrompt } from "@/lib/promptParser";
import { requirePremium } from "@/lib/billing/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const denied = await requirePremium(request);
    if (denied) return denied;
  } catch {
    return NextResponse.json({ error: "Account service is unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  let prompt: string | undefined;
  try {
    const body = (await request.json()) as { prompt?: unknown };
    prompt = typeof body?.prompt === "string" ? body.prompt.trim() : undefined;
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON with a `prompt` field." },
      { status: 400 },
    );
  }

  if (!prompt) {
    return NextResponse.json(
      { error: "Missing `prompt` field." },
      { status: 400 },
    );
  }

  let knownLeagues: string[] = [];
  try {
    const { fixtures } = await getFixtures({});
    knownLeagues = [...new Set(fixtures.map((f) => f.league))];
  } catch {
    /* league detection is optional */
  }

  const filter = parsePrompt(prompt, knownLeagues);
  return NextResponse.json(filter);
}

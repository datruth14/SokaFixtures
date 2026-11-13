import { NextResponse } from "next/server";
import { getFixtures } from "@/lib/scraper";
import { requirePremium } from "@/lib/billing/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const refresh = searchParams.get("refresh") === "1";

  try {
    const denied = await requirePremium(request);
    if (denied) return denied;
    const data = await getFixtures({ refresh });
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}

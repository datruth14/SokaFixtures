import { getAuth } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(request: Request) {
  try {
    const pathname = new URL(request.url).pathname;
    if (request.method === "POST" && ["/sign-up/email", "/request-password-reset", "/send-verification-email"].some((path) => pathname.endsWith(path)) && (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL)) {
      return Response.json({ error: "Account email service is unavailable." }, { status: 503 });
    }
    return await getAuth().handler(request);
  } catch {
    console.error("Authentication request failed.");
    return Response.json({ error: "Account service is unavailable. Please try again later." }, { status: 503 });
  }
}

export const GET = handle;
export const POST = handle;

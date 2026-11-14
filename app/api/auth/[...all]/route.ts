import { getAuth } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const emailRoutes = ["/sign-up/email", "/request-password-reset", "/send-verification-email"];

async function handle(request: Request) {
  const pathname = new URL(request.url).pathname;
  try {
    if (request.method === "POST" && emailRoutes.some((path) => pathname.endsWith(path)) && (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL)) {
      return Response.json({ error: "Account email service is unavailable." }, { status: 503 });
    }
    return await getAuth().handler(request);
  } catch (error) {
    // Log the cause so failures are diagnosable; the client only gets a generic message.
    const cause = error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : { message: String(error) };
    console.error(`Authentication request failed: ${request.method} ${pathname}`, cause);
    return Response.json({ error: "Account service is unavailable. Please try again later." }, { status: 503 });
  }
}

export const GET = handle;
export const POST = handle;

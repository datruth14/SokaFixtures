import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { database } from "./db";
import * as schema from "./db/schema";
import { sendEmail } from "./email";

let instance: ReturnType<typeof createAuth> | undefined;

function createAuth() {
  const secret = process.env.BETTER_AUTH_SECRET;
  const baseURL = process.env.BETTER_AUTH_URL;
  if (!secret || secret.length < 32 || !baseURL) throw new Error("Authentication is not configured.");
  const origin = new URL(baseURL);
  if (origin.protocol !== "https:" && origin.hostname !== "localhost" && origin.hostname !== "127.0.0.1") {
    throw new Error("BETTER_AUTH_URL must use HTTPS outside local development.");
  }
  return betterAuth({
    secret,
    baseURL,
    trustedOrigins: [origin.origin],
    database: drizzleAdapter(database(), { provider: "sqlite", schema, transaction: true }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 10,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await sendEmail({ to: user.email, subject: "Reset your SokaFix password", text: `Reset your SokaFix password using this link:\n\n${url}\n\nIf you did not request this, ignore this email.` });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await sendEmail({ to: user.email, subject: "Verify your SokaFix email", text: `Verify your SokaFix email using this link:\n\n${url}\n\nIf you did not create an account, ignore this email.` });
      },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 60,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 60, max: 5 },
        "/request-password-reset": { window: 60, max: 3 },
        "/send-verification-email": { window: 60, max: 3 },
      },
    },
    advanced: { ipAddress: { ipAddressHeaders: ["x-real-ip"] } },
  });
}

export function getAuth() {
  if (!instance) instance = createAuth();
  return instance;
}

export async function getSession(headers: Headers) {
  return getAuth().api.getSession({ headers });
}

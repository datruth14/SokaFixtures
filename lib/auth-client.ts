import { createAuthClient } from "better-auth/react";
import { normalizeBaseURL } from "./auth-url";

// Resolve explicitly so a malformed BETTER_AUTH_URL cannot break rendering:
// in the browser the page's own origin is always correct, and on the server
// (SSR/prerender) we only need a valid absolute URL.
function resolveBaseURL() {
  if (typeof window !== "undefined") return window.location.origin;
  const configured = process.env.BETTER_AUTH_URL || process.env.VERCEL_URL;
  return configured ? normalizeBaseURL(configured) : undefined;
}

export const authClient = createAuthClient({ baseURL: resolveBaseURL() });

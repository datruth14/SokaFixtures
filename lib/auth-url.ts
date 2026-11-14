/**
 * Normalizes the public base URL used by Better Auth.
 * Accepts values without a scheme (for example "example.com") and picks
 * http for loopback hosts, https everywhere else.
 */
export function normalizeBaseURL(value: string) {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const host = trimmed.split("/")[0].toLowerCase();
  const isLoopback =
    host === "localhost" || host.startsWith("localhost:") ||
    host === "127.0.0.1" || host.startsWith("127.0.0.1:") ||
    host === "[::1]" || host.startsWith("[::1]:");
  return `${isLoopback ? "http" : "https"}://${trimmed}`;
}

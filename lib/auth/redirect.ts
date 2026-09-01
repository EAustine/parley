/**
 * Where to send someone after sign-in.
 *
 * `next` arrives in a query string, which is attacker-controllable — a crafted
 * link could otherwise bounce a freshly authenticated user to another origin.
 * Only same-site absolute paths are honoured; anything else falls back to the
 * dashboard.
 */
export const DEFAULT_SIGNED_IN_PATH = "/dashboard";

export function safeNextPath(next: string | null | undefined): string {
  if (!next) return DEFAULT_SIGNED_IN_PATH;

  // Must be a rooted path, and must not be protocol-relative (`//evil.com`)
  // or contain a backslash, which some parsers treat as a separator.
  if (!next.startsWith("/")) return DEFAULT_SIGNED_IN_PATH;
  if (next.startsWith("//")) return DEFAULT_SIGNED_IN_PATH;
  if (next.includes("\\")) return DEFAULT_SIGNED_IN_PATH;

  return next;
}

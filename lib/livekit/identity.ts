import { nanoid } from "nanoid";

/**
 * Display names and identities for room tokens.
 *
 * Kept apart from the route handler because these are the rules a reviewer
 * needs to check, and they are easier to check — and to test — when they are
 * not tangled with request plumbing.
 */

export const DISPLAY_NAME_MAX = 40;

/**
 * Trim, collapse whitespace, strip control characters, cap at 40.
 *
 * Control characters are the point. A name is rendered on a tile, in the
 * participants panel, and announced to screen readers; a bidi override or a
 * zero-width joiner in it can reorder the text around it or make two different
 * participants render identically. They are stripped here, once, on the server,
 * rather than escaped at each of the places the name is later drawn.
 *
 * Returns null when nothing usable is left, and the caller decides what that
 * means. It used to say "an error for a guest, simply absent for a host, whose
 * name comes from their account" — but nothing in the product ever writes a
 * name to an account, so "absent" resolved to the host's email address on
 * every join. There is one answer now and it is the guest's: no name, no
 * token. `lib/auth/display-name.ts` has the rest.
 *
 * Account names come through here too. `user_metadata` is writable by the
 * account holder, so it is the same untrusted string arriving by a different
 * road.
 */
export function sanitiseDisplayName(input: unknown): string | null {
  if (typeof input !== "string") return null;

  const cleaned = input
    // C0 and C1 control ranges, plus DEL. Written as escapes rather than
    // literal bytes: a control character typed into a source file is invisible
    // in every diff, editor and review that will ever look at it.
    .replace(/[\u0000-\u001F\u007F-\u009F]/gu, "")
    // Bidi overrides and embedding, and the invisible formatting characters
    // that let one name impersonate another.
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/gu, "")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, DISPLAY_NAME_MAX);

  return cleaned.length > 0 ? cleaned : null;
}

/**
 * A guest identity, generated server-side and never taken from the request.
 *
 * The identity is what LiveKit uses to tell participants apart, so a
 * client-supplied one lets someone collide with, or impersonate, another
 * participant. The display name travels in token metadata instead, where it is
 * a label rather than a key.
 */
export function guestIdentity(): string {
  return `guest_${nanoid(10)}`;
}

/** An authenticated identity, derived from the session's user id. */
export function userIdentity(userId: string): string {
  return `user_${userId}`;
}

/**
 * What pre-join hands to the room.
 *
 * A guest's display name is collected on `/j/[code]` and needed by
 * `/room/[code]`, which mints its own token. Without somewhere to put it the
 * room asks for a token with no name and the endpoint correctly refuses —
 * every guest would hit "a name is needed first" having just typed one.
 *
 * `sessionStorage`, not `localStorage`: a name is for this visit, not
 * remembered forever, and per-tab means two meetings open side by side don't
 * overwrite each other's. Device preferences are the opposite case and live in
 * `localStorage` on purpose.
 *
 * Not the URL. A query parameter would put the name in browser history, in
 * referrer headers, and in any link the person pastes to someone else.
 */

const KEY = "parley:join";

export type JoinHandoff = { code: string; displayName: string };

export function rememberJoin(handoff: JoinHandoff) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(handoff));
  } catch {
    // Private mode. The room falls back to asking, which is a worse experience
    // but an honest one.
  }
}

/** Returns the name only if it was stored for *this* meeting. */
export function recallJoin(code: string): string | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as JoinHandoff;
    return parsed.code === code && parsed.displayName ? parsed.displayName : null;
  } catch {
    return null;
  }
}

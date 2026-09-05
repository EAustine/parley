/**
 * What pre-join hands to the room.
 *
 * Two screens, one join. Pre-join collects the name, checks the meeting will
 * actually admit this person, and mints the token that proves it; the room
 * connects with it. Without somewhere to put that, the room has to ask for
 * everything again — and it did, which cost more than it looked like:
 *
 *   The name. The room minted a token with no name, the endpoint correctly
 *   refused, and every guest hit "a name is needed first" having just typed
 *   one.
 *
 *   The token. Pre-join minted one only to validate, threw it away, and the
 *   room minted a second. Two signed six-hour credentials per join, one of
 *   them never used — and two slots against a rate limit of ten per minute per
 *   IP. Behind one office NAT that is five people joining a meeting, not ten,
 *   and the sixth is told to wait a minute for no reason they can see. Found by
 *   the Phase 4 media tests, which exhausted it doing exactly what a small team
 *   arriving at once would do.
 *
 * `sessionStorage`, not `localStorage`: this belongs to one visit in one tab,
 * so two meetings open side by side do not overwrite each other and nothing
 * outlives the tab. Device preferences are the opposite case and live in
 * `localStorage` on purpose — see `lib/media/devices.ts`.
 *
 * Not the URL. A query parameter would put a name, and a signed credential, in
 * browser history, in referrer headers, and in any link the person pastes to
 * someone else. `sessionStorage` is same-origin and same-tab, which is the same
 * reach the token already has as a variable in this page's memory.
 *
 * The room still mints for itself when there is nothing here — a link opened
 * directly, a tab restored, a browser with storage disabled. Pre-join is the
 * fast path, not the only one.
 */

const KEY = "parley:join";

export type JoinHandoff = {
  code: string;
  displayName: string;
  /** The token pre-join already minted. Reusing it keeps the same identity. */
  token: string;
  serverUrl: string;
  /**
   * What may be published, decided at pre-join and binding on the room — v1.4 A1.
   *
   * These are **consent**, not preference, and the distinction is the whole
   * bug. The room used to take its answer from `lib/media/devices.ts`, which is
   * `localStorage` and therefore a standing choice carried between meetings:
   * "which camera" is the right thing to remember across visits, and "may this
   * meeting see me" is not. Someone who granted nothing at pre-join still met a
   * stored `cameraOn` from a previous meeting — or, worse, met no stored value
   * at all and got `undefined !== false`, which is `true`.
   *
   * So they ride here instead, in `sessionStorage`, whose lifetime is the visit
   * — the same span the consent covers. Absent, unparseable, or storage
   * refused, both are **false**: nothing handed over means nothing was agreed
   * to, and §3.3 makes both-off a first-class arrival rather than a failure.
   */
  micOn: boolean;
  cameraOn: boolean;
};

export function rememberJoin(handoff: JoinHandoff) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(handoff));
  } catch {
    // Private mode. The room falls back to minting its own, which is a slower
    // path but an honest one.
  }
}

/** Returns the handoff only if it was stored for *this* meeting. */
export function recallJoin(code: string): JoinHandoff | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<JoinHandoff>;
    if (parsed?.code !== code) return null;
    if (!parsed.token || !parsed.serverUrl) return null;
    return {
      code,
      displayName: parsed.displayName ?? "",
      token: parsed.token,
      serverUrl: parsed.serverUrl,
      // `=== true`, never `!== false`. The defect this replaces was exactly
      // that comparison one module over: an absent value is not a consent, and
      // the only safe reading of "I don't know" is "no".
      micOn: parsed.micOn === true,
      cameraOn: parsed.cameraOn === true,
    };
  } catch {
    return null;
  }
}

/**
 * The display name on its own, outliving the token it was joined with.
 *
 * §3.11's rejoin routes back through pre-join rather than reconnecting in
 * place, because a dropped connection may have been a device problem and
 * pre-join is where devices get re-confirmed. The cost of that route is that a
 * guest lands on a form they already filled in, having just been dropped from
 * a meeting — the moment they are least inclined to retype anything.
 *
 * Kept under its own key rather than reusing the handoff above. The handoff is
 * only returned when its token and server url are intact, which is exactly
 * what a failed connection has invalidated; a name that survives only when the
 * credential does would be useless in the one case it exists for.
 *
 * The identity does not survive, and that is worth knowing rather than hiding:
 * pre-join mints a fresh token, so a returning guest is a new participant to
 * LiveKit and to anyone watching the room. Only the typing is saved.
 */
const NAME_KEY = "parley:name";

export function rememberName(displayName: string) {
  try {
    const trimmed = displayName.trim();
    if (trimmed) sessionStorage.setItem(NAME_KEY, trimmed);
  } catch {
    // Private mode. The field starts empty, which is the old behaviour.
  }
}

export function recallName(): string {
  try {
    return sessionStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

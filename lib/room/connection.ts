/**
 * Every decision §3.11 asks for, as pure functions over plain strings.
 *
 * No import from `livekit-client`, deliberately. Both enums this maps —
 * `ConnectionQuality` and `ConnectionState` — are *string* enums, so their
 * values are exactly the literals below and nothing is lost by taking strings
 * instead. What is gained is that `npm run check:connection` can compile this
 * file on its own, and that the phase's whole decision table sits in one place
 * a script can pin rather than spread across components.
 *
 * `check:connection` asserts these literals still equal the SDK's enum values.
 * A string union that silently stops matching the library it describes would
 * fail open — every quality reading falling through to "none", every degraded
 * state rendering as healthy, in the phase whose premise is that nothing fails
 * silently.
 */

/** `ConnectionQuality` — the server's verdict on one participant. */
export type Quality = "excellent" | "good" | "poor" | "lost" | "unknown";

/** `ConnectionState` — the local room's own connection. */
export type RoomState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "signalReconnecting";

/** What a tile shows. §3.11's first three rows, from the tile's side. */
export type TileTreatment = "none" | "poor" | "lost";

/**
 * What the room as a whole shows.
 *
 * Six, where §3.11 tabulates four. The two additions are the states §3.11 does
 * not cover and the SDK will produce anyway:
 *
 * - `signal` is `SignalReconnecting`: media keeps flowing while the data
 *   channel is down, so video and audio look perfect while chat and reactions
 *   silently stop. Rendering nothing here would be precisely the failure this
 *   phase exists to prevent, and rendering the critical bar would be a lie —
 *   the meeting is still working.
 * - `lost` is the server reporting our own quality as lost while the SDK still
 *   considers itself connected. §3.11's "Lost (local)" row, before any retry
 *   has started, so there is no attempt count to show yet.
 */
export type RoomPhase =
  | "healthy"
  | "unstable"
  | "lost"
  | "signal"
  | "reconnecting"
  | "failed";

/**
 * §3.11: "Excellent, good → No indicator. Silence means fine."
 *
 * Tested positively, and that is the whole point of the function. The obvious
 * shape — return none for excellent and good, treat everything else as a
 * problem — puts an amber "Unstable connection" on every participant the
 * moment they join, because `unknown` is what the SDK seeds every participant
 * to (`Participant` constructor) and what they reset to after a reconnect.
 * `ParticipantsPanel` shipped that way in Phase 7 and this phase would have
 * copied it onto every face in the grid.
 */
export function treatmentFor(quality: Quality): TileTreatment {
  if (quality === "poor") return "poor";
  if (quality === "lost") return "lost";
  return "none";
}

/**
 * The room's phase, from the SDK's connection state and our own quality.
 *
 * State leads and quality only refines it, because they answer different
 * questions: state is what the client is doing about the connection, quality
 * is what the server thinks of it. When the client is already retrying, what
 * the server thought a moment ago is stale.
 *
 * `connecting` is healthy rather than degraded — the room has not been entered
 * yet and `RoomStage` shows its own screen for it. Reporting a problem before
 * the first connection completes would make every join look like a failure.
 */
export function phaseFor(state: RoomState, localQuality: Quality): RoomPhase {
  if (state === "disconnected") return "failed";
  if (state === "reconnecting") return "reconnecting";
  if (state === "signalReconnecting") return "signal";
  if (state === "connecting") return "healthy";

  // Connected. Quality is the only thing left that can be wrong.
  if (localQuality === "lost") return "lost";
  if (localQuality === "poor") return "unstable";
  return "healthy";
}

/** Whether a phase is worth telling anyone about. */
export function isDegraded(phase: RoomPhase): boolean {
  return phase !== "healthy";
}

/**
 * §9: "announced once per change, never per retry."
 *
 * The transition is the argument, not a throttle, so the property is a
 * function of its inputs and a check can pin it directly. A throttle would
 * have made "once per change" a timing accident, and the retry loop runs on
 * the SDK's schedule rather than ours — there is no interval that is correct
 * for both a fast recovery and a slow one.
 *
 * Recovery is announced too. "Nothing fails silently" cuts both ways: someone
 * who heard the connection drop and never hears it come back is left assuming
 * the meeting is still broken.
 */
export function announcementFor(
  next: RoomPhase,
  previous: RoomPhase | null,
): string | null {
  if (next === previous) return null;
  if (next === "healthy") {
    // Nothing to restore on first render, or after a phase nobody was told
    // about.
    return previous && previous !== "failed" ? "Connection restored." : null;
  }
  return ANNOUNCEMENTS[next];
}

const ANNOUNCEMENTS: Record<Exclude<RoomPhase, "healthy">, string> = {
  unstable: "Your connection is unstable.",
  lost: "Your connection is unstable.",
  signal:
    "Messages you send won't arrive, and you won't see people join or leave.",
  reconnecting: "Connection lost. Reconnecting.",
  failed: "Couldn't reconnect to the meeting.",
};

/**
 * The bar's copy. §3.11 specifies the first verbatim; the rest are drafted to
 * its pattern — what happened, and what is being done about it.
 *
 * The attempt count is not here. It changes on every retry and the bar renders
 * it separately, so that this string stays the thing a screen reader hears
 * once rather than the thing that changes ten times.
 */
export const BAR_COPY: Record<Exclude<RoomPhase, "healthy">, string> = {
  unstable: "Your connection is unstable.",
  // §3.11: "same language as Poor — do not jump to critical for a state that
  // may resolve without a retry." Identical to `unstable` on purpose; the
  // phases stay separate because their causes differ and the check pins both.
  lost: "Your connection is unstable.",
  /**
   * **Measured, not inferred.** §3.11 requires this line to name what is
   * actually broken, and warns that "chat and reactions are unavailable" and
   * "you may not see people join or leave" are different claims.
   *
   * Confirmed by probe: two participants, one taken offline at the network
   * service so only signalling died, on 2026-09-02 against livekit-client
   * 2.x. Observed, in that state:
   *
   *   - a chat message *sent by* the signal-less participant never arrived
   *   - a chat message *sent to* them did arrive — receiving still works
   *   - a third participant joining was not seen by them at all
   *
   * So the first draft of this line was wrong in both directions: it claimed
   * chat was unavailable when only the outbound half is, and it missed
   * participant updates entirely. Reading the SDK had suggested outbound data
   * would survive, because `ensureDataTransportConnected` returns early when
   * the channel is already open. It does not survive. Observation beat
   * inference, which is the reason §3.11 asks for observation.
   */
  signal: "Messages you send won't arrive, and you won't see people join or leave.",
  reconnecting: "Connection lost. Reconnecting…",
  failed: "Couldn't reconnect to the meeting.",
};

/** Which bars carry hue, and which. Rule 5: hue only where it is the meaning. */
export function barTone(phase: RoomPhase): "warning" | "critical" | null {
  // §3.11 puts `lost` here rather than with the critical states: it is "the
  // gap between ConnectionQuality.Lost and reconnection actually starting",
  // and jumping to critical for something that may resolve without a retry
  // spends the alarm before anything has gone wrong. Critical is reserved for
  // states where the meeting has actually stopped.
  if (phase === "unstable" || phase === "signal" || phase === "lost") {
    return "warning";
  }
  if (phase === "reconnecting" || phase === "failed") return "critical";
  return null;
}

/** What a tile says when the person on it has dropped. §3.11's third row. */
export const TILE_COPY: Record<Exclude<TileTreatment, "none">, string> = {
  poor: "Unstable connection",
  lost: "Reconnecting…",
};

/**
 * The delays LiveKit's `DefaultReconnectPolicy` actually uses, vendored so a
 * check can notice them changing under us.
 *
 * We supply a `ReconnectPolicy` only because that object is the one place the
 * attempt number is observable — `RTCEngine.reconnectAttempts` is private and
 * `Room.engine` is `@internal`, so a "visible retry count" has no other
 * source. The schedule itself is the SDK's and stays the SDK's: shortening it
 * would abandon connections the default would have recovered, and its `online`
 * listener already short-circuits the wait when the network returns.
 *
 * Nothing reads the length of this to build "attempt n of 10". The total is a
 * vendored constant that a minor version bump may change, and a count that
 * quietly stops matching reality is worse than no total at all.
 */
export const DEFAULT_RETRY_DELAYS_MS: readonly number[] = [
  0, 300, 1_200, 2_700, 4_800, 7_000, 7_000, 7_000, 7_000, 7_000,
] as const;

/**
 * Ten attempts, 44s of delay before jitter, and from attempt 2 the SDK adds up
 * to a further second of random per retry — so roughly 44–52s of wall clock
 * before `nextRetryDelayInMs` returns null and the meeting is given up on.
 *
 * That is why the acceptance criterion works: a ten-second outage is recovered
 * several attempts before the policy runs out. It is also why the failure
 * modal is not reachable in a ten-second test — see `check:connection` and the
 * untested-paths note in BUILD-PLAN.
 */
export const RETRY_BUDGET_MS = 44_000;

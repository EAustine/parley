/**
 * Who arrived and who left, said once rather than sixteen times.
 *
 * §9, as amended: "The first event announces immediately by name; everything
 * else in the following five seconds is held and announced as one aggregate
 * when the window closes. One further arrival reads as a name, two or more as
 * a count — '3 people joined'. Above eight participants, individual
 * announcements are suppressed entirely."
 *
 * Pure, with the clock passed in. Every threshold below is a boundary that is
 * wrong by one in at least one direction, and a boundary that can only be
 * exercised by waiting five real seconds in a browser is a boundary that does
 * not get exercised.
 *
 * The earlier wording asked for a separate collapse threshold — "more than
 * three events in five seconds collapses to '3 people joined'" — which could
 * not produce its own example: under a strict reading the smallest collapsed
 * number is four. There is no collapse threshold now. The window decides.
 */

export type PresenceEvent = { kind: "joined" | "left"; name: string };

/** How long the window stays open after the first event opens it. */
export const BATCH_WINDOW_MS = 5_000;

/**
 * Above this many participants, names are not worth hearing.
 *
 * §9 suppresses "individual announcements", which is narrower than suppressing
 * everything: in the ten-person standup the section is written about, "8
 * people joined" is the useful sentence and ten names are the thirty seconds
 * lost. So counts survive here and names do not.
 */
export const SUPPRESS_NAMES_ABOVE = 8;

/**
 * Fixed from the first event, not rolling.
 *
 * `lib/room/limits.ts` argues for rolling windows and is right about *deny*
 * rules, where a fixed boundary lets a double burst through. This is a
 * *collapse* rule: the failure a rolling window prevents does not exist here,
 * and a rolling window has no bounded flush latency — a steady trickle would
 * hold the aggregate open forever and announce nothing at all.
 */
export class PresenceBatcher {
  private openedAt: number | null = null;
  private buffered: PresenceEvent[] = [];

  /**
   * Returns what to say now, or null to say nothing yet.
   *
   * `roomSize` is the participant count *including* the local participant,
   * snapshotted by the caller in React rather than read inside the SDK's
   * handler. The SDK adds an arriver to its map before emitting
   * `ParticipantConnected` and deletes a leaver before emitting
   * `ParticipantDisconnected`, so a count read inside the handler is 9 on the
   * way up and 8 on the way down for the same room.
   */
  add(event: PresenceEvent, now: number, roomSize: number): string | null {
    if (this.openedAt !== null && now - this.openedAt < BATCH_WINDOW_MS) {
      this.buffered.push(event);
      return null;
    }

    // No window open, or the last one has expired without being flushed.
    this.openedAt = now;
    this.buffered = [];
    return roomSize > SUPPRESS_NAMES_ABOVE ? null : phraseOne(event);
  }

  /** Has the open window elapsed? False when no window is open. */
  due(now: number): boolean {
    return this.openedAt !== null && now - this.openedAt >= BATCH_WINDOW_MS;
  }

  /**
   * Close the window and say what it held.
   *
   * One held event reads as a name; two or more read as a count, per
   * direction, joins first. Above the threshold only counts survive.
   */
  flush(now: number, roomSize: number): string[] {
    const held = this.buffered;
    this.openedAt = null;
    this.buffered = [];
    if (held.length === 0) return [];

    if (held.length === 1) {
      const phrase = roomSize > SUPPRESS_NAMES_ABOVE ? null : phraseOne(held[0]);
      return phrase ? [phrase] : [];
    }

    const out: string[] = [];
    for (const kind of ["joined", "left"] as const) {
      const n = held.filter((e) => e.kind === kind).length;
      if (n === 0) continue;
      // A direction holding exactly one event inside a mixed batch still reads
      // as a count. Naming one person and counting the others would imply the
      // named one mattered more.
      out.push(`${n} ${n === 1 ? "person" : "people"} ${kind}`);
    }
    return out;
  }

  /**
   * Throw away anything held without announcing it.
   *
   * A reconnection unwinds the whole room: LiveKit emits
   * `ParticipantDisconnected` for every remote participant and then
   * `ParticipantConnected` for every one again, so one blip in a nine-person
   * room is sixteen events arriving on top of "Connection restored." Nothing
   * in §9 or the floor covers this, because nothing in the product could
   * announce presence until now.
   *
   * The participant-count threshold does not save it either: the SDK's map
   * drains as the unwind runs, so the count falls past any threshold mid-burst.
   */
  discard(): void {
    this.openedAt = null;
    this.buffered = [];
  }

  /** For the check, and for asserting the discard actually discarded. */
  get pending(): number {
    return this.buffered.length;
  }
}

function phraseOne(event: PresenceEvent): string {
  return `${event.name} ${event.kind}`;
}

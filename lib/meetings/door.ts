import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { hostIsInRoomLive } from "@/lib/livekit/presence";
import { blockIsLive, blockRetryAfter, type Subject } from "@/lib/meetings/waiting";

/**
 * Who may enter, decided server-side — BUILD-PLAN v1.5 A1 and B1.
 *
 * A1 is explicit that this belongs in the token endpoint and "not the client —
 * the client is the thing being kept out". This module is the decision; the
 * route is the plumbing around it, which keeps the rule readable and lets a
 * check put cases to it directly.
 */

export type Verdict =
  | { kind: "admit" }
  /** Blocked, with the seconds until it lapses for `Retry-After`. */
  | { kind: "blocked"; reason: "denied" | "removed"; retryAfter: number }
  /** No host yet. Everybody waits, signed in or not. */
  | { kind: "wait-for-host" }
  /** A host is here; a guest needs letting in individually. */
  | { kind: "wait-for-admission" };

/**
 * The block, checked before anything else.
 *
 * Ahead of the waiting room deliberately: somebody who was removed should meet
 * the same answer whether or not the meeting happens to have a queue, and
 * asking "are you blocked" first means a blocked person never appears in it.
 *
 * Rows are left to expire rather than swept, so every read filters — a cleanup
 * job that has not run is not a reason to keep somebody out.
 */
export async function blockFor(
  db: SupabaseClient,
  meetingId: string,
  who: Subject,
  now = Date.now(),
): Promise<{ reason: "denied" | "removed"; retryAfter: number } | null> {
  const { data } = await db
    .from("meeting_blocks")
    .select("id, reason, expires_at")
    .eq("meeting_id", meetingId)
    .eq("subject_type", who.subjectType)
    .eq("subject", who.subject)
    .maybeSingle();

  if (!data || !blockIsLive(data.expires_at, now)) return null;

  /**
   * They came back — v1.5 B2, recorded here because this is the only place that
   * knows.
   *
   * Not awaited on the caller's critical path in spirit, but awaited in fact:
   * the refusal is already going to be returned, and a fire-and-forget write in
   * a serverless function is a write that may not happen. One row, one column.
   *
   * `notified_at` is deliberately untouched. The pair `attempted_at >
   * notified_at` is what makes the host's notice fire **once rather than once
   * per attempt**, and the host's own poll is what closes it — a person
   * hammering reload bumps this every time and is announced exactly once.
   */
  await db
    .from("meeting_blocks")
    .update({ attempted_at: new Date(now).toISOString() })
    .eq("id", data.id);
  return {
    reason: data.reason as "denied" | "removed",
    retryAfter: blockRetryAfter(data.expires_at, now),
  };
}

/**
 * Is a host in the room? Cheap answer first.
 *
 * `meeting_participants` carries an open host session as soon as the webhook
 * writes one — an indexed read, and right in the steady state. LiveKit is asked
 * **only when that says no**, because the database's failure mode is the fatal
 * one: v1.3 A2 exists because webhook deliveries were silently not arriving,
 * and here a missing delivery would mean nobody can ever enter.
 *
 * So the expensive call is spent exactly where the alternative is telling
 * somebody to wait for a host who is already there.
 */
export async function hostIsPresent(
  db: SupabaseClient,
  meetingId: string,
  code: string,
): Promise<boolean> {
  const { data } = await db
    .from("meeting_participants")
    .select("id")
    .eq("meeting_id", meetingId)
    .eq("role", "host")
    .is("left_at", null)
    .limit(1)
    .maybeSingle();

  if (data) return true;
  return hostIsInRoomLive(code);
}

/**
 * The whole decision, in the order the rules apply.
 *
 * **Two gates, not one**, which is the reading A1 needs stating because its two
 * sentences look like they disagree. "Nobody enters before a host is present,
 * including the first arrival" governs everybody — signed in or not. "Every
 * guest is admitted by the host individually. Signed-in participants pass
 * straight through" governs what happens *after* that. So a signed-in person
 * waits for the host and then walks in; a guest waits for the host and then
 * waits to be let in.
 *
 * The host is never held: they are the thing everybody else is waiting for, and
 * a door that stops them is a meeting that never starts.
 */
export async function decide({
  db,
  meetingId,
  code,
  waitingRoom,
  isHost,
  isSignedIn,
  who,
  admitted,
  now = Date.now(),
}: {
  db: SupabaseClient;
  meetingId: string;
  code: string;
  waitingRoom: boolean;
  isHost: boolean;
  isSignedIn: boolean;
  who: Subject;
  /** Whether this person already holds an `admitted` row from the host. */
  admitted: boolean;
  now?: number;
}): Promise<Verdict> {
  const block = await blockFor(db, meetingId, who, now);
  if (block) {
    return { kind: "blocked", reason: block.reason, retryAfter: block.retryAfter };
  }

  if (isHost || !waitingRoom) return { kind: "admit" };

  if (!(await hostIsPresent(db, meetingId, code))) {
    return { kind: "wait-for-host" };
  }

  if (isSignedIn || admitted) return { kind: "admit" };
  return { kind: "wait-for-admission" };
}

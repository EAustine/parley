import type { Reaction } from "@/lib/room/messages";

/**
 * The chat log, and how §3.5 wants it arranged.
 *
 * Kept apart from the panel because two of its rules are arithmetic — grouping
 * within 60 seconds, and whether an arriving message should scroll the view —
 * and arithmetic in a component is arithmetic nobody can check.
 */

export type ChatEntry = {
  id: string;
  /** Never from the payload. LiveKit says who a packet came from. */
  identity: string;
  name: string;
  body: string;
  /** Stamped on arrival, not carried on the wire. */
  at: number;
  /** A local echo the sender added for itself; `publishData` does not echo. */
  mine: boolean;
};

/** §3.5: join and leave are "visually distinct and quieter". */
export type SystemEntry = {
  id: string;
  kind: "joined" | "left";
  name: string;
  at: number;
};

export type LogEntry =
  | ({ type: "chat" } & ChatEntry)
  | ({ type: "system" } & SystemEntry);

export type ReactionEvent = {
  id: string;
  identity: string;
  name: string;
  emoji: Reaction;
  at: number;
  /** Horizontal offset so simultaneous reactions do not overlap — §3.6. */
  lane: number;
};

/** §3.5: "Consecutive messages from the same sender within 60s group under one header." */
export const GROUP_WINDOW_MS = 60_000;

/**
 * Does this entry need its own header, or does it continue the one above?
 *
 * A system message always breaks a run: "Ama joined" between two of Ama's
 * messages means the second one is not a continuation of the first in any
 * sense a reader would recognise.
 */
export function startsGroup(entry: LogEntry, previous: LogEntry | undefined): boolean {
  if (entry.type === "system") return true;
  if (!previous || previous.type !== "chat") return true;
  if (previous.identity !== entry.identity) return true;
  return entry.at - previous.at >= GROUP_WINDOW_MS;
}

/**
 * §3.5: "Scroll pins to bottom unless the reader has scrolled up, in which case
 * a 'New messages' affordance appears."
 *
 * The tolerance matters. Sub-pixel scroll positions and rounding mean an
 * element parked at the bottom frequently reports a distance of 0.5 or 1.2
 * rather than 0, so an exact comparison would decide the reader had scrolled
 * away when they had not — and then stop following the conversation for
 * someone who never touched anything.
 */
export const PINNED_TOLERANCE_PX = 24;

export function isPinnedToBottom(view: {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}): boolean {
  return (
    view.scrollHeight - view.scrollTop - view.clientHeight <= PINNED_TOLERANCE_PX
  );
}

/**
 * Keeping the log bounded.
 *
 * Chat is ephemeral by design, and a meeting can run for hours. Without a cap,
 * a long call accumulates every message in memory and re-renders a list that
 * only grows. Two hundred is far past what anyone scrolls back through in a
 * live conversation.
 */
export const LOG_LIMIT = 200;

export function appendBounded<T>(log: T[], entry: T): T[] {
  const next = log.length >= LOG_LIMIT ? log.slice(log.length - LOG_LIMIT + 1) : log;
  return [...next, entry];
}

"use client";

import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";

import { ICONS } from "@/lib/icons";
import { rememberName } from "@/lib/prejoin-handoff";
import { BAR_COPY, barTone, type RoomPhase } from "@/lib/room/connection";
import { Button } from "@/components/ui/button";

/**
 * §3.11's local-user bar: "Your connection is unstable" for poor, a critical
 * bar with a visible attempt count when the connection has gone.
 *
 * **Opaque `--popover`, never the scrim.** Rule 4 now says so outright: the
 * scrim composited over white video resolves to about `#515355`, where
 * `--state-warning` is 3.79:1 and `--state-critical` 2.53:1 — both under
 * their floor. On a chip the figures are 8.11:1 and 5.42:1 and no longer
 * depend on what is on camera.
 *
 * **The way out is live throughout, not revealed after the tenth attempt.**
 * §3.11: "Nobody should be made to watch a countdown they cannot interrupt."
 * The default policy runs ten attempts over 45–90 seconds, which is the right
 * schedule precisely because it covers slow real recoveries — wifi handoff,
 * mobile handover — and that length is only acceptable if the person can stop
 * waiting whenever they like. So Rejoin and Leave appear the moment the
 * connection drops and stay until it comes back.
 *
 * The attempt count sits outside the sentence and is `aria-hidden`. §9 wants
 * the change announced once; a screen reader counting to ten is the flooding
 * §9 exists to prevent. No total either — "of 10" would quote a vendored
 * constant that a minor version bump can change.
 */
export function ConnectionBar({
  phase,
  attempts,
  code,
  displayName,
  sharing,
}: {
  phase: Exclude<RoomPhase, "healthy" | "failed">;
  attempts: number;
  code: string;
  displayName: string;
  /** Whether the sharing bar is above us, which occupies the same edge. */
  sharing: boolean;
}) {
  const critical = barTone(phase) === "critical";
  /**
   * Whenever a retry is actually running.
   *
   * §3.11: the way out is live "throughout" the retry. Both `signal` and
   * `reconnecting` are the SDK retrying — one the signalling socket, one the
   * whole connection — and in signal reconnect the person's messages are not
   * arriving and they cannot see who comes and goes, which is a good reason to
   * want a clean rejoin.
   *
   * `lost` is excluded because nothing is retrying there: §3.11 calls it "the
   * gap between ConnectionQuality.Lost and reconnection actually starting".
   * There is no countdown to interrupt yet.
   *
   * Narrowing this to `reconnecting` alone was wrong and the suite caught it:
   * the bar frequently appears in `signal` first and can stay there, so the
   * escape hatch was absent for exactly the state that most needs it.
   */
  const escapable = phase === "signal" || phase === "reconnecting";

  return (
    <div
      // Scoped by attribute, not by text. The bar's copy and the live
      // region's announcement say nearly the same thing on purpose, so a
      // text query matches both — which is the collision CLAUDE.md's
      // "scope queries by role or test id" rule is about, found the usual way.
      data-connection-bar={phase}
      className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center px-3 pt-3"
      /**
       * Below the sharing bar when there is one.
       *
       * Both are `absolute inset-x-0 top-0` and the sharing bar is `z-30`, so
       * this was painted underneath it whenever someone was sharing — and
       * `RoomStage` carried a comment saying the two stacked, which was true of
       * the intent and not of the boxes. A connection warning that disappears
       * exactly when it is most likely to matter is the silent failure §3.11
       * exists to prevent.
       */
      style={{ top: sharing ? "3.5rem" : 0 }}
    >
      <div
        className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-lg px-3 py-2"
        style={{
          background: "var(--popover)",
          border: `1px solid ${critical ? "var(--state-critical)" : "var(--boundary)"}`,
        }}
      >
        <div
          className="flex items-center gap-2"
          style={{
            color: critical ? "var(--state-critical)" : "var(--state-warning)",
          }}
        >
          <HugeiconsIcon
            icon={critical ? ICONS.signalLost.icon : ICONS.signalLow.icon}
            size={20}
            strokeWidth={1.5}
            color="currentColor"
            className="shrink-0"
            aria-hidden
          />
          <p className="type-small">{BAR_COPY[phase]}</p>
          {attempts > 0 && (
            <span className="type-caption tabular-nums opacity-80" aria-hidden>
              attempt {attempts}
            </span>
          )}
        </div>

        {escapable && (
          <div className="pointer-events-auto flex items-center gap-2">
            <Button asChild size="touch">
              <Link href={`/j/${code}`} onClick={() => rememberName(displayName)}>
                Rejoin now
              </Link>
            </Button>
            <Button asChild size="touch" variant="outline">
              <Link href="/dashboard">Leave</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

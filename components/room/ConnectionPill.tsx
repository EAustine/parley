"use client";

import { HugeiconsIcon } from "@hugeicons/react";

import { ICONS } from "@/lib/icons";
import { TILE_COPY, type TileTreatment } from "@/lib/room/connection";

/**
 * §3.11's tile-level state: "Amber pill on the affected tile."
 *
 * **Opaque, not on the scrim, and that is a deliberate narrowing of rule 4.**
 * Rule 4 says every label sits on `--scrim` because contrast against arbitrary
 * video is otherwise undefined. Measured over worst-case bright video,
 * `--state-warning` on `--scrim` is 3.79:1 and `--state-critical` is 2.53:1 —
 * both below the 4.5 their own token rule declares. This is the first hued
 * text in the product to sit over video, and it is where rule 4's mechanism
 * stops delivering what rule 4 is for.
 *
 * So the chip is opaque `--popover`, which measures 8.11:1 and 5.42:1, and
 * carries a `--tile-border` edge to separate it from whatever is behind. That
 * honours rule 4's intent — the label is not on video — while declining its
 * letter. `ReplacedNotice` and `MuteRequestPrompt` already use this surface,
 * so it is the room's existing answer to the same problem rather than a new
 * one.
 *
 * Rule 5 permits hue here: connection warnings are one of the two things hue
 * is spent on. It is not the sole carrier — the icon differs between states
 * and the words say which is which, so nothing depends on seeing the colour.
 */
export function ConnectionPill({ treatment }: { treatment: Exclude<TileTreatment, "none"> }) {
  const critical = treatment === "lost";

  return (
    <div
      // Top-left. The bottom of a tile is the name label and the mic
      // indicator; §3.6 also keeps rising reactions clear of that row, so the
      // top half is the only place nothing else claims.
      className="pointer-events-none absolute left-2 top-2 flex items-center gap-1.5 rounded-full px-2 py-1"
      style={{
        background: "var(--popover)",
        border: "1px solid var(--tile-border)",
        color: critical ? "var(--state-critical)" : "var(--state-warning)",
      }}
    >
      <HugeiconsIcon
        icon={critical ? ICONS.signalLost.icon : ICONS.signalLow.icon}
        size={16}
        strokeWidth={1.5}
        color="currentColor"
        className="shrink-0"
        aria-hidden
      />
      <span className="type-caption whitespace-nowrap">{TILE_COPY[treatment]}</span>
    </div>
  );
}

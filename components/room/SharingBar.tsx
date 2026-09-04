"use client";

import { HugeiconsIcon } from "@hugeicons/react";

import { ICONS } from "@/lib/icons";
import { Button } from "@/components/ui/button";

/**
 * §3.7: "a persistent 'You're sharing your screen' bar with a stop button,
 * visible even if the tab is backgrounded when they return."
 *
 * Persistent is the word that matters. This does not auto-hide with the control
 * bar, because the thing it is telling you is that other people can see your
 * screen — exactly the fact that must not quietly disappear while you go and do
 * something else in another window.
 *
 * ## v1.3 C4: in flow, and on an opaque surface
 *
 * It was `absolute inset-x-0 top-0` with a `--scrim` background: a full-bleed
 * band laid over the top of the room at every width. Two things follow from
 * moving it into the stage's own column instead.
 *
 * **It stops overlapping the video it is about.** An absolute band covers the
 * top of the grid, which on a two-person call is somebody's forehead. In flow
 * it takes its own 8px of the stage and the tiles get the rest.
 *
 * **It stops being a scrim surface at all.** Text on `--scrim` is governed by
 * rule 4 and has to use the on-scrim pair; on an opaque `--popover` chip the
 * question does not arise, and the same reasoning already sends every hued
 * indicator in the room — `ConnectionPill`, `ConnectionBar`, the device-error
 * message — to exactly this surface.
 *
 * A centred pill on a wide viewport and a full-width bar below it, because as a
 * pill it sizes to its content and the button's label wrapped.
 */
export function SharingBar({ onStop }: { onStop: () => void }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center"
      // Announced once when it appears, politely — it is important but it is
      // not an interruption, and the person just pressed the button that
      // caused it.
      role="status"
      aria-live="polite"
    >
      <div
        className="flex w-full items-center justify-between gap-3 rounded-lg border border-boundary bg-popover py-1.5 pr-1.5 pl-3 min-[900px]:w-auto min-[900px]:justify-center min-[900px]:rounded-full min-[900px]:pl-3.5"
      >
        <span className="flex min-w-0 items-center gap-2">
          <HugeiconsIcon
            icon={ICONS.screenShare.icon}
            size={16}
            strokeWidth={1.5}
            color="currentColor"
            className="shrink-0 text-muted-foreground"
            aria-hidden
          />
          <span className="truncate type-small text-foreground">
            You&rsquo;re sharing your screen
          </span>
        </span>
        {/*
          `touch`, not the design's 34px. The room is a 44px surface and the
          floor does not bend for a design file — the same call the control bar,
          the panel's tabs and the copy button already made.
        */}
        <Button size="touch" variant="secondary" className="shrink-0" onClick={onStop}>
          Stop sharing
        </Button>
      </div>
    </div>
  );
}

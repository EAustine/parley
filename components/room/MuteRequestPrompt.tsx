"use client";

import { HugeiconsIcon } from "@hugeicons/react";

import { ICONS } from "@/lib/icons";
import { Button } from "@/components/ui/button";

/**
 * §3.8: "Muting is a request the participant must accept — the host can
 * silence, never activate."
 *
 * So this is a prompt, not a notification of something that already happened.
 * The host has asked; the microphone is still on until the person here says
 * otherwise. Ignoring it is a valid answer and costs nothing — which is the
 * difference between a request and a command, and the reason there is no
 * unmute equivalent anywhere in the product.
 *
 * ## v1.3 C2a: a question, not an announcement
 *
 * It was pinned to the top of the room, which put three things wrong at once:
 * it was nowhere near the microphone it is about, it had the visual weight of a
 * system alert for something a participant may reasonably decline, and it sat
 * at the far end of the screen from the control that answers it.
 *
 * **Above the control bar, and positioned against its measured height.** The
 * design puts this at the bottom of a stage that sits above an in-flow bar; our
 * bar is `absolute` over the frame, so `bottom: 0` here would be *underneath*
 * it — an absolutely positioned box resolves against its containing block's
 * padding box, and the stage's `pb-[var(--parley-controls-h)]` does not move
 * it. `--parley-controls-h` is the bar's own rendered height, published by a
 * `ResizeObserver` in `RoomControls`, so this tracks the bar through wrapping,
 * the safe-area inset, and the error row that appears above it when a device
 * fails.
 *
 * **It overlays rather than displacing.** Nothing about the room moves when a
 * host asks, which matters because the thing being asked about is a live
 * conversation.
 *
 * `z-20`, below the control bar's `z-30`: the bar has to stay reachable, and
 * mute is a privacy control. The card is a request about it, not a replacement
 * for it.
 */
export function MuteRequestPrompt({
  from,
  onMute,
  onDismiss,
}: {
  from: string;
  onMute: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      // Polite, like every other announcement in the room — BUILD-PLAN's
      // Phase 9 note. It is a request, and a request can wait for a gap.
      role="status"
      aria-live="polite"
      className="absolute bottom-[calc(var(--parley-controls-h)+0.5rem)] left-1/2 z-20 flex w-[calc(100%-1rem)] -translate-x-1/2 flex-col items-stretch gap-2.5 rounded-xl border border-boundary bg-popover px-3.5 py-2.5 shadow-[0_12px_32px_rgba(0,0,0,0.5)] min-[900px]:w-auto min-[900px]:max-w-[calc(100%-1.5rem)] min-[900px]:flex-row min-[900px]:items-center min-[900px]:gap-3 min-[900px]:pr-2.5"
    >
      <span className="flex min-w-0 items-center gap-2.5">
        {/* A struck mic, which says what is being asked before the sentence
            does. Muted rather than hued: rule 5 spends hue on destructive
            actions and connection warnings, and this is neither — declining it
            is a real option. */}
        <HugeiconsIcon
          icon={ICONS.micOff.icon}
          size={18}
          strokeWidth={1.5}
          color="currentColor"
          className="shrink-0 text-muted-foreground"
          aria-hidden
        />
        <span className="type-small text-muted-foreground">
          <span className="font-semibold text-foreground">{from}</span> asked you
          to mute.
        </span>
      </span>

      {/*
        Both 44px, not the design's 36 and 40. The room's floor does not bend
        for a design file — the same call the control bar, the panel's tabs and
        the sharing bar already made.

        "Stay unmuted" is a ghost beside a primary Mute, and it is a real
        control rather than a way out of a dialog: §3.8's rule is that a host
        can silence but never activate, and a request the interface pressures
        you into is not a request.
      */}
      <span className="flex shrink-0 gap-2">
        <Button size="touch" className="flex-1 min-[900px]:flex-none" onClick={onMute}>
          Mute
        </Button>
        <Button
          size="touch"
          variant="ghost"
          className="flex-1 min-[900px]:flex-none"
          onClick={onDismiss}
        >
          Stay unmuted
        </Button>
      </span>
    </div>
  );
}

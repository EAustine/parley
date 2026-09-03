"use client";

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
      className="absolute inset-x-0 top-0 z-30 mx-auto flex w-fit items-center gap-3 rounded-b-xl px-4 py-3"
      style={{ background: "var(--popover)", border: "1px solid var(--tile-border)" }}
    >
      <p className="type-small">
        <span className="text-foreground">{from}</span> asked you to mute.
      </p>
      <Button size="touch" onClick={onMute}>
        Mute
      </Button>
      <Button size="touch" variant="ghost" onClick={onDismiss}>
        Stay unmuted
      </Button>
    </div>
  );
}

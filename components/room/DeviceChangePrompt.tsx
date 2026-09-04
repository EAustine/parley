"use client";

import { Button } from "@/components/ui/button";

/**
 * Hardware arrived mid-meeting — v1.3 B2.
 *
 * "**Do not switch silently.** A non-modal prompt: 'AirPods connected. Switch?'
 * with Switch and Dismiss."
 *
 * B2 calls that a decision rather than a detail, and gives the reason:
 * "Silently moving someone's audio to a device they did not choose is how a
 * private conversation comes out of a laptop speaker in an open office." The
 * failure runs both ways — a headset that connects without taking the audio is
 * a mild annoyance, and one that takes the audio without asking can be a
 * disclosure.
 *
 * **Non-modal, and that is the other half.** Someone plugging in headphones
 * mid-sentence should not have a dialog thrown over the person talking. This
 * asks, everything behind it stays reachable, and ignoring it is a valid answer
 * — the same shape as `MuteRequestPrompt`, for the same reason.
 */
export function DeviceChangePrompt({
  label,
  onSwitch,
  onDismiss,
}: {
  label: string;
  onSwitch: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      // Polite. §9 batches and throttles precisely so the room does not
      // interrupt, and a device appearing is the least urgent thing in it.
      role="status"
      aria-live="polite"
      className="absolute inset-x-0 top-0 z-30 mx-auto flex w-fit max-w-[calc(100vw-1rem)] flex-wrap items-center justify-center gap-3 rounded-b-xl px-4 py-3"
      style={{ background: "var(--popover)", border: "1px solid var(--boundary)" }}
    >
      <p className="type-small">
        <span className="text-foreground">{label}</span> connected.
      </p>
      <Button size="touch" onClick={onSwitch}>
        Switch
      </Button>
      <Button size="touch" variant="ghost" onClick={onDismiss}>
        Dismiss
      </Button>
    </div>
  );
}

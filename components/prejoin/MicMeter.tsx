"use client";

/**
 * The input meter — a 4px bar under the preview, per v1.2 D.
 *
 * Weight and fill, no hue — rule 5. A green-to-red meter would be the only
 * chroma on the screen and would mean nothing here: there is no "too loud" to
 * warn about, only "we can hear you", which is a presence signal.
 *
 * This was twelve discrete segments, and the reason given was that "discrete
 * steps read as movement at a glance where a smooth fill reads as static, and
 * they hold up at the small size this occupies next to the mic button". That
 * was true of where it sat. D moves it out from beside the mic button to the
 * full width of the preview, and at that width a continuous fill is legible on
 * its own — the argument for segments was an argument about a small box, and
 * the box is gone.
 *
 * No transition on the width. The attack and release live in
 * `useMediaPreview`, against the real frame delta, so what this draws is the
 * level as smoothed rather than the level as it was a frame ago — see there.
 */
export function MicMeter({
  level,
  muted,
}: {
  /** 0–1, already smoothed by the preview hook. */
  level: number;
  muted: boolean;
}) {
  const filled = muted ? 0 : Math.max(0, Math.min(1, level));

  return (
    <div
      /*
       * v1.3 E2: "a 4px bar directly under the frame, so it reads as voice
       * rather than as a widget."
       *
       * Flush, and square where the frame is square — below 900px the preview
       * runs edge to edge with no radius, and a rounded bar under a square
       * frame reads as a second object rather than as the frame's own edge.
       */
      className="h-1 w-full overflow-hidden min-[900px]:rounded-b-full"
      style={{ background: "var(--input)" }}
      // Not a progress bar to a screen reader: it updates many times a second
      // and says nothing a blind user can act on. The mic button already
      // announces whether the microphone is on, which is the actionable part.
      aria-hidden
      data-mic-meter={muted ? "muted" : "live"}
    >
      <div
        className="h-full min-[900px]:rounded-full"
        style={{
          width: `${filled * 100}%`,
          background: "var(--foreground)",
        }}
      />
    </div>
  );
}

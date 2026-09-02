"use client";

/**
 * The input meter.
 *
 * Weight and fill, no hue — rule 5. A green-to-red meter would be the only
 * chroma on the screen and would mean nothing here: there is no "too loud" to
 * warn about, only "we can hear you", which is a presence signal.
 *
 * Twelve discrete segments rather than a continuous bar. Discrete steps read as
 * movement at a glance where a smooth fill reads as static, and they hold up at
 * the small size this occupies next to the mic button.
 */

const SEGMENTS = 12;

export function MicMeter({
  level,
  muted,
}: {
  /** 0–1, already smoothed by the preview hook. */
  level: number;
  muted: boolean;
}) {
  const lit = muted ? 0 : Math.round(level * SEGMENTS);

  return (
    <div
      className="flex items-center gap-[3px]"
      // Not a progress bar to a screen reader: it updates many times a second
      // and says nothing a blind user can act on. The mic button already
      // announces whether the microphone is on, which is the actionable part.
      aria-hidden
    >
      {Array.from({ length: SEGMENTS }, (_, i) => (
        <span
          key={i}
          className="h-3 w-[3px] rounded-full transition-[background-color] duration-75"
          style={{
            backgroundColor:
              i < lit ? "var(--foreground)" : "var(--tile-border)",
            opacity: i < lit ? 1 : 0.4,
          }}
        />
      ))}
    </div>
  );
}

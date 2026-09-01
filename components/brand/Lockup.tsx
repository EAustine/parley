import { cn } from "@/lib/utils";
import { Mark } from "@/components/brand/Mark";
import { Wordmark, wordmarkSizeForMark } from "@/components/brand/Wordmark";

/**
 * Horizontal — mark, then wordmark. Gap equals one gutter unit scaled to the
 * mark (mark width / 6, since the 24-unit grid has a 4-unit gutter).
 * Header, nav, email signature.
 *
 * Stacked — mark centred above wordmark. Gap equals half the mark height.
 * Pre-join screen, OG image, app icon contexts.
 *
 * Both inherit `currentColor`, so one component serves both themes.
 * Clear space on all sides equals half the mark's height.
 */

export const LOCKUP_MINIMUMS = {
  horizontal: 96,
  stacked: 72,
} as const;

type LockupProps = {
  variant?: "horizontal" | "stacked";
  /** Mark height in px. The wordmark is sized to match its cap height. */
  markSize?: number;
  className?: string;
  /** Reserve the clear-space zone as padding: half the mark's height. */
  withClearSpace?: boolean;
};

export function Lockup({
  variant = "horizontal",
  markSize = 24,
  className,
  withClearSpace,
}: LockupProps) {
  const gap = variant === "horizontal" ? markSize / 6 : markSize / 2;
  const clearSpace = withClearSpace ? markSize / 2 : 0;

  return (
    <span
      className={cn(
        "inline-flex items-center",
        variant === "stacked" && "flex-col justify-center",
        className,
      )}
      style={{ gap: `${gap}px`, padding: clearSpace || undefined }}
      role="img"
      aria-label="Parley"
    >
      <Mark size={markSize} aria-hidden />
      <Wordmark size={wordmarkSizeForMark(markSize)} decorative />
    </span>
  );
}

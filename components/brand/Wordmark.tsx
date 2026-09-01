import { cn } from "@/lib/utils";

/**
 * Instrument Sans 600, -0.02em, sentence case. Nothing else.
 *
 * No letter substitution, no chip in place of a counter, no colour on a single
 * glyph. The mark carries the idea; the wordmark stays quiet so the two don't
 * compete.
 *
 * Cap height is set equal to the mark's height in every lockup. Instrument Sans
 * has a cap height of roughly 0.72em, so a wordmark sitting beside a mark of
 * height H needs a font-size of H / 0.72.
 */

export const WORDMARK_CAP_HEIGHT_RATIO = 0.72;

/** Font size that gives a cap height equal to `markSize`. */
export function wordmarkSizeForMark(markSize: number): number {
  return markSize / WORDMARK_CAP_HEIGHT_RATIO;
}

type WordmarkProps = {
  /** Font size in px. Defaults to the size that pairs with a 24px mark. */
  size?: number;
  className?: string;
  /** True when a sibling element already provides the accessible name. */
  decorative?: boolean;
};

export function Wordmark({
  size = wordmarkSizeForMark(24),
  className,
  decorative,
}: WordmarkProps) {
  return (
    <span
      className={cn("font-sans font-semibold leading-none", className)}
      style={{ fontSize: `${size}px`, letterSpacing: "-0.02em" }}
      aria-hidden={decorative ? true : undefined}
    >
      Parley
    </span>
  );
}

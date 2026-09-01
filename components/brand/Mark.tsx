import { cn } from "@/lib/utils";

/**
 * The presence grid — a 2x2 of rounded tiles, three filled and one empty.
 *
 * Geometry is the 24-unit grid from BRAND.md: 9-unit cells, 4-unit gutters,
 * 2.4 radius, 1 margin, empty cell bottom-right.
 *
 * The ghost cell is a functional rule, not a stylistic one. At 32px and above
 * the empty cell carries a 1.5 stroke at 40% opacity — present, camera off.
 * Below 32px the stroke antialiases into a grey smudge that reads as a
 * rendering artefact, so it is dropped and the cell is fully empty.
 *
 * The fourth cell is never filled. That cell is the idea.
 */

export const MARK_GHOST_THRESHOLD = 32;

type MarkProps = {
  /** Rendered size in px. Drives the ghost-cell switch. Minimum 16. */
  size?: number;
  className?: string;
  /** Set when the mark sits beside a wordmark that already names the product. */
  "aria-hidden"?: boolean;
  title?: string;
};

export function Mark({
  size = 24,
  className,
  title,
  "aria-hidden": ariaHidden,
}: MarkProps) {
  const showGhost = size >= MARK_GHOST_THRESHOLD;
  const labelled = Boolean(title) && !ariaHidden;

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      className={cn("shrink-0", className)}
      role={labelled ? "img" : undefined}
      aria-label={labelled ? title : undefined}
      aria-hidden={labelled ? undefined : true}
      focusable="false"
    >
      <rect x="1" y="1" width="9" height="9" rx="2.4" fill="currentColor" />
      <rect x="14" y="1" width="9" height="9" rx="2.4" fill="currentColor" />
      <rect x="1" y="14" width="9" height="9" rx="2.4" fill="currentColor" />
      {showGhost && (
        <rect
          x="14.75"
          y="14.75"
          width="7.5"
          height="7.5"
          rx="1.65"
          stroke="currentColor"
          strokeWidth="1.5"
          opacity="0.4"
        />
      )}
    </svg>
  );
}

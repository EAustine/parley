import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * `size`, mirroring `Select` — v1.3 E1.
 *
 * The design files set every field to `min-height: 44px`, and this rendered at
 * **32**. Sign-in's floor is 24px (`CLAUDE.md`: 44 on the room and pre-join, 24
 * elsewhere), so nothing was failing — but a floor is not a target, and the
 * visual specification asks for 44 on the surfaces where someone is typing an
 * address on a phone.
 *
 * `size` is omitted from the native props before ours is added: `<input>` has a
 * numeric `size` attribute of its own, and the two cannot share a name.
 *
 * The height goes through `data-size` rather than a bare class, for the same
 * reason `Select` does it: `data-[size=default]:h-8` outranks a plain `h-11` in
 * a caller's `className`, so a bare height class would silently lose. Making
 * both variants attribute-scoped means neither can quietly beat the other.
 */
function Input({
  className,
  type,
  size = "default",
  ...props
}: Omit<React.ComponentProps<"input">, "size"> & {
  size?: "default" | "touch"
}) {
  return (
    <input
      type={type}
      data-slot="input"
      data-size={size}
      className={cn(
        "w-full min-w-0 rounded-lg border border-boundary bg-transparent px-2.5 py-1 text-base transition-colors outline-none data-[size=default]:h-8 data-[size=touch]:h-11 file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }

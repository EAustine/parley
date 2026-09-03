import * as React from "react"
import { ChevronDownIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * A native `<select>`, styled to sit with the other form controls.
 *
 * This was Radix's Select — a button, a portal, a listbox, a scroll-locked
 * shell — and BUILD-PLAN v1.2 replaced it rather than suppressing what that
 * shell does to an axe scan. Three arguments arrived at the same answer:
 *
 * - **Accessibility.** Radix Select fails `aria-hidden-focus` (its `hideOthers()`
 *   marks the shell hidden with twelve focusable elements still inside) and
 *   `scrollable-region-focusable` on the viewport. Both are arguably false
 *   positives — the component is genuinely operable — but getting the open
 *   state into the scan would have needed two documented exclusions, and
 *   suppressing a warning about a component we can simply not use is treating
 *   the symptom. A native select cannot trip either rule, and has the deepest
 *   assistive-technology support of any control on the page.
 * - **Mobile.** The OS picker, for the same reason `<input type="date">` beat
 *   `react-day-picker`.
 * - **Bundle.** Drops Radix's Select and the scroll-lock family it pulls in —
 *   `PRD.md` §10 measured that family as the reason `/schedule` sits above
 *   `/dashboard`.
 *
 * The open list is drawn by the OS and will not match the dark palette. That is
 * a minor inconsistency, not a design failure: the closed state is ours, and
 * every other native control in the product already behaves this way.
 *
 * `appearance-none` removes the platform chevron so ours can carry the icon
 * language; `pr-8` reserves the space it sits in.
 */
function Select({
  className,
  size = "default",
  children,
  ...props
}: /*
 * `size` is omitted from the native props before ours is added: a `<select>`
 * already has one, and it is the *number of visible rows*. Left in the union,
 * TypeScript resolves the overlap to `never` and every call site fails on a
 * prop that looks correct.
 */
Omit<React.ComponentProps<"select">, "size"> & {
  /**
   * `touch` is 44px — the floor on the room and pre-join surfaces. A named
   * variant rather than an `h-11` at the call site, matching `Button`.
   */
  size?: "sm" | "default" | "touch"
}) {
  return (
    <div className="relative w-full">
      <select
        data-slot="select"
        data-size={size}
        className={cn(
          "w-full appearance-none rounded-lg border border-boundary bg-transparent py-2 pr-8 pl-2.5 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-[size=default]:h-8 data-[size=touch]:h-11 data-[size=sm]:h-7 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
          className
        )}
        {...props}
      >
        {children}
      </select>
      {/* Decorative: the select is already announced as a combobox. */}
      <ChevronDownIcon
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  )
}

export { Select }

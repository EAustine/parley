"use client";

/**
 * The waiting room, as a control — §3.2's toggle, v1.5 A1.
 *
 * ## A native checkbox, deliberately
 *
 * There is no switch in `components/ui`, and adding shadcn's would pin
 * `@radix-ui/react-switch` — a dependency, which rule 9 says is asked about
 * first. It is also the wrong trade twice over: v1.2 already replaced Radix
 * `Select` with a native `<select>` on the argument that native form controls
 * "have the deepest, best-tested assistive-technology support of any form
 * control", and that argument does not stop applying at checkboxes. A checkbox
 * announces its role, its checked state and its label without any of it being
 * reimplemented.
 *
 * `accent-color` is why this can look right without being rebuilt: the browser
 * paints the check with our own foreground, and `color-scheme` — already
 * declared per theme in `globals.css` — makes it draw the dark variant in the
 * room. That is the same reasoning the `<select>` swap rested on.
 *
 * ## Presentational only
 *
 * It holds no state and knows no route. The schedule form drives it as a form
 * field on a meeting that does not exist yet; `WaitingRoomToggle` drives it
 * against `PATCH` on one that does. Same control, two owners — which is the
 * split that let this live in three places without three implementations.
 */
export function DoorField({
  id,
  checked,
  onChange,
  disabled = false,
  describedBy,
  touch = false,
}: {
  id: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  describedBy?: string;
  /**
   * Pre-join and room surfaces take the 44px floor; dashboard and scheduling
   * screens take 24. **The floor applies to the input, not to a wrapper around
   * it** — `e2e/targets.ts` measures every `input`'s own box, which is the
   * whole point of measuring geometry rather than resolving classes.
   *
   * A first version padded a 44px `<label>` around a 16px checkbox and read as
   * correct while rendering a 16px target. That is precisely the failure
   * `CLAUDE.md` describes: "a class-resolving check reads `h-11 w-11` and
   * reports 44px while a parent constraint delivers something smaller."
   */
  touch?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      {/*
        **The input is the target; the box is what you see, and they are not the
        same size.**

        The floor applies to the `<input>` itself — `e2e/targets.ts` measures
        every input's own box, which is the point of measuring geometry rather
        than resolving classes. A first version padded a 44px `<label>` around a
        16px checkbox and read as correct while rendering a 16px target: exactly
        the failure `CLAUDE.md` names, "a class-resolving check reads `h-11
        w-11` and reports 44px while a parent constraint delivers something
        smaller".

        The next version made the native checkbox itself 44px, which is honest
        and looks absurd — a native control paints its glyph at whatever size it
        is given, so a 44px target meant a 44px tick.

        So the input keeps the full target and stops painting: transparent, laid
        over a box we draw at a sane size. **It is still a native checkbox** —
        role, checked state, keyboard behaviour and the label association are
        all the browser's, which is the whole argument for using one. Only the
        painting is ours, and painting is the one part with no assistive
        technology consequence.

        `peer-checked` and `peer-focus-visible` drive the box from the input's
        real state rather than from React's copy of it, so the tick cannot
        disagree with what the control actually is — rule 3's reasoning, one
        surface further out.
      */}
      <span
        className={`relative inline-flex shrink-0 items-center justify-center ${
          touch ? "size-11" : "size-7"
        }`}
      >
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          aria-describedby={describedBy}
          className="peer absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-default"
        />
        {/*
          The box and the tick are **siblings of the input**, not nested inside
          one another. `peer-checked:` compiles to a sibling combinator, so a
          tick placed inside the box would never have toggled — it would have
          rendered permanently, in whatever colour the unchecked box happened to
          give it.
        */}
        <span
          aria-hidden
          className="pointer-events-none size-5 rounded-[4px] border border-boundary transition-colors peer-checked:border-[var(--foreground)] peer-checked:bg-[var(--foreground)] peer-disabled:opacity-50 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--ring)]"
        />
        <svg
          aria-hidden
          viewBox="0 0 16 16"
          className="pointer-events-none absolute size-3.5 text-[var(--primary-foreground)] opacity-0 peer-checked:opacity-100"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3.5 8.5l3 3 6-6" />
        </svg>
      </span>
      <div className="min-w-0">
        <label htmlFor={id} className="type-body block cursor-pointer">
          Waiting room
        </label>
        <p id={describedBy} className="type-small text-muted-foreground">
          {/*
            Says what happens, not what the flag is called. §3.2's two gates in
            one sentence each — and the second only exists while the first has
            already passed, which is why they are ordered this way round.
          */}
          People wait until you let them in. Nobody joins before you do.
        </p>
      </div>
    </div>
  );
}

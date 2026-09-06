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
}: {
  id: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  describedBy?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      {/*
        44px of hit area on a 16px box — the room and pre-join floor. The input
        is centred in a padded label rather than scaled up, so the glyph stays
        crisp and the target is honest rather than declared.
      */}
      <label
        htmlFor={id}
        className="-m-3 flex size-11 shrink-0 cursor-pointer items-center justify-center p-3"
      >
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          aria-describedby={describedBy}
          className="size-4 accent-[var(--foreground)] disabled:opacity-50"
        />
        <span className="sr-only">Waiting room</span>
      </label>
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

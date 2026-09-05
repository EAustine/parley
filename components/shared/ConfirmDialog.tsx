"use client";

import { useEffect, useState } from "react";

/**
 * "The menu is a choice; the dialog is the commitment" — v1.3 B1, generalised
 * by D4 when cancelling a meeting became the second destructive action in the
 * product that cannot be undone.
 *
 * **A native `<dialog>`, opened with `showModal()`**, which is what B1 asks for:
 * "Native gives focus trapping, Escape, and backdrop inert-ing for free — which
 * matters because `CLAUDE.md` says modal surfaces trap and non-modal panels do
 * not." Nothing here implements a trap, and nothing here can get one wrong; the
 * top layer, the inertness of everything behind it and the Escape handling are
 * the browser's.
 *
 * Extracted from `EndMeetingDialog` rather than copied. Every subtle part below
 * — one handler for every way it closes, the non-dismissable in-flight state
 * read live rather than through a captured closure, the element held in state —
 * is the sort of thing that gets fixed in one copy and not the other.
 *
 * Two consequences of going native, both deliberate:
 *
 * **The buttons live in a `method="dialog"` form.** Cancel is a submit, so the
 * platform closes the dialog and sets `returnValue` with no JavaScript at all —
 * the same path Escape takes, which is why both arrive at one handler rather
 * than two that can disagree. Confirm is deliberately *not* a submit: it has to
 * keep the dialog open while the request is in flight.
 *
 * **The element is held in state, not a ref.** Same reason as `Tile` after A3:
 * an effect that needs an element has to have that element as an input, or it
 * runs before the element exists and never again.
 */
export function ConfirmDialog({
  id,
  title,
  body,
  confirmLabel,
  dismissLabel = "Cancel",
  pending,
  onConfirm,
  onDismiss,
}: {
  /** Unique on the page — it names the title and body for the dialog. */
  id: string;
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  /** The way out. Named for what it does, never sharing a word with `confirmLabel`. */
  dismissLabel?: string;
  pending: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  const [dialog, setDialog] = useState<HTMLDialogElement | null>(null);

  useEffect(() => {
    if (!dialog || dialog.open) return;
    dialog.showModal();
  }, [dialog]);

  /**
   * One handler for every way this closes.
   *
   * Escape, the dismiss submit, and a `close()` from anywhere else all fire
   * `close`. Wiring dismiss's click separately would leave Escape on a
   * different path, and two paths out of one dialog is how a state gets left
   * behind on only one of them.
   */
  useEffect(() => {
    if (!dialog) return;
    const onClose = () => onDismiss();
    dialog.addEventListener("close", onClose);
    return () => dialog.removeEventListener("close", onClose);
  }, [dialog, onDismiss]);

  /**
   * While the request is in flight the dialog stops being dismissible.
   *
   * `cancel` is the event Escape fires *before* `close`, so preventing it is
   * the one place that can be stopped. Read through a live `pending` rather
   * than a captured one: the listener is attached once per element, and a stale
   * closure would let a dismissal during the request act on a decision already
   * taken.
   */
  useEffect(() => {
    if (!dialog) return;
    const onCancelEvent = (event: Event) => {
      if (pending) event.preventDefault();
    };
    dialog.addEventListener("cancel", onCancelEvent);
    return () => dialog.removeEventListener("cancel", onCancelEvent);
  }, [dialog, pending]);

  return (
    <dialog
      ref={setDialog}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-body`}
      /*
       * The UA stylesheet gives `dialog` its own border, padding and `color`,
       * and centres a modal one with `margin: auto` — which is kept. Everything
       * visual is a token: `--popover` for the surface and `--boundary` for the
       * edge, because no fill in this palette separates from another.
       *
       * The backdrop is `--scrim`, not a new rgba. It is exactly what a scrim
       * is for, and rule "no colour that isn't in the token set" applies to a
       * backdrop like anything else. The literal after the comma is a fallback
       * for the one thing that could go wrong here — `::backdrop` inherits from
       * its originating element in current browsers, and did not always.
       */
      className={
        "m-auto w-[calc(100%-2rem)] max-w-sm rounded-[14px] border border-boundary " +
        "bg-popover p-6 text-foreground " +
        "backdrop:bg-[var(--scrim,rgba(14,16,19,0.72))]"
      }
    >
      <h2 id={`${id}-title`} className="type-h2">
        {title}
      </h2>
      <div id={`${id}-body`} className="mt-2 type-body text-muted-foreground">
        {body}
      </div>

      {/*
        Stacked below `sm` and reversed, so the destructive action is not the
        one under a thumb reaching for the bottom of the screen. Side by side
        above it, confirm last, which is where the eye finishes.
      */}
      <form
        method="dialog"
        className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"
      >
        <button
          value="cancel"
          disabled={pending}
          className="min-h-11 rounded-lg border border-boundary bg-secondary px-4 type-body font-medium text-foreground hover:bg-accent disabled:opacity-45"
        >
          {dismissLabel}
        </button>
        <button
          // Not a submit: the dialog stays up while the request runs.
          type="button"
          onClick={onConfirm}
          disabled={pending}
          // Rule 5: hue is spent on destructive actions, and this dialog only
          // ever fronts one.
          className="min-h-11 rounded-lg bg-destructive px-4 type-body font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-45"
        >
          {/*
            The name does not change to "Ending…". `CLAUDE.md`'s copy voice says
            an action keeps its name through the flow, and a label that changes
            under the cursor reads as a different button having appeared.
            `disabled` carries the state.
          */}
          {confirmLabel}
        </button>
      </form>
    </dialog>
  );
}

"use client";

import { Button } from "@/components/ui/button";

/**
 * §3.7: "The confirmation goes to the person taking the action, not the person
 * being replaced."
 *
 * The original spec had it the other way, and the reasoning for changing it is
 * the reasoning for this component's whole shape: confirming with the replaced
 * person blocks the second sharer on somebody else's dialog. If the current
 * presenter has stepped away, the share simply hangs. It also interrupts an
 * active presenter mid-sentence to ask permission for something they cannot
 * meaningfully weigh in the moment.
 *
 * So the person with the consequence is the person asked, and they are the only
 * one who has to be present for it to resolve.
 */
export function ReplaceShareDialog({
  presenter,
  onConfirm,
  onCancel,
}: {
  presenter: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Replace the current share"
      className="absolute inset-0 z-40 flex items-center justify-center px-6"
      style={{ background: "var(--scrim)" }}
    >
      <div
        className="w-full max-w-sm space-y-4 rounded-xl p-6"
        style={{ background: "var(--popover)", border: "1px solid var(--tile-border)" }}
      >
        <div className="space-y-2">
          <h2 className="type-h2">{presenter} is presenting</h2>
          <p className="type-body text-muted-foreground">
            Sharing will replace theirs. They&rsquo;ll be told you took over.
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          {/* Autofocus: this dialog exists because someone pressed a button and
              is waiting on it, so the default action should be one keystroke
              away rather than a tab away. */}
          <Button onClick={onConfirm} autoFocus>
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}

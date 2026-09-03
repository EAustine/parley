"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

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
 *
 * **It shipped in Phase 7 as a plain `<div role="dialog" aria-modal="true">`
 * with one autofocused button and no trap.** The floor now names that exactly:
 * "the ARIA attribute is what promises a trap, so using it without one is the
 * lie." A screen reader told the rest of the page was inert would let someone
 * tab straight out into a room they had been told was not there. This is a
 * real modal — it is the task, and the meeting behind it can wait for two
 * words — so it gets the trap rather than losing the attribute.
 *
 * Escape cancels, which is the difference from `ConnectionFailedDialog`: that
 * one has no safe closed state and is deliberately not dismissible, while
 * cancelling here simply leaves the existing share alone.
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
    <Dialog open onOpenChange={(next) => { if (!next) onCancel(); }}>
      <DialogContent showCloseButton={false} className="dark max-w-sm">
        <DialogTitle className="type-h2">{presenter} is presenting</DialogTitle>
        <DialogDescription className="type-body text-muted-foreground">
          Sharing will replace theirs. They&rsquo;ll be told you took over.
        </DialogDescription>

        <div className="mt-2 flex justify-end gap-2">
          <Button size="touch" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          {/* This dialog exists because someone pressed a button and is waiting
              on it, so the default action is one keystroke away rather than a
              tab away. */}
          <Button size="touch" onClick={onConfirm} autoFocus>
            Continue
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

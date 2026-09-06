"use client";

import { Button } from "@/components/ui/button";

/**
 * §12's iOS Safari row: "Detect `visibilitychange`, show an explicit resume
 * state, re-publish on return."
 *
 * Distinct from the reconnecting bar and from the failure modal, because the
 * cause is different and so is the remedy. Nothing is retrying here — the
 * connection did not survive the tab being hidden, and no amount of waiting
 * brings it back. The person has to ask.
 *
 * Explicit rather than automatic, deliberately. Coming back to a tab is not
 * consent to switch a camera on, and this codebase already treats the
 * indicator light as a first-class concern rather than a detail — `RoomStage`
 * disconnects on unmount for the same reason. Safari also sometimes requires
 * the gesture regardless, so automatic would be unreliable as well as
 * presumptuous.
 *
 * It covers the room rather than sitting in a corner: this is not a
 * degradation to work around, it is a meeting that has stopped, and a person
 * returning to the tab needs to know that before they start talking.
 */
export function ResumePrompt({ onResume }: { onResume: () => void }) {
  return (
    <div
      className="absolute inset-0 z-[var(--layer-dialogs)] flex items-center justify-center bg-background/80 px-6"
      role="status"
      aria-live="polite"
    >
      <div className="flex max-w-sm flex-col gap-4 text-center">
        <div className="space-y-2">
          <h2 className="type-h2">You left the meeting open in the background</h2>
          <p className="type-body text-balance text-muted-foreground">
            Your browser closed the connection while this tab was hidden.
            Everyone else is still there.
          </p>
        </div>
        <Button size="touch" onClick={onResume} className="w-full">
          Rejoin the meeting
        </Button>
      </div>
    </div>
  );
}

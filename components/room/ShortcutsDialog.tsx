"use client";

import { usePlatform } from "@/lib/hooks/usePlatform";
import { SHORTCUTS, formatChord } from "@/lib/room/shortcuts";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * §9: "`?` opens a shortcuts dialog."
 *
 * A real modal, and the inverse of `ConnectionFailedDialog`. That one is
 * deliberately not dismissible because it has no safe closed state — the
 * meeting is gone and both exits are the point. This one is the opposite: it
 * is a reference you glance at, dismissing it returns you to a working
 * meeting, so it takes the floor's whole modal contract unchanged. Radix
 * traps focus, Escape closes, and focus returns to whatever opened it.
 *
 * The rows come from `SHORTCUTS`, which is also what the matcher dispatches on
 * and what the control tooltips read. Three tooltips used to hardcode "⌘D",
 * "⌘E" and "⌘⌥C", which told a Windows user to press ⌘ for a Ctrl binding;
 * publishing the same facts here from a second source would have put the wrong
 * answer in two places instead of one.
 */
export function ShortcutsDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const platform = usePlatform();

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="dark max-w-sm">
        <DialogTitle className="type-h2">Keyboard shortcuts</DialogTitle>
        <DialogDescription className="sr-only">
          The keys that work anywhere in the meeting.
        </DialogDescription>

        <dl className="mt-2 space-y-3">
          {SHORTCUTS.map((shortcut) => (
            <div
              key={shortcut.action}
              className="flex items-baseline justify-between gap-4"
            >
              <dt className="type-body">{shortcut.label}</dt>
              <dd
                className="type-data shrink-0 rounded px-2 py-1 text-muted-foreground"
                style={{ background: "var(--secondary)" }}
              >
                {formatChord(shortcut.chord, platform)}
              </dd>
            </div>
          ))}
        </dl>

        <p className="type-small text-muted-foreground">
          Shortcuts pause while you&rsquo;re typing, so they never swallow a
          keystroke.
        </p>
      </DialogContent>
    </Dialog>
  );
}

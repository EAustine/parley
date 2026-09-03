"use client";

import Link from "next/link";

import { rememberName } from "@/lib/prejoin-handoff";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * §3.11's last row: "Modal on `--popover`: what happened, 'Rejoin' and 'Leave'."
 *
 * The room stays mounted behind it. Before this phase, a dropped connection
 * unmounted everything and rendered a full-page screen with a single "Join
 * again" link — which made §3.11's "Leave" meaningless, because you already
 * had. Keeping the room mounted is what makes both verbs true at once, and it
 * keeps the grid, the panels and the live region alive underneath so nothing
 * is rebuilt on a recovery.
 *
 * **Not dismissible, which is a documented deviation from the accessibility
 * floor.** The floor requires Escape to close a panel and return focus to its
 * trigger. There is no trigger here — nothing opened this, the network did —
 * and no safe closed state: dismissing would leave a frozen grid with no
 * explanation, which is exactly what §3.11 forbids. Both exits are always
 * present, neither is destructive, and Rejoin is the default focus. Written
 * down here rather than left for Phase 9 to rediscover as a bug.
 *
 * `showCloseButton={false}` also keeps shadcn's built-in lucide glyph out of
 * the room. `select.tsx` and `sonner.tsx` already render lucide internally and
 * have since Phase 0; this at least does not add another.
 *
 * "Rejoin" goes back through pre-join rather than reconnecting in place. After
 * a real outage someone may have moved network or changed device, and pre-join
 * is the screen that settles both — reusing a path that exists, with a fresh
 * token, rather than replaying one that may have expired.
 *
 * The display name goes with them. §3.11 asks for it explicitly, and the
 * reason is the moment rather than the keystrokes: someone who has just been
 * dropped from a meeting should not be handed a blank form. What does not
 * survive is the identity — a fresh token means LiveKit sees a new
 * participant. That is worth knowing rather than papering over.
 */
export function ConnectionFailedDialog({
  code,
  displayName,
}: {
  code: string;
  displayName: string;
}) {
  return (
    <Dialog open>
      <DialogContent
        showCloseButton={false}
        // Neither gesture may close it — see the note above.
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        className="dark max-w-sm"
      >
        <DialogTitle className="type-h2">Couldn&rsquo;t reconnect</DialogTitle>
        <DialogDescription className="type-body text-muted-foreground">
          Parley kept trying and the connection didn&rsquo;t come back. The
          meeting is still running — check your network and rejoin, or leave.
        </DialogDescription>

        <div className="mt-2 flex flex-col gap-2">
          <Button size="touch" asChild className="w-full">
            <Link href={`/j/${code}`} onClick={() => rememberName(displayName)}>
              Rejoin
            </Link>
          </Button>
          <Button size="touch" asChild variant="outline" className="w-full">
            <Link href="/dashboard">Leave</Link>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

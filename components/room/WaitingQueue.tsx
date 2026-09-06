"use client";

import { Button } from "@/components/ui/button";
import { initialOf } from "@/lib/room/participant";
import type { BlockedPerson, WaitingRequest } from "@/lib/hooks/useWaitingQueue";

/**
 * Who is at the door — BUILD-PLAN v1.5 A2.
 *
 * A section above the roster, **not a third tab**: C3 merged two panels into one
 * surface with two tabs, and adding a third would undo the fix rather than
 * build on it.
 *
 * ## Allow and Deny sit side by side, and v1.4 B1 refused exactly that
 *
 * B1 took two adjacent controls out of the participant row — one of them
 * destructive — and put them behind a `⋮`. This does the opposite, and A2
 * argues the distinction rather than waving at it:
 *
 * > "A roster row is passive, it exists to be read, and a stray tap on
 * > hover-revealed actions acted on someone you were only looking at. A waiting
 * > request is a pending decision — the row exists *solely* to be answered,
 * > both answers are expected, and Deny is reversible under B2. Putting one of
 * > two expected answers behind a menu costs the common flow and buys no
 * > safety."
 *
 * So: Allow primary, Deny secondary and visually distinct, both on the room's
 * 44px floor, and **neither hover-revealed** — which is the half B1 and A2 do
 * agree on, for the reason B1 gives: a hover-revealed action does not exist for
 * touch, and does not exist for a keyboard until focus has already arrived.
 */
export function WaitingQueue({
  waiting,
  onDecide,
  deciding,
}: {
  waiting: WaitingRequest[];
  onDecide: (id: string, decision: "admit" | "deny") => void;
  /** The row mid-decision, so a second tap cannot answer twice. */
  deciding: string | null;
}) {
  if (waiting.length === 0) return null;

  return (
    <section aria-label="Waiting to join" className="mb-4">
      <div className="mb-2.5 flex items-baseline gap-2 px-2">
        <h3 className="type-small font-semibold">Waiting to join</h3>
        <span className="type-caption tabular-nums text-muted-foreground">
          {waiting.length}
        </span>
      </div>

      <ul>
        {waiting.map((request) => (
          <li
            key={request.id}
            className="flex items-center gap-3 rounded-lg px-2 py-2"
          >
            <div
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary"
              aria-hidden
            >
              <span className="type-small text-secondary-foreground">
                {initialOf(request.name)}
              </span>
            </div>

            <div className="min-w-0 flex-1">
              <span className="type-body block truncate">{request.name}</span>
              {/*
                C1's load-bearing distinction, at the moment it matters most —
                the one decision where somebody is deciding *about* this name.
                "Signing in buys accountability, not authorisation… a guest can
                type your name and sit in the roster looking like you."
              */}
              <span className="type-caption block truncate text-muted-foreground">
                {request.verified ? "Signed in" : "Guest · name entered"}
              </span>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Button
                size="touch"
                onClick={() => onDecide(request.id, "admit")}
                disabled={deciding === request.id}
                aria-label={`Allow ${request.name} in`}
              >
                Allow
              </Button>
              {/*
                Secondary and visually distinct, never `--destructive`. Rule 5
                spends hue on exactly two things and a refusal at the door is
                neither — and B1's block makes this reversible, which is the
                property that keeps it out of the destructive tier at all.
              */}
              <Button
                size="touch"
                variant="outline"
                onClick={() => onDecide(request.id, "deny")}
                disabled={deciding === request.id}
                aria-label={`Deny ${request.name} entry`}
              >
                Deny
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {/* The queue is a different kind of list from the roster below it. */}
      <hr className="mt-4 border-t border-border" />
    </section>
  );
}


/**
 * Who is shut out, and the way back — BUILD-PLAN v1.5 B2.
 *
 * > "'Let them back in' clears the row. Removing the wrong person and being
 * > unable to fix it for ten minutes is a worse outcome than the one the block
 * > exists to prevent, and it is the more likely of the two."
 *
 * That asymmetry is why this is a visible list rather than a thing that expires
 * quietly. A host who mis-tapped Remove has no other way to know they did, and
 * ten minutes is a long time to be locked out of a meeting you were invited to.
 *
 * Below the queue and above the roster: a decision already made outranks a list
 * of people and is outranked by decisions still pending.
 */
export function BlockedList({
  blocked,
  onLetBackIn,
}: {
  blocked: BlockedPerson[];
  onLetBackIn: (id: string) => void;
}) {
  if (blocked.length === 0) return null;

  return (
    <section aria-label="Blocked" className="mb-4">
      <div className="mb-2.5 flex items-baseline gap-2 px-2">
        <h3 className="type-small font-semibold">Blocked</h3>
        <span className="type-caption tabular-nums text-muted-foreground">
          {blocked.length}
        </span>
      </div>

      <ul>
        {blocked.map((person) => (
          <li key={person.id} className="flex items-center gap-3 rounded-lg px-2 py-2">
            <div className="min-w-0 flex-1">
              <span className="type-body block truncate">{person.name}</span>
              <span className="type-caption block truncate text-muted-foreground">
                {/*
                  Denied and removed are different things that happened, and the
                  host is the one person who should be told which — the same
                  distinction A3 draws for the person on the other side of it.
                */}
                {person.reason === "removed" ? "Removed" : "Denied entry"}
                {person.returned ? " · tried to rejoin" : ""}
              </span>
            </div>
            <Button
              size="touch"
              variant="outline"
              onClick={() => onLetBackIn(person.id)}
              aria-label={`Let ${person.name} back in`}
            >
              Let back in
            </Button>
          </li>
        ))}
      </ul>

      <hr className="mt-4 border-t border-border" />
    </section>
  );
}

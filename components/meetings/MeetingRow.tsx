"use client";

import Link from "next/link";

import {
  formatClock,
  formatShortDay,
  formatZone,
} from "@/lib/meetings/format";
import type { MeetingStatus } from "@/lib/supabase/types";
import { CopyLinkButton } from "@/components/meetings/CopyLinkButton";
import { Badge } from "@/components/ui/badge";

export type MeetingRowData = {
  id: string;
  code: string;
  title: string;
  scheduled_start: string | null;
  /** Both read by `partitionMeetings` — see `lib/meetings/partition.ts`. */
  scheduled_end: string | null;
  status: MeetingStatus;
  created_at: string;
  started_at: string | null;
};

/**
 * A client component because the time must be rendered in the *viewer's* zone,
 * which the server does not know. Rendering it on the server would print the
 * server's zone and hydrate into a different string.
 *
 * ## v1.3 D1: the time leads
 *
 * "The time is the leftmost column at 15px so you scan times rather than
 * reading titles to find one." A 96px column — 64px on a phone — holding the
 * clock at 15px with the zone beneath it, then the title, then the actions.
 *
 * **The zone label is always printed.** PRD §3.9 calls this the one place a
 * quiet bug produces a missed meeting, and splitting `formatMeetingTime` into
 * pieces is exactly the edit that could have dropped it — which is why
 * `formatZone` exists as its own function rather than as an argument.
 *
 * In a **month** group the same column carries a short day, because a month
 * header cannot say which Thursday. In a **day** group it does not, because the
 * header already said.
 */
export function MeetingRow({
  meeting,
  past,
  group,
}: {
  meeting: MeetingRowData;
  past: boolean;
  /** Which header this row sits under — it decides what the column repeats. */
  group: "day" | "month";
}) {
  const when = meeting.scheduled_start ?? meeting.created_at;
  const cancelled = meeting.status === "cancelled";
  const duration = durationLabel(meeting);

  return (
    <li
      // Structural hooks for the suite. CLAUDE.md: "Scope queries by role or
      // test id, not by visible text" — and §3.9's zone label is precisely the
      // guarantee that a text-shaped query would stop checking the moment the
      // string was split into two elements, which v1.3 D1 did.
      data-meeting={meeting.code}
      /*
       * `group` for the hover reveal below. No hover *fill* on the row, and
       * that is a deliberate departure from the design.
       *
       * The design sets `.row:hover{background:var(--card)}`, and CLAUDE.md
       * already states what that is worth: "--card vs --background is 1.09:1".
       * It is not a visible state change. It is also a false affordance — the
       * row is not a link, and nothing in it navigates except the buttons at
       * its end. A full-row fill points at a click target that does not exist.
       */
      /*
       * Wraps below `sm`, and that is a departure from the design.
       *
       * `.ops` is `flex:none` and holds three controls — roughly 170px that no
       * amount of narrowing gives back. The design keeps it on the row at every
       * width, which at 390px leaves about 150px for the title and at 320px
       * about 32px. `BUILD-PLAN-v1.3.md`'s porting note is about exactly this:
       * "Every rule in a mobile media block must override every property the
       * desktop layout set, not just the ones that look layout-related" — the
       * mobile block sets `opacity:1` and leaves `flex:none` alone.
       *
       * It would also have passed the 320px sweep, because `.body` is
       * `min-width:0` and ellipsises rather than overflowing: the check asserts
       * the page does not scroll sideways, not that the row still says which
       * meeting it is.
       *
       * So on a phone the actions take their own line — `basis-full`, not
       * merely permission to wrap, because the body is `min-w-0` and shrinks
       * before the row ever wraps.
       *
       * **And the hover-hide applies only from `sm` up**, which is where there
       * is room for them inline. Both signals are load-bearing and they answer
       * different questions: `hover-hover` decides whether hiding is *safe*
       * (can this pointer reveal them again), and `sm` decides whether hiding
       * *buys* anything (is the row crowded without it). A phone satisfies
       * neither and shows them; a laptop satisfies both and hides them; a
       * tablet at 900px hovers no better than a phone and keeps them.
       */
      className="group flex flex-wrap items-start gap-x-3 gap-y-2 border-b border-border py-3.5 last:border-b-0 sm:flex-nowrap sm:items-center sm:gap-4"
    >
      {/* The design's 96px column, 64px on a phone. `shrink-0` so a long title
          never squeezes the thing the list is scanned by. */}
      <div className="w-16 shrink-0 sm:w-24">
        <span data-clock className="type-body block font-semibold tabular-nums">
          {formatClock(when)}
        </span>
        <span className="type-small block truncate text-muted-foreground">
          {group === "month" && (
            <>
              {formatShortDay(when)}
              <span aria-hidden> · </span>
            </>
          )}
          <span data-zone>{formatZone(when)}</span>
        </span>
      </div>

      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="type-body truncate font-medium">{meeting.title}</span>
          {/* One badge at most, and only where it changes what the row means.
              §3.2: cancelled meetings are "labelled as cancelled rather than
              silently mixed in with meetings that took place" — the label is
              the only thing distinguishing them. Live and Instant are gone:
              a live meeting is in its own block above the filter now, and
              "Instant" described how a meeting was made rather than anything
              you can do about it. */}
          {cancelled && (
            <Badge variant="outline" className="type-caption shrink-0">
              Cancelled
            </Badge>
          )}
        </div>

        <div className="type-small flex flex-wrap items-center gap-x-2 gap-y-0.5 text-muted-foreground">
          {/* Selectable as a unit: mono, letter-spaced, and one text node. */}
          <code className="type-data select-all tracking-[0.08em]">
            {meeting.code}
          </code>
          {duration && (
            <>
              <span aria-hidden>·</span>
              <span>{duration}</span>
            </>
          )}
        </div>
      </div>

      {/*
        D1: "Row actions appear on hover and are always visible on touch, so the
        list is quiet at rest."
        
        **Gated on `(hover: hover)`, not on width.** The design uses a 760px
        media query, and v1.3 C5 already settled that this is the wrong signal:
        "A narrow window on a laptop still reports (hover: hover), so the rule
        that hid Present on touch devices was green at 375px for the whole of
        v1.2." Here it is the same mistake mirrored — a width query leaves a
        tablet at desktop width with actions it can never hover into view.
        `hover-none:` is the capability, which is what the sentence means.

        `focus-within` keeps them reachable from the keyboard: they are opacity
        0, never `display:none`, so they hold their tab stops and appear the
        moment one takes focus.
      */}
      <div
        // A structural hook, because the assertion is about *rendered opacity*
        // and a query that finds this div by what it contains is one refactor
        // from finding a different div — or, as it did on the first run,
        // nothing at all.
        data-ops
        className="flex shrink-0 basis-full items-center justify-end gap-1 opacity-100 transition-opacity duration-[120ms] group-focus-within:opacity-100 sm:basis-auto sm:hover-hover:opacity-0 sm:group-hover:hover-hover:opacity-100 motion-reduce:transition-none"
      >
        {/*
          `!past` alone, and `!cancelled` is deliberately not here.
          
          Every cancelled meeting is a past meeting — `lib/meetings/partition.ts`
          returns "past" for `status === "cancelled"` before it looks at any
          time. So a second condition would never once change the outcome, and
          the mutation check proved it: deleting it failed nothing. CLAUDE.md's
          rule is to "name which gate each case exercises, pin the load-bearing
          one directly, and document the rest as backstops" — this one is not
          even a backstop, it is a restatement, so it goes.
          
          The effect it was written for still holds: a cancelled meeting's link
          leads to a designed dead end, and copying it would hand someone that.
        */}
        {!past && <CopyLinkButton code={meeting.code} />}
        {meeting.scheduled_start !== null && (
          <Link
            href={`/schedule/${meeting.code}`}
            className="type-small inline-flex h-9 items-center rounded-md px-3 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            Details
          </Link>
        )}
        {/* Join is withheld once a meeting is over. §3.2 keeps past meetings
            around and `/j/[code]` renders designed dead ends for them — but a
            control that promises an action it cannot perform is still a
            control that lies. Cancelled needs no clause of its own here for
            the reason given above: it is already past. */}
        {!past && (
          <Link
            href={`/j/${meeting.code}`}
            className="type-small inline-flex h-9 items-center rounded-md border px-3 font-medium"
            style={{ background: "var(--secondary)", borderColor: "var(--boundary)" }}
          >
            Join
          </Link>
        )}
      </div>
    </li>
  );
}

/** "30 min", when both ends of the slot are known. */
function durationLabel(meeting: MeetingRowData): string | null {
  if (!meeting.scheduled_start || !meeting.scheduled_end) return null;
  const minutes = Math.round(
    (new Date(meeting.scheduled_end).getTime() -
      new Date(meeting.scheduled_start).getTime()) /
      60_000,
  );
  return minutes > 0 ? `${minutes} min` : null;
}

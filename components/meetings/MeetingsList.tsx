"use client";

import { useMemo, useRef, useState } from "react";

import { groupMeetings } from "@/lib/meetings/group";
import { LiveMeetingCard } from "@/components/meetings/LiveMeetingCard";
import { MeetingRow, type MeetingRowData } from "@/components/meetings/MeetingRow";

type Filter = "upcoming" | "past";
const ORDER: Filter[] = ["upcoming", "past"];

/**
 * v1.3 D1's list: a live block, a segmented filter, and day- or month-grouped
 * rows beneath it.
 *
 * ## Client state, not a URL parameter
 *
 * A `?filter=past` search param would be shareable, and it would make every
 * click a full server navigation against an uncacheable RLS query with no
 * pending affordance at all — the mockup feels instant because its script flips
 * `aria-selected` locally, and a server round trip flips nothing until it
 * returns. "Ship a state with no design" is on the Never-do list, and there is
 * no loading state anywhere in this product to borrow. Both lists are already
 * fetched and already partitioned; switching between them is a local question
 * and gets a local answer.
 *
 * ## The tabs are real tabs, with real panels
 *
 * The design declares `role="tablist"` with two `role="tab"` buttons and no
 * tabpanel and no `aria-controls`. That is the failure CLAUDE.md names in three
 * other places: "the ARIA attribute is what promises a trap, so using it
 * without one is the lie." A tab promises a panel it controls and keyboard
 * navigation within the list, so both are here — arrows, Home, End, and a
 * roving `tabIndex`, the same contract `RoomPanel` already keeps.
 *
 * Both panels stay mounted with one hidden, so switching back does not re-run
 * the grouping or lose scroll position.
 */
export function MeetingsList({
  live,
  upcoming,
  past,
  now,
}: {
  live: MeetingRowData[];
  upcoming: MeetingRowData[];
  past: MeetingRowData[];
  /** The server's render clock — see `LiveMeetingCard`. */
  now: number;
}) {
  const [filter, setFilter] = useState<Filter>("upcoming");
  const tabs = useRef<HTMLDivElement>(null);

  const when = (m: MeetingRowData) => m.scheduled_start ?? m.created_at;

  // Grouped in the browser, because the boundaries are the *viewer's* days and
  // months and the server does not know their zone. Memoised on the arrays, so
  // switching tabs does not regroup either list.
  const upcomingGroups = useMemo(
    // The server's clock, not the browser's — v1.3 D5. "Today" is a comparison
    // against a *now*, and the partition that decided this row is upcoming used
    // the server's. Two clocks on one screen is how a row lands in Upcoming
    // under a header saying it already happened.
    () => groupMeetings(upcoming, when, "day", undefined, now),
    [upcoming, now],
  );
  const pastGroups = useMemo(() => groupMeetings(past, when, "month"), [past]);

  const onTabKeyDown = (event: React.KeyboardEvent) => {
    const at = ORDER.indexOf(filter);
    const go = (next: Filter) => {
      event.preventDefault();
      setFilter(next);
      tabs.current
        ?.querySelector<HTMLButtonElement>(`#tab-${next}`)
        ?.focus();
    };
    if (event.key === "ArrowRight") go(ORDER[(at + 1) % ORDER.length]);
    else if (event.key === "ArrowLeft") go(ORDER[(at - 1 + ORDER.length) % ORDER.length]);
    else if (event.key === "Home") go(ORDER[0]);
    else if (event.key === "End") go(ORDER[ORDER.length - 1]);
  };

  return (
    <div className="space-y-5">
      {/*
        One card per meeting. `live` is an array and the design draws a single
        block; two concurrent meetings is a real state with no mockup, and
        stacking is the reading that needs no new element.
        
        Headed, since A1's revision: the section holds a room with people in it
        *and* a room that is merely due, so it needs a name that covers both.
        "Happening now" is the plan's, and it is the only one of the three
        sections whose heading is not on a tab.
      */}
      {live.length > 0 && (
        <section aria-label="Happening now" className="space-y-2">
          <h2 className="type-caption tracking-[0.04em] text-muted-foreground uppercase">
            Happening now
          </h2>
          {live.map((meeting) => (
            <LiveMeetingCard key={meeting.id} meeting={meeting} now={now} />
          ))}
        </section>
      )}

      <div
        ref={tabs}
        role="tablist"
        aria-label="Filter meetings"
        className="inline-flex w-full rounded-full bg-muted p-[3px] sm:w-auto"
      >
        <FilterTab
          id="upcoming"
          label="Upcoming"
          count={upcoming.length}
          selected={filter === "upcoming"}
          onSelect={() => setFilter("upcoming")}
          onKeyDown={onTabKeyDown}
        />
        <FilterTab
          id="past"
          label="Past"
          count={past.length}
          selected={filter === "past"}
          onSelect={() => setFilter("past")}
          onKeyDown={onTabKeyDown}
        />
      </div>

      <div
        role="tabpanel"
        id="panel-upcoming"
        aria-labelledby="tab-upcoming"
        hidden={filter !== "upcoming"}
        tabIndex={0}
      >
        {upcomingGroups.length === 0 ? (
          <Nothing>Nothing coming up. Start a meeting whenever you need one.</Nothing>
        ) : (
          upcomingGroups.map((group) => (
            <Group key={group.key} heading={group.heading}>
              {group.meetings.map((meeting) => (
                <MeetingRow key={meeting.id} meeting={meeting} past={false} group="day" />
              ))}
            </Group>
          ))
        )}
      </div>

      <div
        role="tabpanel"
        id="panel-past"
        aria-labelledby="tab-past"
        hidden={filter !== "past"}
        tabIndex={0}
      >
        {pastGroups.length === 0 ? (
          <Nothing>No past meetings yet.</Nothing>
        ) : (
          pastGroups.map((group) => (
            <Group key={group.key} heading={group.heading}>
              {group.meetings.map((meeting) => (
                <MeetingRow key={meeting.id} meeting={meeting} past group="month" />
              ))}
            </Group>
          ))
        )}
      </div>
    </div>
  );
}

function Group({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-7 first:mt-0">
      <h2 className="type-caption mb-1 border-b border-border pb-2 tracking-[0.04em] text-muted-foreground uppercase">
        {heading}
      </h2>
      <ul>{children}</ul>
    </section>
  );
}

function Nothing({ children }: { children: React.ReactNode }) {
  return <p className="type-small py-6 text-muted-foreground">{children}</p>;
}

function FilterTab({
  id,
  label,
  count,
  selected,
  onSelect,
  onKeyDown,
}: {
  id: Filter;
  label: string;
  count: number;
  selected: boolean;
  onSelect: () => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      id={`tab-${id}`}
      aria-selected={selected}
      aria-controls={`panel-${id}`}
      // Roving tabIndex: one Tab stop for the whole control, arrows within it.
      tabIndex={selected ? 0 : -1}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      className="type-small inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full px-3.5 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] sm:flex-none"
      style={{
        // Selected is a fill *and* a value change, and the value change is the
        // half that carries it. In dark mode `--secondary` on `--muted` is
        // 1.07:1 — a fill you cannot see — so the label going from
        // `--muted-foreground` to `--foreground` is what actually says which
        // half of the list you are looking at. That is rule 5 working as
        // written ("weight, fill, and value"), but it is worth naming, because
        // `check:contrast` pairs foregrounds against surfaces and never asks
        // what a surface-on-surface change is worth.
        background: selected ? "var(--secondary)" : "transparent",
        color: selected ? "var(--foreground)" : "var(--muted-foreground)",
      }}
    >
      {label}
      <span className={selected ? "text-muted-foreground" : undefined}>{count}</span>
    </button>
  );
}

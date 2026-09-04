import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/auth/SignOutButton";
import Link from "next/link";

import { StartMeetingButton } from "@/components/meetings/StartMeetingButton";
import { Button } from "@/components/ui/button";
import { MeetingRow, type MeetingRowData } from "@/components/meetings/MeetingRow";
import { partitionMeetings } from "@/lib/meetings/partition";

export const metadata: Metadata = {
  title: "Meetings",
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The middleware already redirects, but a Server Component must not assume
  // a guard upstream of it held.
  if (!user) redirect("/sign-in?next=/dashboard");

  /**
   * Every row here is reached through RLS as this user, and the count comes
   * from the same query rather than a round trip per row.
   *
   * `scheduled_end` and `started_at` are new to this select, and A1's partition
   * cannot be computed without them. That is part of why the old predicate
   * could not have been right: it compared against `scheduled_start` not
   * because that was the intended rule, but because it was the only end of the
   * slot the query had fetched.
   */
  const { data, error } = await supabase
    .from("meetings")
    .select(
      "id, code, title, scheduled_start, scheduled_end, status, created_at, started_at, meeting_participants(count)",
    );

  const meetings: MeetingRowData[] = (data ?? []).map((m) => ({
    id: m.id,
    code: m.code,
    title: m.title,
    scheduled_start: m.scheduled_start,
    scheduled_end: m.scheduled_end,
    status: m.status,
    created_at: m.created_at,
    started_at: m.started_at,
    participantCount:
      (m.meeting_participants as unknown as { count: number }[] | null)?.[0]
        ?.count ?? 0,
  }));

  /**
   * Computed from `now()` at render, which is the half of D5 that A1 delivers
   * on its own. The other half — `router.refresh()` on window focus — is Track
   * D and is not here yet, so a dashboard left open still goes stale; it is
   * simply correct every time the page is rendered.
   */
  const { live, upcoming, past } = partitionMeetings(meetings, Date.now());

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-10 px-6 py-12">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="type-h1">Meetings</h1>
          <p className="type-small text-muted-foreground">
            Signed in as {user.email}
          </p>
        </div>
        {/* `flex-wrap` on the group, not just on its parent.
            WCAG 2.1 AA SC 1.4.10 asks for no horizontal scrolling at 320px, and
            this row was 383px of buttons — Start meeting, Schedule meeting,
            Sign out, and two gaps — inside 327px of content. Every button
            carries `shrink-0`, so nothing gave and the whole page scrolled
            sideways instead: 391px against 320, and against 375. The outer
            container already wrapped, but it wraps this group as one unit. */}
        <div className="flex flex-wrap items-center gap-2">
          <StartMeetingButton />
          {/* §3.10's second primary action. The empty state below has invited
              it since Phase 2; this is the button that invitation meant. */}
          <Button asChild variant="outline">
            <Link href="/schedule">Schedule meeting</Link>
          </Button>
          <SignOutButton />
        </div>
      </div>

      {error && (
        <p role="alert" className="type-small text-[var(--state-critical)]">
          Your meetings couldn&rsquo;t be loaded. Reload the page to try again.
        </p>
      )}

      {meetings.length === 0 && !error ? (
        <div className="rounded-lg border border-border p-10 text-center">
          <p className="type-body">
            No meetings yet. Start one now, or{" "}
            <Link href="/schedule" className="underline underline-offset-2">
              schedule for later
            </Link>
            .
          </p>
        </div>
      ) : (
        <div className="space-y-10">
          {/*
            Live is its own block above the two lists — A1: "never inside
            either list", because a meeting that is happening is neither
            something to be at nor something you came out of.

            Plain for now. D1 gives it the pulsing dot, the elapsed time and
            the participant count from `design/03-dashboard-schedule.html`;
            what matters here is that the partition has somewhere to put these
            rows, rather than leaving them in Upcoming until Track D arrives.
          */}
          {live.length > 0 && (
            <Section title="Live now" count={live.length}>
              <ul className="divide-y divide-border">
                {live.map((m) => (
                  <MeetingRow key={m.id} meeting={m} past={false} />
                ))}
              </ul>
            </Section>
          )}

          <Section title="Upcoming" count={upcoming.length}>
            {upcoming.length === 0 ? (
              <p className="type-small py-4 text-muted-foreground">
                Nothing coming up. Start a meeting whenever you need one.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {upcoming.map((m) => (
                  <MeetingRow key={m.id} meeting={m} past={false} />
                ))}
              </ul>
            )}
          </Section>

          {past.length > 0 && (
            <Section title="Past" count={past.length}>
              <ul className="divide-y divide-border">
                {past.map((m) => (
                  <MeetingRow key={m.id} meeting={m} past />
                ))}
              </ul>
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="type-caption text-muted-foreground">
        {title}
        <span className="tabular"> · {count}</span>
      </h2>
      {children}
    </section>
  );
}

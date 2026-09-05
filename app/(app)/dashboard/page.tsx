import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";

import { createClient } from "@/lib/supabase/server";
import { StartMeetingButton } from "@/components/meetings/StartMeetingButton";
import { Button } from "@/components/ui/button";
import { DashboardFreshness } from "@/components/meetings/DashboardFreshness";
import { MeetingsList } from "@/components/meetings/MeetingsList";
import type { MeetingRowData } from "@/components/meetings/MeetingRow";
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
   * Every row here is reached through RLS as this user, and in one query.
   *
   * `meeting_participants(count)` is **gone** — v1.3 D1. Nothing in this
   * application ever wrote that table: the LiveKit webhook handles
   * `room_started` and `room_finished` and no participant events, so the only
   * writer is `scripts/seed-dev.mjs`. The count was structurally zero, and it
   * was rendering on every past row as "0 participants" whatever had actually
   * happened. A number that is always wrong is worse than no number, so it
   * comes out until A2 creates the writer.
   */
  const { data, error } = await supabase
    .from("meetings")
    .select(
      "id, code, title, scheduled_start, scheduled_end, status, created_at, started_at",
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
  }));

  /**
   * One clock, read once, and passed down.
   *
   * D5's render-time half, which A1 delivers: the partition is computed from
   * `now()` on every server render rather than from a timer. The same reading
   * goes to the live block *and* to the day headers, so a meeting cannot be
   * bucketed against one clock and described against another — "Today" is a
   * comparison against a now, and it used to be the browser's while this was
   * the server's.
   *
   * The other half is `DashboardFreshness` below, which asks the server for a
   * new one when you come back to the tab. Between the two, "current" means
   * current as of the last time you looked at it rather than as of the last
   * time you loaded it.
   */
  const now = Date.now();
  const { live, upcoming, past } = partitionMeetings(meetings, now);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-8 sm:py-12">
      {/* v1.3 D5. Renders nothing; it holds the effect that re-asks the server
          when you come back to this tab. */}
      <DashboardFreshness />
      {/* D2: the page actions are Start meeting (primary) and Schedule
          (secondary). Sign out has left this row for the account menu in the
          header, and the "Signed in as" subtitle went with it — the email is
          the account's, and it now lives where the account's controls are. */}
      <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-start sm:justify-between">
        <h1 className="type-h1">Meetings</h1>
        <div className="flex shrink-0 gap-2">
          <StartMeetingButton className="flex-1 sm:flex-none" />
          <Button asChild variant="secondary" className="flex-1 sm:flex-none">
            <Link href="/schedule">Schedule</Link>
          </Button>
        </div>
      </div>

      {error && (
        <p role="alert" className="type-small text-[var(--state-critical)]">
          Your meetings couldn&rsquo;t be loaded. Reload the page to try again.
        </p>
      )}

      {meetings.length === 0 && !error ? (
        // CLAUDE.md quotes this string verbatim under Copy voice, so it is the
        // one that ships. The design rewrites it and also gives the same action
        // two names on one screen ("Start meeting" above, "Start a meeting"
        // inside) — the copy rule says an action keeps its name through the
        // flow, so the invitation stays a link to the button that is already
        // there.
        <div className="rounded-xl border border-border p-10 text-center">
          <p className="type-body">
            No meetings yet. Start one now, or{" "}
            <Link href="/schedule" className="underline underline-offset-2">
              schedule for later
            </Link>
            .
          </p>
        </div>
      ) : (
        <MeetingsList live={live} upcoming={upcoming} past={past} now={now} />
      )}
    </div>
  );
}

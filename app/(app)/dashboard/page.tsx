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
import type { MeetingStatus } from "@/lib/supabase/types";

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
   * **Two counts, because they are two different questions** — v1.3 A2, and D1
   * asks for them to be named before they are built.
   *
   * A row in `meeting_participants` is a *session*: it opens when somebody
   * arrives and closes when they go. So:
   *
   * - **`joined`** — every row — is how many arrivals a meeting had. It is what
   *   a past meeting wants: "four people were in this".
   * - **`here`** — rows with `left_at is null` — is how many are connected
   *   right now. It is what a happening-now meeting wants.
   *
   * Same table, two filters, and the distinction is not cosmetic: a meeting
   * three people passed through and left is `joined: 3, here: 0`, and reporting
   * either number under the other's name is a different meeting.
   *
   * The counts were removed entirely in D1 because nothing wrote the table —
   * the webhook handled `room_started` and `room_finished` and no participant
   * events, so every figure was structurally zero and the dashboard asserted
   * "0 participants" on meetings that had been full. A2 wired the writer, and
   * they come back.
   *
   * **A guest counts once per arrival, not once per person.** A guest identity
   * is minted fresh on every join, so somebody who drops and comes back is two
   * arrivals — there is nothing linking them, and inventing a link would mean
   * fingerprinting. A signed-in participant is `user_<uuid>` and is one.
   */
  const { data, error } = await supabase
    .from("meetings")
    .select(
      "id, code, title, scheduled_start, scheduled_end, status, created_at, started_at, " +
        "joined:meeting_participants(count), " +
        "here:meeting_participants(count)",
    )
    .is("here.left_at", null)
    /*
     * Cast, and narrowly.
     *
     * The generated Supabase types describe the tables; they do not model two
     * *aliased* embeds of the same relation with a filter applied to one of
     * them, so the inferred row collapses to an error type. The query itself is
     * ordinary PostgREST and was verified against the real database before this
     * was written: three sessions with one closed returns `joined: 3, here: 2`,
     * and zero for both once the rows are gone.
     *
     * The alternative was two round trips to avoid a cast, which is a worse
     * trade on the page D5 refreshes.
     */
    .overrideTypes<
      {
        id: string;
        code: string;
        title: string;
        scheduled_start: string | null;
        scheduled_end: string | null;
        status: MeetingStatus;
        created_at: string;
        started_at: string | null;
        joined: { count: number }[] | null;
        here: { count: number }[] | null;
      }[]
    >();

  const countOf = (value: unknown) =>
    (value as { count: number }[] | null)?.[0]?.count ?? 0;

  const meetings: MeetingRowData[] = (data ?? []).map((m) => ({
    id: m.id,
    code: m.code,
    title: m.title,
    scheduled_start: m.scheduled_start,
    scheduled_end: m.scheduled_end,
    status: m.status,
    created_at: m.created_at,
    started_at: m.started_at,
    joined: countOf(m.joined),
    here: countOf(m.here),
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

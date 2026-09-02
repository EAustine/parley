import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/auth/SignOutButton";
import Link from "next/link";

import { StartMeetingButton } from "@/components/meetings/StartMeetingButton";
import { Button } from "@/components/ui/button";
import { MeetingRow, type MeetingRowData } from "@/components/meetings/MeetingRow";

export const metadata: Metadata = {
  title: "Meetings",
};

/**
 * Upcoming and past. Past means ended, or scheduled for a time that has gone —
 * so an unstarted meeting whose slot has passed still appears rather than
 * vanishing, which §3.9 asks for explicitly.
 *
 * An instant meeting that was never joined is upcoming until it is ended: it
 * has no scheduled time to fall behind. The 12h expiry in §3.2 is a Phase 8
 * concern, driven by the LiveKit webhook.
 */
function isPast(m: { status: string; scheduled_start: string | null }) {
  // §3.2: "cancelled meetings leave the upcoming list and appear under past".
  // A meeting that is not going to happen is not something to be at.
  if (m.status === "ended" || m.status === "cancelled") return true;
  if (!m.scheduled_start) return false;
  return new Date(m.scheduled_start).getTime() < Date.now();
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The middleware already redirects, but a Server Component must not assume
  // a guard upstream of it held.
  if (!user) redirect("/sign-in?next=/dashboard");

  // Every row here is reached through RLS as this user. The count comes from
  // the same query rather than a second round trip per row.
  const { data, error } = await supabase
    .from("meetings")
    .select("id, code, title, scheduled_start, status, created_at, meeting_participants(count)");

  const meetings: MeetingRowData[] = (data ?? []).map((m) => ({
    id: m.id,
    code: m.code,
    title: m.title,
    scheduled_start: m.scheduled_start,
    status: m.status,
    created_at: m.created_at,
    participantCount:
      (m.meeting_participants as unknown as { count: number }[] | null)?.[0]
        ?.count ?? 0,
  }));

  // The two sections sort in opposite directions, which is why this is not a
  // single ORDER BY. Upcoming reads soonest-first — the next thing you have to
  // be at. Past reads most-recent-first — the thing you just came out of.
  // Instant meetings have no scheduled time and are startable now, so they lead
  // the upcoming list, newest first.
  const at = (m: MeetingRowData) =>
    new Date(m.scheduled_start ?? m.created_at).getTime();

  const upcoming = meetings
    .filter((m) => !isPast(m))
    .sort((a, b) => {
      if (!a.scheduled_start && !b.scheduled_start) return at(b) - at(a);
      if (!a.scheduled_start) return -1;
      if (!b.scheduled_start) return 1;
      return at(a) - at(b);
    });

  const past = meetings.filter(isPast).sort((a, b) => at(b) - at(a));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-10 px-6 py-12">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="type-h1">Meetings</h1>
          <p className="type-small text-muted-foreground">
            Signed in as {user.email}
          </p>
        </div>
        <div className="flex items-center gap-2">
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

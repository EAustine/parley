import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";

import { createClient } from "@/lib/supabase/server";
import { normaliseMeetingCode } from "@/lib/meetings/code";
import { toWallClock } from "@/lib/meetings/when";
import { publicEnv } from "@/lib/env";
import { MeetingSchedule } from "@/components/schedule/MeetingSchedule";

export const metadata: Metadata = { title: "Meeting" };

/**
 * A scheduled meeting's own page: the link, the calendar exports, and the form
 * to change it.
 *
 * Host-only, and the ownership check is the query — RLS returns this user's
 * rows and nothing else, so someone else's code reaches `notFound()` by the
 * same path a made-up one does.
 */
export default async function ScheduledMeetingPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code: raw } = await params;
  const code = normaliseMeetingCode(raw);
  if (!code) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?next=/schedule/${code}`);

  const { data: meeting } = await supabase
    .from("meetings")
    .select("code, title, description, scheduled_start, scheduled_end, timezone, status")
    .eq("code", code)
    .maybeSingle();

  if (!meeting || !meeting.scheduled_start) notFound();

  const start = new Date(meeting.scheduled_start);
  const end = meeting.scheduled_end
    ? new Date(meeting.scheduled_end)
    : new Date(start.getTime() + 60 * 60_000);

  const base = publicEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");

  return (
    <div className="mx-auto w-full max-w-xl px-6 py-12">
      <div className="mb-8 space-y-1">
        {/* A 28px minimum: WCAG 2.2 AA SC 2.5.8 asks for 24, and at 13/18
            this link rendered 72x16. Its inline exception does not apply — it
            stands alone above the heading rather than sitting in a sentence.
            28 rather than exactly 24 because a control that passes a floor by
            0.00px passes on rounding, and it is the height the small buttons
            on this surface already use. */}
        <Link
          href="/dashboard"
          className="type-small inline-flex min-h-7 items-center text-muted-foreground hover:text-foreground"
        >
          ← Meetings
        </Link>
        <h1 className="type-h1">{meeting.title}</h1>
      </div>

      <MeetingSchedule
        code={meeting.code}
        title={meeting.title}
        description={meeting.description}
        startISO={start.toISOString()}
        endISO={end.toISOString()}
        joinUrl={`${base}/j/${meeting.code}`}
        cancelled={meeting.status === "cancelled"}
        ended={meeting.status === "ended"}
        wall={toWallClock(start, meeting.timezone)}
        durationMinutes={Math.round((end.getTime() - start.getTime()) / 60_000)}
      />
    </div>
  );
}

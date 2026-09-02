import { NextResponse, type NextRequest } from "next/server";

import { createAnonClient } from "@/lib/supabase/anon";
import { createAdminClient } from "@/lib/supabase/admin";
import { normaliseMeetingCode } from "@/lib/meetings/code";
import { ICS_CONTENT_TYPE, buildIcs } from "@/lib/meetings/ics";
import { publicEnv } from "@/lib/env";

/**
 * The calendar file — §3.9, public.
 *
 * Public because a link-holder is exactly who needs it, and the file contains
 * only what the join page already shows them: the title, the time, and the
 * link. No host identity, no participant list — the same line
 * `get_meeting_by_code` draws.
 *
 * The lookup goes through that function too, so this route cannot become a
 * second, looser way to read a meeting. It needs two fields the function does
 * not return — `id` for the UID and `sequence` for the revision — and those
 * are fetched separately with the admin client, selecting exactly those two
 * columns and nothing else. Widening that select is the mistake to guard
 * against; there is a check for it.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code: raw } = await params;
  const code = normaliseMeetingCode(raw);
  if (!code) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const anon = createAnonClient();
  const { data: rows, error } = await anon.rpc("get_meeting_by_code", {
    p_code: code,
  });
  const meeting = error ? undefined : rows?.[0];
  if (!meeting) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // An instant meeting has no time to put in a calendar. Saying so is better
  // than emitting an event at whatever `now` happened to be.
  if (!meeting.scheduled_start) {
    return NextResponse.json({ error: "not_scheduled" }, { status: 404 });
  }

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("meetings")
    .select("id, sequence, scheduled_end, description")
    .eq("code", code)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const start = new Date(meeting.scheduled_start);
  const end = row.scheduled_end
    ? new Date(row.scheduled_end)
    : new Date(start.getTime() + 60 * 60_000);

  const base = publicEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const body = buildIcs({
    uid: row.id,
    host: new URL(base).host,
    title: meeting.title,
    description: row.description,
    start,
    end,
    // The moment this file was produced, per RFC 5545 §3.8.7.2 — not the
    // meeting's own time, which is a mistake that makes every regeneration
    // look identical to a client deciding whether to update.
    stamp: new Date(),
    sequence: row.sequence,
    url: `${base}/j/${code}`,
    cancelled: meeting.status === "ended",
  });

  return new NextResponse(body, {
    headers: {
      "Content-Type": ICS_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="${code}.ics"`,
      // A calendar file changes when the meeting is edited, and a cached copy
      // of the old one is exactly the missed-meeting failure §3.9 is about.
      "Cache-Control": "no-store",
    },
  });
}

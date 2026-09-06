import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { normaliseMeetingCode } from "@/lib/meetings/code";
import {
  updateMeetingSchema,
  type UpdateMeetingError,
} from "@/lib/meetings/schema";
import type { Database } from "@/lib/supabase/types";

type MeetingUpdate = Database["public"]["Tables"]["meetings"]["Update"];

/**
 * Editing and cancelling a scheduled meeting — §3.9, §7.
 *
 * Both are host-only, and neither checks ownership itself. The query runs as
 * the caller, and RLS returns their own rows and nothing else — so a request
 * for someone else's meeting finds no row and gets the same 404 a
 * made-up code gets. That is the correct answer twice over: it is true, and it
 * declines to confirm that a stranger's code exists.
 *
 * This is the same reasoning the token endpoint uses to decide who the host is.
 * One authority, not a second ownership check to drift out of step with it.
 */

function fail(error: UpdateMeetingError, status: number) {
  return NextResponse.json({ error }, { status });
}

async function hostAndCode(request: NextRequest, codeParam: string) {
  const code = normaliseMeetingCode(codeParam);
  if (!code) return { error: fail("not_found", 404) } as const;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: fail("unauthenticated", 401) } as const;

  return { supabase, code } as const;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code: codeParam } = await params;
  const context = await hostAndCode(request, codeParam);
  if ("error" in context) return context.error;
  const { supabase, code } = context;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("invalid_request", 400);
  }

  const parsed = updateMeetingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "invalid_request" satisfies UpdateMeetingError,
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 },
    );
  }
  const input = parsed.data;

  // Read as the caller: RLS is the ownership check.
  const { data: existing } = await supabase
    .from("meetings")
    .select("id, status, scheduled_start, sequence")
    .eq("code", code)
    .maybeSingle();
  if (!existing) return fail("not_found", 404);

  /*
   * **An instant meeting accepts exactly one edit: its door.**
   *
   * This guard used to refuse every `PATCH` on a meeting with no
   * `scheduled_start`, which is right for the edit form — title, times and
   * timezone are scheduling fields and an instant meeting has none. It is wrong
   * for `waiting_room`, which every meeting has and which §3.2 promises is
   * reversible. An instant meeting is precisely the case that needs it: the
   * create route defaults it *off*, so without this the door could never be
   * closed on the meetings that start with it open.
   */
  const onlyTheDoor =
    Object.keys(input).length === 1 && input.waitingRoom !== undefined;
  if (!existing.scheduled_start && !onlyTheDoor) {
    return fail("not_scheduled", 400);
  }
  if (existing.status === "ended" || existing.status === "cancelled") {
    return fail("already_ended", 409);
  }

  const patch: MeetingUpdate = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.description !== undefined) patch.description = input.description;
  if (input.timezone !== undefined) patch.timezone = input.timezone;
  if (input.waitingRoom !== undefined) patch.waiting_room = input.waitingRoom;
  if (input.scheduledStart !== undefined) {
    patch.scheduled_start = input.scheduledStart;
    if (input.durationMinutes !== undefined) {
      patch.scheduled_end = new Date(
        new Date(input.scheduledStart).getTime() + input.durationMinutes * 60_000,
      ).toISOString();
    }
  }

  /*
   * §3.9: "Editing a scheduled meeting regenerates the `.ics` with an
   * incremented SEQUENCE." Incremented here rather than in the ics route,
   * because it counts revisions of the meeting and not downloads of the file — a
   * client that fetched twice would otherwise see two revisions of an unchanged
   * event and have no way to tell that from a real edit.
   *
   * **Only for changes a calendar can see.** `waiting_room` is not one: nothing
   * about it appears in the `.ics`, so bumping the sequence for it would
   * announce a revision of an event that did not change, and every attendee's
   * client would re-notify them about a door setting they cannot observe. A
   * meeting whose door is toggled four times is still revision one.
   */
  const calendarVisible =
    input.title !== undefined ||
    input.description !== undefined ||
    input.timezone !== undefined ||
    input.scheduledStart !== undefined ||
    input.durationMinutes !== undefined;
  if (calendarVisible) patch.sequence = existing.sequence + 1;

  const { data, error } = await supabase
    .from("meetings")
    .update(patch)
    .eq("code", code)
    .select("code, title, description, scheduled_start, scheduled_end, timezone, status, sequence, waiting_room")
    .single();

  if (error) return fail("update_failed", 500);
  return NextResponse.json(data);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code: codeParam } = await params;
  const context = await hostAndCode(request, codeParam);
  if ("error" in context) return context.error;
  const { supabase, code } = context;

  const { data: existing } = await supabase
    .from("meetings")
    .select("id, status, sequence")
    .eq("code", code)
    .maybeSingle();
  if (!existing) return fail("not_found", 404);

  // Cancelling sets `cancelled`, never deletes the row. §3.2 is explicit that
  // this is a different event from a meeting running to its end: someone
  // holding a link for Thursday at 3, cancelled on Wednesday, arrives on time
  // and would otherwise read that they missed it. They didn't — it never
  // happened, and that is a factual error in user-facing copy.
  //
  // The row stays so a link already in an inbox keeps resolving to that
  // designed state rather than to the unknown-code page.
  if (existing.status === "cancelled" || existing.status === "ended") {
    return NextResponse.json({ code, status: existing.status });
  }

  const { data, error } = await supabase
    .from("meetings")
    .update({
      status: "cancelled",
      // `ended_at` is what the 30-day resolution window measures from, so a
      // cancelled meeting needs one too — otherwise the window would run from
      // `created_at` and a long-scheduled meeting could stop resolving sooner
      // than one cancelled today.
      ended_at: new Date().toISOString(),
      // The cancellation is itself a revision, so a calendar already holding
      // the event can tell this file supersedes the one it has. An unchanged
      // SEQUENCE is how a cancellation gets ignored.
      sequence: existing.sequence + 1,
    })
    .eq("code", code)
    .select("code, status")
    .single();

  if (error) return fail("update_failed", 500);
  return NextResponse.json(data);
}

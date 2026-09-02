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
  if (!existing.scheduled_start) return fail("not_scheduled", 400);
  if (existing.status === "ended") return fail("already_ended", 409);

  const patch: MeetingUpdate = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.description !== undefined) patch.description = input.description;
  if (input.timezone !== undefined) patch.timezone = input.timezone;
  if (input.scheduledStart !== undefined) {
    patch.scheduled_start = input.scheduledStart;
    if (input.durationMinutes !== undefined) {
      patch.scheduled_end = new Date(
        new Date(input.scheduledStart).getTime() + input.durationMinutes * 60_000,
      ).toISOString();
    }
  }

  // §3.9: "Editing a scheduled meeting regenerates the .ics with an incremented
  // SEQUENCE." Incremented here rather than in the ics route, because it counts
  // revisions of the meeting and not downloads of the file — a client that
  // fetched twice would otherwise see two revisions of an unchanged event and
  // have no way to tell that from a real edit.
  patch.sequence = existing.sequence + 1;

  const { data, error } = await supabase
    .from("meetings")
    .update(patch)
    .eq("code", code)
    .select("code, title, description, scheduled_start, scheduled_end, timezone, status, sequence")
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

  // Cancelling ends the meeting rather than deleting the row. §3.9 requires
  // past meetings to move to a section rather than disappear, and a link
  // already sent has to keep resolving — §3.2's "This meeting has ended" is a
  // designed state, where a 404 would tell someone holding a real invite that
  // it was never real.
  //
  // `ended` rather than a new `cancelled` status: the enum has three values and
  // adding a fourth means a migration, a change to `get_meeting_by_code`, and a
  // new join-page state to design. Worth doing if cancelled should read
  // differently from ended — flagged rather than decided here.
  if (existing.status === "ended") {
    return NextResponse.json({ code, status: "ended" });
  }

  const { data, error } = await supabase
    .from("meetings")
    .update({
      status: "ended",
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

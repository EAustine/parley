import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { normaliseMeetingCode } from "@/lib/meetings/code";
import { blockExpiry } from "@/lib/meetings/waiting";

/**
 * The host's answer — BUILD-PLAN v1.5 A2 and B1.
 *
 * A waiting request is a pending decision, and this is where it is made. Both
 * answers are expected: A2 argues that putting one of two expected answers
 * behind a menu costs the common flow and buys no safety, which is why Allow
 * and Deny sit side by side in the panel rather than behind a `⋮` the way the
 * roster's destructive actions do.
 *
 * **Deny writes a block, and that is the only reason B1 has to exist before
 * A2.** Without the table there is nowhere for a refusal to be recorded, so the
 * person turned away simply re-queues on their next poll and the host is asked
 * the same question forever.
 */

type DecisionError =
  | "invalid_request"
  | "meeting_not_found"
  | "not_host"
  | "already_decided";

function fail(error: DecisionError, status: number) {
  return NextResponse.json({ error }, { status });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string; id: string }> },
) {
  const { code: rawCode, id } = await params;
  const code = normaliseMeetingCode(rawCode);
  if (!code || !id) return fail("invalid_request", 400);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("invalid_request", 400);
  }
  const decision = (body as { decision?: unknown }).decision;
  if (decision !== "admit" && decision !== "deny") return fail("invalid_request", 400);

  /*
   * Host, established by RLS returning the meeting to its owner — the same
   * authorisation every other host surface uses. No separate ownership check,
   * which is a thing that drifts out of step with the policy it duplicates.
   */
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("not_host", 403);

  const { data: owned } = await supabase
    .from("meetings")
    .select("id")
    .eq("code", code)
    .maybeSingle();
  if (!owned) return fail("not_host", 403);

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("meeting_waiting")
    .select("id, meeting_id, subject, subject_type, status, display_name")
    .eq("id", id)
    .eq("meeting_id", owned.id)
    .maybeSingle();

  if (!row) return fail("meeting_not_found", 404);

  /*
   * Decided once. Two hosts is not a thing this product has, but two taps is —
   * and the second tap arriving after the first has written a block should not
   * write a second one with a fresh ten minutes on it.
   */
  if (row.status !== "waiting") return fail("already_decided", 409);

  const decidedAt = new Date().toISOString();
  const { error: updateError } = await admin
    .from("meeting_waiting")
    .update({
      status: decision === "admit" ? "admitted" : "denied",
      decided_at: decidedAt,
    })
    .eq("id", row.id)
    .eq("status", "waiting");

  if (updateError) return fail("invalid_request", 500);

  if (decision === "deny") {
    /**
     * The block, written with the refusal rather than after it.
     *
     * `upsert` on the unique subject index: a person denied, unblocked by the
     * host under B2, and denied again should end with one row carrying the
     * later expiry — not a duplicate-key error that leaves the host's action
     * looking like it failed.
     */
    await admin.from("meeting_blocks").upsert(
      {
        meeting_id: row.meeting_id,
        subject: row.subject,
        subject_type: row.subject_type,
        reason: "denied",
        expires_at: blockExpiry(),
        // The name they were known by — B2's undo needs somebody to offer back.
        display_name: row.display_name,
      },
      { onConflict: "meeting_id,subject_type,subject" },
    );
  }

  return NextResponse.json({
    id: row.id,
    status: decision === "admit" ? "admitted" : "denied",
    decidedAt,
  });
}

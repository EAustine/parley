import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { normaliseMeetingCode } from "@/lib/meetings/code";

/**
 * Letting somebody back in, and marking that the host has been told — v1.5 B2.
 *
 * > "'Let them back in' clears the row. Removing the wrong person and being
 * > unable to fix it for ten minutes is a worse outcome than the one the block
 * > exists to prevent, and it is the more likely of the two."
 *
 * That asymmetry is the whole argument for this route existing. The block is a
 * cost imposed on somebody who may have done nothing, by a host who may have
 * mis-tapped, and ten minutes is a long time to be locked out of a meeting you
 * were invited to. A mechanism with no undo makes the mistake permanent for its
 * whole duration.
 *
 * Two verbs, because they are two different acts:
 *
 *   DELETE  clear the block — they can come back now
 *   POST    mark it notified — the host has seen that they tried
 */

type BlockError = "invalid_request" | "not_host" | "not_found";

function fail(error: BlockError, status: number) {
  return NextResponse.json({ error }, { status });
}

/**
 * Host, by RLS returning the meeting to its owner.
 *
 * A successful read *is* the authorisation — the same shape every other host
 * surface uses, and deliberately not a separate ownership check, which is the
 * kind of thing that drifts out of step with the policy it duplicates.
 */
async function asHost(code: string | null) {
  if (!code) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: owned } = await supabase
    .from("meetings")
    .select("id")
    .eq("code", code)
    .maybeSingle();
  return owned ? { meetingId: owned.id } : null;
}

/** Let them back in. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string; id: string }> },
) {
  const { code: rawCode, id } = await params;
  const code = normaliseMeetingCode(rawCode);
  if (!code || !id) return fail("invalid_request", 400);

  const owner = await asHost(code);
  if (!owner) return fail("not_host", 403);

  const admin = createAdminClient();
  /*
   * Scoped to the meeting as well as the id. The id alone would be enough with
   * RLS in front of it, and this route uses the service role precisely because
   * it needs to reach a row the host has no *write* policy for — so the scope
   * has to be re-asserted here rather than assumed from the check above.
   */
  const { error } = await admin
    .from("meeting_blocks")
    .delete()
    .eq("id", id)
    .eq("meeting_id", owner.meetingId);

  if (error) return fail("not_found", 404);
  return NextResponse.json({ id, cleared: true });
}

/**
 * The host has seen that they came back.
 *
 * Separate from clearing, because seeing is not forgiving: a host who is told
 * somebody tried to return may well decide the block was right. Marking it
 * notified only stops the notice repeating — B2's "surfaces to the host once,
 * not once per attempt".
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string; id: string }> },
) {
  const { code: rawCode, id } = await params;
  const code = normaliseMeetingCode(rawCode);
  if (!code || !id) return fail("invalid_request", 400);

  const owner = await asHost(code);
  if (!owner) return fail("not_host", 403);

  const admin = createAdminClient();
  await admin
    .from("meeting_blocks")
    .update({ notified_at: new Date().toISOString() })
    .eq("id", id)
    .eq("meeting_id", owner.meetingId);

  return NextResponse.json({ id, notified: true });
}

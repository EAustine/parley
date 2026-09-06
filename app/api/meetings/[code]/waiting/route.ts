import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { normaliseMeetingCode } from "@/lib/meetings/code";
import { sanitiseDisplayName } from "@/lib/livekit/identity";
import { hostIsPresent } from "@/lib/meetings/door";
import { deviceCookie, readDeviceId, subjectFor } from "@/lib/room/device";
import { consumeRateLimit, rateLimitSubject } from "@/lib/rate-limit";

/**
 * The queue — BUILD-PLAN v1.5 A1.
 *
 * Two callers, deliberately on one route because they are two views of one row:
 *
 *   POST  a waiting person joins the queue, or asks again where they stand
 *   GET   the host reads who is waiting
 *
 * A1: "the waiting client polls a lightweight route until it is admitted,
 * denied, or the host ends the meeting. Boring, and its worst case is waiting a
 * few seconds longer." The queue is in Supabase and not in LiveKit, because the
 * alternative — admitting people with publish and subscribe disabled — fails by
 * letting somebody you did not admit hear the meeting.
 */

type WaitingError =
  | "invalid_request"
  | "meeting_not_found"
  | "meeting_ended"
  | "display_name_required"
  | "not_host"
  | "rate_limited";

function fail(error: WaitingError, status: number) {
  return NextResponse.json({ error }, { status });
}

/**
 * §7's tiers, applied to a route that is polled.
 *
 * A1: "The new routes need §7's two-tier limits. A join request that reaches a
 * lookup is a request that costs something, and the waiting endpoint is a
 * lookup on every poll."
 *
 * The overall tier is generous because polling is the design: at
 * `POLL_MS` = 2s, one person waiting five minutes is 150 requests, and a room
 * filling from one office multiplies that by the people in it. The miss tier is
 * the tight one and counts only codes that fail to resolve, which is what
 * separates a room full of colleagues from somebody walking the code space.
 */
const OVERALL = { limit: 240, windowSeconds: 60 };
const MISSES = { limit: 5, windowSeconds: 60 };

async function resolve(request: NextRequest, code: string | null) {
  if (!code) return { error: fail("invalid_request", 400) };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const subject = rateLimitSubject(request, user?.id ?? null);

  const overall = await consumeRateLimit({ key: `waiting:${subject}`, ...OVERALL });
  if (!overall.allowed) {
    return {
      error: NextResponse.json(
        { error: "rate_limited" satisfies WaitingError, retryAfter: overall.retryAfter },
        { status: 429, headers: { "Retry-After": String(overall.retryAfter) } },
      ),
    };
  }

  const admin = createAdminClient();
  const { data: meeting } = await admin
    .from("meetings")
    .select("id, status, host_id, waiting_room")
    .eq("code", code)
    .maybeSingle();

  if (!meeting) {
    // Counted only here, after the lookup failed — §7's rule that the tight
    // tier is about misses rather than about joining.
    const misses = await consumeRateLimit({ key: `waiting-miss:${subject}`, ...MISSES });
    if (!misses.allowed) {
      return {
        error: NextResponse.json(
          { error: "rate_limited" satisfies WaitingError, retryAfter: misses.retryAfter },
          { status: 429, headers: { "Retry-After": String(misses.retryAfter) } },
        ),
      };
    }
    return { error: fail("meeting_not_found", 404) };
  }

  return { admin, supabase, user, meeting };
}

/**
 * Join the queue, or ask again.
 *
 * Idempotent by construction: one open row per person per meeting, enforced by
 * `mw_open_request_idx`, so a client polling every two seconds writes once and
 * reads thereafter. The unique violation is tolerated rather than avoided with
 * a check-then-insert — the same rule meeting codes follow, for the same
 * reason: two polls can race and a check has a window inside it.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code: rawCode } = await params;
  const code = normaliseMeetingCode(rawCode);
  if (!code) return fail("invalid_request", 400);
  const resolved = await resolve(request, code);
  if ("error" in resolved) return resolved.error;
  const { admin, user, meeting } = resolved;

  if (meeting.status === "ended" || meeting.status === "cancelled") {
    return fail("meeting_ended", 410);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const displayName = sanitiseDisplayName((body as { displayName?: unknown }).displayName);

  const device = await readDeviceId();
  const who = subjectFor(user?.id, device.id);

  // Where do they stand? Read first: a poll is overwhelmingly a read, and a
  // decided row must not be overwritten by the next poll re-queuing them.
  const { data: existing } = await admin
    .from("meeting_waiting")
    .select("id, status, decided_at")
    .eq("meeting_id", meeting.id)
    .eq("subject", who.subject)
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let row = existing;

  if (!row || row.status === "denied") {
    /*
     * A denied person does not silently rejoin the queue. B1 blocks them for
     * ten minutes and the token endpoint is what enforces it; this route simply
     * declines to create a second pending row, so the host is not asked the
     * same question again by somebody pressing reload.
     */
    if (row?.status === "denied") {
      return NextResponse.json({ status: "denied", decidedAt: row.decided_at });
    }

    // A name is needed to appear in the host's list at all — a row saying
    // somebody is waiting, without saying who, is a decision nobody can make.
    if (!displayName) return fail("display_name_required", 400);

    const { data: created, error } = await admin
      .from("meeting_waiting")
      .insert({
        meeting_id: meeting.id,
        subject: who.subject,
        subject_type: who.subjectType,
        user_id: user?.id ?? null,
        display_name: displayName,
      })
      .select("id, status, decided_at")
      .single();

    if (error) {
      // 23505: the partial unique index doing its job against two polls
      // arriving together. The row it wanted exists, so read it.
      const { data: raced } = await admin
        .from("meeting_waiting")
        .select("id, status, decided_at")
        .eq("meeting_id", meeting.id)
        .eq("subject", who.subject)
        .eq("status", "waiting")
        .maybeSingle();
      if (!raced) return fail("invalid_request", 500);
      row = raced;
    } else {
      row = created;
    }
  }

  const response = NextResponse.json({
    status: row.status,
    decidedAt: row.decided_at,
    /*
     * Whether a host is here at all, so A3's screen can tell "waiting for the
     * host" from "waiting to be let in" — five terminal states that must not
     * share a screen, and two of them differ only by this.
     */
    hostPresent: await hostIsPresent(admin, meeting.id, code),
  });
  if (device.minted) response.cookies.set(deviceCookie(device.id));
  return response;
}

/**
 * What the host sees.
 *
 * Host only, and asked the way every other host surface asks: RLS returns the
 * meeting row to its owner and nobody else, so a successful read *is* the
 * authorisation. No separate ownership check to drift out of step with the
 * policy.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code: rawCode } = await params;
  const code = normaliseMeetingCode(rawCode);
  if (!code) return fail("invalid_request", 400);
  const resolved = await resolve(request, code);
  if ("error" in resolved) return resolved.error;
  const { admin, supabase, user, meeting } = resolved;

  if (!user) return fail("not_host", 403);
  const { data: owned } = await supabase
    .from("meetings")
    .select("id")
    .eq("code", code)
    .maybeSingle();
  if (!owned) return fail("not_host", 403);

  const { data: waiting } = await admin
    .from("meeting_waiting")
    .select("id, display_name, subject_type, user_id, requested_at")
    .eq("meeting_id", meeting.id)
    .eq("status", "waiting")
    .order("requested_at", { ascending: true });

  return NextResponse.json({
    waiting: (waiting ?? []).map((w) => ({
      id: w.id,
      name: w.display_name,
      /*
       * C1: "verified and typed names must be visibly different, and this is
       * the load-bearing part." Signing in buys accountability, not
       * authorisation — anyone can sign in with any Google account — so a
       * signed-in person is *identifiable* rather than invited. A guest can
       * type your name and sit in the roster looking like you, and a list that
       * does not say which is which implies an attestation the product cannot
       * make.
       */
      verified: w.subject_type === "user" && Boolean(w.user_id),
      requestedAt: w.requested_at,
    })),
  });
}

import "server-only";

import { NextResponse } from "next/server";
import { WebhookReceiver } from "livekit-server-sdk";

import { serverEnv } from "@/lib/env.server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * LiveKit's room lifecycle, written back to `meetings.status`.
 *
 * §7 lists this route and `CLAUDE.md`'s file layout names the file, but no
 * phase task list ever asked for it, which is how it went missing for seven
 * phases. What that cost is larger than it sounds: nothing in the product
 * wrote `status = 'live'` or `'ended'`, so a meeting that ran and emptied
 * stayed whatever it was created as, forever. The dashboard's past section
 * could not fill, the "Live" badge could not render, and §3.2's ended page —
 * with all the enum work that separated ended from cancelled — was unreachable
 * for every meeting that actually took place.
 *
 * A host pressing "End meeting" would cover some of it and not the host who
 * shuts a laptop, and `beforeunload` is not reliable enough to substitute. The
 * server is the only party that knows when a room really emptied.
 *
 * **Two events, deliberately.** `participant_joined` and `participant_left`
 * arrive far more often and would tell us nothing `room_started` and
 * `room_finished` do not — LiveKit closes a room once the last participant
 * leaves, which is exactly the transition being recorded.
 *
 * Rule 8d: `server-only` at the top. This module holds a service-role client
 * and the API secret, and importing it from a client component should be a
 * build error rather than a silent inclusion.
 */

/**
 * The signature covers the raw bytes, so the body must not be parsed first.
 * `request.json()` would consume the stream and re-serialising afterwards
 * would produce a different string and a failed check — for spacing, or key
 * order, neither of which is visible in a diff.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const receiver = new WebhookReceiver(
    serverEnv.LIVEKIT_API_KEY,
    serverEnv.LIVEKIT_API_SECRET,
  );

  let event;
  try {
    const body = await request.text();
    const authorization = request.headers.get("Authorization") ?? undefined;
    // Throws on a bad signature, a missing header, or a stale timestamp.
    event = await receiver.receive(body, authorization);
  } catch {
    // Deliberately not specific. Anyone can POST here, and telling an
    // unauthenticated caller *why* their signature failed is free help.
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  const code = event.room?.name;
  if (!code) {
    // Well-formed and signed, but about nothing we track — an egress or
    // ingress event, say. Acknowledged so LiveKit stops retrying it.
    return NextResponse.json({ ok: true });
  }

  // Service-role: this is infrastructure the caller must not be able to
  // influence, which is the same reason the rate limiter uses it. There is no
  // session here to run RLS against — the caller is LiveKit, and the signature
  // is what authorises the write.
  const supabase = createAdminClient();

  if (event.event === "room_started") {
    // `started_at` is only set once. A room can be started, emptied, and
    // started again by someone rejoining, and the first arrival is the honest
    // answer to "when did this meeting begin" — it is also what §3.2's 12h
    // expiry reads to mean "never joined".
    const { error } = await supabase
      .from("meetings")
      .update({ status: "live", started_at: new Date().toISOString() })
      .eq("code", code)
      .is("started_at", null);
    if (error) return NextResponse.json({ error: "write_failed" }, { status: 500 });

    // A room restarted after ending goes live again, without moving
    // `started_at`.
    await supabase
      .from("meetings")
      .update({ status: "live" })
      .eq("code", code)
      .eq("status", "ended");

    return NextResponse.json({ ok: true });
  }

  if (event.event === "room_finished") {
    // Cancelled is not overwritten. A host who cancels a scheduled meeting
    // that someone had already opened would otherwise have the cancellation
    // silently rewritten to "ended" when the empty room closed — and §3.2 is
    // explicit that those are different events which must not be conflated.
    const { error } = await supabase
      .from("meetings")
      .update({ status: "ended", ended_at: new Date().toISOString() })
      .eq("code", code)
      .neq("status", "cancelled");
    if (error) return NextResponse.json({ error: "write_failed" }, { status: 500 });

    return NextResponse.json({ ok: true });
  }

  // Signed, understood, and not one of ours.
  return NextResponse.json({ ok: true });
}

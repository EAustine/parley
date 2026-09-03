import { ImageResponse } from "next/og";

import { SITE_NAME } from "@/lib/site";
import { BACKGROUND, FOREGROUND, MUTED_FOREGROUND, Mark, instrumentSans } from "@/lib/og";

// next/font/google does not expose the font binary to ImageResponse, so the
// static weights are vendored in app/fonts/ and read from disk. The literal is
// required — Next reads this statically and cannot follow a re-export.
export const runtime = "nodejs";

export const alt = `You've been invited to a meeting on ${SITE_NAME}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * The card a pasted meeting link unfurls to — **with no meeting data in it**.
 *
 * BRAND.md specified a variant showing the meeting title and host, and
 * withdrew both. The host half reversed §3.2's decision against exposing host
 * identity to link-holders, and §6's `get_meeting_by_code` returns no host
 * field, so reaching it would have meant a service-role read on a public
 * unauthenticated route.
 *
 * The title half is the subtler one, and it is the reason this file takes no
 * parameters despite sitting on a dynamic route. **An unfurl discloses on
 * paste, not on open.** §3.2 reasoned about who holds the link; an unfurl
 * widens that to everyone who can see the channel, plus the platform's fetcher
 * and its cache. The counter — that anyone in the channel could click through
 * and read the title anyway — does not survive the accident case: paste a link
 * to the wrong channel and "1:1 re: performance concerns" is broadcast
 * instantly and passively to everyone scrolling past, where without an unfurl
 * it sits there until someone cares enough to click.
 *
 * Whoever pastes the link can type what the meeting is if they want it known.
 *
 * A second consequence worth having: taking no parameters means there is no
 * lookup, so there is no unknown-code, ended, cancelled or expired branch to
 * get wrong. An OG route must return an image rather than a 500, and the
 * surest way to do that is to have nothing to fail at.
 */
export default async function MeetingOpenGraphImage() {
  const fonts = await instrumentSans();

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          alignItems: "center",
          justifyContent: "center",
          gap: 44,
          backgroundColor: BACKGROUND,
          fontFamily: "Instrument Sans",
        }}
      >
        {/* Clear space on all sides is half the mark's height — BRAND.md. */}
        <Mark size={88} />

        <div
          style={{
            display: "flex",
            fontSize: 56,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            color: FOREGROUND,
            lineHeight: 1.1,
            textAlign: "center",
          }}
        >
          You&rsquo;ve been invited to a meeting
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 32,
            fontWeight: 400,
            color: MUTED_FOREGROUND,
          }}
        >
          on {SITE_NAME}
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}

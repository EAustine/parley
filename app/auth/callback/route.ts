import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/auth/redirect";

/**
 * Where both sign-in methods land: the magic link and the Google round-trip.
 *
 * Two shapes arrive here, and both have to work.
 *
 *   ?code=…        PKCE. What our own sign-in form produces, because the
 *                  browser client stores a verifier before sending the email.
 *
 *   ?token_hash=…  No verifier. What arrives when the link is opened somewhere
 *                  other than where it was requested — asked for on a laptop,
 *                  opened on a phone — which is ordinary behaviour, not an edge
 *                  case. Handling only `code` turns that into "this link is
 *                  broken" for a link that is perfectly valid.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNextPath(searchParams.get("next"));

  const fail = (message: string) =>
    NextResponse.redirect(`${origin}/sign-in?error=${encodeURIComponent(message)}`);

  // Supabase reports a refused or expired link here rather than by failing the
  // exchange, so read it before doing anything else.
  const reported =
    searchParams.get("error_description") ?? searchParams.get("error");
  if (reported) return fail(reported);

  const supabase = await createClient();

  const code = searchParams.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return fail("That link has expired or has already been used. Request a new one.");
    }
    return NextResponse.redirect(`${origin}${next}`);
  }

  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (error) {
      return fail("That link has expired or has already been used. Request a new one.");
    }
    return NextResponse.redirect(`${origin}${next}`);
  }

  // Neither shape present. The session may be in the URL fragment, which the
  // server never receives — the page below reads it in the browser.
  return NextResponse.redirect(
    `${origin}/auth/complete?next=${encodeURIComponent(next)}`,
  );
}

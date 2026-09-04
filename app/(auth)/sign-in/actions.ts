"use server";

import { redirect } from "next/navigation";

import { authErrorMessage } from "@/lib/auth/errors";
import { safeNextPath } from "@/lib/auth/redirect";
import { publicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/**
 * Sign-in happens on the server, and the route carries no auth SDK.
 *
 * `PRD.md` §10: "Most of that weight is `supabase-js` on the client, and it
 * does not need to be there — `signInWithOtp` sends its email server-side, and
 * `signInWithOAuth` returns a URL a server action can redirect to."
 *
 * The second consequence is the one worth having beyond the kilobytes: a form
 * that posts to a server action works with JavaScript disabled, and sign-in is
 * the last screen where a person should be told to enable it.
 */

/** What the form renders after a submit. Every branch is a designed state. */
export type SignInState =
  | { kind: "idle" }
  | { kind: "sent"; email: string }
  | { kind: "error"; message: string };

/**
 * The origin the email link points back at, from configuration rather than from
 * the request.
 *
 * The client version read `window.location.origin`. On the server the
 * equivalent is the `Host` header, which is attacker-controllable — and this
 * value ends up in an email as the destination of an authentication link, which
 * is the worst possible place to trust a request header. `NEXT_PUBLIC_APP_URL`
 * is validated as a URL at boot by `lib/env.ts`, and Supabase's own redirect
 * allow-list has to match it anyway.
 */
function callbackUrl(next: string) {
  const base = publicEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  return `${base}/auth/callback?next=${encodeURIComponent(next)}`;
}

export async function requestMagicLink(
  _previous: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim();
  const next = safeNextPath(String(formData.get("next") ?? ""));

  // The field is `required`, so this is the no-JavaScript path rather than a
  // state the UI can reach.
  if (!email) {
    return { kind: "error", message: "Enter the email address to send it to." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: callbackUrl(next) },
  });

  return error
    ? { kind: "error", message: authErrorMessage(error.message) }
    : { kind: "sent", email };
}

/**
 * Google, as a redirect rather than a client-side navigation.
 *
 * `signInWithOAuth` on the server does not navigate; it returns the provider
 * URL, and the action redirects to it. `redirect()` throws to unwind, so the
 * error branch below is only reached when Supabase itself refused.
 */
export async function startGoogleSignIn(formData: FormData): Promise<void> {
  const next = safeNextPath(String(formData.get("next") ?? ""));

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callbackUrl(next) },
  });

  if (error || !data?.url) {
    const message = authErrorMessage(error?.message);
    redirect(`/sign-in?error=${encodeURIComponent(message)}&next=${encodeURIComponent(next)}`);
  }

  redirect(data.url);
}

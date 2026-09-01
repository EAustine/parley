"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import { safeNextPath } from "@/lib/auth/redirect";

/**
 * The last resort in the sign-in chain.
 *
 * Supabase's default email template points at its own `/verify` endpoint, which
 * — when no PKCE verifier exists — hands the session back in the URL *fragment*.
 * Fragments are never sent to a server, so the callback route cannot see it and
 * has forwarded here.
 *
 * Reading it in the browser and calling setSession writes the same cookies the
 * server flow would have written, so everything downstream is unchanged. The
 * fragment is cleared from history immediately afterwards: leaving a refresh
 * token in the address bar means it survives in back-button history and in
 * anything that syncs open tabs.
 */
export function CompleteSignIn() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNextPath(params.get("next"));
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    const fragment = new URLSearchParams(hash);
    const accessToken = fragment.get("access_token");
    const refreshToken = fragment.get("refresh_token");
    const fragmentError =
      fragment.get("error_description") ?? fragment.get("error");

    // Strip the fragment before anything else can read it.
    if (hash) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }

    if (fragmentError) {
      setFailed(fragmentError);
      return;
    }

    if (!accessToken || !refreshToken) {
      setFailed("That link is missing its sign-in details. Request a new one.");
      return;
    }

    const supabase = createClient();
    supabase.auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error }) => {
        if (error) {
          setFailed("That link has expired or has already been used. Request a new one.");
          return;
        }
        router.replace(next);
        router.refresh();
      });
  }, [next, router]);

  useEffect(() => {
    if (failed) {
      router.replace(`/sign-in?error=${encodeURIComponent(failed)}`);
    }
  }, [failed, router]);

  return (
    <p className="type-body text-muted-foreground" role="status" aria-live="polite">
      Signing you in…
    </p>
  );
}

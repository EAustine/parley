"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

export const AUTH_CHANNEL = "parley-auth";

/**
 * Keeps every open tab agreed on who is signed in.
 *
 * Two mechanisms, because neither is sufficient alone:
 *
 *   onAuthStateChange fires in the tab that acted, and on token refresh. With
 *   cookie-backed storage it does not reliably reach sibling tabs, because
 *   nothing in those tabs is watching the cookie jar.
 *
 *   BroadcastChannel carries the event to the siblings. It is a notification
 *   only — the receiving tab re-renders from the server and the server decides
 *   what it may see. A forged message can at worst cause a refresh.
 *
 * Server Components hold the rendered state, so the response to either is
 * router.refresh() rather than local state surgery.
 */
export function AuthListener() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        router.refresh();
      }
    });

    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel(AUTH_CHANNEL);
      channel.onmessage = () => router.refresh();
    }

    return () => {
      subscription.unsubscribe();
      channel?.close();
    };
  }, [router]);

  return null;
}

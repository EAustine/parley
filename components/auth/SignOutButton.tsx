"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import { AUTH_CHANNEL } from "@/components/auth/AuthListener";
import { Button } from "@/components/ui/button";

/**
 * Signs out here, then tells the other tabs. Without the broadcast they keep
 * rendering a signed-in shell until something else forces a navigation — which
 * looks like the sign-out silently failed.
 */
export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    const supabase = createClient();
    await supabase.auth.signOut();

    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel(AUTH_CHANNEL);
      channel.postMessage({ event: "SIGNED_OUT" });
      channel.close();
    }

    router.refresh();
    router.push("/sign-in");
  }

  return (
    <Button variant="outline" onClick={signOut} disabled={busy}>
      {busy ? "Signing out…" : "Sign out"}
    </Button>
  );
}

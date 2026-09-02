import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { publicEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";

/**
 * A deliberately session-less client, for the one public read in the product.
 *
 * `/j/[code]` must resolve a meeting the way a stranger holding a link does.
 * Using the cookie-backed server client would send the browser's session, so a
 * signed-in host would exercise the `authenticated` path and the `anon` path —
 * the one that actually ships to guests — would never be tested by anyone
 * looking at the page.
 *
 * `get_meeting_by_code` is `security definer`: it runs with the owner's rights
 * and is the only thing standing between a meeting code and the row behind it.
 * The right way to trust it is to call it as the least-privileged caller there
 * is, on the real page, every time.
 */
export function createAnonClient() {
  return createSupabaseClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}

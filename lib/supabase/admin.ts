import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { publicEnv, serverEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";

/**
 * Service-role client. Bypasses RLS on every table.
 *
 * Why the key cannot leak even though nothing here says `server-only`: Next
 * inlines exactly the variables prefixed `NEXT_PUBLIC_` and nothing else, so
 * `SUPABASE_SERVICE_ROLE_KEY` is simply `undefined` in a client bundle. Import
 * this from a client component and it fails at runtime with a missing key — it
 * does not quietly ship one. The `server-only` package would turn that runtime
 * failure into a build error, which is better; it is a one-line dependency and
 * worth adding if you want it.
 *
 * Reserved for infrastructure the caller must not be able to influence — the
 * rate limiter's counters. Anything answering "may this person do this" uses
 * the caller's own client and lets RLS decide, because a service-role client
 * answers yes to everything.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";
import type { Database } from "@/lib/supabase/types";

/**
 * Service-role client. Bypasses RLS on every table.
 *
 * `server-only` at the top is rule 8d: importing this from a client component
 * is a build error rather than a runtime one. The key could not have leaked
 * either way — Next inlines only `NEXT_PUBLIC_` variables, so it reads as
 * `undefined` in a browser — but a failure with no visible symptom is exactly
 * the kind worth catching at build time.
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

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { publicEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";

/**
 * Server client for Server Components, Server Actions, and route handlers.
 *
 * Server Components cannot set cookies, so `setAll` is allowed to fail there —
 * the middleware refreshes the session on every request, so the write it
 * couldn't perform has already happened. Swallowing the error anywhere else
 * would hide a real bug, which is why the reason is written down rather than
 * left as a bare try/catch.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component. The middleware has already
            // refreshed the session cookie for this request.
          }
        },
      },
    },
  );
}

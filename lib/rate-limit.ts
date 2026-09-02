import type { NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Fixed-window IP rate limiting, counted in Postgres.
 *
 * §8 leans on this as a security control, which rules out a module-level Map:
 * on serverless each cold instance starts from zero, so the effective limit
 * becomes "10 per minute per instance" — a number nobody chose and nobody can
 * observe. The counter has to be shared.
 */

/** Best guess at the caller, preferring what the platform vouches for. */
export function clientIp(request: NextRequest): string {
  // Vercel sets this and strips any client-supplied copy, so it is not
  // spoofable there. `x-forwarded-for` is, which is why it comes second and
  // only its first hop is used.
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();

  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();

  return "unknown";
}

/**
 * Counts one request and reports whether it may proceed.
 *
 * Fails **open** on a database error, deliberately. This limiter guards against
 * code enumeration, and enumeration is already implausible at 8×10^14 codes;
 * a Supabase blip would otherwise take the whole product down rather than
 * degrade one defence. A limiter whose outage is an outage is the wrong shape
 * for this particular risk — it would be the wrong call for, say, a login
 * endpoint.
 */
export async function consumeRateLimit({
  key,
  limit,
  windowSeconds,
}: {
  key: string;
  limit: number;
  windowSeconds: number;
}): Promise<{ allowed: boolean; degraded: boolean }> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("consume_rate_limit", {
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });

    if (error) {
      console.error("rate limit unavailable, allowing request:", error.message);
      return { allowed: true, degraded: true };
    }

    return { allowed: data === true, degraded: false };
  } catch (error) {
    console.error("rate limit threw, allowing request:", error);
    return { allowed: true, degraded: true };
  }
}

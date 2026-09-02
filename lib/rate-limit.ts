import type { NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Fixed-window rate limiting, counted in Postgres.
 *
 * §8 leans on this as a security control, which rules out a module-level Map:
 * on serverless each cold instance starts from zero, so the effective limit
 * becomes "N per minute per instance" — a number nobody chose and nobody can
 * observe. The counter has to be shared.
 *
 * §7 keys the buckets on the caller, not always on the address: a signed-in
 * host is not the threat model, and putting them in a bucket shared with
 * everyone else behind the same office NAT punishes them for their colleagues.
 */

/**
 * Who to count against.
 *
 * A signed-in user gets their own bucket — §7 — which means an office of
 * seventeen colleagues is seventeen buckets rather than one. Everyone else is
 * counted by address, which is the only handle available.
 */
export function rateLimitSubject(
  request: NextRequest,
  userId: string | null,
): string {
  return userId ? `user:${userId}` : `ip:${clientIp(request)}`;
}

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
export type RateLimitVerdict = {
  allowed: boolean;
  /** Seconds until this bucket's window resets. Becomes `Retry-After`. */
  retryAfter: number;
  degraded: boolean;
};

export async function consumeRateLimit({
  key,
  limit,
  windowSeconds,
}: {
  key: string;
  limit: number;
  windowSeconds: number;
}): Promise<RateLimitVerdict> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("consume_rate_limit", {
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });

    if (error) {
      console.error("rate limit unavailable, allowing request:", error.message);
      return { allowed: true, retryAfter: 0, degraded: true };
    }

    // The function returns a single row; PostgREST gives it back as an array.
    const row = Array.isArray(data) ? data[0] : data;
    return {
      allowed: row?.allowed === true,
      // Falls back to the whole window rather than 0. A Retry-After of zero
      // invites an immediate retry, which is the stampede this exists to
      // spread out.
      retryAfter: Number(row?.retry_after) || windowSeconds,
      degraded: false,
    };
  } catch (error) {
    console.error("rate limit threw, allowing request:", error);
    return { allowed: true, retryAfter: 0, degraded: true };
  }
}

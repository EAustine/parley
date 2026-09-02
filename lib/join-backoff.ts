/**
 * What to do with a 429 on the way into a meeting.
 *
 * §7: "A 429 on join is not a dead end. Return `Retry-After` and have the
 * client hold the pre-join screen in a 'joining' state with automatic backoff,
 * not an error. A rare, very large meeting from one network should fill slowly
 * rather than fail."
 *
 * The server knows exactly when the window resets and says so, so there is
 * nothing to guess — the usual doubling backoff would be worse here, not
 * better, because it would keep waiting long after the allowance came back.
 *
 * Jitter is the one thing added. Everyone refused inside one window is told the
 * same reset second, so retrying precisely on it recreates the pile-up that
 * caused the refusal. A second or two of spread costs nothing and makes the
 * room fill smoothly instead of in bursts.
 */

/** Past this the wait stops being "filling up" and starts being broken. */
export const MAX_JOIN_ATTEMPTS = 5;

export function retryAfterSeconds(
  response: Response,
  body: { retryAfter?: unknown },
): number {
  const header = Number(response.headers.get("Retry-After"));
  const fromBody = Number(body?.retryAfter);
  const base =
    Number.isFinite(header) && header > 0
      ? header
      : Number.isFinite(fromBody) && fromBody > 0
        ? fromBody
        : 30; // The server said nothing usable. Half a window is a fair guess.

  // Never zero — an immediate retry is the stampede this exists to spread.
  return Math.max(1, Math.min(120, Math.ceil(base))) + jitter();
}

function jitter(): number {
  return Math.floor(Math.random() * 3);
}

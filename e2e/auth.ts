import type { Page } from "@playwright/test";

import { serviceFetch } from "./meeting-admin";

/**
 * Sign a page in, the way `check-meetings.mjs` does: a magic link minted with
 * the service role and consumed through the app's own callback.
 *
 * Every signed-in screen is behind auth and magic links otherwise arrive by
 * email, so this is the only way in from a test. It lives here rather than
 * inside `schedule.spec.ts` because the participants panel needs it too — a
 * host badge and the host-only actions beside it cannot be reached by a guest,
 * and until now nothing in the suite had ever been the host of the meeting it
 * was looking at.
 *
 * Note that Supabase invalidates the previous link when a new one is minted for
 * the same address, so callers need their own account — the `hostEmail`
 * fixture.
 */
/**
 * **No retry — and this time the decision is measured rather than assumed.**
 *
 * A bounded retry lived here briefly. It fired on the one refusal
 * `app/auth/callback/route.ts` reports for every `verifyOtp` failure — "That
 * link has expired or has already been used" — minted a fresh link and tried
 * once more. The case for it looked strong: `diagnose()` had shown
 * `callback requests: 1`, so this navigation was not consuming the link twice,
 * and a link minted milliseconds later verified fine.
 *
 * **Two full runs, forty minutes apart, settled it.**
 *
 * | Run | Retries fired | Failures |
 * |---|---|---|
 * | after three weeks idle | 1 | 2, both unrelated |
 * | after three more runs in the hour | 26 | 25, all auth |
 *
 * Same code, same freshly created accounts, one variable: how much the auth
 * endpoint had been asked for in the preceding hour. And of those 26 retries,
 * **50 attempts failed twice** — the second fresh link was refused as readily
 * as the first, so the retry recovered almost nothing while doubling the
 * requests against the endpoint already refusing them. It made its own
 * trigger more likely.
 *
 * So the original paragraph here was right, and is restored: "a suite that is
 * re-run until green is a suite that teaches you to ignore it." The refusal is
 * a rate signal, and the fix is to ask less often — one full run per idle
 * period — not to ask twice as hard. `diagnose()` stays, because the numbers
 * above only exist because it was there.
 */
export async function signIn(page: Page, email: string, next = "/dashboard") {
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabase || !service) {
    throw new Error("Run via `npm run check:media`, which loads .env.local.");
  }

  const result = await attempt(page, supabase, service, email, next);
  if (!result.ok) throw result.error!;
  return finish(page, result, next);
}

type Attempt = {
  ok: boolean;
  reported: string | null;
  landedOnSignIn: boolean;
  error?: Error;
};

/**
 * Mint a link, consume it, and report whether a session exists — without
 * throwing, so the caller can decide whether this failure is one to retry.
 */
async function attempt(
  page: Page,
  supabase: string,
  service: string,
  email: string,
  next: string,
): Promise<Attempt> {
  // `serviceFetch`, for the same reason the fixtures use it: a connect
  // timeout here fails a test that never reached the page it is about.
  const response = await serviceFetch(`${supabase}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: {
      apikey: service,
      Authorization: `Bearer ${service}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ type: "magiclink", email, redirect_to: "/" }),
  });
  const link = await response.json();
  if (!link.hashed_token) {
    throw new Error(`generate_link: HTTP ${response.status} ${JSON.stringify(link)}`);
  }

  /*
   * Count what the browser actually asks for, before asking for it.
   *
   * A magic link is single-use, so "already been used" has exactly two
   * readings: somebody else consumed it, or **this navigation consumed it
   * twice**. Nothing recorded which, so the diagnostic below counts the
   * requests rather than reasoning about them. Registered before the `goto`,
   * because a listener added afterwards is a listener that missed the event.
   */
  let callbackRequests = 0;
  const countCallbacks = (request: { url: () => string }) => {
    if (request.url().includes("/auth/callback")) callbackRequests += 1;
  };
  page.on("request", countCallbacks);
  const mintedAt = Date.now();

  try {
    await page.goto(
      `/auth/callback?token_hash=${link.hashed_token}&type=${link.verification_type}` +
        `&next=${encodeURIComponent(next)}`,
    );
  } finally {
    page.off("request", countCallbacks);
  }
  const consumedAfterMs = Date.now() - mintedAt;

  /**
   * **The cookie is the fact; the URL is an artefact.** Order matters here, and
   * the first version had it backwards.
   *
   * That version threw whenever the page ended on `/sign-in`, and it caught a
   * real case immediately — a WebKit run reporting "That link has expired or has
   * already been used." But a magic link is single-use, so that message can also
   * mean the callback was requested **twice**: the first request consumed the
   * token and set the session, the second was refused and redirected to the
   * error page. The session existed; only the last navigation was wrong.
   *
   * Asserting the URL first turns that into a failure. Asserting the session
   * first asks the question callers actually depend on, and it cannot hide a
   * genuine failure: no cookie still throws, carrying the reason the callback
   * reported.
   */
  const cookies = await page.context().cookies();
  const session = cookies.filter((c) => /^sb-.*auth-token/.test(c.name));
  const landed = new URL(page.url());
  const reported = landed.searchParams.get("error");
  const landedOnSignIn = landed.pathname.startsWith("/sign-in");

  if (session.length > 0) return { ok: true, reported, landedOnSignIn };

  return {
    ok: false,
    reported,
    landedOnSignIn,
    error: new Error(
      `signIn(${email}) established no session. Landed on ${landed.pathname}` +
        (reported ? ` with error: ${reported}` : "") +
        `, expected ${next}. Cookies present: ` +
        `${cookies.map((c) => c.name).join(", ") || "none"}.\n` +
        (await diagnose(supabase, service, email, {
          callbackRequests,
          consumedAfterMs,
        })),
    ),
  };
}

/*
 * Signed in, but possibly sitting on the error page from a duplicate request.
 * The caller asked to be at `next`, so go there — a navigation, not a retry of
 * the sign-in, and nothing is being papered over: the session is proven.
 */
async function finish(page: Page, result: Attempt, next: string) {
  if (result.landedOnSignIn) await page.goto(next);
}

/**
 * What actually went wrong, asked of Supabase rather than inferred.
 *
 * `app/auth/callback/route.ts` flattens **every** `verifyOtp` failure into one
 * sentence — "That link has expired or has already been used. Request a new
 * one." That is the right copy for a person and it is useless as a diagnosis:
 * expiry, reuse, a deleted account and a rate limit all arrive worded
 * identically. A whole session went into guessing between them, and three
 * hypotheses were tested and disproved from the outside — reuse, sequential
 * volume, and concurrency — because nothing here could see the real error.
 *
 * So on failure this asks four questions whose answers separate the cases. It
 * runs only when the sign-in has already failed, so it costs nothing in a green
 * run, and it is deliberately best-effort: a diagnostic that throws replaces the
 * failure it was meant to explain.
 *
 * | Reading | What it looks like |
 * |---|---|
 * | The navigation consumed the link twice | `callback requests: 2` |
 * | The token expired in flight | a large `consumed after` |
 * | The account was deleted under us | `account: gone` |
 * | Transient, whatever it was | `fresh link: verified` |
 * | Persistent at the account or project level | `fresh link: rejected …` |
 */
async function diagnose(
  supabase: string,
  service: string,
  email: string,
  observed: { callbackRequests: number; consumedAfterMs: number },
): Promise<string> {
  const lines = [
    `  callback requests: ${observed.callbackRequests} (2+ means this navigation used the link twice)`,
    `  consumed after: ${observed.consumedAfterMs}ms`,
  ];

  try {
    const headers = {
      apikey: service,
      Authorization: `Bearer ${service}`,
      "Content-Type": "application/json",
    };

    // Is the account still there? A racing teardown would explain everything
    // else, and it is the cheapest thing to rule in or out.
    const found = await serviceFetch(
      `${supabase}/auth/v1/admin/users?filter=${encodeURIComponent(email)}`,
      { headers },
    );
    const users = found.ok ? await found.json() : null;
    const exists = Array.isArray(users?.users) && users.users.length > 0;
    lines.push(`  account: ${exists ? "present" : "gone"}`);

    if (exists) {
      /*
       * Mint a second link and verify it **directly against Supabase**, not
       * through the app. Going around the callback is the point: it is the
       * layer that flattens the error, so this is the only way to read what
       * Supabase actually says.
       */
      const again = await serviceFetch(`${supabase}/auth/v1/admin/generate_link`, {
        method: "POST",
        headers,
        body: JSON.stringify({ type: "magiclink", email, redirect_to: "/" }),
      });
      const fresh = await again.json();
      if (!fresh.hashed_token) {
        lines.push(
          `  fresh link: could not be minted — HTTP ${again.status} ${JSON.stringify(fresh).slice(0, 200)}`,
        );
      } else {
        const verified = await serviceFetch(
          `${supabase}/auth/v1/verify?token=${fresh.hashed_token}&type=magiclink&redirect_to=/`,
          { redirect: "manual", headers: { apikey: service } },
        );
        const where = verified.headers.get("location") ?? "";
        lines.push(
          /error|otp_expired|rate/i.test(where)
            ? `  fresh link: rejected — HTTP ${verified.status} ${where.slice(0, 200)}`
            : `  fresh link: verified (so the failure above was transient)`,
        );
      }
    }
  } catch (error) {
    // Never mask the failure being explained.
    lines.push(`  diagnosis unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }

  return lines.join("\n");
}

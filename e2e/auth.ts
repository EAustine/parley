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
export async function signIn(page: Page, email: string, next = "/dashboard") {
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabase || !service) {
    throw new Error("Run via `npm run check:media`, which loads .env.local.");
  }

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
   * Assert the session actually took — otherwise this function fails silently
   * and every caller reports the wrong thing.
   *
   * `app/auth/callback/route.ts` redirects to `/sign-in?error=…` when the
   * exchange fails, carrying the reason. Nothing here read it. So a sign-in that
   * did not take returned normally, the caller carried on to a signed-in page,
   * the middleware bounced it back to `/sign-in`, and the test died twenty
   * seconds later on `expect(getByRole("heading", { name: "Meetings" }))` —
   * reporting "element not found" for a dashboard that was never going to
   * render, while the actual explanation sat unread in a query parameter.
   *
   * That is the same defect as every entry in `CLAUDE.md`'s testing rules: not
   * a check that fails, a check that stops asking. It cost most of a session's
   * debugging, because the failures moved between runs and each one named a
   * different innocent assertion.
   *
   * **Two assertions, and the cookie is the load-bearing one.** The URL check
   * catches the redirect the route actually performs; the cookie check catches
   * a session that is absent for any reason the route never saw. Landing
   * somewhere plausible is not the same as holding a session, and only one of
   * these is a statement about the thing callers depend on.
   *
   * **Deliberately no retry.** A bounded retry here would make the suite green
   * and hide whatever is causing this, which `CLAUDE.md` is explicit about:
   * "a suite that is re-run until green is a suite that teaches you to ignore
   * it." If this throws, that is information.
   */
  const cookies = await page.context().cookies();
  const session = cookies.filter((c) => /^sb-.*auth-token/.test(c.name));
  const landed = new URL(page.url());
  const reported = landed.searchParams.get("error");

  /**
   * **The cookie is the fact; the URL is an artefact.** Order matters here, and
   * the first version had it backwards.
   *
   * That version threw whenever the page ended on `/sign-in`, and it caught a
   * real case immediately — a WebKit run reporting "That link has expired or has
   * already been used." But a magic link is single-use, so that message means
   * the callback was requested **twice**: the first request consumed the token
   * and set the session, the second was refused and redirected to the error
   * page. The session existed; only the last navigation was wrong.
   *
   * Asserting the URL first turns that into a failure. Asserting the session
   * first asks the question callers actually depend on, and it cannot hide a
   * genuine failure: no cookie still throws, carrying the reason the callback
   * reported.
   */
  if (session.length === 0) {
    throw new Error(
      `signIn(${email}) established no session. Landed on ${landed.pathname}` +
        (reported ? ` with error: ${reported}` : "") +
        `, expected ${next}. Cookies present: ` +
        `${cookies.map((c) => c.name).join(", ") || "none"}.\n` +
        (await diagnose(supabase, service, email, {
          callbackRequests,
          consumedAfterMs,
        })),
    );
  }

  /*
   * Signed in, but sitting on the error page from the duplicate request. The
   * caller asked to be at `next`, so go there — a navigation, not a retry of
   * the sign-in, and nothing is being papered over: the session is already
   * proven above.
   */
  if (landed.pathname.startsWith("/sign-in")) {
    await page.goto(next);
  }
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

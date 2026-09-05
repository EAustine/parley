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

  await page.goto(
    `/auth/callback?token_hash=${link.hashed_token}&type=${link.verification_type}` +
      `&next=${encodeURIComponent(next)}`,
  );

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
  const landed = new URL(page.url());
  const reported = landed.searchParams.get("error");
  if (reported || landed.pathname.startsWith("/sign-in")) {
    throw new Error(
      `signIn(${email}) established no session. Landed on ${landed.pathname}` +
        (reported ? ` with error: ${reported}` : "") +
        `, expected ${next}.`,
    );
  }

  const cookies = await page.context().cookies();
  const session = cookies.filter((c) => /^sb-.*auth-token/.test(c.name));
  if (session.length === 0) {
    throw new Error(
      `signIn(${email}) reached ${landed.pathname} but set no Supabase auth ` +
        `cookie, so the next navigation will be treated as signed out. ` +
        `Cookies present: ${cookies.map((c) => c.name).join(", ") || "none"}.`,
    );
  }
}

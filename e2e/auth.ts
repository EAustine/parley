import type { Page } from "@playwright/test";

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

  const response = await fetch(`${supabase}/auth/v1/admin/generate_link`, {
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
}

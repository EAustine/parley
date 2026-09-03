import { type Browser, type Page } from "@playwright/test";

import { expect, test } from "./fixtures";

/**
 * §3.9's timezone acceptance, in real browsers set to real timezones.
 *
 * BUILD-PLAN: "Playwright takes `timezoneId` on a browser context, which sets
 * the real browser timezone — `Intl.DateTimeFormat().resolvedOptions()
 * .timeZone` returns it and every format call follows. That exercises the
 * whole rendering path, because the code never sees the OS, only the browser."
 *
 * Which is the point: `check:ics` proves the arithmetic, and this proves the
 * arithmetic is what reaches the screen. A formatter called with the wrong zone
 * produces a number that is internally consistent and wrong.
 *
 * Importing the file into three real calendar clients stays manual. "Valid
 * against RFC 5545" and "imports cleanly" are genuinely different claims.
 */

const ACCRA = "Africa/Accra";        // UTC+0 all year — no DST to reason about
const BERLIN = "Europe/Berlin";      // +1 winter, +2 summer
const LOS_ANGELES = "America/Los_Angeles";

/**
 * A time followed by *some* zone label.
 *
 * Deliberately not one format. A zone renders as `GMT` in Accra, `GMT+2` in
 * Berlin in summer, `GMT+5:30` in Kolkata and `PDT` in Los Angeles — `zzz`
 * prefers a named abbreviation wherever the zone has one. §3.9 requires a
 * label, not a particular spelling, so asserting one spelling would fail in
 * half the world for a product that is working correctly.
 */
const ZONE_LABEL = /\d{2}:\d{2} (GMT|UTC)([+-]\d{1,2}(:\d{2})?)?|\d{2}:\d{2} [A-Z]{2,5}\b/;

/**
 * A signed-in page in a given timezone.
 *
 * The session comes from a magic link minted with the service role, the same
 * way `check-meetings.mjs` gets one — every scheduling screen is behind auth
 * and magic links otherwise arrive by email.
 */
async function signedInPage(
  browser: Browser,
  timezoneId: string,
  email: string,
): Promise<Page> {
  const context = await browser.newContext({ timezoneId });
  const page = await context.newPage();

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
  if (!link.hashed_token) throw new Error(`generate_link: HTTP ${response.status}`);

  await page.goto(
    `/auth/callback?token_hash=${link.hashed_token}&type=${link.verification_type}&next=%2Fdashboard`,
  );
  await expect(page.getByRole("heading", { name: "Meetings" })).toBeVisible();
  return page;
}

/** Fill the schedule form and submit, returning the new meeting's code. */
async function schedule(
  page: Page,
  { title, date, time, timezone }: { title: string; date: string; time: string; timezone: string },
) {
  await page.goto("/schedule");
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Date").fill(date);
  await page.getByLabel("Start time").fill(time);

  await page.getByLabel("Timezone").click();
  await page.getByRole("option", { name: timezone.replace(/_/g, " ") }).click();

  await page.getByRole("button", { name: "Schedule meeting" }).click();
  await page.waitForURL(/\/schedule\/[a-z0-9-]+$/);
  return page.url().split("/").pop()!;
}

test.describe("across timezones", () => {
  test("a meeting made in Accra reads correctly in Berlin and Los Angeles", async ({ browser, hostEmail }) => {
    test.setTimeout(180_000);

    const accra = await signedInPage(browser, ACCRA, hostEmail);
    // The browser's own zone is what the form defaults to, and what every
    // format call reads. If this is wrong nothing below means anything.
    expect(
      await accra.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone),
    ).toBe(ACCRA);

    // 15 September, 14:30 in Accra — which is 14:30 UTC, since Accra is +0.
    const code = await schedule(accra, {
      title: "Quarterly planning",
      date: "2026-09-15",
      time: "14:30",
      timezone: ACCRA,
    });

    // …and it says so, with the zone label, where it was made.
    await expect(accra.getByText(/Tue 15 Sep, 14:30 GMT/)).toBeVisible();

    // Berlin, in September: +2. The same instant is 16:30 there.
    const berlin = await signedInPage(browser, BERLIN, hostEmail);
    await berlin.goto(`/schedule/${code}`);
    // §3.9: "always print the zone label" — the number alone is not checkable.
    await expect(berlin.getByText(/Tue 15 Sep, 16:30 GMT\+2/)).toBeVisible();
    // And the zone it was scheduled in is still shown, so a host can tell
    // which 14:30 was meant.
    await expect(berlin.getByText(/14:30 GMT.*where it was scheduled/)).toBeVisible();

    // Los Angeles, in September: −7. 07:30, same morning — and the label is
    // "PDT", not "GMT-7". `zzz` prefers a named abbreviation where the zone has
    // one, which is the more readable answer and not what I first expected.
    const la = await signedInPage(browser, LOS_ANGELES, hostEmail);
    await la.goto(`/schedule/${code}`);
    await expect(la.getByText(/Tue 15 Sep, 07:30 PDT/)).toBeVisible();

    // The calendar file describes the instant, so it is the same file for
    // everyone — that is what makes an invite mean one moment.
    const fromBerlin = await (await berlin.request.get(`/api/meetings/${code}/ics`)).text();
    const fromLa = await (await la.request.get(`/api/meetings/${code}/ics`)).text();
    expect(fromBerlin.match(/DTSTART:[^\r\n]+/)?.[0]).toBe("DTSTART:20260915T143000Z");
    expect(fromBerlin.match(/DTSTART:[^\r\n]+/)?.[0]).toBe(
      fromLa.match(/DTSTART:[^\r\n]+/)?.[0],
    );

    for (const page of [accra, berlin, la]) await page.context().close();
  });

  test("a winter meeting shifts with Berlin's offset, not with a fixed one", async ({ browser, hostEmail }) => {
    test.setTimeout(180_000);

    const accra = await signedInPage(browser, ACCRA, hostEmail);
    // Same wall clock as above, three months later. Berlin is +1 in December,
    // so this is 15:30 there rather than 16:30 — a fixed offset would print
    // the same number in both seasons, and be an hour wrong for half the year.
    const code = await schedule(accra, {
      title: "Winter planning",
      date: "2026-12-15",
      time: "14:30",
      timezone: ACCRA,
    });

    const berlin = await signedInPage(browser, BERLIN, hostEmail);
    await berlin.goto(`/schedule/${code}`);
    await expect(berlin.getByText(/Tue 15 Dec, 15:30 GMT\+1/)).toBeVisible();

    for (const page of [accra, berlin]) await page.context().close();
  });

  test("the dashboard prints the zone label too", async ({ browser, hostEmail }) => {
    const berlin = await signedInPage(browser, BERLIN, hostEmail);

    /**
     * Schedule the rows this reads, rather than reading whatever is there.
     *
     * It used to sign in and assert against the dashboard as found — which
     * meant it was really asserting on `seed:dev`'s fixtures, or on rows other
     * tests had left behind. `CLAUDE.md` names this file specifically: "Two
     * scheduling tests were wrong before the code was, because they leaned on
     * rows other sections deliberately mutate." This was the third.
     *
     * Two rows, not one: a missing label on the second row is as much a missed
     * meeting as on the first, and one row cannot show that the loop below runs
     * more than once.
     */
    await schedule(berlin, {
      title: "Zone label, first row",
      date: "2026-12-15",
      time: "15:30",
      timezone: "Europe/Berlin",
    });
    await schedule(berlin, {
      title: "Zone label, second row",
      date: "2026-12-16",
      time: "09:00",
      timezone: "Europe/Berlin",
    });

    await berlin.goto("/dashboard");
    // §3.9 makes the label non-optional: it is what makes the number checkable.
    // Asserted on every row rather than on one, since a missing label on the
    // second row is as much a missed meeting as on the first.
    const times = berlin.locator("li time, li span").filter({ hasText: /\d{2}:\d{2}/ });
    const count = await times.count();
    expect(count, "no times on the dashboard to check").toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      await expect(times.nth(i)).toHaveText(ZONE_LABEL);
    }
    await berlin.context().close();
  });
});

import { type Browser, type Page } from "@playwright/test";

import { expect, test } from "./fixtures";

import { signIn } from "./auth";

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
/**
 * The zone label, on its own — v1.3 D1.
 *
 * This replaced a pattern wanting a clock and a label welded into one string.
 * D1 split the dashboard row's column into a 15px clock and a label beneath it,
 * so on that surface the two are separate elements and the welded pattern could
 * not see either half — it matched the bare clock and reported a missing zone
 * label that was sitting in the sibling element.
 *
 * Both halves still get asserted, on every row — see the dashboard test below.
 * A zone label that stopped being printed fails this exactly as it did before;
 * what changed is where the test looks, not how much it demands.
 */
/**
 * A date that is always in the future, in a chosen month — and its weekday.
 *
 * **These were typed: `2026-09-15` and `2026-12-15`.** Both were comfortably
 * ahead when they were written and the September pair expired twelve days
 * before this run, which is a slow-motion version of the failure `CLAUDE.md`
 * describes for hand-written meeting codes: a fixture that looks like the real
 * thing and silently stops being it. v1.3 D3 refuses a past time on the server
 * *and* disables the submit button, so the symptom was a form that never
 * enabled and a three-minute timeout on a click — nothing about timezones,
 * which is what these tests are for.
 *
 * **The month is not arbitrary and must survive.** September puts Berlin in
 * CEST (+2) and December puts it in CET (+1); that contrast is the whole point
 * of having both tests, and "now plus a week" would land wherever the calendar
 * happens to be and assert nothing. So the month and day are kept and only the
 * year rolls forward.
 *
 * **The weekday is derived rather than typed**, because 15 September is a
 * Tuesday in 2026 and a Wednesday in 2027. It comes from `Intl`, which is a
 * different implementation from the `date-fns-tz` path the app renders with —
 * an independent oracle rather than a copy of our own arithmetic.
 */
function nextOccurrence(month: number, day: number, zone: string) {
  const at = (year: number) => new Date(Date.UTC(year, month - 1, day, 14, 30));
  const thisYear = new Date().getUTCFullYear();
  const when = at(thisYear).getTime() > Date.now() ? at(thisYear) : at(thisYear + 1);
  return {
    date: `${when.getUTCFullYear()}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    weekday: new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: zone }).format(when),
  };
}

/** September: Berlin is on CEST, +2. */
const SUMMER = nextOccurrence(9, 15, ACCRA);
/** `20270915`, from the same date the form is filled with — never typed twice. */
const SUMMER_STAMP = SUMMER.date.replace(/-/g, "");
/** December: Berlin is on CET, +1 — the contrast the winter test exists for. */
const WINTER = nextOccurrence(12, 15, ACCRA);

const ZONE_ONLY = /^(GMT|UTC)([+-]\d{1,2}(:\d{2})?)?$|^[A-Z]{2,5}$/;

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

  /*
   * **`signIn`, not a second copy of it.**
   *
   * This minted its own magic link and consumed it directly, which duplicated
   * `e2e/auth.ts` and diverged from it in the two ways that matter. It had no
   * diagnosis — a failure here reported "heading not found" for a dashboard
   * that was never going to render, which is the exact defect `signIn`'s
   * assertions were written to end. And it had no retry, so the transient
   * refusal `signIn` now recovers from failed these tests outright.
   *
   * It also minted a fresh link **three times per test** for one address, once
   * per timezone, and Supabase invalidates the previous link each time. Each
   * page consumed its own link immediately so it usually held, but the margin
   * was one slow navigation wide — and `schedule.spec` is one of the specs that
   * has failed this way.
   */
  await signIn(page, email, "/dashboard");
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
  /*
   * `fill`, because v1.3 D3 settled Start time as one control everywhere: a
   * native `<input type="time" step="900">`. It was briefly a select on
   * desktop, and this helper briefly asked the DOM which it had got.
   */
  await page.getByLabel("Start time").fill(time);

  /*
   * One call, on the IANA value — the select is native now, so the option's
   * value is the zone rather than its de-underscored label.
   *
   * And then read back, because this line was a guard that could not fail.
   * Every caller passed the zone the browser context was already in, and
   * `ScheduleForm` defaults to `browserTimeZone()` — so deleting these two
   * lines left all four tests green. `CLAUDE.md`: "Delete the guard. If no test
   * fails, the guard is untested." The read-back makes a no-op loud here; the
   * test below makes it loud where it matters, by scheduling in a zone the
   * browser is not in.
   */
  await page.getByLabel("Timezone").selectOption(timezone);
  await expect(page.getByLabel("Timezone")).toHaveValue(timezone);

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
      date: SUMMER.date,
      time: "14:30",
      timezone: ACCRA,
    });

    /*
     * …and it says so, with the zone label, where it was made.
     *
     * **The two lines swapped in v1.3 D4**, and it is a fix rather than a
     * preference. The heading line is now the meeting's *own* zone and the line
     * beneath it is the viewer's — which is the order `ScheduleForm`'s preview
     * has always used ("Starts 14:30 GMT" / "12:30 where you are"). The detail
     * page had the opposite, so the same meeting was described one way while
     * being scheduled and the other way afterwards.
     *
     * The format changed with it: the whole slot rather than its start, and the
     * day spelled out — design/03's "Friday 11 September, 10:00 – 10:30 GMT".
     */
    await expect(
      accra.getByText(new RegExp(`${SUMMER.weekday} 15 September, 14:30 – 15:00 GMT`)),
    ).toBeVisible();

    // Berlin, in September: +2. The same instant is 16:30 there — and now it is
    // the *second* line, because the meeting belongs to Accra.
    const berlin = await signedInPage(browser, BERLIN, hostEmail);
    await berlin.goto(`/schedule/${code}`);
    // §3.9: "always print the zone label" — the number alone is not checkable.
    await expect(
      berlin.getByText(new RegExp(`${SUMMER.weekday} 15 September, 14:30 – 15:00 GMT`)),
    ).toBeVisible();
    await expect(berlin.getByText(/16:30 – 17:00 GMT\+2 where you are/)).toBeVisible();

    // Los Angeles, in September: −7. 07:30, same morning — and the label is
    // "PDT", not "GMT-7". `zzz` prefers a named abbreviation where the zone has
    // one, which is the more readable answer and not what I first expected.
    const la = await signedInPage(browser, LOS_ANGELES, hostEmail);
    await la.goto(`/schedule/${code}`);
    await expect(la.getByText(/07:30 – 08:00 PDT where you are/)).toBeVisible();

    // The calendar file describes the instant, so it is the same file for
    // everyone — that is what makes an invite mean one moment.
    const fromBerlin = await (await berlin.request.get(`/api/meetings/${code}/ics`)).text();
    const fromLa = await (await la.request.get(`/api/meetings/${code}/ics`)).text();
    expect(fromBerlin.match(/DTSTART:[^\r\n]+/)?.[0]).toBe(`DTSTART:${SUMMER_STAMP}T143000Z`);
    expect(fromBerlin.match(/DTSTART:[^\r\n]+/)?.[0]).toBe(
      fromLa.match(/DTSTART:[^\r\n]+/)?.[0],
    );

    for (const page of [accra, berlin, la]) await page.context().close();
  });

  /**
   * The timezone select decides what is *stored*, not what is displayed.
   *
   * Every other test in this file schedules from a browser already in the zone
   * it passes, so the form's default was doing the work and the select was
   * never exercised — the mapping for the native-select swap found it, and it
   * had been true since the tests were written. This one schedules from Accra
   * *in Berlin's zone*, which the default cannot produce.
   *
   * 14:30 Berlin in September is 12:30 UTC. If the select did nothing, the form
   * would keep Accra, 14:30 would be stored as 14:30Z, and the assertion below
   * fails by exactly the two hours the control is for. §3.9 calls this the one
   * place a quiet bug produces a missed meeting.
   */
  test("the timezone select changes the instant that is stored", async ({ browser, hostEmail }) => {
    test.setTimeout(180_000);

    const accra = await signedInPage(browser, ACCRA, hostEmail);
    const code = await schedule(accra, {
      title: "Scheduled from Accra, in Berlin time",
      date: SUMMER.date,
      time: "14:30",
      timezone: BERLIN,
    });

    const ics = await (await accra.request.get(`/api/meetings/${code}/ics`)).text();
    expect(
      ics.match(/DTSTART:[^\r\n]+/)?.[0],
      "the stored instant is Accra's 14:30, so the timezone select did nothing",
    ).toBe(`DTSTART:${SUMMER_STAMP}T123000Z`);

    // And the page says which 14:30 was meant, from a viewer who is not there.
    await accra.goto(`/schedule/${code}`);
    // The meeting's own zone leads; Accra's is the line beneath it.
    await expect(
      accra.getByText(new RegExp(`${SUMMER.weekday} 15 September, 14:30 – 15:00 GMT\\+2`)),
    ).toBeVisible();

    await accra.context().close();
  });

  test("a winter meeting shifts with Berlin's offset, not with a fixed one", async ({ browser, hostEmail }) => {
    test.setTimeout(180_000);

    const accra = await signedInPage(browser, ACCRA, hostEmail);
    // Same wall clock as above, three months later. Berlin is +1 in December,
    // so this is 15:30 there rather than 16:30 — a fixed offset would print
    // the same number in both seasons, and be an hour wrong for half the year.
    const code = await schedule(accra, {
      title: "Winter planning",
      date: WINTER.date,
      time: "14:30",
      timezone: ACCRA,
    });

    const berlin = await signedInPage(browser, BERLIN, hostEmail);
    await berlin.goto(`/schedule/${code}`);
    /*
     * The meeting belongs to Accra, so Accra leads and Berlin is the line
     * beneath — which is where the claim now lives, unchanged: **+1**, not the
     * +2 the same wall clock produced in September. A fixed offset would print
     * the same number in both seasons and be an hour wrong for half the year.
     */
    await expect(
      berlin.getByText(new RegExp(`${WINTER.weekday} 15 December, 14:30 – 15:00 GMT`)),
    ).toBeVisible();
    await expect(
      berlin.getByText(/15:30 – 16:00 GMT\+1 where you are/),
    ).toBeVisible();

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
      date: WINTER.date,
      time: "15:30",
      timezone: "Europe/Berlin",
    });
    await schedule(berlin, {
      title: "Zone label, second row",
      date: nextOccurrence(12, 16, ACCRA).date,
      time: "09:00",
      timezone: "Europe/Berlin",
    });

    await berlin.goto("/dashboard");
    // §3.9 makes the label non-optional: it is what makes the number checkable.
    // Asserted on every row rather than on one, since a missing label on the
    // second row is as much a missed meeting as on the first.
    const rows = berlin.locator("li[data-meeting]");
    const count = await rows.count();
    expect(count, "no rows on the dashboard to check").toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      // Both halves, on every row. Scoped by test id rather than by tag or by
      // text — CLAUDE.md's rule, and the reason this test needed rewriting
      // rather than merely repointing: `li span` matched the new clock element
      // and reported a missing zone label that was right there in its sibling.
      await expect(rows.nth(i).locator("[data-clock]")).toHaveText(/^\d{2}:\d{2}$/);
      await expect(rows.nth(i).locator("[data-zone]")).toHaveText(ZONE_ONLY);
    }
    await berlin.context().close();
  });
});

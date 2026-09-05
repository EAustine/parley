import { devices } from "@playwright/test";

import { expect, test } from "./fixtures";
import { signIn } from "./auth";
import {
  addSessions,
  createFixtureHost,
  createMeeting,
  deleteFixtureHost,
} from "./meeting-admin";

/**
 * The meetings list and the header — BUILD-PLAN v1.3 D1 and D2.
 *
 * **This spec owns its fixtures.** CLAUDE.md names this file's neighbours for
 * getting it wrong: "Two scheduling tests were wrong before the code was,
 * because they leaned on rows other sections deliberately mutate." Every test
 * here builds an account and the exact rows it asserts on, and takes it away
 * again.
 *
 * The fixtures are also built from *offsets*, never from typed dates, so a
 * meeting is upcoming because it is in the future rather than because
 * September 2026 happened to be.
 */

const DAY = 86_400_000;
const HOUR = 3_600_000;

/**
 * An account with one of everything the list can show.
 *
 * Deliberately spanning two months in the past, because one month proves
 * nothing about grouping — a single header appears whether the code groups or
 * merely prints a heading once.
 */
async function dashboard() {
  const host = await createFixtureHost();
  const now = Date.now();
  await createMeeting({ host: host.id, status: "live", title: "Live design review" });
  await createMeeting({
    host: host.id, status: "scheduled", title: "Soon, today or tomorrow",
    scheduledStart: new Date(now + 5 * HOUR),
    scheduledEnd: new Date(now + 5 * HOUR + 30 * 60_000),
  });
  await createMeeting({
    host: host.id, status: "scheduled", title: "Later this fortnight",
    scheduledStart: new Date(now + 11 * DAY),
    scheduledEnd: new Date(now + 11 * DAY + 90 * 60_000),
  });
  /*
   * The past rows are pinned to the **middle** of a month, and that is the
   * whole of what makes this fixture owned.
   *
   * The obvious construction — three rows at now − 3, − 5 and − 70 days —
   * straddles two months when the suite runs on the 4th and one month when it
   * runs on the 20th, so the number of headers a correct grouping produces
   * depends on the date the test happens to run. That is a test that owns its
   * rows and not its assertion.
   *
   * Noon on the 15th and the 16th are the same month in every zone on earth
   * (UTC+14 pushes noon to 02:00 the next day, still mid-month), so two rows
   * share a month by construction. Forty days earlier is always a different
   * month, and lands near the 5th, far from either boundary.
   */
  const base = new Date(now - 40 * DAY);
  const mid = Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), 15, 12);
  await createMeeting({
    host: host.id, status: "ended", title: "Recent retro",
    scheduledStart: new Date(mid),
    scheduledEnd: new Date(mid + 30 * 60_000),
  });
  await createMeeting({
    host: host.id, status: "cancelled", title: "Postponed review",
    scheduledStart: new Date(mid + DAY),
    scheduledEnd: new Date(mid + DAY + 30 * 60_000),
  });
  await createMeeting({
    host: host.id, status: "ended", title: "Older kickoff",
    scheduledStart: new Date(mid - 40 * DAY),
    scheduledEnd: new Date(mid - 40 * DAY + 30 * 60_000),
  });
  return host;
}

const headings = (page: import("@playwright/test").Page, panel: string) =>
  page.locator(`#panel-${panel} h2`);

test.describe("the meetings list", () => {
  /**
   * D1: "Filter is a segmented control: Upcoming and Past with counts."
   *
   * And the contract that comes with calling it a tablist. The design declares
   * `role="tablist"` with two tabs, no tabpanel and no `aria-controls` — the
   * failure CLAUDE.md names three times over: "the ARIA attribute is what
   * promises a trap, so using it without one is the lie." So this asserts the
   * promise, not just the switch: a panel each tab controls, arrows and
   * Home/End moving between them, and one Tab stop for the whole control.
   */
  test("the filter switches panels, and keeps the contract a tablist promises", async ({ page }) => {
    const host = await dashboard();
    try {
      await signIn(page, host.email, "/dashboard");
      const upcoming = page.getByRole("tab", { name: /^Upcoming/ });
      const past = page.getByRole("tab", { name: /^Past/ });

      // Each tab names the panel it controls, and that panel exists.
      for (const [tab, id] of [[upcoming, "panel-upcoming"], [past, "panel-past"]] as const) {
        await expect(tab).toHaveAttribute("aria-controls", id);
        await expect(page.locator(`#${id}`)).toHaveAttribute("role", "tabpanel");
      }

      await expect(upcoming).toHaveAttribute("aria-selected", "true");
      await expect(page.locator("#panel-upcoming")).toBeVisible();
      await expect(page.locator("#panel-past")).toBeHidden();
      // Counts, from the partition rather than from the rendered rows.
      await expect(upcoming).toContainText("2");
      await expect(past).toContainText("3");

      // Roving tabIndex: one stop for the control, not one per tab.
      expect(
        await page.locator('[role="tab"]').evaluateAll((tabs) =>
          tabs.map((t) => t.getAttribute("tabindex")),
        ),
      ).toEqual(["0", "-1"]);

      await upcoming.focus();
      await page.keyboard.press("ArrowRight");
      await expect(past).toHaveAttribute("aria-selected", "true");
      await expect(past).toBeFocused();
      await expect(page.locator("#panel-past")).toBeVisible();
      await expect(page.locator("#panel-upcoming")).toBeHidden();

      await page.keyboard.press("Home");
      await expect(upcoming).toHaveAttribute("aria-selected", "true");
      await page.keyboard.press("End");
      await expect(past).toHaveAttribute("aria-selected", "true");
    } finally {
      await deleteFixtureHost(host.id);
    }
  });

  /**
   * D1 groups Upcoming by day. Past groups by **month**, because it grows
   * without limit and a year of it under day headers is close to one header
   * per row — worse than none, and worse every week.
   *
   * Asserted as the two resolutions producing different headers over the same
   * kind of data, not as a string: a month header names a month and a year, a
   * day header names a weekday.
   */
  test("upcoming groups by day and past groups by month", async ({ page }) => {
    const host = await dashboard();
    try {
      await signIn(page, host.email, "/dashboard");

      const days = await headings(page, "upcoming").allTextContents();
      expect(days.length, "two upcoming meetings, two different days").toBe(2);
      for (const heading of days) {
        expect(heading, `"${heading}" should name a weekday`).toMatch(
          /Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday/i,
        );
      }

      await page.getByRole("tab", { name: /^Past/ }).click();
      const months = await headings(page, "past").allTextContents();
      // Three past rows across two months — so grouping is doing something a
      // per-row header would not. See the fixture for why that is two and not
      // "however many months today happens to make it".
      expect(months.length, "three past rows spanning two months").toBe(2);
      for (const heading of months) {
        expect(heading, `"${heading}" should name a month and a year`).toMatch(
          /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}$/i,
        );
      }
      expect(months, "and never a weekday").not.toContainEqual(
        expect.stringMatching(/Monday|Tuesday|Wednesday/i),
      );
    } finally {
      await deleteFixtureHost(host.id);
    }
  });

  /**
   * D1: Join is for meetings you can still join.
   *
   * `/j/[code]` renders designed dead ends for an ended or cancelled meeting,
   * so this is not about avoiding a framework error page — it is that a control
   * promising an action it cannot perform is a control that lies. Cancelled
   * loses Copy link for the same reason: the link no longer works, so copying
   * it hands someone a dead end.
   */
  test("a past row withholds Join, and a cancelled one loses Copy link too", async ({ page }) => {
    const host = await dashboard();
    try {
      await signIn(page, host.email, "/dashboard");
      await page.getByRole("tab", { name: /^Past/ }).click();

      const rows = page.locator("#panel-past li[data-meeting]");
      await expect(rows).toHaveCount(3);
      for (let i = 0; i < 3; i++) {
        await expect(rows.nth(i).getByRole("link", { name: "Join" })).toHaveCount(0);
      }
      await expect(
        page.locator("#panel-past").getByRole("button", { name: /copy link/i }),
      ).toHaveCount(0);

      // And the cancelled one says so, which is the only thing distinguishing
      // it from a meeting that took place — §3.2.
      const cancelled = rows.filter({ hasText: "Postponed review" });
      await expect(cancelled).toHaveCount(1);
      await expect(cancelled).toContainText("Cancelled");

      // Upcoming rows keep both.
      await page.getByRole("tab", { name: /^Upcoming/ }).click();
      const upcoming = page.locator("#panel-upcoming li[data-meeting]").first();
      await expect(upcoming.getByRole("link", { name: "Join" })).toBeVisible();
    } finally {
      await deleteFixtureHost(host.id);
    }
  });

  /**
   * D1: "Live is its own block above the filter."
   *
   * Above it in the DOM, and in neither list — a meeting that is happening is
   * neither something to be at nor something you came out of. Asserted
   * structurally rather than by looking at pixels: the live title appears in
   * no `li[data-meeting]`, in either panel.
   */
  test("a live meeting is its own block, above the filter and in neither list", async ({ page }) => {
    const host = await dashboard();
    try {
      await signIn(page, host.email, "/dashboard");
      const block = page.getByRole("region", { name: "Happening now" });
      await expect(block).toContainText("Live design review");
      await expect(block).toContainText(/Started/);

      // Before the filter in document order.
      expect(
        await page.evaluate(() => {
          const region = document.querySelector('[aria-label="Happening now"]')!;
          const tablist = document.querySelector('[role="tablist"]')!;
          return region.compareDocumentPosition(tablist) & Node.DOCUMENT_POSITION_FOLLOWING;
        }),
        "the live block should precede the filter",
      ).toBeTruthy();

      for (const panel of ["upcoming", "past"]) {
        await page.getByRole("tab", { name: panel === "past" ? /^Past/ : /^Upcoming/ }).click();
        await expect(
          page.locator(`#panel-${panel} li[data-meeting]`).filter({ hasText: "Live design review" }),
        ).toHaveCount(0);
      }
    } finally {
      await deleteFixtureHost(host.id);
    }
  });

  /**
   * D1: "Row actions appear on hover and are always visible on touch, so the
   * list is quiet at rest."
   *
   * **Measured opacity, not a resolved class.** CLAUDE.md: "a class-resolving
   * check reads `h-11 w-11` and reports 44px while a parent constraint, a
   * conflicting utility, a transform, or a squeezed flex child delivers
   * something smaller. That is how the control bar shrank below the floor for
   * months with a green check."
   *
   * They are hidden with `opacity`, never `display`, so they keep their tab
   * stops throughout — which the focus half of this test is what proves.
   */
  test("row actions are quiet at rest and reachable from the keyboard", async ({ page }) => {
    const host = await dashboard();
    try {
      await signIn(page, host.email, "/dashboard");
      await page.setViewportSize({ width: 1280, height: 900 });

      const row = page.locator("#panel-upcoming li[data-meeting]").first();
      const ops = row.locator("[data-ops]");
      const opacity = () => ops.evaluate((el) => getComputedStyle(el).opacity);

      expect(await opacity(), "at rest on a pointer that can hover").toBe("0");

      await row.hover();
      await expect.poll(opacity, { timeout: 2000 }).toBe("1");

      // Still in the tab order while invisible: focusing from the keyboard is
      // what brings them back, so `display:none` would have been wrong.
      await page.mouse.move(0, 0);
      await expect.poll(opacity, { timeout: 2000 }).toBe("0");
      await row.getByRole("link", { name: "Join" }).focus();
      await expect.poll(opacity, { timeout: 2000 }).toBe("1");
    } finally {
      await deleteFixtureHost(host.id);
    }
  });

  /**
   * The other half, on real devices rather than narrow windows.
   *
   * v1.3 C5 is the reason these are devices and not viewports: "A narrow window
   * on a laptop still reports `(hover: hover)`, so the rule that hid Present on
   * touch devices was green at 375px for the whole of v1.2." A width-based test
   * of a hover-based rule proves nothing about either.
   *
   * **The tablet is the case that matters**, and the phone alone would not have
   * caught it. A phone is narrow *and* cannot hover, so a width query and a
   * hover query agree there and either implementation passes. An iPad in
   * landscape is 1194px wide and still cannot hover — it is the one machine on
   * which the design's `@media (max-width:760px)` hides a row's actions behind
   * a gesture the device does not have.
   */
  for (const device of ["Pixel 5", "iPad Pro 11 landscape"] as const) {
    test(`and always visible on ${device}, which cannot hover`, async ({ browser }) => {
      const host = await dashboard();
      const context = await browser.newContext({ ...devices[device] });
      const page = await context.newPage();
      try {
        await signIn(page, host.email, "/dashboard");
        const row = page.locator("#panel-upcoming li[data-meeting]").first();
        const ops = row.locator("[data-ops]");
        expect(
          await page.evaluate(() => matchMedia("(hover: hover)").matches),
          `${device} should report that it cannot hover`,
        ).toBe(false);
        expect(
          await ops.evaluate((el) => getComputedStyle(el).opacity),
          "nothing may be hidden behind a gesture this device does not have",
        ).toBe("1");
      } finally {
        await context.close();
        await deleteFixtureHost(host.id);
      }
    });
  }

  /**
   * The counts, back with v1.3 A2 — and read **through RLS as the host**, which
   * is the half that matters.
   *
   * `meeting_participants` had no writer for the whole of v1.2, so every count
   * was structurally zero and past rows asserted "0 participants" on meetings
   * that had been full. A test that read the table as the service role would
   * have reproduced that bug rather than caught it: the query was never the
   * problem, the empty table was, and RLS is the other thing that can silently
   * return nothing.
   *
   * Two counts, because they are two questions. A meeting three people passed
   * through and left is `joined: 3, here: 0`, and reporting either under the
   * other's name describes a different meeting.
   */
  test("a past meeting reports arrivals, and a live one reports who is here", async ({ page }) => {
    const host = await createFixtureHost();
    const now = Date.now();
    try {
      const over = await createMeeting({
        host: host.id, status: "ended", title: "Finished with people",
        scheduledStart: new Date(now - 2 * HOUR),
        scheduledEnd: new Date(now - HOUR),
      });
      // Three arrivals, all gone: what a past meeting reports is the arrivals.
      await addSessions(over, [
        { name: "Ama", identity: "guest_a", left: true },
        { name: "Kwabena", identity: "guest_b", left: true },
        { name: "Yaw", identity: "guest_c", left: true },
      ]);

      const running = await createMeeting({
        host: host.id, status: "live", title: "Running with people",
      });
      // Three arrivals, one already gone: what a live meeting reports is two.
      await addSessions(running, [
        { name: "Ama", identity: "guest_d" },
        { name: "Kwabena", identity: "guest_e" },
        { name: "Yaw", identity: "guest_f", left: true },
      ]);

      await signIn(page, host.email, "/dashboard");
      await expect(page.getByRole("heading", { name: "Meetings" })).toBeVisible();

      const live = page.getByRole("region", { name: "Happening now" });
      await expect(live).toContainText("2 people");
      // Not the arrivals — three people have been in this room.
      await expect(live).not.toContainText("3 people");

      await page.getByRole("tab", { name: /^Past/ }).click();
      const row = page
        .locator("#panel-past li[data-meeting]")
        .filter({ hasText: "Finished with people" });
      await expect(row).toContainText("3 people");
    } finally {
      await deleteFixtureHost(host.id);
    }
  });
});

test.describe("the account menu", () => {
  /**
   * D2: "'Sign out' was a peer of 'Start meeting', which it is not."
   *
   * Two claims, and the second is the one that would rot quietly: sign out is
   * *in* the menu, and it is no longer in the page-action row beside the two
   * things you came to the page to do.
   */
  test("carries the email, the theme and sign out — and sign out has left the page actions", async ({ page }) => {
    const host = await dashboard();
    try {
      await signIn(page, host.email, "/dashboard");

      // Gone from the page, until the menu is opened.
      await expect(page.getByRole("button", { name: /^Sign out/ })).toHaveCount(0);
      await expect(page.getByText(`Signed in as ${host.email}`)).toHaveCount(0);

      const trigger = page.getByRole("button", { name: `Account, ${host.email}` });
      await expect(trigger).toHaveAttribute("aria-expanded", "false");
      await trigger.click();

      const menu = page.getByRole("menu", { name: "Account" });
      await expect(menu).toBeVisible();
      await expect(trigger).toHaveAttribute("aria-expanded", "true");
      // The email is in the popup and *not* a menu item: `role="menu"` may own
      // only menuitem, group and separator, and a block of identity text is
      // none of those.
      await expect(page.getByText(host.email).last()).toBeVisible();
      await expect(menu.getByRole("menuitem")).toHaveCount(2);
      await expect(menu.getByRole("menuitem", { name: /theme/i })).toBeVisible();
      await expect(menu.getByRole("menuitem", { name: "Sign out" })).toBeVisible();

      // Escape closes and hands focus back, which is what makes it a way back
      // rather than a way out.
      await page.keyboard.press("Escape");
      await expect(menu).toBeHidden();
      await expect(trigger).toBeFocused();
    } finally {
      await deleteFixtureHost(host.id);
    }
  });

  /** The logic moved out of `SignOutButton`, so it needs proving where it landed. */
  test("signs out", async ({ page }) => {
    const host = await dashboard();
    try {
      await signIn(page, host.email, "/dashboard");
      await page.getByRole("button", { name: `Account, ${host.email}` }).click();
      await page.getByRole("menuitem", { name: "Sign out" }).click();
      await page.waitForURL(/\/sign-in/, { timeout: 20_000 });
      await expect(page.getByRole("button", { name: /^Account/ })).toHaveCount(0);
    } finally {
      await deleteFixtureHost(host.id);
    }
  });
});

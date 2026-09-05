import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { signIn } from "./auth";
import { createFixtureHost, createMeeting, deleteFixtureHost } from "./meeting-admin";
// The real number, not a copy of it — see `lib/meetings/freshness.ts`.
import { REFRESH_GAP_MS } from "../lib/meetings/freshness";

/**
 * Past the gap, which starts at mount.
 *
 * The page has just been rendered from the server, so nothing refreshes inside
 * it — a test that returns to the tab immediately is testing the throttle, not
 * the return.
 */
const pastTheGap = (page: Page) => page.waitForTimeout(REFRESH_GAP_MS + 1_000);

/**
 * Dashboard freshness — BUILD-PLAN v1.3 D5.
 *
 * > "Not a timer. Compute the partition from `now()` at render, which A1
 * > delivers anyway, then `router.refresh()` on window focus. Nobody watches a
 * > dashboard for five minutes; they come back to it, and that is the moment
 * > the data should be current."
 *
 * ## What this can and cannot drive, stated rather than implied
 *
 * A headless Chromium page is **always visible and always focused**, and
 * nothing available here changes that. Measured, not assumed:
 * `page.bringToFront()` on a second page in the same context fires no `focus`,
 * no `blur` and no `visibilitychange` on the first — the event log stays empty
 * and `visibilityState` stays `"visible"`. `Emulation.setPageVisibilityState`
 * no longer exists in the protocol, and `Page.setWebLifecycleState` and
 * `Emulation.setFocusEmulationEnabled` both succeed and fire nothing.
 *
 * So the return is dispatched, and the boundary is exactly this: **that the
 * browser fires these events when someone comes back is a platform guarantee,
 * not our code** — the same class of thing as trusting `click` to fire on a
 * click. What *is* ours is everything on this side of the event, and all of it
 * is tested: that a hide is ignored and a show is acted on, that the refresh is
 * soft, that returns inside the gap collapse to one, and that nothing happens
 * at all without an event.
 *
 * `visibilityState` is overridden alongside the dispatch rather than left
 * saying `"visible"` through a hide, so the handler's own guard is exercised
 * instead of stepped around. `MANUAL.md` carries the half a browser has to
 * confirm.
 *
 * That the refresh is *soft* is asserted by leaving a mark on `window` and
 * checking it survives. A reload would also make the data current and would be
 * the wrong fix: it discards client state, and on this page that includes which
 * half of the filter you were looking at.
 */

/**
 * Sign in, then arrive on a settled dashboard.
 *
 * Signing in is followed by a refresh that has nothing to do with D5:
 * `AuthListener` calls `router.refresh()` when Supabase emits `SIGNED_IN`, and
 * that lands somewhere after the page does — sometimes inside two seconds,
 * sometimes not, which is a flake rather than a fixture.
 *
 * So the session is established first and the page is then loaded fresh, with
 * the cookie already set: nothing signs in during the measurement. The silence
 * afterwards catches anything else still settling.
 */
async function arrive(page: Page, email: string, title: string) {
  const refreshes = watchRefreshes(page);
  await signIn(page, email, "/dashboard");
  await expect(page.getByRole("heading", { name: "Meetings" })).toBeVisible();
  await page.goto("/dashboard");
  await expect(page.getByText(title)).toBeVisible();
  await refreshes.quiet(3_000);
  refreshes.reset();
  return refreshes;
}

/**
 * Leave and come back, as the browser would report it.
 *
 * The document is told it is hidden and the event fired, then told it is
 * visible and the event fired again — so the handler sees the same pair, in the
 * same order, that a real tab switch produces.
 */
async function leaveAndReturn(page: Page, { alsoFocus = true } = {}) {
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.evaluate((focus) => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    if (focus) window.dispatchEvent(new Event("focus"));
  }, alsoFocus);
}

async function dashboardWith(title: string) {
  const host = await createFixtureHost();
  const start = new Date(Date.now() + 7 * 86_400_000);
  await createMeeting({
    host: host.id,
    status: "scheduled",
    title,
    scheduledStart: start,
    scheduledEnd: new Date(start.getTime() + 30 * 60_000),
  });
  return host;
}

/**
 * Every time this page asks the server for itself again.
 *
 * `router.refresh()` on an App Router page is an RSC fetch of the same route —
 * `/dashboard?_rsc=…` — so counting those counts refreshes, and counts them as
 * the thing they actually cost.
 *
 * **`quiet()` is not politeness, it is the fixture.** Signing in is followed by
 * a refresh that has nothing to do with D5: `AuthListener` calls
 * `router.refresh()` when Supabase emits `SIGNED_IN`, which lands about a
 * second after the page does. Every assertion below is about what happens with
 * nobody touching anything, and starting the clock before that settled made the
 * auth refresh look like a poll — three tests failing for a behaviour the
 * product is right to have.
 */
function watchRefreshes(page: Page) {
  let count = 0;
  let last = Date.now();
  page.on("request", (request) => {
    if (/\/dashboard\?[^ ]*_rsc=/.test(request.url())) {
      count += 1;
      last = Date.now();
    }
  });
  return {
    get count() {
      return count;
    },
    reset() {
      count = 0;
    },
    /** Resolve once nothing has asked for the dashboard in `ms`. */
    async quiet(ms = 2_000) {
      for (;;) {
        const since = Date.now() - last;
        if (since >= ms) return;
        await page.waitForTimeout(ms - since);
      }
    },
  };
}

/** A value that a soft refresh keeps and a reload does not. */
const MARK = () =>
  ((window as unknown as { __mark?: number }).__mark ??= Math.round(
    performance.now(),
  ));

test.describe("dashboard freshness", () => {
  test("coming back to the tab makes it current, without a reload", async ({
    browser,
  }) => {
    const host = await dashboardWith("Already there");
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await arrive(page, host.email, "Already there");

      const mark = await page.evaluate(MARK);
      expect(mark).toBeGreaterThan(0);

      // Something happens while they are away.
      await createMeeting({
        host: host.id,
        status: "scheduled",
        title: "Arrived while away",
        scheduledStart: new Date(Date.now() + 8 * 86_400_000),
        scheduledEnd: new Date(Date.now() + 8 * 86_400_000 + 30 * 60_000),
      });
      // Still stale: nothing polls, and D5 is explicit that nothing should.
      await expect(page.getByText("Arrived while away")).toHaveCount(0);

      await pastTheGap(page);
      await leaveAndReturn(page);
      await expect(page.getByText("Arrived while away")).toBeVisible({
        timeout: 20_000,
      });

      // And it was a re-render, not a reload.
      expect(
        await page.evaluate(() => (window as unknown as { __mark?: number }).__mark),
        "a reload would have cleared this, and the open filter with it",
      ).toBe(mark);
    } finally {
      await context.close();
      await deleteFixtureHost(host.id);
    }
  });

  /**
   * D5 is "not a timer", and the absence has to be asserted rather than
   * assumed: a polling interval would make the test above pass on its own.
   */
  test("nothing polls while the tab is simply left open", async ({ browser }) => {
    const host = await dashboardWith("Sitting there");
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      const refreshes = await arrive(page, host.email, "Sitting there");

      await createMeeting({
        host: host.id,
        status: "scheduled",
        title: "Never asked for",
        scheduledStart: new Date(Date.now() + 9 * 86_400_000),
        scheduledEnd: new Date(Date.now() + 9 * 86_400_000 + 30 * 60_000),
      });

      /*
       * Past the gap first, and only then left alone.
       *
       * Without that this test could not see a poll at all: every refresh path
       * runs through the same gate, so a `setInterval` inside the first ten
       * seconds is swallowed by the throttle and the test passes for the wrong
       * reason. Proven by mutation — a two-second poll went green here and was
       * caught only by a neighbouring test, which is the shape CLAUDE.md calls
       * a check exercising something adjacent to its claim.
       *
       * Past the gap, a timer of any period under six seconds has to show.
       */
      await pastTheGap(page);
      await page.waitForTimeout(6_000);
      expect(refreshes.count, "nothing should have asked the server").toBe(0);
      await expect(page.getByText("Never asked for")).toHaveCount(0);
    } finally {
      await context.close();
      await deleteFixtureHost(host.id);
    }
  });

  /**
   * The gap. A person moving between a document and this tab produces a return
   * every few seconds, and each one is an uncacheable RLS query and an RSC
   * render — none of them the "came back to it" D5 describes.
   *
   * Counted as **server round trips**, not as renders: the claim is about what
   * the refresh costs, and a request is the thing that costs it.
   */
  test("returning twice in quick succession asks the server once", async ({
    browser,
  }) => {
    const host = await dashboardWith("Counting");
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      const refreshes = await arrive(page, host.email, "Counting");

      await pastTheGap(page);
      for (let i = 0; i < 3; i++) {
        await leaveAndReturn(page);
        await page.waitForTimeout(300);
      }
      // A moment for any request the last return would have made.
      await page.waitForTimeout(1_500);

      expect(
        refreshes.count,
        "three returns inside the gap should cost one refresh, not three",
      ).toBe(1);
    } finally {
      await context.close();
      await deleteFixtureHost(host.id);
    }
  });

  /**
   * The guard: a hide is not a return.
   *
   * `visibilitychange` fires in both directions, and refreshing as someone
   * *leaves* spends a request on a page nobody is looking at — and lands its
   * result during whatever they left to do.
   */
  test("leaving does not refresh; only coming back does", async ({ browser }) => {
    const host = await dashboardWith("Guarded");
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      const refreshes = await arrive(page, host.email, "Guarded");

      await pastTheGap(page);
      await page.evaluate(() => {
        Object.defineProperty(document, "visibilityState", {
          configurable: true,
          get: () => "hidden",
        });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await page.waitForTimeout(1_000);
      expect(refreshes.count, "going away should cost nothing").toBe(0);

      await page.evaluate(() => {
        Object.defineProperty(document, "visibilityState", {
          configurable: true,
          get: () => "visible",
        });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await expect.poll(() => refreshes.count, { timeout: 10_000 }).toBe(1);
    } finally {
      await context.close();
      await deleteFixtureHost(host.id);
    }
  });
});

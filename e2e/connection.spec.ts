import { expect, test } from "./fixtures";

import { announcementFor, type RoomPhase } from "../lib/room/connection";
import { joinAs, leave, type Participant } from "./room.helpers";

/**
 * Derived from the module under test, never retyped.
 *
 * The first version of this spec hard-coded the strings, and when §3.11 asked
 * for the signal-reconnect copy to be rewritten from observation the test
 * failed on its own stale regex while the product was doing exactly the right
 * thing — announcing the outage and the recovery. A test that has to be
 * hand-edited whenever copy changes will eventually be edited to match a bug.
 */
const DEGRADED: RoomPhase[] = ["unstable", "lost", "signal", "reconnecting", "failed"];
const OUTAGE_ANNOUNCEMENTS = DEGRADED.map((p) => announcementFor(p, "healthy")).filter(
  (a): a is string => Boolean(a),
);
const RECOVERY = announcementFor("healthy", "reconnecting");

/**
 * §3.11's acceptance criterion: "Killing the network for 10s and restoring it
 * recovers the call without a page reload."
 *
 * **What this test actually exercises, and what it does not.**
 *
 * `context.setOffline(true)` is Playwright's wrapper around CDP
 * `Network.emulateNetworkConditions`, which reaches Chromium's network service
 * — HTTP and the signalling WebSocket. It does **not** reach an established
 * PeerConnection: ICE, DTLS and SRTP run through the P2P socket path, outside
 * the loader stack the throttle applies to. So what this produces is the
 * signalling half of an outage: the room loses its control channel and enters
 * the SDK's reconnect state machine, while any media already flowing keeps
 * flowing.
 *
 * That is the honest description, and it is still the path worth testing: the
 * reconnect state machine, the bar, the attempt count, and recovery without a
 * reload are all driven by exactly this. What it cannot prove is that media
 * returns after a true media-path loss, which needs a real network and is
 * named in BUILD-PLAN's untested-paths table rather than implied here.
 *
 * `ConnectionQuality.Poor` is unreachable by any local means at all — quality
 * is the server's verdict, delivered over the signalling socket, so killing
 * the network produces *no* quality updates rather than a bad one. The amber
 * pill's mapping is exercised in `npm run check:connection` as a pure
 * function, and nowhere else.
 */

test.describe("connection", () => {
  let participant: Participant;

  test.afterEach(async () => {
    if (!participant) return;
    await leave(participant).catch(() => {});
    // `joinAs` creates the context by hand, so Playwright never reaps it —
    // every other spec closes it here and these two did not. A context left
    // open holds its participant in the room long enough for the *next*
    // spec's `expectParticipants(1)` to see two, which is how a passing suite
    // starts failing somewhere it was never touched.
    await participant.context.close().catch(() => {});
  });

  test("a ten-second outage recovers without reloading the page", async ({ browser, meetingCode }) => {
    participant = await joinAs(browser, "Ama Serwaa", { code: meetingCode });
    const { page, context } = participant;

    // The proof that no reload happened. A value on `window` does not survive
    // navigation, so if it is still here at the end, this is the same document
    // that was in the meeting before the outage. Asserting on the URL would
    // not distinguish a reload from a survival.
    await page.evaluate(() => {
      (window as unknown as { __parleySurvived?: number }).__parleySurvived = 1;
    });

    await context.setOffline(true);

    // §3.11: "Never fail silently." Something must say so, and it must be the
    // local-user bar rather than a console line.
    await expect(page.locator("[data-connection-bar]")).toBeVisible({
      timeout: 30_000,
    });

    // §3.11: the way out is live throughout, "not revealed after the tenth
    // attempt". If this only appeared on failure, this assertion would have to
    // wait out the full 44-second policy — and it does not.
    await expect(page.getByRole("link", { name: "Rejoin now" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Leave" })).toBeVisible();

    await page.waitForTimeout(10_000);
    await context.setOffline(false);

    // Back to silence. §3.11: "Excellent, good → No indicator."
    await expect(page.locator("[data-connection-bar]")).toBeHidden({
      timeout: 60_000,
    });

    // Still in the meeting, and still the same document.
    await expect(
      page.getByRole("heading", { name: /Meeting, \d+ participant/ }),
    ).toBeAttached();
    const survived = await page.evaluate(
      () => (window as unknown as { __parleySurvived?: number }).__parleySurvived,
    );
    expect(survived, "the page reloaded rather than recovering").toBe(1);
  });

  test("the room stays mounted through an outage rather than being replaced", async ({ browser, meetingCode }) => {
    participant = await joinAs(browser, "Kofi Mensah", { code: meetingCode });
    const { page, context } = participant;

    await context.setOffline(true);
    await expect(page.locator("[data-connection-bar]")).toBeVisible({
      timeout: 30_000,
    });

    // The grid is still there behind the bar. Before this phase a drop
    // unmounted the whole surface and rendered a page, which is what made
    // §3.11's "Leave" meaningless — you already had.
    await expect(page.locator("[data-participant]").first()).toBeAttached();
    await expect(
      page.getByRole("heading", { name: /Meeting, \d+ participant/ }),
    ).toBeAttached();

    await context.setOffline(false);
  });

  test("the outage and the recovery are both announced", async ({ browser, meetingCode }) => {
    participant = await joinAs(browser, "Nana Adjei", { code: meetingCode });
    const { page, context } = participant;

    /**
     * What this proves, and what it does not.
     *
     * It proves the room says something when the connection goes and says
     * something when it comes back — §3.11's "never fail silently" in both
     * directions, through the real live region.
     *
     * **It does not prove §9's once-per-change gate, and it cannot.** Deleting
     * `if (next === previous) return null` from `announcementFor` leaves this
     * test green: the effect that calls it is keyed on `[phase]`, so it does
     * not re-run while a phase stands, and React bails out of a `setState`
     * with an identical string before the DOM is touched. Two layers of
     * accidental protection sit between the guard and anything observable
     * here. Measured, not assumed — the mutation was run.
     *
     * The gate is pinned directly in `npm run check:connection`, where
     * removing it fails immediately. The no-repeat assertion below stays as a
     * backstop against some future path that writes the region outside that
     * effect, and is documented as a backstop rather than counted as coverage.
     *
     * An earlier version of this test asserted the text never changed at all,
     * and failed correctly: the phase does move during an outage, from
     * `signalReconnecting` to a full reconnect, and those are two different
     * facts that each deserve saying. That version would also have passed if
     * the room had gone silent after the first line.
     */
    await page.evaluate(() => {
      const w = window as unknown as { __parleySaid?: string[] };
      w.__parleySaid = [];
      const region = document.querySelector('[role="status"][aria-live="polite"]');
      if (!region) return;
      // Recorded verbatim, repeats included — collapsing them here would
      // delete the very thing the assertion below is looking for.
      const push = () => {
        const text = (region.textContent ?? "").trim();
        if (text) w.__parleySaid!.push(text);
      };
      new MutationObserver(push).observe(region, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    });

    await context.setOffline(true);
    await expect(page.locator("[data-connection-bar]")).toBeVisible({
      timeout: 30_000,
    });

    // Long enough for several retries on the SDK's schedule — the delays are
    // 0, 300, 1200, 2700, 4800ms, so this covers five attempts.
    await page.waitForTimeout(10_000);
    await context.setOffline(false);
    await expect(page.locator("[data-connection-bar]")).toBeHidden({
      timeout: 60_000,
    });

    const said = await page.evaluate(
      () => (window as unknown as { __parleySaid?: string[] }).__parleySaid ?? [],
    );

    // The load-bearing assertions: something was said, and recovery was said.
    // Without the first, everything below passes trivially on an empty list.
    expect(said.length, `nothing was announced: ${JSON.stringify(said)}`)
      .toBeGreaterThan(0);
    expect(
      said.some((text) => OUTAGE_ANNOUNCEMENTS.includes(text)),
      `the outage was never announced: ${JSON.stringify(said)}`,
    ).toBe(true);
    expect(
      said,
      "recovery was never announced, so a screen reader is left assuming the meeting is still broken",
    ).toContain(RECOVERY);

    // Backstop, not coverage — see the note above. This cannot currently fail,
    // because the effect keyed on `[phase]` never re-runs while a phase stands.
    const repeated = said.filter((text, i) => i > 0 && said[i - 1] === text);
    expect(
      repeated,
      `the same announcement was made twice in a row: ${JSON.stringify(said)}`,
    ).toEqual([]);
  });
});

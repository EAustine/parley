import { expect, test } from "./fixtures";

import { expectParticipants, joinAs, leave, type Participant } from "./room.helpers";

/**
 * `prefers-reduced-motion`, measured rather than felt.
 *
 * `MANUAL.md` lists this as **needs a human** — "turn on Reduce Motion in System
 * Settings and open every dialog, panel and sheet". The System Settings half is
 * what makes it read as manual, and it is the half that is wrong: Playwright
 * emulates the media query directly, and `reactions.spec.ts` has been doing so
 * since v1.3.
 *
 * What was genuinely missing is an assertion for the *grid*, which is where
 * `CLAUDE.md` puts the strongest claim: "Under `prefers-reduced-motion`, skip
 * the whole cycle and snap."
 *
 * ## Why animation calls rather than positions
 *
 * The obvious test samples a tile's box twice and asserts it did not move. It is
 * the wrong instrument twice over. FLIP inverts a transform and animates *back*
 * to identity, so a sample taken a moment late reads the settled position and
 * passes whether or not anything travelled — the same defect D2's first
 * clearance assertion had. And a sample taken early races the compositor.
 *
 * `useGridFlip` makes this directly observable instead: the reduced-motion guard
 * wraps the entire block, so under `reduce` **`el.animate()` is never called**.
 * Counting the calls is exact, has no timing window, and fails loudly if the
 * guard is removed.
 *
 * The second test is a **positive control** rather than a second feature. It
 * proves the counter sees animations when they exist, so a green first test
 * means "the guard held" rather than "the instrument was blind". `CLAUDE.md`'s
 * rule is to prove a guard can fail; a control that runs every time is stronger
 * than a mutation run once by hand.
 */
test.describe("reduced motion", () => {
  const open: Participant[] = [];

  test.afterEach(async () => {
    while (open.length) {
      const p = open.pop()!;
      await leave(p).catch(() => {});
      await p.context.close().catch(() => {});
    }
  });

  /**
   * Count every `Element.prototype.animate` call from here on.
   *
   * Patched after load rather than in an init script, which is safe because the
   * reflow under test is triggered by the *next* participant arriving — well
   * after this page is up. It also keeps the patch out of the shared helper,
   * where it would run for the whole suite.
   */
  async function countAnimationsFrom(page: import("@playwright/test").Page) {
    await page.evaluate(() => {
      const w = window as unknown as { __animCalls?: number };
      w.__animCalls = 0;
      const original = Element.prototype.animate;
      Element.prototype.animate = function (this: Element, ...args: unknown[]) {
        w.__animCalls = (w.__animCalls ?? 0) + 1;
        return (original as (...a: unknown[]) => Animation).apply(this, args);
      } as typeof Element.prototype.animate;
    });
  }

  const read = (page: import("@playwright/test").Page) =>
    page.evaluate(() => (window as unknown as { __animCalls?: number }).__animCalls ?? 0);

  test("a joining tile does not animate when motion is reduced", async ({
    browser,
    meetingCode,
  }) => {
    test.setTimeout(180_000);
    const me = await joinAs(browser, "Ama Serwaa", {
      code: meetingCode,
      withMedia: false,
      reducedMotion: "reduce",
    });
    open.push(me);
    await expectParticipants(me.page, 1);
    await countAnimationsFrom(me.page);

    // Somebody arrives: the grid reflows, which is the moment FLIP runs.
    const other = await joinAs(browser, "Kwabena Osei", {
      code: meetingCode,
      withMedia: false,
    });
    open.push(other);
    await expectParticipants(me.page, 2);
    // Past the 200ms reflow window, so a late animation is still counted.
    await me.page.waitForTimeout(1_000);

    expect(
      await read(me.page),
      "the grid animated a reflow for somebody who asked for less motion — " +
        "CLAUDE.md requires the whole cycle skipped, not shortened",
    ).toBe(0);
  });

  /**
   * The control. Same room, same join, no emulation — the reflow must animate,
   * or the test above is measuring nothing.
   */
  test("the same join does animate when motion is not reduced", async ({
    browser,
    meetingCode,
  }) => {
    test.setTimeout(180_000);
    const me = await joinAs(browser, "Ama Serwaa", {
      code: meetingCode,
      withMedia: false,
      reducedMotion: "no-preference",
    });
    open.push(me);
    await expectParticipants(me.page, 1);
    await countAnimationsFrom(me.page);

    const other = await joinAs(browser, "Kwabena Osei", {
      code: meetingCode,
      withMedia: false,
    });
    open.push(other);
    await expectParticipants(me.page, 2);
    await me.page.waitForTimeout(1_000);

    expect(
      await read(me.page),
      "no animation ran with motion allowed, so the counter cannot tell a " +
        "skipped reflow from an unobserved one — the test above proves nothing",
    ).toBeGreaterThan(0);
  });
});

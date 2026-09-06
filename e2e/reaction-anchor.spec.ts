import { expect, test } from "./fixtures";

import {
  expectParticipants,
  joinAs,
  leave,
  wakeControls,
  type Participant,
} from "./room.helpers";

/**
 * Where your own reaction comes from — BUILD-PLAN v1.5 D2.
 *
 * > "§3.6 says a reaction animates upward 'from the sender's tile.' C1 took your
 * > tile away and gave you a PiP, and nobody updated the sentence — the same
 * > shift that moved the layout table's rows and went unnoticed for the same
 * > reason."
 *
 * Two cases, because the sender's own origin is a different element depending
 * on how many people are in the room: alone you have a full tile and no PiP, and
 * the moment somebody else arrives you shrink into the corner.
 *
 * **And both must clear the control bar's band.** The overlay is
 * `absolute inset-0` on a root with `pb-[var(--parley-controls-h)]`, and an
 * absolutely positioned box resolves against the **padding box** — so `inset-0`
 * covers the bar's strip too, and nothing about the layout stops a reaction
 * being drawn behind it. That is the same property this project has already been
 * caught by twice: padding does not move an absolutely positioned child.
 */
test.describe("where a reaction comes from", () => {
  const open: Participant[] = [];

  test.afterEach(async () => {
    while (open.length) {
      const p = open.pop()!;
      await leave(p).catch(() => {});
      await p.context.close().catch(() => {});
    }
  });

  /** Send one, and measure it while it is alive. */
  async function sendAndMeasure(page: import("@playwright/test").Page) {
    await wakeControls(page);
    await page.getByRole("button", { name: "Send a reaction" }).click();
    await page.getByRole("button", { name: "React with applause" }).click();

    const reaction = page.locator(".parley-reaction").first();
    await expect(reaction).toBeVisible({ timeout: 10_000 });

    /*
     * Read the **untransformed** box, and read it at the origin.
     *
     * The reaction rises and sways on `transform`, so `getBoundingClientRect`
     * reports where it is *now* — and "clears the control bar's band" is a
     * claim about where it *starts*, which is the lowest point of its path.
     * A rect read a moment later clears the bar whatever the origin was, which
     * would make the assertion pass vacuously.
     *
     * `offsetTop`/`offsetHeight` are layout, which is what the anchor sets and
     * what the animation then leaves alone.
     */
    return page.evaluate(() => {
      const el = document.querySelector<HTMLElement>(".parley-reaction");
      // The overlay: `absolute inset-0`, so it is the reaction's offsetParent.
      const overlay = el?.offsetParent as HTMLElement | null;
      // The stage root: `relative`, so it is the overlay's.
      const stage = (overlay?.offsetParent as HTMLElement | null) ?? overlay;
      if (!el || !overlay || !stage) return null;

      /*
       * The bar's band, resolved to pixels by the browser rather than parsed
       * from `--parley-controls-h` — the token is `6rem` until RoomControls
       * publishes a measured height over it, and `parseFloat("6rem")` is 6.
       * Reading the padding the stage actually computed sidesteps the unit
       * question entirely.
       */
      const band = parseFloat(getComputedStyle(stage).paddingBottom) || 0;

      return {
        // Untransformed distance from the overlay's floor to the reaction's
        // bottom edge — its origin.
        originBottom: overlay.clientHeight - (el.offsetTop + el.offsetHeight),
        band,
        overlayHeight: overlay.clientHeight,
      };
    });
  }

  /**
   * Alone: a full tile and no PiP, so the tile is the origin.
   *
   * §3.4 is explicit that "a lone participant stays a full-size tile and there
   * is no PiP", which is why this case still exists at all and why D2 names it
   * separately.
   */
  test("alone, a reaction rises from the tile and clears the control bar", async ({
    browser,
    meetingCode,
  }) => {
    test.setTimeout(120_000);
    const solo = await joinAs(browser, "Ama Serwaa", {
      code: meetingCode,
      withMedia: false,
    });
    open.push(solo);

    const measured = await sendAndMeasure(solo.page);
    expect(measured, "no reaction rendered to measure").not.toBeNull();
    expect(
      measured!.originBottom,
      `the reaction starts ${Math.round(measured!.originBottom)}px above the overlay's floor, ` +
        `inside the control bar's ${Math.round(measured!.band)}px band, where the bar paints over it`,
    ).toBeGreaterThanOrEqual(measured!.band);
  });

  /**
   * With somebody else here, your tile is gone and the PiP is where you are.
   *
   * The anchor looks up `[data-participant]`, and `SelfViewPiP` carries it for
   * exactly this — without it the lookup falls through to a hardcoded
   * mid-screen fallback, which is the bug D2 reports: a reaction from a tile
   * that no longer exists.
   */
  test("with others, your reaction rises from the PiP and clears the bar", async ({
    browser,
    meetingCode,
  }) => {
    test.setTimeout(180_000);
    const me = await joinAs(browser, "Ama Serwaa", { code: meetingCode, withMedia: false });
    const other = await joinAs(browser, "Kwabena Osei", {
      code: meetingCode,
      withMedia: false,
    });
    open.push(me, other);
    await expectParticipants(me.page, 2);

    // The PiP exists, which is the precondition the anchor depends on.
    await expect(
      me.page.getByRole("button", { name: "Move self view to the next corner" }),
    ).toBeVisible({ timeout: 20_000 });

    const measured = await sendAndMeasure(me.page);
    expect(measured, "no reaction rendered to measure").not.toBeNull();

    /*
     * Anchored to the PiP rather than to the middle of the room. The fallback
     * this replaces is `{ left: 50, bottom: 30 }` — a fixed point near the
     * bottom centre, which is both not-your-face and inside the bar's band, so
     * asserting the origin and asserting the clearance are the same assertion
     * from two directions.
     */
    const pip = await me.page
      .getByRole("button", { name: "Move self view to the next corner" })
      .boundingBox();
    expect(pip).not.toBeNull();

    expect(
      measured!.originBottom,
      `the reaction starts ${Math.round(measured!.originBottom)}px above the overlay's floor, ` +
        `inside the control bar's ${Math.round(measured!.band)}px band`,
    ).toBeGreaterThanOrEqual(measured!.band);

    /*
     * And it starts near the PiP horizontally. A reaction that rose from the
     * centre of the room would clear the bar too, so the clearance check alone
     * cannot tell the fixed fallback from a real anchor.
     */
    const reactionBox = await me.page.locator(".parley-reaction").first().boundingBox();
    expect(reactionBox).not.toBeNull();
    const pipCentre = pip!.x + pip!.width / 2;
    const reactionCentre = reactionBox!.x + reactionBox!.width / 2;
    expect(
      Math.abs(reactionCentre - pipCentre),
      `the reaction started ${Math.round(Math.abs(reactionCentre - pipCentre))}px from the PiP's centre — ` +
        "it is anchored to something else, which is D2's report",
    ).toBeLessThan(160);
  });
});

import { expect, test } from "./fixtures";

import { joinAs, leave, wakeControls, type Participant } from "./room.helpers";

const IPHONE = { width: 375, height: 812 };

/**
 * Reactions on a phone — BUILD-PLAN v1.4 B2, and §3.6's two rules under it.
 *
 * > "The picker stays open; everything else closes on activation."
 *
 * Those cannot both hold in one surface, and the six emoji were `menuitem`s
 * inside the overflow menu — so pressing one closed it. That was **not** a bug
 * in the menu: `role="menu"` dismisses on activation, which is the pattern and
 * what a screen reader expects. The bug was that reactions were menu items at
 * all, and the fix is that they are no longer in a menu.
 *
 * C2 put them there to avoid "a second popup inside the first", which was an
 * argument about space and does not survive a bottom sheet.
 */
test.describe("reactions on a phone", () => {
  let participant: Participant | null = null;

  test.afterEach(async () => {
    if (!participant) return;
    await leave(participant).catch(() => {});
    await participant.context.close().catch(() => {});
    participant = null;
  });

  /**
   * The load-bearing case: repeated sends from one opening.
   *
   * Three claps is the normal use. Under the old surface the second press had
   * to reopen the menu first, so this fails against it at the second press.
   */
  test("the sheet survives repeated sends and closes only when asked", async ({
    browser,
    meetingCode,
  }) => {
    test.setTimeout(120_000);
    participant = await joinAs(browser, "Ama Serwaa", {
      code: meetingCode,
      viewport: IPHONE,
    });
    const { page } = participant;

    await wakeControls(page);
    await page.getByRole("button", { name: "More options" }).click();
    await page.getByRole("menuitem", { name: "Send a reaction" }).click();

    const sheet = page.getByRole("group", { name: "Send a reaction" });
    await expect(sheet).toBeVisible();

    // §3.6's rate limit is one per second, so these are spaced to be sends
    // rather than drops — the claim is about the surface, not the limiter.
    for (let i = 0; i < 3; i++) {
      await sheet.getByRole("button", { name: /React with applause/ }).click();
      await expect(sheet, "the sheet closed on a selection").toBeVisible();
      await page.waitForTimeout(1_100);
    }

    // It closes on an explicit dismissal, which is the other half of the rule.
    await sheet.getByRole("button", { name: "Close reactions" }).click();
    await expect(sheet).toBeHidden();
  });

  /**
   * §3.6's other new acceptance line: "No reaction control is a `menuitem`."
   *
   * Asserted against the menu rather than against the sheet, because the defect
   * was a role in the wrong place and the sheet passing tells you nothing about
   * what the menu still holds.
   */
  test("the overflow menu holds no reaction controls", async ({
    browser,
    meetingCode,
  }) => {
    test.setTimeout(120_000);
    participant = await joinAs(browser, "Ama Serwaa", {
      code: meetingCode,
      viewport: IPHONE,
    });
    const { page } = participant;

    await wakeControls(page);
    await page.getByRole("button", { name: "More options" }).click();

    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    await expect(
      menu.getByRole("menuitem", { name: /^React with/ }),
      "an emoji is still a menuitem",
    ).toHaveCount(0);

    /*
     * And every item that *is* there dismisses on activation, which is the
     * contract `role="menu"` makes. "Send a reaction" is the interesting one:
     * it opens the sheet and closes the menu, rather than being a surface that
     * behaves differently from its neighbours when you tap it.
     */
    await page.getByRole("menuitem", { name: "Send a reaction" }).click();
    await expect(menu).toBeHidden();
  });

  /**
   * B2 asks directly: "Check whether Present is in that menu on mobile at all."
   *
   * It always was. The test round saw neither Present nor a clipped trace of it
   * because the whole menu was off the left edge at x = -41.8 — one bug, not the
   * two the question allowed for. This pins the answer so it does not have to be
   * re-derived.
   */
  test("Present is in the mobile menu where the API exists", async ({
    browser,
    meetingCode,
  }) => {
    test.setTimeout(120_000);
    participant = await joinAs(browser, "Ama Serwaa", {
      code: meetingCode,
      android: true,
    });
    const { page } = participant;

    expect(
      await page.evaluate(
        () => typeof navigator.mediaDevices?.getDisplayMedia === "function",
      ),
      "this context has no getDisplayMedia, so the branch cannot be checked",
    ).toBe(true);

    await wakeControls(page);
    await page.getByRole("button", { name: "More options" }).click();
    await expect(
      page.getByRole("menuitem", { name: /Share your screen|Stop presenting/ }),
    ).toBeVisible();
  });
});

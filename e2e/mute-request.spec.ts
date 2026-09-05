import { expect, test } from "./fixtures";

import {
  expectParticipants,
  joinAs,
  leave,
  wakeControls,
  type Participant,
} from "./room.helpers";

/**
 * The mute request — BUILD-PLAN v1.3 C2a, and §3.8 underneath it.
 *
 * > "Muting is a request the participant must accept — the host can silence,
 * > never activate."
 *
 * C2a is about where the question is asked, not whether it can be declined —
 * but the two are the same claim seen from different ends. A card with the
 * weight of a system alert, at the far end of the screen from the control that
 * answers it, is not asking; and **nothing in the suite exercised the prompt at
 * all** before this, so the "must accept" half was resting on nobody having
 * broken it.
 */
test.describe("a host asking someone to mute", () => {
  const open: Participant[] = [];

  test.afterEach(async () => {
    while (open.length) {
      const p = open.pop()!;
      await leave(p).catch(() => {});
      await p.context.close().catch(() => {});
    }
  });

  test("asks near the microphone, over the room rather than moving it", async ({
    browser,
    hostedMeeting,
  }) => {
    const host = await joinAs(browser, "Ama Serwaa", {
      code: hostedMeeting.code,
      withMedia: false,
      asHost: hostedMeeting.email,
    });
    const guest = await joinAs(browser, "Kwabena Osei", {
      code: hostedMeeting.code,
      withMedia: false,
    });
    open.push(host, guest);
    await expectParticipants(host.page, 2);
    await expectParticipants(guest.page, 2);

    /*
     * The guest has to be unmuted first, and that is the product being right
     * rather than the fixture being fussy: "Ask to mute" is not offered for
     * somebody who is already muted. `withMedia: false` seeds the device store
     * muted, so without this the host's panel has no such button and the test
     * waits for a control the interface is correct not to show.
     */
    await wakeControls(guest.page);
    await guest.page.getByRole("button", { name: "Unmute" }).click();
    await expect(guest.page.getByRole("button", { name: "Mute" })).toBeVisible();

    // The room as it stands, before anybody is asked anything.
    const before = await guest.page.evaluate(() => {
      const grid = document.querySelector(".grid")!.getBoundingClientRect();
      return { top: Math.round(grid.top), height: Math.round(grid.height) };
    });

    await wakeControls(host.page);
    await host.page.getByRole("button", { name: "Participants" }).click();
    await host.page.getByRole("button", { name: /Ask to mute/ }).first().click();

    const prompt = guest.page.getByRole("status").filter({ hasText: "asked you to mute" });
    await expect(prompt).toBeVisible({ timeout: 20_000 });

    /*
     * It names whoever asked, and the name is the one the host chose.
     *
     * This used to compare against the host's **email address**, with a comment
     * explaining that `joinAs`'s requested name "is not what a signed-in host
     * ends up with" because the token route fell back to `user.email`. The
     * comment was accurate and the conclusion was backwards: the test was
     * describing a defect rather than reporting it, and it read as coverage.
     * The product now names a host what they typed — `e2e/display-name.spec.ts`
     * holds that guarantee — so this asserts it.
     */
    await expect(prompt).toContainText(host.name);
    expect(
      await guest.page.locator("body").innerText(),
      "the host's email address reached a guest's screen",
    ).not.toContain(hostedMeeting.email);

    /*
     * **Above the control bar**, which is the whole of C2a's placement claim:
     * the question belongs next to the control that answers it. Measured
     * against the bar's rendered box rather than a constant — the bar's height
     * moves with wrapping, the safe-area inset, and the device-error row.
     */
    const geometry = await guest.page.evaluate(() => {
      const card = document
        .querySelectorAll('[role="status"]')
        .values()
        .find((el) => el.textContent?.includes("asked you to mute")) as HTMLElement;
      const mute = document.querySelector<HTMLElement>('button[aria-label], button');
      void mute;
      const leaveBtn = [...document.querySelectorAll("button")].find(
        (b) => b.textContent?.trim() === "Leave",
      )!;
      const grid = document.querySelector(".grid")!.getBoundingClientRect();
      return {
        cardBottom: Math.round(card.getBoundingClientRect().bottom),
        barTop: Math.round(leaveBtn.getBoundingClientRect().top),
        roomMiddle: Math.round(window.innerHeight / 2),
        grid: { top: Math.round(grid.top), height: Math.round(grid.height) },
      };
    });
    expect(
      geometry.cardBottom,
      "the card should sit above the control bar, not over it",
    ).toBeLessThanOrEqual(geometry.barTop);
    /*
     * And *near* it, which is the half that actually states C2a's claim.
     *
     * "It is nowhere near the microphone it is about." The bound above alone
     * does not say that: a card pinned to the top of the room — which is what
     * C2a is replacing — is also above the bar, and passed this test until this
     * line existed. Proven by moving it back to `top-2` and watching nothing
     * fail.
     */
    expect(
      geometry.cardBottom,
      "and near it — a card at the top of the room is also 'above the bar'",
    ).toBeGreaterThan(geometry.roomMiddle);

    /*
     * And it overlays rather than displacing. The thing being asked about is a
     * live conversation; a room that jumps when a host asks a question is
     * answering with the layout.
     */
    expect(geometry.grid, "the room should not have moved").toEqual(before);
  });

  /**
   * §3.8's actual guarantee. "Stay unmuted" is a real control, not a way out of
   * a dialog — a request the interface pressures you into is not a request.
   */
  test("declining leaves the microphone on", async ({ browser, hostedMeeting }) => {
    const host = await joinAs(browser, "Ama Serwaa", {
      code: hostedMeeting.code,
      withMedia: false,
      asHost: hostedMeeting.email,
    });
    const guest = await joinAs(browser, "Kwabena Osei", {
      code: hostedMeeting.code,
      withMedia: false,
    });
    open.push(host, guest);
    await expectParticipants(guest.page, 2);

    // Unmute the guest first: the request is only meaningful against a live mic,
    // and `withMedia: false` seeds the device store muted.
    await wakeControls(guest.page);
    await guest.page.getByRole("button", { name: "Unmute" }).click();
    await expect(guest.page.getByRole("button", { name: "Mute" })).toBeVisible();

    await wakeControls(host.page);
    await host.page.getByRole("button", { name: "Participants" }).click();
    await host.page.getByRole("button", { name: /Ask to mute/ }).first().click();

    const prompt = guest.page.getByRole("status").filter({ hasText: "asked you to mute" });
    await expect(prompt).toBeVisible({ timeout: 20_000 });

    await prompt.getByRole("button", { name: "Stay unmuted" }).click();
    await expect(prompt).toHaveCount(0);
    /*
     * Still unmuted — read from the control bar, whose label is derived from
     * the track's published state rather than from React. Rule 3: "If unmuting
     * fails, the UI must show muted." The inverse holds here, and it is the
     * same source of truth.
     */
    await wakeControls(guest.page);
    await expect(guest.page.getByRole("button", { name: "Mute" })).toBeVisible();
  });
});

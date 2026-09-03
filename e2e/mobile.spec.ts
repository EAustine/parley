import { expect, test } from "./fixtures";

import { joinAs, leave, wakeControls, type Participant } from "./room.helpers";

/**
 * The room at phone width, measured rather than eyeballed.
 *
 * BUILD-PLAN Phase 10's done-when is "the whole flow works on iPhone Safari and
 * Android Chrome". This is not that: Chromium at 375×812 is not Safari, and
 * PROGRESS already records that iOS `visibilitychange` and track
 * re-acquisition are unreachable under Playwright. What this does reach is the
 * geometry — whether the controls fit and whether anything covers them — which
 * is where both of the mobile faults this phase fixed actually lived.
 *
 * Rendered boxes, never declared classes. A control bar that declares
 * `max-w-[calc(100vw-1rem)]` and still overflows is exactly the failure this
 * is for, and reading the class back would report the fix rather than the
 * result.
 */

const IPHONE = { width: 375, height: 812 };

test.describe("the room on a phone", () => {
  let participant: Participant;

  test.afterEach(async () => {
    if (!participant) return;
    await leave(participant).catch(() => {});
    await participant.context.close().catch(() => {});
  });

  test("the control bar fits the viewport", async ({ browser, meetingCode }) => {
    participant = await joinAs(browser, "Ama Serwaa", { code: meetingCode, viewport: IPHONE });
    const { page } = participant;

    await wakeControls(page);

    /**
     * Seven controls at 44–48px plus a leave pill and six gaps came to roughly
     * 420px against a 375pt viewport, and the stage clips `overflow-hidden` —
     * so the ends did not wrap or scroll, they simply were not there.
     */
    const box = await page
      .getByRole("button", { name: /microphone/i })
      .boundingBox();
    expect(box, "the mic control did not render").not.toBeNull();
    expect(box!.x, "the mic control is clipped off the left edge")
      .toBeGreaterThanOrEqual(0);

    /**
     * And every control keeps §9's floor.
     *
     * The bar used to fit this viewport by shrinking its controls — flex items
     * shrink by default — which put them under 44px on the surface the floor
     * exists for. `check:targets` reads declared CSS and saw nothing wrong.
     * This measures what was rendered, which is the only way that shows.
     */
    const undersized = await page.evaluate(() => {
      const bar = document.querySelector('[aria-label="Leave"], button');
      void bar;
      return [...document.querySelectorAll<HTMLElement>("button")]
        .map((b) => ({ label: b.getAttribute("aria-label") ?? b.textContent?.trim() ?? "", box: b.getBoundingClientRect() }))
        .filter((b) => b.box.width > 0 && b.box.height > 0)
        .filter((b) => /microphone|camera|share|reaction|^Chat$|^Participants$|^Leave$/i.test(b.label))
        .filter((b) => b.box.width < 44 || b.box.height < 44)
        .map((b) => `${b.label} ${Math.round(b.box.width)}x${Math.round(b.box.height)}`);
    });
    expect(undersized, "controls shrank below the 44px floor to fit").toEqual([]);

    const leaveBox = await page.getByRole("button", { name: "Leave" }).boundingBox();
    expect(leaveBox, "the leave control did not render").not.toBeNull();
    expect(
      leaveBox!.x + leaveBox!.width,
      "the leave control runs past the right edge",
    ).toBeLessThanOrEqual(IPHONE.width);
  });

  test("a panel does not cover the control bar", async ({ browser, meetingCode }) => {
    participant = await joinAs(browser, "Kofi Mensah", { code: meetingCode, viewport: IPHONE });
    const { page } = participant;

    await wakeControls(page);
    await page.getByRole("button", { name: "Chat" }).click();
    await expect(page.getByRole("textbox", { name: /message/i })).toBeVisible();

    /**
     * §3.4: "Controls remain reachable when both panels are open", and mute is
     * a privacy control.
     *
     * On mobile both panels are `inset-x-0 bottom-0 h-[60dvh]` at `z-20`, and
     * the control bar had no z-index at all — a positioned element with a
     * stacking order beats a positioned element without one whatever the DOM
     * order, so opening chat hid mic, camera and leave entirely.
     *
     * `toBeVisible` alone would not have caught it: the bar was in the layout
     * and painted, just underneath. Hit-testing the centre point is what asks
     * whether a finger would reach it.
     */
    await wakeControls(page);
    const mic = page.getByRole("button", { name: /microphone/i });
    await expect(mic).toBeVisible();

    const box = await mic.boundingBox();
    expect(box, "the mic control did not render with the panel open").not.toBeNull();

    const onTop = await page.evaluate(
      ({ x, y }) => {
        const el = document.elementFromPoint(x, y);
        return el ? el.closest("button")?.getAttribute("aria-label") ?? el.tagName : null;
      },
      { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 },
    );
    expect(
      onTop,
      "something is painted over the mic control while the chat panel is open",
    ).toMatch(/microphone/i);

    // And it still works, which is the fact the geometry is a proxy for.
    await mic.click();
    await expect(page.getByRole("button", { name: /Turn on microphone/i })).toBeVisible();
  });
});

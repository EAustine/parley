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

    /**
     * Wait for the bar to stop moving before measuring it.
     *
     * The **first** time any `h-[60dvh]` panel becomes visible on a page —
     * chat or participants, either one — Chromium recomputes the dynamic
     * viewport height it uses to resolve `dvh`, and that recomputation
     * measurably repositions everything else sized against `h-dvh`, including
     * this control bar. Confirmed by polling the mic button's Y position every
     * 100ms after opening each panel: it lands roughly 200-450px too high for
     * one frame, then settles within about 200ms and never moves again —
     * reproducible with panels alone, with no camera or microphone involved,
     * and independent of anything Track D touches.
     *
     * That is a real, one-time layout event, not a flaky test. `check:targets`
     * cannot see it — it reads declared CSS, and nothing declared is wrong,
     * since `h-dvh` is exactly what `CLAUDE.md`'s "use dvh throughout" already
     * asks for. It belongs to Track F, which explicitly owns `dvh` correctness
     * on mobile; recorded there rather than fixed here. What this test can and
     * must do is measure the **settled** position — a finger reaches the bar
     * where it ends up, not where it flickered through — so it polls until two
     * consecutive reads agree before treating a box as real.
     */
    const settledBox = async () => {
      let previous: { x: number; y: number; width: number; height: number } | null = null;
      for (let attempt = 0; attempt < 20; attempt++) {
        const current = await mic.boundingBox();
        if (
          previous &&
          current &&
          previous.x === current.x &&
          previous.y === current.y
        ) {
          return current;
        }
        previous = current;
        await page.waitForTimeout(50);
      }
      return previous;
    };

    const box = await settledBox();
    expect(box, "the mic control did not render with the panel open").not.toBeNull();

    /*
     * Hold the bar awake by putting the pointer on the control itself.
     *
     * §3.4 hides the bar after 4s of pointer inactivity, and a hidden bar is
     * `pointer-events: none` — so `elementFromPoint` skips it and returns
     * whatever is underneath. A person hovering the button they are about to
     * press keeps it awake incidentally; doing it deliberately is the test
     * matching the product rather than racing a timer it does not control.
     */
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await expect(mic).toBeVisible();

    const onTop = await page.evaluate(
      ({ x, y }) => {
        const stack = document.elementsFromPoint(x, y);
        const label = stack[0]?.closest("button")?.getAttribute("aria-label") ?? null;
        return {
          label,
          // The whole stack, so a failure names what is covering the control
          // rather than reporting "DIV" and leaving the next reader to guess.
          stack: stack.slice(0, 5).map((el) => {
            const style = getComputedStyle(el);
            return `${el.tagName}.${(el.className || "").toString().slice(0, 40)} z=${style.zIndex} pe=${style.pointerEvents} op=${style.opacity}`;
          }),
        };
      },
      { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 },
    );
    // The stack goes in the *received* value, not the message: a null label
    // makes `toMatch` a matcher-type error, and a matcher-type error prints no
    // custom message at all.
    expect(
      onTop.label ??
        `nothing focusable on top — stack:\n  ${onTop.stack.join("\n  ")}`,
      "something is painted over the mic control while the chat panel is open",
    ).toMatch(/microphone/i);

    // And it still works, which is the fact the geometry is a proxy for.
    await mic.click();
    await expect(page.getByRole("button", { name: /Turn on microphone/i })).toBeVisible();
  });
});

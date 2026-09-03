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
     * The control bar does not move when a panel opens.
     *
     * It used to, by exactly 487px on a 375x812 phone — the sheet's own height
     * — for about 200ms. Not a `dvh` recomputation, which is what I first
     * recorded: a live `100dvh` probe, `innerHeight`, `visualViewport.height`
     * and the room's own height are all constant throughout. The room's
     * `scrollTop` is what moved, 487 → 88 → 3 → 0.
     *
     * The cause was C1's sheet entrance meeting the panel's focus-on-open. The
     * sheet animates up from `translate: 0 100%`, so for the first frames the
     * focus target sat below the room's `overflow-hidden` box; the browser
     * scrolled that container to reveal it, and everything inside — including
     * this absolutely positioned bar — came up with it. `preventScroll` on the
     * focus call fixes it.
     *
     * This was a `settledBox()` poll that waited the jump out. Waiting out a
     * defect is not the same as not having one, so it asserts stillness now.
     */
    const before = await mic.boundingBox();
    expect(before, "the mic control did not render with the panel open").not.toBeNull();
    await page.waitForTimeout(300);
    const box = await mic.boundingBox();
    expect(
      box!.y,
      `the control bar moved ${Math.round(Math.abs(box!.y - before!.y))}px while the panel opened`,
    ).toBeCloseTo(before!.y, 0);
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

  /**
   * v1.2 F1: the sheet caps at 55dvh and the video shrinks above it rather
   * than being covered — and the composer clears the control bar.
   *
   * Both halves were measurably wrong. The sheet's top edge sat 138px above
   * the tile's bottom edge, covering 70% of the video, and the tile did not
   * move because the stage is `h-full` in a padded box while the sheet is
   * absolute. And the sheet reserved a hard-coded 96px for a control bar that
   * B4's wrapping made 144px tall, so Send rendered *under* the bar — hit
   * testing its centre returned the participants badge. On touch the bar never
   * auto-hides, so that was permanent, not a transient overlap.
   */
  test("the sheet caps the video rather than covering it, and Send is reachable", async ({
    browser,
    meetingCode,
  }) => {
    participant = await joinAs(browser, "Abena Poku", {
      code: meetingCode,
      viewport: IPHONE,
      withMedia: false,
    });
    const { page } = participant;

    await wakeControls(page);
    await page.getByRole("button", { name: "Chat" }).click();
    /*
     * Type first. Send is disabled while the composer is empty, and shadcn's
     * `disabled:pointer-events-none` makes `elementFromPoint` skip it — so
     * hit-testing an empty composer's Send reports "nothing there" whether the
     * bar covers it or not. It is also the honest scenario: you only reach for
     * Send once you have something to send.
     */
    await page.getByRole("textbox", { name: /message/i }).fill("kasa");
    // Past the 180ms sheet entrance and the stage's matching reflow.
    await page.waitForTimeout(400);

    const geometry = await page.evaluate(() => {
      const panel = document.querySelector<HTMLElement>('aside[aria-label="Meeting chat"]')!;
      const tile = document.querySelector<HTMLElement>("[data-participant]");
      const send = [...document.querySelectorAll<HTMLElement>("button")].find(
        (b) => b.textContent?.trim() === "Send",
      );
      const box = (el: Element | null | undefined) =>
        el ? el.getBoundingClientRect() : null;
      const sendBox = box(send);
      const onTopOfSend = sendBox
        ? document
            .elementFromPoint(sendBox.x + sendBox.width / 2, sendBox.y + sendBox.height / 2)
            ?.closest("button")?.textContent?.trim() ?? null
        : null;
      return {
        panelHeight: box(panel)!.height,
        panelTop: box(panel)!.top,
        tileBottom: tile ? box(tile)!.bottom : null,
        onTopOfSend,
        viewport: innerHeight,
      };
    });

    // 55% of the dynamic viewport, measured rather than read back.
    expect(geometry.panelHeight / geometry.viewport).toBeCloseTo(0.55, 2);

    // The video ends above the sheet instead of running under it.
    expect(geometry.tileBottom, "no participant tile to measure").not.toBeNull();
    expect(
      geometry.tileBottom!,
      `the sheet covers ${Math.round(geometry.tileBottom! - geometry.panelTop)}px of the video`,
    ).toBeLessThanOrEqual(geometry.panelTop + 1);

    // And the composer's own control is the thing at its own centre.
    expect(
      geometry.onTopOfSend,
      "the control bar is painted over the chat Send button",
    ).toBe("Send");
  });
});

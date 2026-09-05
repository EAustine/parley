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

  /**
   * v1.4 B2: the overflow menu is on screen, measured rather than declared.
   *
   * It was `min-w-[260px]` with no ceiling, anchored `right-0` to a trigger
   * near the left of a 375pt bar, so its left edge sat off the viewport and
   * Present and the reactions inside it were unreachable. Nothing measured it —
   * `check:targets` reads each control's *size*, and a menu clipped off-screen
   * keeps its size, which is the same blind spot that let the control bar
   * overflow with a green check.
   *
   * So this reads an origin, not a width. `left >= 0` is the claim; the right
   * edge is checked too, since `right-0` anchoring makes that the easy one to
   * assume and the cheap one to assert.
   */
  test("the overflow menu opens fully on screen", async ({ browser, meetingCode }) => {
    participant = await joinAs(browser, "Ama Serwaa", { code: meetingCode, viewport: IPHONE });
    const { page } = participant;

    await wakeControls(page);
    await page.getByRole("button", { name: "More" }).click();

    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    const box = await menu.boundingBox();
    expect(box, "the overflow menu rendered no box").not.toBeNull();
    expect(
      Math.round(box!.x),
      `the menu is clipped off the left edge at x=${box!.x}`,
    ).toBeGreaterThanOrEqual(0);
    expect(
      Math.round(box!.x + box!.width),
      "the menu runs past the right edge",
    ).toBeLessThanOrEqual(IPHONE.width);
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
      .getByRole("button", { name: /^(Mute|Unmute)$/ })
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
    const mic = page.getByRole("button", { name: /^(Mute|Unmute)$/ });
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
        /**
         * The accessible *name*, not one mechanism of producing it.
         *
         * This read `aria-label` alone, and v1.3 C2's primary tier deliberately
         * has none: its label is real text, `sr-only` below 900px, so that the
         * visible label and the accessible name are the same string — SC 2.5.3.
         * Reading only the attribute reported "nothing focusable on top" for a
         * control that was sitting right there.
         */
        const button = stack[0]?.closest("button");
        const label =
          button?.getAttribute("aria-label") ??
          (button?.textContent?.trim() || null);
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
    ).toMatch(/^(Mute|Unmute)$/);

    // And it still works, which is the fact the geometry is a proxy for.
    await mic.click();
    await expect(page.getByRole("button", { name: /Unmute/i })).toBeVisible();
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
      const panel = document.querySelector<HTMLElement>('aside[aria-label="Chat and people"]')!;
      const tile = document.querySelector<HTMLElement>("[data-participant]");
      const send = [...document.querySelectorAll<HTMLElement>("button")].find(
        (b) => b.getAttribute("aria-label") === "Send message",
      );
      const box = (el: Element | null | undefined) =>
        el ? el.getBoundingClientRect() : null;
      const sendBox = box(send);
      const onTopOfSend = sendBox
        ? document
            .elementFromPoint(sendBox.x + sendBox.width / 2, sendBox.y + sendBox.height / 2)
            ?.closest("button")?.getAttribute("aria-label") ?? null
        : null;
      return {
        panelHeight: box(panel)!.height,
        panelTop: box(panel)!.top,
        tileBottom: tile ? box(tile)!.bottom : null,
        onTopOfSend,
        viewport: innerHeight,
      };
    });

    /**
     * **Capped at 55dvh, not pinned to it** — v1.3 C3.
     *
     * This asserted exactly 0.55, which the panel met by declaring `h-[55dvh]`:
     * a room with two people and no messages still took over half the screen to
     * say so. C3 caps it and lets it hug what it holds, so the assertion is the
     * cap plus a floor — a sheet that collapsed to nothing would satisfy "at
     * most 55%" and be just as wrong.
     */
    const share = geometry.panelHeight / geometry.viewport;
    expect(share, `the sheet is ${Math.round(share * 100)}% of the viewport`).toBeLessThanOrEqual(0.56);
    expect(share, `the sheet is ${Math.round(share * 100)}% of the viewport`).toBeGreaterThan(0.2);

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
    ).toBe("Send message");
  });

  /**
   * v1.2 F2 and F3, measured on a phone while someone else shares.
   *
   * A6's complaint was that the shared screen renders "at unusable scale
   * inside a container with large dead margins". The scale was not the defect —
   * `object-fit: contain` letterboxes *inside* the element, so the picture was
   * right and the box around it was four times too tall, taking the border,
   * the rounding and the label with it.
   */
  test("the share region hugs its content, and the strip is a 96px rail", async ({
    browser,
    meetingCode,
  }) => {
    participant = await joinAs(browser, "Ama Serwaa", {
      code: meetingCode,
      viewport: IPHONE,
      withMedia: false,
    });
    const sharer = await joinAs(browser, "Kwabena Osei", {
      code: meetingCode,
      withMedia: false,
    });

    try {
      await wakeControls(sharer.page);
      await sharer.page.getByRole("button", { name: "Present" }).click();

      const { page } = participant;
      await expect(page.getByText("Kwabena Osei is sharing")).toBeVisible({
        timeout: 20_000,
      });

      /**
       * Wait for a **decoded frame**, not for a fixed 500ms.
       *
       * The label appears when the publication arrives; `videoWidth` and
       * `videoHeight` stay 0 until a frame is actually decoded, and the gap
       * between the two is a real network. A `waitForTimeout(500)` stood in for
       * that condition and lost the race repeatedly — `intrinsic` came back
       * `NaN` (0/0) and the failure read "against a NaN picture".
       *
       * I first took that for four-worker contention and moved the whole file
       * to the serial project. It failed there too, at one worker: the wait was
       * never long enough *in principle*, only usually. Polling asks the
       * question the sleep was guessing at, which is the same lesson as every
       * other measured check here.
       */
      await expect
        .poll(
          async () =>
            page.evaluate(() => {
              const video = [...document.querySelectorAll<HTMLVideoElement>("video")].find(
                (v) => getComputedStyle(v).objectFit === "contain",
              );
              return video?.videoHeight ?? 0;
            }),
          { message: "the shared picture never decoded a frame", timeout: 20_000 },
        )
        .toBeGreaterThan(0);

      const measured = await page.evaluate(() => {
        const video = [...document.querySelectorAll<HTMLVideoElement>("video")].find(
          (v) => getComputedStyle(v).objectFit === "contain",
        );
        if (!video) return null;
        const frame = video.parentElement!;
        const strip = [...document.querySelectorAll<HTMLElement>("h2")]
          .find((h) => /^Participants, \d+$/.test(h.textContent?.trim() ?? ""))
          ?.parentElement;
        const box = (el: Element | null | undefined) =>
          el ? el.getBoundingClientRect() : null;
        return {
          frame: box(frame)!,
          intrinsic: video.videoWidth / video.videoHeight,
          strip: box(strip),
          stripTiles: strip
            ? [...strip.querySelectorAll<HTMLElement>("[data-participant], [data-overflow]")].map(
                (t) => {
                  const r = t.getBoundingClientRect();
                  return +(r.width / r.height).toFixed(2);
                },
              )
            : [],
        };
      });

      expect(measured, "no shared surface on the viewer's phone").not.toBeNull();

      /*
       * The frame's own shape is the picture's shape. Before this it was the
       * region's shape, and the difference was the dead margin.
       */
      expect(
        measured!.frame.width / measured!.frame.height,
        `frame ${Math.round(measured!.frame.width)}x${Math.round(measured!.frame.height)} against a ${measured!.intrinsic.toFixed(2)} picture`,
      ).toBeCloseTo(measured!.intrinsic, 1);

      // F2: fullscreen lives on the region, not in the room bar — §9 rejected
      // an eighth persistent control, and this one only exists while sharing.
      const fullscreen = page.getByRole("button", { name: "View full screen" });
      await expect(fullscreen).toBeVisible();
      const size = await fullscreen.boundingBox();
      expect(size!.width, "the fullscreen control is under the 44px floor").toBeGreaterThanOrEqual(44);
      expect(size!.height).toBeGreaterThanOrEqual(44);

      // F3: a 96px rail of 16:9 tiles, not a 2-up grid.
      expect(measured!.strip, "no filmstrip on the phone").not.toBeNull();
      expect(measured!.strip!.height, "the strip is not 96px tall").toBeCloseTo(96, 0);
      for (const ratio of measured!.stripTiles) {
        expect(ratio, "a strip tile is not 16:9").toBeCloseTo(1.78, 1);
      }
    } finally {
      await sharer.context.close().catch(() => {});
    }
  });

  /**
   * v1.2 F1's drag handle: swipe the sheet down to dismiss it.
   *
   * Driven as a real pointer drag rather than by dispatching events, so it
   * exercises the same path a thumb takes — including the `touch-action: none`
   * without which the browser claims the gesture for scrolling and the
   * `pointermove` handlers never run.
   */
  test("the sheet can be swiped down to dismiss", async ({ browser, meetingCode }) => {
    participant = await joinAs(browser, "Efua Sutherland", {
      code: meetingCode,
      viewport: IPHONE,
      withMedia: false,
    });
    const { page } = participant;

    await wakeControls(page);
    await page.getByRole("button", { name: "Chat" }).click();
    const panel = page.getByRole("tabpanel", { name: "Chat" });
    await expect(panel).toBeVisible();
    await page.waitForTimeout(300);

    const handle = await page.evaluate(() => {
      const sheet = document.querySelector<HTMLElement>('aside[aria-label="Chat and people"]')!;
      const grip = sheet.firstElementChild as HTMLElement;
      const box = grip.getBoundingClientRect();
      return { x: box.x + box.width / 2, y: box.y + box.height / 2, touch: getComputedStyle(grip).touchAction };
    });

    // Without `touch-action: none` the drag never reaches the handler.
    expect(handle.touch, "the handle lets the browser take the gesture").toBe("none");

    await page.mouse.move(handle.x, handle.y);
    await page.mouse.down();
    // Past the quarter-height threshold, in steps so the move handler runs.
    await page.mouse.move(handle.x, handle.y + 80, { steps: 8 });
    await page.mouse.move(handle.x, handle.y + 200, { steps: 8 });
    await page.mouse.up();

    await expect(panel, "the sheet survived a full swipe down").toBeHidden();
  });
});

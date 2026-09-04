import { expect, test } from "./fixtures";

import {
  videoLiveness } from "./room.helpers";
import { assertFloor } from "./targets";

/**
 * §3.3's camera preview, measured as pixels rather than as markup.
 *
 * BUILD-PLAN v1.2 A2: the preview was a black rectangle on every first load in
 * production. Nothing about the DOM said so — the `<video>` was mounted, and
 * carried `autoPlay`, `playsInline` and `muted` exactly as Safari needs. What
 * was missing was `srcObject`, because the effect that assigned it was keyed on
 * `[media.stream]` and the element did not exist yet on the one commit where
 * that dependency changed. `hasCamera` is set after an `await
 * enumerateDevices()`, so the `<video>` mounts a tick later than the stream
 * arrives.
 *
 * So this asserts the frames, not the attribute. `videoLiveness` samples the
 * element twice through a canvas: `spread` separates a real image from a flat
 * fill, `motion` separates a live feed from one frozen frame. Reading back
 * `srcObject !== null` would have passed against an element that never painted.
 */
test.describe("the pre-join preview", () => {
  test("paints live camera frames on first load", async ({ page, meetingCode }) => {
    await page.goto(`/j/${meetingCode}`);

    // §3.3 asks before it grabs: the screen opens on an explanation and a
    // button, not on a permission prompt. This is the visitor's first click.
    await page.getByRole("button", { name: "Allow camera and microphone" }).click();

    // The preview is gated on permission being granted and the device list
    // having been read, which is a real round trip even with fake devices.
    await expect(page.locator("video")).toBeVisible({ timeout: 20_000 });

    // Chrome's fake device is a rolling test pattern, so both figures are
    // comfortably non-zero when the stream is attached and zero when it is not.
    await expect
      .poll(async () => (await videoLiveness(page)).width, { timeout: 15_000 })
      .toBeGreaterThan(0);

    const live = await videoLiveness(page);
    expect(live.present, "no <video> element on the pre-join screen").toBe(true);
    expect(live.spread, "the preview is a flat fill, not an image").toBeGreaterThan(10);
    expect(live.motion, "the preview is frozen, not a live feed").toBeGreaterThan(0.5);
  });

  /**
   * The second way the same defect shows up, and the reason the fix is a
   * callback ref rather than an extra dependency: `setCamera` flips
   * `track.enabled` and keeps the same `MediaStream` object, so a `<video>`
   * that unmounts and remounts around a toggle never sees the dependency
   * change either.
   */
  test("paints again after the camera is turned off and back on", async ({ page, meetingCode }) => {
    await page.goto(`/j/${meetingCode}`);
    await page.getByRole("button", { name: "Allow camera and microphone" }).click();
    await expect(page.locator("video")).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: /Turn off camera/i }).click();
    await expect(page.locator("video")).toHaveCount(0);

    await page.getByRole("button", { name: /Turn on camera/i }).click();
    await expect(page.locator("video")).toBeVisible();

    await expect
      .poll(async () => (await videoLiveness(page)).spread, { timeout: 15_000 })
      .toBeGreaterThan(10);
  });

  /**
   * v1.2 D's layout, measured as an order and a width rather than as classes.
   *
   * The screen was a two-column grid with the preview as one of two equal
   * concerns and the device controls on a scrim *inside* it. D puts the preview
   * first and everything else underneath, in the order you deal with it.
   */
  /**
   * v1.3 E2's layout, which **reverses v1.2 D** — deliberately, and this test
   * was rewritten with it rather than deleted.
   *
   * D made the preview a hero in one centred 560px column and moved the device
   * toggles *out* of the frame, on the grounds that "nothing sits on the video
   * at all any more, which is a stronger form of rule 4 than a scrim". This
   * test asserted that order, item by item, and would have gone on passing
   * against a layout the specification no longer wants — so its assertions are
   * the specification's, not the layout's.
   *
   * E2: "Split layout: preview left, meeting title and panel right. Better use
   * of horizontal space than a centred column." And the toggles go back on the
   * preview, "which puts them where attention already is" — rule 4 met with
   * `--on-scrim` rather than avoided by moving things off the video.
   */
  test("the preview leads, and the controls sit on it", async ({
    page,
    meetingCode,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/j/${meetingCode}`);
    await page.getByRole("button", { name: "Allow camera and microphone" }).click();
    await expect(page.locator("video")).toBeVisible({ timeout: 20_000 });

    const layout = await page.evaluate(() => {
      const video = document.querySelector<HTMLVideoElement>("video")!;
      const frame = video.parentElement!;
      const meter = document.querySelector<HTMLElement>("[data-mic-meter]");
      const mic = document.querySelector<HTMLElement>('[aria-label*="microphone" i]')!;
      const heading = document.querySelector<HTMLElement>("h1")!;
      const join = [...document.querySelectorAll<HTMLElement>("button")].find((b) =>
        /Join meeting/i.test(b.textContent ?? ""),
      );
      const box = (el: Element | null | undefined) => (el ? el.getBoundingClientRect() : null);

      /**
       * `frame`, not `document.body` — rule 8b forces `.dark` via a wrapper
       * element inside the route group, not on `<html>` or `<body>`. Reading a
       * custom property from body resolves the *light* `:root` value while the
       * control paints the dark one, so a same-token comparison fails by
       * comparing against the wrong scope.
       */
      const resolve = (name: string) => {
        const probe = document.createElement("span");
        probe.style.color = getComputedStyle(frame).getPropertyValue(name).trim();
        frame.appendChild(probe);
        const value = getComputedStyle(probe).color;
        probe.remove();
        return value;
      };

      // How many buttons are filled with --primary? Join is the only one.
      const primary = resolve("--primary");
      const filled = [...document.querySelectorAll<HTMLElement>("button")]
        .filter((b) => b.getBoundingClientRect().width > 0)
        .filter((b) => getComputedStyle(b).backgroundColor === primary)
        .map((b) => b.textContent?.trim().slice(0, 24) ?? "");

      return {
        frame: box(frame),
        meter: box(meter),
        mic: box(mic),
        heading: box(heading),
        join: box(join),
        radius: parseFloat(getComputedStyle(frame).borderTopLeftRadius),
        micColour: getComputedStyle(mic).color,
        onScrim: resolve("--on-scrim"),
        foreground: resolve("--foreground"),
        // Both, because Tailwind v4 compiles `-scale-x-100` to the individual
        // `scale` property and leaves `transform: none`.
        transform: getComputedStyle(video).transform,
        scale: getComputedStyle(video).scale,
        meterHeight: meter ? meter.getBoundingClientRect().height : null,
        viewport: innerWidth,
        filled,
      };
    });

    // --- split: preview left, everything about the meeting right ---------
    expect(
      layout.heading!.left,
      "the title is not to the right of the preview — this is still one column",
    ).toBeGreaterThan(layout.frame!.right);
    // 16:9, and the wider of the two columns.
    expect(layout.frame!.width / layout.frame!.height).toBeCloseTo(1.78, 1);
    expect(layout.frame!.width).toBeGreaterThan(layout.viewport - layout.frame!.width);
    // 0.75rem — CLAUDE.md's tile radius.
    expect(layout.radius).toBeCloseTo(12, 0);

    // --- the toggles are ON the preview, not under it --------------------
    expect(
      layout.mic!.top >= layout.frame!.top && layout.mic!.bottom <= layout.frame!.bottom + 1,
      `mic ${JSON.stringify(layout.mic)} is not inside frame ${JSON.stringify(layout.frame)}`,
    ).toBe(true);

    /**
     * And drawn in `--on-scrim`, which is the half of E2 that has nothing to do
     * with position.
     *
     * `--foreground` flips with the theme and the scrim does not: in light mode
     * it lands at **2.30:1** on a surface that composites to `#515355`. The two
     * tokens are the same value in dark, so the assertion is that it is *not*
     * the theme-dependent one — a same-value check would pass either way here
     * and fail nowhere until someone opened this screen in light mode.
     */
    expect(layout.micColour, "the mic toggle is not --on-scrim").toBe(layout.onScrim);

    // --- the meter, flush under the frame --------------------------------
    expect(layout.meter!.top, "the meter is not under the preview").toBeGreaterThanOrEqual(
      layout.frame!.bottom - 1,
    );
    expect(layout.meterHeight, "the meter is not a 4px bar").toBeCloseTo(4, 0);
    expect(layout.meter!.width, "the meter is not the width of the preview").toBeCloseTo(
      layout.frame!.width,
      0,
    );

    /*
     * §3.3: "Preview is mirrored; published video is not." A negative
     * horizontal scale, expressed either as a matrix or as the individual
     * `scale` property — Tailwind v4 uses the latter.
     */
    const mirrored =
      /^matrix\(\s*-/.test(layout.transform) || /^-/.test(layout.scale ?? "");
    expect(
      mirrored,
      `transform: ${layout.transform}, scale: ${layout.scale}`,
    ).toBe(true);

    // "Join is the only filled-primary button on the screen."
    expect(layout.filled, `filled-primary buttons: ${layout.filled.join(" | ")}`).toHaveLength(1);
    expect(layout.filled[0]).toMatch(/Join meeting/i);
  });

  /**
   * E2 on a phone: "preview edge-to-edge … Join sticky at the bottom with a
   * safe-area inset."
   *
   * A separate test rather than a second viewport in the one above, because
   * these are different claims: the split layout is about proportion, and this
   * is about the two edges of the screen. Measured, because "edge to edge" is a
   * rendered fact and `border-radius: 0` at a breakpoint is a declaration.
   */
  test("on a phone the preview runs edge to edge and Join is pinned", async ({
    page,
    meetingCode,
  }) => {
    await page.setViewportSize({ width: 390, height: 780 });
    await page.goto(`/j/${meetingCode}`);
    await page.getByRole("button", { name: "Allow camera and microphone" }).click();
    await expect(page.locator("video")).toBeVisible({ timeout: 20_000 });

    const phone = await page.evaluate(() => {
      const video = document.querySelector<HTMLVideoElement>("video")!;
      const frame = video.parentElement!;
      /**
       * The **visible** Join, not the first one in the DOM.
       *
       * There are two: the panel's, shown from 900px up, and the pinned one
       * below it. `display: none` gives the desktop button a zero-sized rect
       * at the origin, so a plain `.find()` reported Join sitting 780px from
       * the bottom of a 780px viewport — which is what this measured before the
       * filter, and would have been just as wrong in the other direction.
       */
      const join = [...document.querySelectorAll<HTMLElement>("button")]
        .filter((b) => b.checkVisibility())
        .find((b) => /Join meeting/i.test(b.textContent ?? ""))!;
      const selects = [...document.querySelectorAll<HTMLSelectElement>("select")];
      return {
        frame: frame.getBoundingClientRect(),
        radius: parseFloat(getComputedStyle(frame).borderTopLeftRadius),
        join: join.getBoundingClientRect(),
        viewport: { width: innerWidth, height: innerHeight },
        /**
         * The disclosure is shut, so the selectors are not on screen — E2: "the
         * join button should not sit four fields down".
         *
         * **`checkVisibility()`, not a rect.** Chrome no longer hides a closed
         * `<details>` with `display: none`; it uses `content-visibility`, so
         * the subtree stays laid out and `getBoundingClientRect()` returns a
         * full-height box for a control nobody can see. The first version of
         * this test read 2 visible selects inside a disclosure it had just
         * asserted was closed.
         */
        selectsVisible: selects.filter((s) => s.checkVisibility()).length,
        detailsOpen: document.querySelector("details")?.open ?? null,
      };
    });

    expect(phone.frame.left, "the preview is inset from the left edge").toBe(0);
    expect(phone.frame.width, "the preview is not the full width").toBeCloseTo(
      phone.viewport.width,
      0,
    );
    expect(phone.radius, "the preview is still rounded on a phone").toBe(0);

    expect(phone.detailsOpen, "the device disclosure starts open").toBe(false);
    expect(phone.selectsVisible, "the device selectors are not behind the disclosure").toBe(0);

    // Pinned: the button's bottom sits at the bottom of the viewport, within
    // the safe-area padding.
    expect(
      phone.viewport.height - phone.join.bottom,
      `Join is ${phone.viewport.height - phone.join.bottom}px from the bottom`,
    ).toBeLessThan(24);
  });

  /**
   * v1.2 E2: "Control hover / press | 120 / 80ms".
   *
   * Track B4 gave the room's control bar this treatment and `ReactionPicker`
   * grew a near-copy of it; the pre-join device toggles had neither. E2 says
   * "control", not "control bar", and a mic toggle is the same control
   * whichever screen it is on — so the three now share one constant.
   *
   * Read from `scale`, not `transform`: Tailwind v4 compiles these to the
   * individual property and leaves `transform: none`, which is what made the
   * mirror assertion above fail the first time it was written.
   */
  test("the device toggles respond to hover", async ({ page, meetingCode }) => {
    await page.goto(`/j/${meetingCode}`);
    await page.getByRole("button", { name: "Allow camera and microphone" }).click();
    await expect(page.locator("video")).toBeVisible({ timeout: 20_000 });

    const mic = page.getByRole("button", { name: /microphone/i });
    const resting = await mic.evaluate((el) => getComputedStyle(el).scale);

    await mic.hover();

    /*
     * That it lifts *over time*, not just that it ends up lifted.
     *
     * The first version of this asserted only the settled value, and passed
     * against a control whose scale snapped in 0ms: `CONTROL_MOTION` listed
     * `transform` in its transition, but Tailwind v4 compiles `hover:scale-*`
     * to the individual `scale` property, so the named property never changed
     * and the one that did was not covered. Durations correct, motion absent —
     * the exact shape a settled-value assertion cannot see.
     */
    const motion = await mic.evaluate((el) => {
      const scale = el
        .getAnimations()
        .find((a) => (a as CSSTransition).transitionProperty === "scale");
      if (!scale) return null;
      scale.pause();
      scale.currentTime = 0;
      const atStart = getComputedStyle(el).scale;
      scale.currentTime = 120;
      const atEnd = getComputedStyle(el).scale;
      return { atStart, atEnd };
    });

    expect(motion, "hover does not transition `scale` — it snaps").not.toBeNull();
    const first = (v: string) => Number(String(v).split(" ")[0]);
    expect(resting, "the toggle is scaled at rest").toBe("none");
    expect(first(motion!.atEnd), "hover did not lift the control").toBeGreaterThan(1);
    expect(
      first(motion!.atStart),
      `scale jumped straight to its end value (${motion!.atStart})`,
    ).toBeLessThan(first(motion!.atEnd));
  });

  /**
   * v1.2 Track D: "renders the no-camera state when the device list is empty".
   *
   * **Named for what it proves, not for what it looks like.** It is not "works
   * with no camera" — the fake-device harness always presents one, so the real
   * condition cannot be produced in automation. Two claims sit behind that and
   * only one is ours: the browser reporting `NotFoundError` and an empty
   * `videoinput` list is browser behaviour, verified by hand once through the
   * Screen Time trick in the Phase 3 matrix. **Our code rendering the right
   * state given that report is ours, and a stub reproduces it exactly.**
   *
   * That is not the media-faking the Phase 4 rule forbids. That rule protects
   * claims about WebRTC subscription and track behaviour; this claim is about
   * our UI responding to a state the browser hands it.
   */
  test("renders the no-camera state when the device list is empty", async ({
    page,
    meetingCode,
  }) => {
    await page.addInitScript(() => {
      const devices = navigator.mediaDevices;
      // Audio only: a microphone exists, a camera does not.
      devices.enumerateDevices = async () =>
        [
          {
            deviceId: "mic-1",
            kind: "audioinput",
            label: "Built-in Microphone",
            groupId: "g1",
            toJSON() {
              return this;
            },
          },
        ] as unknown as MediaDeviceInfo[];

      const original = devices.getUserMedia.bind(devices);
      devices.getUserMedia = async (constraints?: MediaStreamConstraints) => {
        if (constraints?.video) {
          // What Chromium raises when the requested camera is not there.
          throw Object.assign(new Error("Requested device not found"), {
            name: "NotFoundError",
          });
        }
        return original(constraints);
      };
    });

    await page.goto(`/j/${meetingCode}`);
    await page.getByRole("button", { name: "Allow camera and microphone" }).click();

    // §3.3: "No camera found" — and audio-only join is still offered, so the
    // copy must not read as a failure.
    /*
     * Matched on the full sentence, not on "No camera found".
     *
     * Three places carry that phrase in this state and they are all correct:
     * the in-frame copy, the camera selector's own empty state, and the
     * disabled toggle's accessible name. Track D's claim is specifically that
     * the state renders *inside the preview frame*, so this asserts the
     * sentence only that copy has — and the audio-only reassurance is the half
     * that matters, since §3.3 requires this not to read as a failure.
     */
    await expect(
      page.getByText(/No camera found\. Your microphone works/i),
      "the no-camera state did not render inside the preview frame",
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("video")).toHaveCount(0);

    /*
     * The camera toggle says why it cannot be used rather than silently doing
     * nothing, and — the regression E2's shared motion introduced — a disabled
     * control does not hover-lift as though it were pressable.
     */
    const camera = page.getByRole("button", { name: "No camera found" });
    await expect(camera).toBeDisabled();

    const resting = await camera.evaluate((el) => getComputedStyle(el).scale);
    await camera.hover({ force: true });
    const hovered = await camera.evaluate((el) => getComputedStyle(el).scale);
    expect(
      hovered,
      `a disabled control lifted on hover (rest: ${resting}, hover: ${hovered})`,
    ).toBe(resting);

    /*
     * Joining is still allowed — §3.3: "Joining with camera and mic both off is
     * allowed and must not be treated as an error."
     *
     * The name is filled first because a guest cannot join without one either
     * way; asserting an enabled Join before typing tests the name requirement,
     * not the camera state, and would have failed for the right reason on the
     * wrong claim.
     */
    await page.getByLabel("Your name").fill("Ama Serwaa");
    await expect(page.getByRole("button", { name: "Join meeting" })).toBeEnabled();
  });
});

/**
 * The half of pre-join that `targets.spec.ts` cannot reach.
 *
 * §3.3 opens on an explanation and a button rather than a permission prompt, so
 * the screen the `app` project measures has three controls on it. The device
 * selectors and the mic and camera toggles exist only after permission is
 * answered — which means real capture, which is why this state is measured here
 * in the serial `media` project instead.
 *
 * Same floor, same helper, different project. The split is about what the state
 * costs to reach, not about what is being asserted.
 */
test.describe("touch targets on pre-join", () => {
  test("every control clears the 44px floor once devices are granted", async ({
    page,
    meetingCode,
  }) => {
    await page.goto(`/j/${meetingCode}`);
    await page.getByRole("button", { name: "Allow camera and microphone" }).click();
    await expect(page.locator("video")).toBeVisible({ timeout: 20_000 });

    // Both widths: a selector row that fits at 1280 is the one that wraps and
    // squeezes at 375.
    for (const viewport of [
      { width: 1280, height: 800 },
      { width: 375, height: 812 },
    ]) {
      await page.setViewportSize(viewport);
      await assertFloor(page, {
        floor: 44,
        // Two device toggles, three selectors, the name field, and Join.
        atLeast: 7,
        label: `pre-join with devices at ${viewport.width}px`,
      });
    }
  });
});

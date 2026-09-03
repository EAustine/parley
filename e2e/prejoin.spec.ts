import { expect, test } from "./fixtures";

import {
  videoLiveness } from "./room.helpers";

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
  test("the preview is the hero, and everything else sits under it", async ({
    page,
    meetingCode,
  }) => {
    await page.goto(`/j/${meetingCode}`);
    await page.getByRole("button", { name: "Allow camera and microphone" }).click();
    await expect(page.locator("video")).toBeVisible({ timeout: 20_000 });

    const layout = await page.evaluate(() => {
      const video = document.querySelector<HTMLVideoElement>("video")!;
      const frame = video.parentElement!;
      const meter = document.querySelector<HTMLElement>("[data-mic-meter]");
      const mic = document.querySelector<HTMLElement>('[aria-label*="microphone" i]');
      const join = [...document.querySelectorAll<HTMLElement>("button")].find((b) =>
        /Join meeting/i.test(b.textContent ?? ""),
      );
      const camera = document.querySelector<HTMLElement>('[id="camera"], [aria-labelledby*="camera"]');
      const box = (el: Element | null | undefined) => (el ? el.getBoundingClientRect() : null);
      /**
       * `frame`, not `document.body` — rule 8b forces `.dark` via a wrapper
       * element inside the route group, not on `<html>` or `<body>`. Reading
       * the custom property from body resolved the *light* `:root` value
       * (`#16181D`) while the button actually painted the dark one
       * (`#F2F4F7`), so a same-token comparison failed by comparing against
       * the wrong scope. `frame` is already inside the forced-dark tree.
       */
      const resolve = (name: string) => {
        const probe = document.createElement("span");
        probe.style.color = getComputedStyle(frame).getPropertyValue(name).trim();
        frame.appendChild(probe);
        const value = getComputedStyle(probe).color;
        probe.remove();
        return value;
      };
      // How many buttons are filled with --primary? D: Join is the only one.
      const primary = resolve("--primary");
      const filled = [...document.querySelectorAll<HTMLElement>("button")]
        .filter((b) => b.getBoundingClientRect().width > 0)
        .filter((b) => getComputedStyle(b).backgroundColor === primary)
        .map((b) => b.textContent?.trim().slice(0, 24) ?? "");

      return {
        frame: box(frame),
        meter: box(meter),
        mic: box(mic),
        camera: box(camera),
        join: box(join),
        radius: parseFloat(getComputedStyle(frame).borderTopLeftRadius),
        // Both, because Tailwind v4 compiles `-scale-x-100` to the individual
        // `scale` property and leaves `transform: none` — the same shape that
        // caught the panel slide's `translate` in Track C.
        transform: getComputedStyle(video).transform,
        scale: getComputedStyle(video).scale,
        meterHeight: meter ? meter.getBoundingClientRect().height : null,
        viewport: innerWidth,
        filled,
      };
    });

    // 16:9, up to about 560px, centred in the viewport.
    expect(layout.frame!.width).toBeLessThanOrEqual(560);
    expect(layout.frame!.width / layout.frame!.height).toBeCloseTo(1.78, 1);
    const centre = layout.frame!.x + layout.frame!.width / 2;
    expect(Math.abs(centre - layout.viewport / 2)).toBeLessThan(2);
    // 0.75rem — CLAUDE.md's tile radius, which B3 corrected from 0.7rem.
    expect(layout.radius).toBeCloseTo(12, 0);
    /*
     * §3.3: "Preview is mirrored; published video is not."
     *
     * A negative horizontal scale, expressed either as a matrix or as the
     * individual `scale` property — Tailwind v4 uses the latter, so reading
     * only `transform` returned "none" and the assertion failed against a
     * preview that was mirrored correctly.
     */
    const mirrored =
      /^matrix\(\s*-/.test(layout.transform) || /^-/.test(layout.scale ?? "");
    expect(
      mirrored,
      `transform: ${layout.transform}, scale: ${layout.scale}`,
    ).toBe(true);

    // The order D asks for: preview, meter, toggles, selectors, name and join.
    expect(layout.meter!.top, "the meter is not under the preview").toBeGreaterThanOrEqual(
      layout.frame!.bottom - 1,
    );
    expect(layout.mic!.top, "the device toggles are not under the meter").toBeGreaterThanOrEqual(
      layout.meter!.bottom - 1,
    );
    expect(
      layout.camera!.top,
      "the selectors are not under the device toggles",
    ).toBeGreaterThanOrEqual(layout.mic!.bottom - 1);
    expect(layout.join!.top, "Join is not the last thing").toBeGreaterThan(layout.camera!.bottom);

    // A 4px bar, not a number and not twelve segments.
    expect(layout.meterHeight, "the meter is not a 4px bar").toBeCloseTo(4, 0);
    expect(layout.meter!.width, "the meter is not the width of the preview").toBeCloseTo(
      layout.frame!.width,
      0,
    );

    // "Join is the only filled-primary button on the screen."
    expect(layout.filled, `filled-primary buttons: ${layout.filled.join(" | ")}`).toHaveLength(1);
    expect(layout.filled[0]).toMatch(/Join meeting/i);
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
});

import { expect, test } from "@playwright/test";

import { LIVE_CODE, videoLiveness } from "./room.helpers";

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
  test("paints live camera frames on first load", async ({ page }) => {
    await page.goto(`/j/${LIVE_CODE}`);

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
  test("paints again after the camera is turned off and back on", async ({ page }) => {
    await page.goto(`/j/${LIVE_CODE}`);
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
});

import { expect, test } from "./fixtures";

import {
  joinAs,
  leave,
  videoLiveness,
  wakeControls,
  type Participant,
} from "./room.helpers";

/**
 * A3 — turning the camera off and on again.
 *
 * "Distinguish before fixing. If `localParticipant.videoTrackPublications`
 * shows a live track while the element is blank, it is **attachment**. If there
 * is no track, it is **acquisition**."
 *
 * So the diagnosis is part of the test rather than something done once and
 * written down. `cameraState` reports both halves at every step — what LiveKit
 * has published, and what the DOM is actually painting — so a future
 * regression says which of the two broke rather than only that the tile is
 * blank.
 *
 * This is also rule 3. §3 says mute state comes from the track, and the failure
 * here is the same lie from the other direction: the control reads "Turn off
 * camera", the participants panel shows the camera on, and nothing is on
 * screen. A UI claiming a live camera while nothing renders is exactly the
 * class of defect rule 3 exists to prevent.
 */

/**
 * What LiveKit thinks, and what the DOM is doing, in one reading.
 *
 * **LiveKit's side is read through the product's own UI, not a test global.**
 * `RoomControls` labels the button from `useLocalParticipant().isCameraEnabled`,
 * which is the publication's real state — that is rule 3, and it is the whole
 * reason the label can be trusted as a probe. Exposing the `Room` on `window`
 * for a test would put a hole in production code to observe a property the
 * product already renders.
 */
async function cameraState(participant: Participant) {
  const { page } = participant;

  // "Turn off camera" is offered when the camera is enabled, and vice versa.
  const enabled = await page
    .getByRole("button", { name: "Turn off camera" })
    .count();

  const dom = await page.evaluate(() => {
    const video = document.querySelector<HTMLVideoElement>("video");
    return {
      videoInDom: video !== null,
      attached: Boolean(video?.srcObject),
      readyState: video?.readyState ?? null,
    };
  });

  return { enabled: enabled > 0, ...dom };
}

test.describe("A3 — camera off, then on", () => {
  let participant: Participant;

  test.afterEach(async () => {
    if (!participant) return;
    await leave(participant).catch(() => {});
    await participant.context.close().catch(() => {});
  });

  test("the tile paints again after the camera is turned back on", async ({
    browser,
    meetingCode,
  }) => {
    participant = await joinAs(browser, "Efua Danso", { code: meetingCode });
    const { page } = participant;

    /**
     * Baseline: it works before anything is toggled.
     *
     * Polled, not read once. A track arrives over a real signalling round trip
     * to a cloud SFU and is attached when it lands, so `joinAs` returning only
     * means the room is connected — the first read of this found no `<video>`
     * at all, several seconds before the tile was fine.
     */
    await expect
      .poll(async () => (await videoLiveness(page)).width, {
        message: "no camera track ever arrived on join",
        timeout: 30_000,
      })
      .toBeGreaterThan(0);
    await expect
      .poll(async () => (await videoLiveness(page)).motion, {
        message: "the tile is not painting before any toggle",
        timeout: 15_000,
      })
      .toBeGreaterThan(1);

    const stateBefore = await cameraState(participant);
    expect(stateBefore.enabled, "camera not enabled on join").toBe(true);
    expect(stateBefore.attached, "the <video> has no stream on join").toBe(true);

    // --- off ---------------------------------------------------------------
    await wakeControls(page);
    await page.getByRole("button", { name: "Turn off camera" }).click();
    await expect(page.getByRole("button", { name: "Turn on camera" })).toBeVisible();

    // --- and on again ------------------------------------------------------
    await wakeControls(page);
    await page.getByRole("button", { name: "Turn on camera" }).click();
    await expect(page.getByRole("button", { name: "Turn off camera" })).toBeVisible();

    /**
     * The diagnosis, asserted rather than inspected.
     *
     * If this fails it says which half broke: `published`/`hasTrack` false is
     * acquisition — the device was never re-obtained. `attached` false with a
     * live track is the element — LiveKit is publishing into a `<video>` that
     * nothing ever handed the stream to.
     */
    const after = await cameraState(participant);
    expect(
      after.enabled,
      "acquisition: LiveKit is not reporting the camera as enabled again",
    ).toBe(true);
    expect(after.videoInDom, "no <video> element rendered at all").toBe(true);
    expect(
      after.attached,
      "attachment: the camera is enabled and a <video> is rendered, but it has " +
        "no srcObject — the track was never attached to the new element",
    ).toBe(true);

    // And the thing a person would actually notice.
    await expect
      .poll(async () => (await videoLiveness(page)).motion, {
        message: "the tile is blank after the camera was turned back on",
        timeout: 10_000,
      })
      .toBeGreaterThan(1);
  });
});

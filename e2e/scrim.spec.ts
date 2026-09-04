import { expect, test } from "./fixtures";

import { assertScrimText, measureScrimText } from "./scrim";
import { joinAs, leave, wakeControls, type Participant } from "./room.helpers";

/**
 * Rule 4, in the one place the scrim actually exists.
 *
 * The room is the whole surface area: `Tile` puts a gradient under every label,
 * `RoomControls` paints the bar and the device-error message, and
 * `ScreenShareStage` puts the sharer's name on one.
 *
 * **And pre-join, as of v1.3 E2.** This file used to say pre-join had no scrim
 * at all, because v1.2 D had moved its controls out of the frame — "a stronger
 * form of rule 4 than a scrim". E2 puts them back on the preview, so the claim
 * went stale the moment that layout landed, and a comment asserting the absence
 * of a thing is exactly the sort that stops being true without failing.
 */
test.describe("rule 4 — what is drawn on the scrim", () => {
  let participant: Participant;

  test.afterEach(async () => {
    if (!participant) return;
    await leave(participant).catch(() => {});
    await participant.context.close().catch(() => {});
  });

  test("pre-join draws its controls in --on-scrim, not --foreground", async ({
    page,
    meetingCode,
  }) => {
    await page.goto(`/j/${meetingCode}`);
    await page.getByRole("button", { name: "Allow camera and microphone" }).click();
    await expect(page.locator("video")).toBeVisible({ timeout: 20_000 });

    /**
     * Two: the mic and camera toggles, which are the only marks on this scrim.
     *
     * `--on-scrim` and dark `--foreground` are the same value, so a colour
     * comparison alone cannot tell them apart here — which is the whole reason
     * this check compares against the **permitted set** rather than against the
     * token that happens to be right in one theme.
     */
    await assertScrimText(page, 2);
  });

  test("the resting room draws nothing hued on the scrim", async ({
    browser,
    meetingCode,
  }) => {
    participant = await joinAs(browser, "Kwabena Osei", { code: meetingCode });
    await wakeControls(participant.page);

    await assertScrimText(participant.page, 2);
  });

  /**
   * The state the check was written for.
   *
   * `RoomControls` drew this message as `text-[var(--state-critical)]` on
   * `var(--scrim)` — 2.53:1 over bright video, on the sentence telling you your
   * camera did not start. It renders only after a device fails, so a walk of
   * the resting room was green while it sat one failed acquisition away.
   *
   * **Joining with media off is what makes the failure reachable.** Toggling a
   * live camera off and on again does not call `getUserMedia` a second time —
   * LiveKit keeps the track and unmutes it — so patching acquisition and
   * toggling proved nothing, and the first version of this test timed out
   * waiting for a message that could not appear. A participant who joined with
   * the camera off has no track to unmute, so turning it on has to acquire, and
   * that is the call this intercepts.
   */
  test("and nothing hued when the camera fails to start", async ({
    browser,
    meetingCode,
  }) => {
    participant = await joinAs(browser, "Adwoa Mensah", {
      code: meetingCode,
      withMedia: false,
    });
    const { page } = participant;

    await page.evaluate(() => {
      const media = navigator.mediaDevices;
      const real = media.getUserMedia.bind(media);
      media.getUserMedia = async (c?: MediaStreamConstraints) => {
        if (c?.video) throw new DOMException("Device in use", "NotReadableError");
        return real(c);
      };
    });

    await wakeControls(page);
    await page.getByRole("button", { name: "Turn on camera" }).click();

    await expect(page.getByText("Your camera didn't turn on.")).toBeVisible();
    await assertScrimText(page, 2);
  });

  /**
   * The detector, proved able to fail.
   *
   * `CLAUDE.md`: "Delete the guard. If no test fails, the guard is untested."
   * Both tests above pass on correct code, and would pass just as quietly
   * against a walk that matched nothing, resolved the wrong ancestor, or
   * compared colours it never found. The `atLeast` floor catches an empty
   * result; it does not catch a walk that finds elements and misjudges them.
   *
   * So this puts the exact defect back — hued text under a scrim gradient, the
   * colour on a child and the scrim on its parent, which is the shape no source
   * scan can see — and requires the detector to name it. Injected rather than
   * reverted in the component, because a test that needs the product broken to
   * run is a test nobody can run.
   */
  test("the detector finds hued text under a scrim on a parent", async ({
    browser,
    meetingCode,
  }) => {
    participant = await joinAs(browser, "Yaw Boateng", { code: meetingCode });
    const { page } = participant;

    const clean = await measureScrimText(page);
    expect(clean.map((f) => f.color)).not.toContain("rgb(242, 102, 105)");

    await page.evaluate(() => {
      const parent = document.createElement("div");
      // The real shape: gradient on the parent, colour on the child.
      parent.style.backgroundImage =
        "linear-gradient(to top, var(--scrim), transparent)";
      const child = document.createElement("span");
      child.style.color = "var(--state-critical)";
      child.textContent = "Your camera didn't turn on.";
      parent.appendChild(child);
      /**
       * Inside the room's own `.dark` wrapper, not on `<body>`.
       *
       * The palette is declared on `.dark` and `.light`; only `--scrim` and
       * its two foregrounds sit on `:root`. Appending to `<body>` therefore
       * resolved the gradient and left `--state-critical` undefined, so the
       * span inherited a permitted colour and the injected defect was not one.
       * This test failed on its first run for that reason — which is the
       * argument for having it: the same blind spot in the detector would have
       * looked identical from outside.
       */
      (document.querySelector(".dark") ?? document.body).appendChild(parent);
    });

    const found = await measureScrimText(page);
    const offender = found.find((f) => f.color === "rgb(242, 102, 105)");

    expect(
      offender,
      "the scrim walk did not find --state-critical drawn under a scrim gradient — " +
        "it is not asserting what it claims to",
    ).toBeDefined();
  });
});

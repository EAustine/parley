import { expect, test } from "./fixtures";

import { joinAs, leave, wakeControls, type Participant } from "./room.helpers";

/**
 * Devices, during a meeting — v1.3 B2.
 *
 * §3.3 gave pre-join three selectors and the room none, so the only moment a
 * device could be changed was before you were in a position to discover it was
 * the wrong one. "Field issues 2 and 5 are one feature."
 */
test.describe("device settings, mid-call", () => {
  let participant: Participant;

  test.afterEach(async () => {
    if (!participant) return;
    await leave(participant).catch(() => {});
    await participant.context.close().catch(() => {});
  });

  const openSettings = async (p: Participant) => {
    await wakeControls(p.page);
    await p.page.getByRole("button", { name: "More options" }).click();
    await p.page.getByRole("menuitem", { name: "Audio and video settings" }).click();
    return p.page.getByRole("dialog");
  };

  test("the overflow menu reaches audio and video settings", async ({
    browser,
    meetingCode,
  }) => {
    participant = await joinAs(browser, "Yaa Asantewaa", { code: meetingCode });
    const { page } = participant;

    const more = page.getByRole("button", { name: "More options" });
    await wakeControls(page);
    await expect(more).toHaveAttribute("aria-haspopup", "menu");
    await expect(more).toHaveAttribute("aria-expanded", "false");

    const dialog = await openSettings(participant);
    await expect(dialog.getByRole("heading", { name: "Audio and video" })).toBeVisible();

    /**
     * The two that always exist. Chromium's fake capture provides both, and the
     * selects are populated from `enumerateDevices` after permission — so an
     * empty one here would mean the labels never arrived, not that the machine
     * has no camera.
     */
    await expect(dialog.getByLabel("Camera")).toBeVisible();
    await expect(dialog.getByLabel("Microphone")).toBeVisible();
  });

  test("choosing a different microphone switches the published track", async ({
    browser,
    meetingCode,
  }) => {
    participant = await joinAs(browser, "Yaa Asantewaa", { code: meetingCode });

    const dialog = await openSettings(participant);
    const mic = dialog.getByLabel("Microphone");

    const options = await mic.locator("option").evaluateAll((nodes) =>
      nodes.map((n) => (n as HTMLOptionElement).value).filter(Boolean),
    );
    test.skip(options.length < 2, "this machine reports one microphone");

    const before = await mic.inputValue();
    const other = options.find((id) => id !== before)!;
    await mic.selectOption(other);

    /**
     * Read back from the control, which reads from `room.getActiveDevice` —
     * rule 3's habit. A React value set when the select changed would show the
     * chosen device whether or not the switch succeeded, which is the one thing
     * this test exists to distinguish.
     */
    await expect.poll(async () => mic.inputValue()).toBe(other);
  });

  test("the speaker control is offered only where it can work", async ({
    browser,
    meetingCode,
  }) => {
    participant = await joinAs(browser, "Yaa Asantewaa", { code: meetingCode });
    const { page } = participant;

    const dialog = await openSettings(participant);

    /**
     * B2: "Speaker selection needs `HTMLMediaElement.setSinkId`, unsupported in
     * Safari. Feature-detect and hide rather than showing a control that does
     * nothing."
     *
     * Asserted against the browser's own answer rather than against "Chromium
     * has it": the point of the rule is that the control tracks the capability,
     * and a test hard-coding the expected outcome would pass on an engine where
     * the detection had been wired backwards.
     */
    const supported = await page.evaluate(
      () => "setSinkId" in HTMLMediaElement.prototype,
    );
    await expect(dialog.getByLabel("Speaker")).toHaveCount(supported ? 1 : 0);
  });

  test("a new device asks rather than switching", async ({
    browser,
    meetingCode,
  }) => {
    participant = await joinAs(browser, "Yaa Asantewaa", { code: meetingCode });
    const { page } = participant;

    /**
     * A device that arrives after the room is up.
     *
     * `enumerateDevices` is patched to append one and a `devicechange` is
     * dispatched, which is exactly what the browser does when hardware is
     * plugged in — the hook cannot tell the difference, because the only thing
     * it reads is the list before and after.
     *
     * Patching rather than plugging in real hardware is the whole reason this
     * is testable at all, and the substituted value is the same shape the real
     * API returns.
     */
    await page.evaluate(() => {
      const media = navigator.mediaDevices;
      const real = media.enumerateDevices.bind(media);
      media.enumerateDevices = async () => {
        const devices = await real();
        return [
          ...devices,
          {
            deviceId: "parley-test-airpods",
            kind: "audioinput",
            label: "AirPods Pro",
            groupId: "parley-test-group",
            toJSON() {
              return this;
            },
          } as MediaDeviceInfo,
        ];
      };
      media.dispatchEvent(new Event("devicechange"));
    });

    /**
     * B2 calls this a decision: "Silently moving someone's audio to a device
     * they did not choose is how a private conversation comes out of a laptop
     * speaker in an open office." So the assertion is that it *asks*.
     */
    const prompt = page.getByRole("status").filter({ hasText: "AirPods Pro" });
    await expect(prompt).toBeVisible({ timeout: 15_000 });
    await expect(prompt.getByRole("button", { name: "Switch" })).toBeVisible();
    await expect(prompt.getByRole("button", { name: "Dismiss" })).toBeVisible();

    // Non-modal: the meeting continues, and the control bar stays reachable —
    // §3.4, and mute is a privacy control.
    await wakeControls(page);
    await expect(page.getByRole("button", { name: /Turn off microphone/ })).toBeEnabled();

    await prompt.getByRole("button", { name: "Dismiss" }).click();
    await expect(prompt).toHaveCount(0);
  });

  test("and the same hardware is not asked about twice", async ({
    browser,
    meetingCode,
  }) => {
    participant = await joinAs(browser, "Yaa Asantewaa", { code: meetingCode });
    const { page } = participant;

    await page.evaluate(() => {
      const media = navigator.mediaDevices;
      const real = media.enumerateDevices.bind(media);
      media.enumerateDevices = async () => {
        const devices = await real();
        return [
          ...devices,
          {
            deviceId: "parley-test-airpods",
            kind: "audioinput",
            label: "AirPods Pro",
            groupId: "parley-test-group",
            toJSON() {
              return this;
            },
          } as MediaDeviceInfo,
        ];
      };
      media.dispatchEvent(new Event("devicechange"));
    });

    const prompt = page.getByRole("status").filter({ hasText: "AirPods Pro" });
    await expect(prompt).toBeVisible({ timeout: 15_000 });
    await prompt.getByRole("button", { name: "Dismiss" }).click();
    await expect(prompt).toHaveCount(0);

    /**
     * A second `devicechange` with the *same* list must say nothing.
     *
     * Browsers fire this event for changes that are not additions — a default
     * output moving, a permission granting labels — and a prompt that reappears
     * every time is one people learn to dismiss without reading, which is worse
     * than no prompt. "New" has to mean new.
     */
    await page.evaluate(() => navigator.mediaDevices.dispatchEvent(new Event("devicechange")));
    await page.waitForTimeout(1_000);
    await expect(prompt).toHaveCount(0);
  });
});

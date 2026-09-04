import { expect, test } from "./fixtures";

import { joinAs, leave, wakeControls, type Participant } from "./room.helpers";

/**
 * §3.7's availability rule — v1.3 C5.
 *
 * "Reported three times, and 'desktop only' was never the right rule.
 * `getDisplayMedia` is unsupported on iOS Safari entirely; **Android Chrome
 * supports it**. Feature-detect and hide — not disable — where unavailable."
 *
 * The rule was `hasApi && matchMedia("(hover: hover)")`, which is the right
 * answer for two platforms out of three and wrong for the one that breaks the
 * correlation.
 *
 * **The suite could not have caught it**, and that is the more useful finding.
 * Every mobile test sets a `viewport` and nothing more — and a 375px window on
 * a laptop still reports `(hover: hover)`, so the conjunct that hid the control
 * on touch devices was never false in a test run. "Phone-sized" and "a phone"
 * are different machines. `joinAs({ android: true })` now emulates the second.
 */
test.describe("§3.7 — where screen share is offered", () => {
  let participant: Participant;

  test.afterEach(async () => {
    if (!participant) return;
    await leave(participant).catch(() => {});
    await participant.context.close().catch(() => {});
  });

  const present = (p: Participant) =>
    p.page.getByRole("button", { name: "Present" });

  test("offered on a pointer device that has the API", async ({
    browser,
    meetingCode,
  }) => {
    participant = await joinAs(browser, "Kofi Mensah", { code: meetingCode });
    const { page } = participant;

    // The premise. If this were false the assertion below would pass for the
    // wrong reason on a browser that simply cannot share.
    expect(
      await page.evaluate(
        () => typeof navigator.mediaDevices?.getDisplayMedia === "function",
      ),
      "this browser has no getDisplayMedia, so the test proves nothing",
    ).toBe(true);

    await wakeControls(page);
    await expect(present(participant)).toBeVisible();
  });

  test("offered on a touch device that has the API — the Android case", async ({
    browser,
    meetingCode,
  }) => {
    participant = await joinAs(browser, "Kofi Mensah", {
      code: meetingCode,
      android: true,
    });
    const { page } = participant;

    const environment = await page.evaluate(() => ({
      hasApi: typeof navigator.mediaDevices?.getDisplayMedia === "function",
      hover: window.matchMedia("(hover: hover)").matches,
    }));

    /**
     * The emulation has to actually produce the machine in question, or this
     * test is the old one at a smaller size. Both halves are asserted: the API
     * present, and hover absent — which together are exactly the combination
     * the old rule got wrong.
     */
    expect(environment.hasApi, "emulated phone has no getDisplayMedia").toBe(true);
    expect(
      environment.hover,
      "the emulated phone still reports hover — this is a narrow window, not a touch device",
    ).toBe(false);

    /**
     * **Reachable, not necessarily in the bar** — v1.3 C2 moved Present into
     * the overflow menu below 900px, where the bar is allowed six controls.
     *
     * The claim C5 makes is about *availability on this device*, not about
     * which of the two surfaces carries it, so the assertion follows the
     * feature rather than the layout that happened to hold it when the test
     * was written.
     */
    await wakeControls(page);
    await expect(
      present(participant),
      "Present is in the bar on a phone, where C2 allows only six controls",
    ).toHaveCount(0);

    await page.getByRole("button", { name: "More options" }).click();
    await expect(
      page.getByRole("menuitem", { name: /Share your screen/ }),
      "screen share is unreachable on a touch device that supports it — C5's bug",
    ).toBeVisible();
  });

  test("hidden, not disabled, where the API is absent", async ({
    browser,
    meetingCode,
  }) => {
    /**
     * The API is removed before any page script runs, so the capability check
     * on mount sees a browser without it — which is what iOS Safari is.
     *
     * `addInitScript` on the context rather than `page.evaluate` afterwards:
     * the check runs once, in an effect, and deleting the method later would
     * be a change nothing re-reads.
     */
    participant = await joinAs(browser, "Kofi Mensah", { code: meetingCode });
    await leave(participant).catch(() => {});
    await participant.context.close().catch(() => {});

    const context = await browser.newContext({ permissions: ["camera", "microphone"] });
    await context.addInitScript(() => {
      // From the **prototype**, which is where it lives. Deleting it off the
      // `navigator.mediaDevices` instance is a silent no-op, and the assertion
      // below is what said so.
      delete (MediaDevices.prototype as Partial<MediaDevices>).getDisplayMedia;
    });
    const page = await context.newPage();
    participant = { context, page, name: "Kofi Mensah" };

    await page.goto(`/j/${meetingCode}`);
    const nameField = page.getByLabel("Your name");
    if (await nameField.count()) await nameField.fill("Kofi Mensah");
    await page.getByRole("button", { name: "Join meeting" }).click();
    await page.waitForURL(`**/room/${meetingCode}`);
    await expect(
      page.getByRole("heading", { name: /Meeting, \d+ participant/ }),
    ).toBeAttached({ timeout: 60_000 });

    expect(
      await page.evaluate(
        () => typeof navigator.mediaDevices?.getDisplayMedia === "function",
      ),
      "the API was not actually removed, so nothing here is being tested",
    ).toBe(false);

    await wakeControls(page);
    /**
     * **Hidden, not disabled.** C5: "A disabled control invites someone to keep
     * trying." So the assertion is a count of zero rather than a disabled
     * state — a present-but-disabled button would satisfy "cannot be used" and
     * fail the rule.
     */
    await expect(present(participant)).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /Stop presenting/ }),
    ).toHaveCount(0);

    // And the rest of the bar is unaffected: hiding one control must not take
    // its neighbours with it.
    await expect(page.getByRole("button", { name: /Mute/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Chat", exact: true })).toBeVisible();
  });
});

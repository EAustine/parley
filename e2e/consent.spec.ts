import { expect, test } from "./fixtures";

import { expectParticipants, joinAs, leave, wakeControls, type Participant } from "./room.helpers";

/**
 * Nothing publishes that nobody turned on — BUILD-PLAN v1.4 A1.
 *
 * Reported from the deployed app: joined without granting anything at pre-join,
 * and the camera was live in the room, publishing to two other people.
 *
 * The cause was one comparison. `RoomStage` read `stored.cameraOn !== false`
 * from `localStorage`, and `undefined !== false` is `true` — so somebody who
 * had never granted anything, and therefore had no stored preference, reached
 * `setCameraEnabled(true)`. **That call is the `getUserMedia` prompt.** The room
 * asked the browser for a camera on their behalf and published what came back.
 *
 * ## Why the suite could not have caught it
 *
 * Every project in `playwright.config.ts` grants camera and microphone and
 * launches Chrome with `--use-fake-ui-for-media-stream`, which auto-accepts.
 * There was no ungranted path to fail on: `prejoin.spec` covers the granted one
 * thoroughly, and that is exactly why this shipped.
 *
 * So these tests do not rely on the browser's permission state at all. They
 * replace `navigator.mediaDevices.getUserMedia` with a stub that **counts every
 * call and refuses**, which gives both halves of A1's check from one
 * instrument: refusing produces the ungranted pre-join, and counting answers
 * "did anything ask for a device on the room route".
 *
 * ## And why the assertion is a call count rather than a label
 *
 * A1 names the trap: asserting the button says "off" is the assertion that
 * passes while a track publishes. A camera track cannot exist without a
 * `getUserMedia` that resolved, so **zero calls on the room route is a
 * statement about publications**, not about the interface drawn over them. The
 * observer case below then checks the same fact from the only place it actually
 * mattered — somebody else's screen.
 */

/**
 * Count every `getUserMedia`, and refuse them all.
 *
 * `enumerateDevices` is deliberately left alone: the devices are still there,
 * so this is "permission withheld" and not "no camera", which are different
 * branches in `useMediaPreview` and only one of them is under test.
 */
const DENY_AND_COUNT = () => {
  const w = window as unknown as { __gum?: { calls: string[] } };
  w.__gum = { calls: [] };
  const media = navigator.mediaDevices;
  if (!media) return;
  media.getUserMedia = async () => {
    w.__gum!.calls.push(location.pathname);
    throw new DOMException("Refused by the consent spec", "NotAllowedError");
  };
};

/** Calls recorded while on the room route, which is the window A1 cares about. */
const roomCalls = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __gum?: { calls: string[] } };
    return (w.__gum?.calls ?? []).filter((p) => p.startsWith("/room/"));
  });

test.describe("what the room is allowed to publish", () => {
  const open: Participant[] = [];

  test.afterEach(async () => {
    while (open.length) {
      const p = open.pop()!;
      await leave(p).catch(() => {});
      await p.context.close().catch(() => {});
    }
  });

  /**
   * The reported case, exactly: nothing was granted, because nothing was asked.
   *
   * §3.3 says the prompt does not fire on page load, so a visitor who joins
   * without pressing "Allow camera and microphone" has granted nothing — and
   * the old room read that silence as consent.
   */
  test("joins with both off when pre-join was never granted, and asks the browser for nothing", async ({
    browser,
    meetingCode,
  }) => {
    test.setTimeout(120_000);
    const context = await browser.newContext({ permissions: [] });
    await context.addInitScript(DENY_AND_COUNT);
    const page = await context.newPage();

    try {
      await page.goto(`/j/${meetingCode}`);
      // Deliberately not pressing "Allow camera and microphone". This is the
      // state the report was made from.
      await page.getByLabel("Your name").fill("Ama Serwaa");
      await page.getByRole("button", { name: /^Join/ }).click();
      await page.waitForURL(`**/room/${meetingCode}`);
      await expect(
        page.getByRole("heading", { name: /Meeting, \d+ participant/ }),
      ).toBeAttached({ timeout: 60_000 });

      // Give the connect path every chance to publish before reading. The old
      // code called `setCameraEnabled(true)` immediately after `connect`.
      await page.waitForTimeout(3_000);

      expect(
        await roomCalls(page),
        "the room asked the browser for a device nobody turned on",
      ).toEqual([]);
    } finally {
      await context.close();
    }
  });

  /**
   * The same, having explicitly refused — and then the counter is made to move.
   *
   * A call count that can only ever read zero would pass against a broken
   * probe, so the second half presses Start video and requires a call to
   * appear. That is what makes the first half's empty array an observation
   * rather than an artefact, and it is also A1's other clause: the first press
   * is what asks.
   */
  test("stays silent after an explicit denial, and asks only when a control is pressed", async ({
    browser,
    meetingCode,
  }) => {
    test.setTimeout(120_000);
    const context = await browser.newContext({ permissions: [] });
    await context.addInitScript(DENY_AND_COUNT);
    const page = await context.newPage();

    try {
      await page.goto(`/j/${meetingCode}`);
      // Ask, and be refused: `useMediaPreview` classifies the NotAllowedError
      // and pre-join renders the denied state with its own way forward.
      await page.getByRole("button", { name: "Allow camera and microphone" }).click();
      await expect(
        page.getByRole("button", { name: "Join without camera or mic" }),
      ).toBeVisible({ timeout: 20_000 });

      await page.getByLabel("Your name").fill("Kwabena Osei");
      await page.getByRole("button", { name: "Join without camera or mic" }).click();
      await page.waitForURL(`**/room/${meetingCode}`);
      await expect(
        page.getByRole("heading", { name: /Meeting, \d+ participant/ }),
      ).toBeAttached({ timeout: 60_000 });
      await page.waitForTimeout(3_000);

      expect(
        await roomCalls(page),
        "entering the room asked for a device after an explicit denial",
      ).toEqual([]);

      // Now make it ask. The control still works; it is the *entry* that must
      // be silent, because a prompt is a response to an action.
      await wakeControls(page);
      await page.getByRole("button", { name: "Start video" }).click();
      await expect
        .poll(async () => (await roomCalls(page)).length, { timeout: 15_000 })
        .toBeGreaterThan(0);
    } finally {
      await context.close();
    }
  });

  /**
   * The fact from the only place it mattered: somebody else's screen.
   *
   * **This context is granted, and that is the whole point of it.** The first
   * draft reused the refusing stub and *passed against the restored defect* —
   * of course it did: with `getUserMedia` rejecting, no track can start however
   * the room is written, so the test was a backstop being reported as a
   * defence. `CLAUDE.md` names that exact failure, and it took a mutation to
   * see it.
   *
   * The scenario that actually reproduces the report is sharper anyway.
   * Permission is already granted at the browser level — from any earlier
   * visit — and pre-join *still* never asks, because §3.3 forbids firing the
   * prompt on load. So the person opts into nothing, `localStorage` holds no
   * preference, and the old `undefined !== false` reached a `getUserMedia` that
   * **succeeded**. That is how a camera goes live for someone who agreed to
   * nothing, and it is the one arrangement where the observer's grid can tell
   * the fix from the defect.
   *
   * The stub here therefore counts and does not refuse.
   */
  test("publishes nothing that reaches anyone else, even when the browser would allow it", async ({
    browser,
    meetingCode,
  }) => {
    test.setTimeout(180_000);
    const context = await browser.newContext({ permissions: ["camera", "microphone"] });
    await context.addInitScript(() => {
      const w = window as unknown as { __gum?: { calls: string[] } };
      w.__gum = { calls: [] };
      const media = navigator.mediaDevices;
      if (!media) return;
      const real = media.getUserMedia.bind(media);
      media.getUserMedia = async (constraints?: MediaStreamConstraints) => {
        w.__gum!.calls.push(location.pathname);
        return real(constraints);
      };
    });
    const denied = await context.newPage();

    try {
      await denied.goto(`/j/${meetingCode}`);
      // Again, "Allow camera and microphone" is never pressed. The browser
      // would say yes; nobody asked it.
      await denied.getByLabel("Your name").fill("Ama Serwaa");
      await denied.getByRole("button", { name: /^Join/ }).click();
      await denied.waitForURL(`**/room/${meetingCode}`);
      await expect(
        denied.getByRole("heading", { name: /Meeting, \d+ participant/ }),
      ).toBeAttached({ timeout: 60_000 });

      // An ordinary second participant, granted and publishing, so the room is
      // the two-person case the report describes rather than a room of one.
      const observer = await joinAs(browser, "Kwabena Osei", { code: meetingCode });
      open.push(observer);
      await expectParticipants(observer.page, 2);
      await denied.waitForTimeout(3_000);

      /*
       * The observer's grid holds exactly the remote participants — their own
       * face is the PiP, outside `.grid` — so every `<video>` in it belongs to
       * somebody else. The denied participant is the only somebody else.
       */
      expect(
        await observer.page.locator(".grid [data-participant] video").count(),
        "a participant who granted nothing is on camera for the rest of the room",
      ).toBe(0);

      // And the cause, from the publisher's side, so a future failure says
      // which half broke rather than only that something did.
      expect(
        await roomCalls(denied),
        "the room reached for a device the browser happened to allow",
      ).toEqual([]);
    } finally {
      await context.close();
    }
  });
});

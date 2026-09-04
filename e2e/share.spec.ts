import { expect, test } from "./fixtures";

import {
  expectParticipants,
  joinAs,
  wakeControls,
  type Participant,
} from "./room.helpers";

/**
 * §3.7 and §3.8, between two real browsers.
 *
 * Screen share is automatable because Chrome takes
 * `--auto-select-desktop-capture-source`, which answers the picker and hands
 * back a genuine display track. That matters most for the criterion §3.7
 * singles out — stopping from the browser's own bar — because the whole risk is
 * that our UI does not hear about it.
 */

/**
 * The persistent share bar, not the suppressed-view copy on the stage.
 * Both legitimately contain the phrase — one tells you others can see your
 * screen, the other explains why you cannot.
 */
const sharingBar = (p: Participant) =>
  p.page.getByRole("status").filter({ hasText: "You’re sharing your screen" });

async function openParticipants(p: Participant) {
  await wakeControls(p.page);
  await p.page.getByRole("button", { name: "Participants", exact: true }).click();
  await expect(p.page.getByRole("tabpanel", { name: "People" })).toBeVisible();
}

test.describe("screen share", () => {
  let ama: Participant;
  let kwabena: Participant;

  test.afterEach(async () => {
    for (const p of [ama, kwabena]) await p?.context.close().catch(() => {});
  });

  test("reaches the other participant, and collapses them to a filmstrip", async ({ browser, meetingCode }) => {
    ama = await joinAs(browser, "Ama Serwaa", { code: meetingCode, withMedia: false });
    kwabena = await joinAs(browser, "Kwabena Osei", { code: meetingCode, withMedia: false });
    await expectParticipants(ama.page, 2);
    await expectParticipants(kwabena.page, 2);

    await wakeControls(ama.page);
    await ama.page.getByRole("button", { name: "Present" }).click();

    // §3.7: a persistent bar, not one that hides with the controls — what it
    // says is that other people can see your screen.
    await expect(sharingBar(ama)).toBeVisible();
    // The name changed with the state; no `aria-pressed` alongside it.
    await expect(
      ama.page.getByRole("button", { name: "Stop presenting" }),
    ).toBeVisible();

    /**
     * §3.7: "The sharer's own view of the shared content is suppressed."
     *
     * v1.2 B1 made that literal. The sharer used to get the share region with a
     * paragraph in it explaining that it was empty — a suppression that still
     * cost them the whole main area. Now the region is not rendered for them at
     * all, and they keep the ordinary grid.
     *
     * Asserted as **no share surface and a full-size grid**, because the
     * absence of a sentence proves very little on its own: a region rendered
     * with nothing in it would also pass a text check.
     */
    await expect(ama.page.getByText(/your own view is hidden/i)).toHaveCount(0);
    const amaShareSurface = await ama.page.evaluate(() =>
      [...document.querySelectorAll("video")].filter(
        (v) => getComputedStyle(v).objectFit === "contain",
      ).length,
    );
    expect(amaShareSurface, "the sharer is still rendering a share region").toBe(0);

    /*
     * The grid, not a column beside dead space.
     *
     * A filmstrip renders no `.grid` at all — it is a flex column of tiles — so
     * the null check below is what catches "the sharer got collapsed too". What
     * the ratio catches is the other failure: a grid that *is* rendered but has
     * a share region taking horizontal space beside it.
     *
     * That is a claim about the grid's **container**, and v1.3 C1 is why the
     * distinction now matters. The measurement used to be the grid's own width
     * against the stage, with a 0.8 floor calibrated on a two-tile grid. Ama is
     * one of the two, and C1 moved her out of the grid and into a corner PiP —
     * so the grid holds one tile, a single tile letterboxes to 16:9, and the
     * grid legitimately measured 0.77 of the stage. Correct behaviour, failing
     * a number that had quietly encoded the tile count.
     *
     * Measuring the stage wrapper instead removes the tile count from the claim
     * entirely, and lets the threshold be *tighter* rather than looser: with no
     * share region it is the full stage, and 0.95 is a bound a 220px rail could
     * never clear. Relaxing 0.8 to fit would have left almost nothing that
     * could fail.
     */
    const amaGrid = await ama.page.evaluate(() => {
      const grid = document.querySelector<HTMLElement>(".grid");
      const stage = document.querySelector<HTMLElement>(".relative.h-dvh");
      if (!grid || !stage) return null;
      const area = grid.parentElement as HTMLElement;
      return {
        width: area.getBoundingClientRect().width,
        stageWidth: stage.getBoundingClientRect().width,
      };
    });
    expect(amaGrid, "the sharer has no grid at all").not.toBeNull();
    expect(
      amaGrid!.width / amaGrid!.stageWidth,
      "the sharer's grid is still squeezed beside a share region",
    ).toBeGreaterThan(0.95);

    // And she is in the corner rather than the grid — C1, in the one room shape
    // where the filmstrip would otherwise have put her back in line.
    await expect(ama.page.locator("[data-self-view]")).toHaveCount(1);

    // At the other end it is real video, in the main area.
    await expect(kwabena.page.getByText("Ama Serwaa is sharing")).toBeVisible();
    const sample = async () => kwabena.page.evaluate(async () => {
      const video = [...document.querySelectorAll("video")].find(
        (v) => getComputedStyle(v).objectFit === "contain",
      );
      if (!video) return null;
      const canvas = document.createElement("canvas");
      canvas.width = 64;
      canvas.height = 36;
      const context = canvas.getContext("2d", { willReadFrequently: true })!;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let min = 255, max = 0;
      for (let p = 0; p < data.length; p += 4) {
        const luma = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
        if (luma < min) min = luma;
        if (luma > max) max = luma;
      }
      return { width: video.videoWidth, spread: max - min };
    });
    // Polled, not sampled once. A track that has published still takes a
    // moment to produce its first frame, and `videoWidth` is 0 until it does —
    // the same lesson as the tile liveness check.
    await expect
      .poll(async () => (await sample())?.width ?? 0, {
        message: "the shared track never produced a frame",
        timeout: 20_000,
      })
      .toBeGreaterThan(0);

    const live = await sample();
    // `object-fit: contain`, not `cover`: a cropped screen cuts off the thing
    // being pointed at.
    expect(live, "no contain-fitted video — the share is not in the main area").not.toBeNull();
    expect(live!.spread, "the shared surface is a flat rectangle").toBeGreaterThan(5);

    // §3.4: participants collapse to a filmstrip beside the content.
    await expect(kwabena.page.getByRole("heading", { name: /^Participants, \d+$/ })).toBeAttached();
  });

  /**
   * §3.7's acceptance criterion, and the one place worth naming who does the
   * work: `livekit-client`'s `LocalParticipant.handleTrackEnded` unpublishes
   * any ended track whose source is ScreenShare. We wrote our own listener for
   * this and a mutation check showed it could be deleted with nothing failing,
   * so it was removed.
   *
   * This test stays, and matters more for it — it is what would notice if that
   * behaviour ever changed underneath us.
   */
  test("stopping from the browser's own control updates the app", async ({ browser, meetingCode }) => {
    ama = await joinAs(browser, "Ama Serwaa", { code: meetingCode, withMedia: false });
    // Keep a handle on whatever getDisplayMedia returns. A wrapper, not a
    // stub: the real call still runs and a real display track still publishes.
    await ama.page.evaluate(() => {
      const original = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getDisplayMedia = async (constraints) => {
        const stream = await original(constraints);
        (window as unknown as { __share?: MediaStream }).__share = stream;
        return stream;
      };
    });
    kwabena = await joinAs(browser, "Kwabena Osei", { code: meetingCode, withMedia: false });
    await expectParticipants(ama.page, 2);

    await wakeControls(ama.page);
    await ama.page.getByRole("button", { name: "Present" }).click();
    await expect(sharingBar(ama)).toBeVisible();
    await expect(kwabena.page.getByText("Ama Serwaa is sharing")).toBeVisible();

    // Chrome's own bar does exactly one thing to the page: it ends the
    // MediaStreamTrack. Nothing else is signalled — no LiveKit event, no
    // publication change — which is precisely why the `ended` listener exists
    // and precisely what §3.7 makes an acceptance criterion.
    //
    // Reached by capturing the stream `getDisplayMedia` returned, because the
    // sharer's own view is suppressed and the track is therefore attached to
    // no element on their page. Ending that track is the same event Chrome's
    // button produces.
    const ended = await ama.page.evaluate(() => {
      const held = (window as unknown as { __share?: MediaStream }).__share;
      const track = held?.getVideoTracks()[0];
      if (!track) return false;
      track.stop();
      // `stop()` does not fire `ended` on the track that called it — the event
      // is for tracks ended from elsewhere — so it is dispatched here, which is
      // what the browser does when its own control is the one stopping.
      track.dispatchEvent(new Event("ended"));
      return true;
    });
    expect(ended, "no captured display track to end").toBe(true);

    // The UI must agree, at both ends.
    await expect(sharingBar(ama)).toBeHidden({
      timeout: 15_000,
    });
    await expect(
      ama.page.getByRole("button", { name: "Present" }),
    ).toBeVisible();
    await expect(kwabena.page.getByText("Ama Serwaa is sharing")).toBeHidden();
  });

  test("a second sharer is asked, and the first is told", async ({ browser, meetingCode }) => {
    ama = await joinAs(browser, "Ama Serwaa", { code: meetingCode, withMedia: false });
    kwabena = await joinAs(browser, "Kwabena Osei", { code: meetingCode, withMedia: false });
    await expectParticipants(ama.page, 2);
    await expectParticipants(kwabena.page, 2);

    await wakeControls(ama.page);
    await ama.page.getByRole("button", { name: "Present" }).click();
    await expect(kwabena.page.getByText("Ama Serwaa is sharing")).toBeVisible();

    // §3.7: the confirmation goes to the person taking the action. Kwabena is
    // asked; Ama is not interrupted with a dialog she cannot usefully weigh.
    await wakeControls(kwabena.page);
    await kwabena.page.getByRole("button", { name: "Present" }).click();
    /**
     * Named by its title, not by an `aria-label`.
     *
     * Phase 9 made this a real Radix dialog: it had claimed
     * `aria-modal="true"` with no trap, which the floor names as the lie —
     * "the ARIA attribute is what promises a trap". Radix derives the
     * accessible name from `DialogTitle`, and `aria-labelledby` wins over
     * `aria-label`, so the name is now §3.7's own copy rather than a separate
     * string only a screen reader ever heard.
     */
    const dialog = kwabena.page.getByRole("dialog", { name: "Ama Serwaa is presenting" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Sharing will replace theirs")).toBeVisible();
    // Nothing has happened yet — asking is not doing.
    await expect(ama.page.getByRole("dialog")).toHaveCount(0);
    await expect(sharingBar(ama)).toBeVisible();

    // Cancel leaves everything as it was.
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await expect(sharingBar(ama)).toBeVisible();

    // Continue takes over.
    await wakeControls(kwabena.page);
    await kwabena.page.getByRole("button", { name: "Present" }).click();
    await kwabena.page
      .getByRole("dialog", { name: "Ama Serwaa is presenting" })
      .getByRole("button", { name: "Continue" })
      .click();

    // §3.7: one share at a time. Ama yields, and is told rather than asked.
    await expect(sharingBar(kwabena)).toBeVisible();
    await expect(sharingBar(ama)).toBeHidden({ timeout: 15_000 });
    await expect(ama.page.getByText(/Kwabena Osei.*is now presenting/)).toBeVisible();
    await expect(ama.page.getByText("Kwabena Osei is sharing")).toBeVisible();

    // The notice is not a dialog — her share is already stopped, so there is
    // nothing to decide and nothing should be demanding an answer.
    await expect(ama.page.getByRole("dialog")).toHaveCount(0);
  });

  test("sharing alone asks nothing", async ({ browser, meetingCode }) => {
    ama = await joinAs(browser, "Ama Serwaa", { code: meetingCode, withMedia: false });
    await expectParticipants(ama.page, 1);

    await wakeControls(ama.page);
    await ama.page.getByRole("button", { name: "Present" }).click();
    // No presenter to replace, so the dialog never appears and the share
    // starts on one press.
    await expect(sharingBar(ama)).toBeVisible();
    await expect(ama.page.getByRole("dialog")).toHaveCount(0);
  });

  test("share survives opening and closing the chat panel", async ({ browser, meetingCode }) => {
    ama = await joinAs(browser, "Ama Serwaa", { code: meetingCode, withMedia: false });
    kwabena = await joinAs(browser, "Kwabena Osei", { code: meetingCode, withMedia: false });
    await expectParticipants(kwabena.page, 2);

    await wakeControls(ama.page);
    await ama.page.getByRole("button", { name: "Present" }).click();
    await expect(kwabena.page.getByText("Ama Serwaa is sharing")).toBeVisible();

    // §3.7 acceptance. A panel toggle re-renders the room; the share must not
    // be a casualty of that.
    await wakeControls(kwabena.page);
    await kwabena.page.getByRole("button", { name: "Chat", exact: true }).click();
    await expect(kwabena.page.getByRole("tabpanel", { name: "Chat" })).toBeVisible();
    await expect(kwabena.page.getByText("Ama Serwaa is sharing")).toBeVisible();

    await kwabena.page.keyboard.press("Escape");
    await expect(kwabena.page.getByText("Ama Serwaa is sharing")).toBeVisible();
    await expect(sharingBar(ama)).toBeVisible();
  });
});

test.describe("participants panel", () => {
  let ama: Participant;
  let kwabena: Participant;

  test.afterEach(async () => {
    for (const p of [ama, kwabena]) await p?.context.close().catch(() => {});
  });

  test("lists everyone with their device state", async ({ browser, meetingCode }) => {
    ama = await joinAs(browser, "Ama Serwaa", { code: meetingCode, withMedia: false });
    kwabena = await joinAs(browser, "Kwabena Osei", { code: meetingCode, withMedia: false });
    await expectParticipants(ama.page, 2);

    await openParticipants(ama);
    const panel = ama.page.getByRole("tabpanel", { name: "People" });
    // v1.2 C2 split "(you)" out of the name span and into `--muted-foreground`,
    // so it is no longer part of what someone is called. Asserted as two
    // elements in one row rather than as one string.
    const own = panel.locator("li").filter({ hasText: "Ama Serwaa" });
    await expect(own.getByText("Ama Serwaa", { exact: true })).toBeVisible();
    await expect(own.getByText("(you)", { exact: true })).toBeVisible();
    await expect(panel.getByText("Kwabena Osei", { exact: true })).toBeVisible();

    // Both joined with media off, so both mic-off markers are present — named,
    // not colour-coded. Rule 5.
    await expect(panel.getByLabel("Kwabena Osei's microphone is off")).toBeVisible();
    await expect(panel.getByLabel("Kwabena Osei's camera is off")).toBeVisible();

    // §3.4: the control shows the count.
    // Scoped to the control bar: the panel's own header carries a close button
    // with the same accessible name, which is a naming duplication worth
    // Phase 9's attention rather than a defect — both do close the panel.
    await expect(
      ama.page.locator("button[aria-controls='participants-panel']"),
    ).toContainText("2");
  });

  test("offers no way for a guest to act on anyone", async ({ browser, meetingCode }) => {
    // §3.8's actions are the host's. Neither of these participants is one —
    // both are guests on a meeting owned by someone else.
    ama = await joinAs(browser, "Ama Serwaa", { code: meetingCode, withMedia: false });
    kwabena = await joinAs(browser, "Kwabena Osei", { code: meetingCode, withMedia: false });
    await expectParticipants(ama.page, 2);

    await openParticipants(ama);
    const panel = ama.page.getByRole("tabpanel", { name: "People" });
    await expect(panel.getByRole("button", { name: /Ask to mute/ })).toHaveCount(0);
    await expect(panel.getByRole("button", { name: /^Remove/ })).toHaveCount(0);
  });

  test("has no unmute action anywhere — a host can silence, never activate", async ({ browser, meetingCode }) => {
    ama = await joinAs(browser, "Ama Serwaa", { code: meetingCode, withMedia: false });
    await openParticipants(ama);

    /**
     * §3.8's rule, still asserted across the whole room rather than one panel —
     * but precisely, because a blunt scan stopped being safe.
     *
     * This read the page's entire text and refused any occurrence of "unmute".
     * That worked while no control anywhere used the word, and v1.3 C2 gave the
     * primary tier visible labels: your **own** mic control now reads "Unmute"
     * when you are muted. Unmuting yourself is not a host activating someone
     * else, so the scan was catching the wrong thing — and simply deleting it
     * would have given up the property it protects.
     *
     * So: every control matching the word is enumerated, and the only one
     * permitted is your own. Anything aimed at another participant — a row
     * action, a tile menu, a request — fails, wherever it is added.
     */
    const unmute = await ama.page.getByRole("button", { name: /unmute/i }).all();
    const names = await Promise.all(
      unmute.map(async (b) => (await b.getAttribute("aria-label")) ?? (await b.textContent())?.trim() ?? ""),
    );
    expect(
      names,
      "an unmute control exists that is not the local participant's own",
    ).toEqual(["Unmute"]);

    // And the panel — where host actions on other people live — says nothing
    // of the kind at all.
    const panel = await ama.page
      .getByRole("tabpanel", { name: "People" })
      .innerText();
    expect(panel).not.toMatch(/unmute/i);

    const body = await ama.page.locator("body").innerText();
    expect(body).not.toMatch(/turn on their (microphone|camera)/i);
  });
});

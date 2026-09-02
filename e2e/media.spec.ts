import { test, expect } from "@playwright/test";

import { emptyRoom } from "./livekit-admin";
import {
  LIVE_CODE,
  gridShape,
  joinAs,
  leave,
  tileBorders,
  videoLiveness,
  wakeControls,
  type Participant,
} from "./room.helpers";

// Start from an empty room, never from what the last test left behind.
test.beforeEach(async () => {
  await emptyRoom(LIVE_CODE);
});

/**
 * The gap Phase 4's report could not close by hand: the Browser pane blocks
 * media capture, so nothing was ever published and "two people see each other"
 * was verified only as far as presence.
 *
 * Here Chrome publishes real tracks from its synthetic devices, through the
 * real SFU, and the assertions are about what arrives at the other end.
 */

test.describe("two participants", () => {
  let ama: Participant;
  let kwabena: Participant;

  test.afterEach(async () => {
    for (const p of [ama, kwabena]) await p?.context.close().catch(() => {});
  });

  test("publish and subscribe to each other's video", async ({ browser }) => {
    ama = await joinAs(browser, "Ama Serwaa");
    kwabena = await joinAs(browser, "Kwabena Osei");

    for (const p of [ama, kwabena]) {
      await expect(
        p.page.getByRole("heading", { name: "Meeting, 2 participants" }),
      ).toBeVisible();
    }

    // Both tiles carry a <video>, which only happens once a track is attached.
    await expect(ama.page.locator("video")).toHaveCount(2);
    await expect(kwabena.page.locator("video")).toHaveCount(2);

    // …and the video is moving, not a black or frozen rectangle. This is the
    // assertion presence checks cannot make.
    for (const p of [ama, kwabena]) {
      for (const index of [0, 1]) {
        await expect
          .poll(async () => (await videoLiveness(p.page, index)).width, {
            message: `${p.name}: tile ${index} never reported a frame size`,
            timeout: 30_000,
          })
          .toBeGreaterThan(0);

        const live = await videoLiveness(p.page, index);
        expect(live.spread, `${p.name}: tile ${index} is a flat rectangle`).toBeGreaterThan(10);
        expect(live.motion, `${p.name}: tile ${index} is a frozen frame`).toBeGreaterThan(0.5);
      }
    }
  });

  test("mute in one is visible in the other, from track state", async ({ browser }) => {
    ama = await joinAs(browser, "Ama Serwaa");
    kwabena = await joinAs(browser, "Kwabena Osei");

    const amaOnKwabena = kwabena.page.locator('[aria-label="Ama Serwaa is muted"]');
    await expect(amaOnKwabena).toHaveCount(0);

    await wakeControls(ama.page);
    await ama.page.getByRole("button", { name: "Turn off microphone" }).click();

    // Rule 3: the indicator follows the published track, not a local boolean —
    // so it can only appear here if the mute actually crossed the SFU.
    await expect(amaOnKwabena).toHaveCount(1);
    await expect(
      ama.page.getByRole("button", { name: "Turn on microphone" }),
    ).toHaveAttribute("aria-pressed", "true");

    await wakeControls(ama.page);
    await ama.page.getByRole("button", { name: "Turn on microphone" }).click();
    await expect(amaOnKwabena).toHaveCount(0);
  });

  test("camera off leaves an avatar, and the video comes back", async ({ browser }) => {
    ama = await joinAs(browser, "Ama Serwaa");
    kwabena = await joinAs(browser, "Kwabena Osei");

    await expect(kwabena.page.locator("video")).toHaveCount(2);
    await wakeControls(ama.page);
    await ama.page.getByRole("button", { name: "Turn off camera" }).click();

    // Ama's tile falls back to the initial; Kwabena's own video stays.
    await expect(kwabena.page.locator("video")).toHaveCount(1);
    await expect(kwabena.page.getByText("Ama Serwaa")).toBeVisible();

    await wakeControls(ama.page);
    await ama.page.getByRole("button", { name: "Turn on camera" }).click();
    await expect(kwabena.page.locator("video")).toHaveCount(2);
  });

  test("the speaking ring follows real speech, and ignores a cough", async ({ browser }) => {
    ama = await joinAs(browser, "Ama Serwaa");
    kwabena = await joinAs(browser, "Kwabena Osei");

    // The fixture loops: 4s speech, 3s silence, a 200ms cough, 2.8s silence,
    // 4s speech. Sampling across more than one full cycle is what separates
    // "follows speech" from "happens to be lit".
    const samples: { at: number; speaking: number; widths: string[] }[] = [];
    const started = Date.now();
    while (Date.now() - started < 30_000) {
      const borders = await tileBorders(kwabena.page);
      samples.push({
        at: Date.now() - started,
        speaking: borders.filter((b) => b.width === "2px").length,
        widths: borders.map((b) => b.width),
      });
      await kwabena.page.waitForTimeout(200);
    }

    const speakingSamples = samples.filter((s) => s.speaking > 0).length;
    const quietSamples = samples.filter((s) => s.speaking === 0).length;

    // Both states have to occur. A ring wired to nothing would be stuck at one.
    expect(speakingSamples, "the ring never lit during speech").toBeGreaterThan(5);
    expect(quietSamples, "the ring never went out during silence").toBeGreaterThan(5);

    // §3.4's encoding: 2px --foreground when speaking, 1px --tile-border idle.
    const widths = new Set(samples.flatMap((s) => s.widths));
    expect([...widths].sort()).toEqual(["1px", "2px"]);

    const colours = new Set(
      (await tileBorders(kwabena.page)).map((b) => b.colour),
    );
    for (const colour of colours) {
      expect(
        ["rgb(93, 103, 119)", "rgb(242, 244, 247)"],
        `unexpected border colour ${colour} — §3.4 permits only --tile-border and --foreground`,
      ).toContain(colour);
    }

    // Transitions, as evidence about flicker rather than a pass/fail: a
    // detector with no hysteresis chatters on every pause between words.
    let transitions = 0;
    for (let i = 1; i < samples.length; i++) {
      if ((samples[i].speaking > 0) !== (samples[i - 1].speaking > 0)) transitions++;
    }
    console.log(
      `speaking ring over 30s: ${speakingSamples} lit / ${quietSamples} dark ` +
        `across ${samples.length} samples, ${transitions} transitions`,
    );
    // Roughly two speech blocks per 14s cycle, so ~4-5 edges per cycle at most.
    expect(transitions, "the ring is chattering rather than following speech").toBeLessThan(25);
  });
});

test.describe("joining", () => {
  test("costs exactly one token, not one per screen", async ({ browser }) => {
    const context = await browser.newContext({ permissions: ["camera", "microphone"] });
    const page = await context.newPage();

    const minted: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/livekit/token") {
        minted.push(request.method());
      }
    });

    await page.goto(`/j/${LIVE_CODE}`);
    await page.getByLabel("Your name").fill("Ama Serwaa");
    await page.getByRole("button", { name: "Join meeting" }).click();
    await page.waitForURL(`**/room/${LIVE_CODE}`);
    await expect(
      page.getByRole("heading", { name: /Meeting, \d+ participant/ }),
    ).toBeAttached({ timeout: 60_000 });

    // Pre-join mints the token and the room reuses it. Minting again there
    // would spend two of the ten requests a minute the endpoint allows per IP,
    // which behind one office NAT is five people joining rather than ten — and
    // would leave a signed six-hour credential unused. This suite is what
    // exhausted that limit and found it.
    expect(minted, `token requests during one join: ${minted.length}`).toHaveLength(1);

    await context.close();
  });
});

test.describe("the grid", () => {
  test("reflows on join and leave", async ({ browser }) => {
    const ama = await joinAs(browser, "Ama Serwaa");

    // One participant: §3.4 letterboxes to 16:9 rather than cropping.
    await expect.poll(async () => (await gridShape(ama.page)).cells).toBe(1);
    expect(await gridShape(ama.page)).toMatchObject({
      columns: 1,
      rows: 1,
      aspectRatio: "16 / 9",
    });

    const kwabena = await joinAs(browser, "Kwabena Osei");
    await expect.poll(async () => (await gridShape(ama.page)).cells).toBe(2);
    expect(await gridShape(ama.page)).toMatchObject({ columns: 2, rows: 1 });

    await leave(kwabena);
    await expect.poll(async () => (await gridShape(ama.page)).cells).toBe(1);
    expect(await gridShape(ama.page)).toMatchObject({ columns: 1, rows: 1 });

    await kwabena.context.close();
    await ama.context.close();
  });
});

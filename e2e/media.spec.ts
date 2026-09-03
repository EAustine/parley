import { expect, test } from "./fixtures";

import {
  gridShape,
  joinAs,
  leave,
  tileBorders,
  videoLiveness,
  wakeControls,
  type Participant,
} from "./room.helpers";

// Start from an empty room, never from what the last test left behind.

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

  test("publish and subscribe to each other's video", async ({ browser, meetingCode }) => {
    ama = await joinAs(browser, "Ama Serwaa", { code: meetingCode });
    kwabena = await joinAs(browser, "Kwabena Osei", { code: meetingCode });

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

        // Polled rather than sampled once. Two frames 250ms apart can be
        // identical for reasons that are not a bug: LiveKit's adaptiveStream
        // pauses video it believes is off-screen, and every context after the
        // first is a background tab. A genuinely frozen track stays frozen, so
        // polling separates "paused for a moment" from "never moving" without
        // weakening the assertion.
        await expect
          .poll(async () => (await videoLiveness(p.page, index)).motion, {
            message: `${p.name}: tile ${index} is a frozen frame`,
            timeout: 15_000,
          })
          .toBeGreaterThan(0.5);
      }
    }
  });

  test("mute in one is visible in the other, from track state", async ({ browser, meetingCode }) => {
    ama = await joinAs(browser, "Ama Serwaa", { code: meetingCode });
    kwabena = await joinAs(browser, "Kwabena Osei", { code: meetingCode });

    const amaOnKwabena = kwabena.page.locator('[aria-label="Ama Serwaa is muted"]');
    await expect(amaOnKwabena).toHaveCount(0);

    await wakeControls(ama.page);
    await ama.page.getByRole("button", { name: "Turn off microphone" }).click();

    // Rule 3: the indicator follows the published track, not a local boolean —
    // so it can only appear here if the mute actually crossed the SFU.
    await expect(amaOnKwabena).toHaveCount(1);
    // The accessibility floor: a state toggle names the action and changes
    // with it. No `aria-pressed` — that would announce the same fact twice.
    await expect(
      ama.page.getByRole("button", { name: "Turn on microphone" }),
    ).toBeVisible();
    expect(
      await ama.page
        .getByRole("button", { name: "Turn on microphone" })
        .getAttribute("aria-pressed"),
      "a state toggle should not carry aria-pressed",
    ).toBeNull();

    await wakeControls(ama.page);
    await ama.page.getByRole("button", { name: "Turn on microphone" }).click();
    await expect(amaOnKwabena).toHaveCount(0);
  });

  test("camera off leaves an avatar, and the video comes back", async ({ browser, meetingCode }) => {
    ama = await joinAs(browser, "Ama Serwaa", { code: meetingCode });
    kwabena = await joinAs(browser, "Kwabena Osei", { code: meetingCode });

    await expect(kwabena.page.locator("video")).toHaveCount(2);
    await wakeControls(ama.page);
    await ama.page.getByRole("button", { name: "Turn off camera" }).click();

    // Ama's tile falls back to the initial; Kwabena's own video stays.
    await expect(kwabena.page.locator("video")).toHaveCount(1);
    // Scoped to the tile. Phase 5 added join and leave messages to the chat
    // log, so a name now appears in more than one place and an unscoped query
    // resolves to several elements — a test that was precise became ambiguous
    // because the product grew, which is worth fixing here rather than in the
    // product.
    await expect(
      kwabena.page.locator('[data-participant]').getByText("Ama Serwaa", { exact: true }),
    ).toBeVisible();

    await wakeControls(ama.page);
    await ama.page.getByRole("button", { name: "Turn on camera" }).click();
    await expect(kwabena.page.locator("video")).toHaveCount(2);
  });

  test("the speaking ring follows real speech, and ignores a cough", async ({ browser, meetingCode }) => {
    ama = await joinAs(browser, "Ama Serwaa", { code: meetingCode });
    kwabena = await joinAs(browser, "Kwabena Osei", { code: meetingCode });

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
        onTheRingAxis(colour),
        `border colour ${colour} is not --tile-border, --foreground, or between them — §3.4 permits no other value`,
      ).toBe(true);
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
  test("costs exactly one token, not one per screen", async ({ browser, meetingCode }) => {
    const context = await browser.newContext({ permissions: ["camera", "microphone"] });
    const page = await context.newPage();

    const minted: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/livekit/token") {
        minted.push(request.method());
      }
    });

    await page.goto(`/j/${meetingCode}`);
    await page.getByLabel("Your name").fill("Ama Serwaa");
    await page.getByRole("button", { name: "Join meeting" }).click();
    await page.waitForURL(`**/room/${meetingCode}`);
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

test.describe("a busy meeting", () => {
  test("holds the join screen and goes through by itself", async ({ browser, meetingCode }) => {
    const context = await browser.newContext({ permissions: ["camera", "microphone"] });
    const page = await context.newPage();

    // The first attempt is refused the way a full room from one network would
    // be; the second is let through. Intercepted rather than driven by the real
    // limiter, so the assertion is about what the *client* does with a 429 —
    // §7: "not a dead end".
    let refusals = 0;
    await page.route("**/api/livekit/token", async (route) => {
      if (refusals === 0) {
        refusals += 1;
        await route.fulfill({
          status: 429,
          headers: { "Retry-After": "2", "Content-Type": "application/json" },
          body: JSON.stringify({ error: "rate_limited", retryAfter: 2 }),
        });
        return;
      }
      await route.continue();
    });

    await page.goto(`/j/${meetingCode}`);
    await page.getByLabel("Your name").fill("Ama Serwaa");
    await page.getByRole("button", { name: "Join meeting" }).click();

    // Held, not failed: the button counts down and says why.
    await expect(page.getByRole("button", { name: /Joining in \d+s/ })).toBeVisible();
    await expect(page.getByText("This meeting is busy right now")).toBeVisible();
    // And the rate-limit error copy never appears — being held is not failing.
    // Asserted on our own text rather than on role=alert: Next's route
    // announcer is itself a role="alert" live region, so the broader check
    // matches the framework rather than the product.
    await expect(page.getByText("Too many attempts")).toHaveCount(0);

    // Then it goes through on its own, with nothing more from the person.
    await page.waitForURL(`**/room/${meetingCode}`, { timeout: 30_000 });
    await expect(
      page.getByRole("heading", { name: /Meeting, \d+ participant/ }),
    ).toBeAttached({ timeout: 60_000 });
    expect(refusals, "the refusal actually happened").toBe(1);

    await context.close();
  });
});

test.describe("the grid", () => {
  test("reflows on join and leave", async ({ browser, meetingCode }) => {
    const ama = await joinAs(browser, "Ama Serwaa", { code: meetingCode });

    // One participant: §3.4 letterboxes to 16:9 rather than cropping.
    await expect.poll(async () => (await gridShape(ama.page)).cells).toBe(1);
    expect(await gridShape(ama.page)).toMatchObject({
      columns: 1,
      rows: 1,
      aspectRatio: "16 / 9",
    });

    const kwabena = await joinAs(browser, "Kwabena Osei", { code: meetingCode });
    await expect.poll(async () => (await gridShape(ama.page)).cells).toBe(2);
    expect(await gridShape(ama.page)).toMatchObject({ columns: 2, rows: 1 });

    await leave(kwabena);
    await expect.poll(async () => (await gridShape(ama.page)).cells).toBe(1);
    expect(await gridShape(ama.page)).toMatchObject({ columns: 1, rows: 1 });

    await kwabena.context.close();
    await ama.context.close();
  });

  /**
   * v1.2 E2 and CLAUDE.md: "Grid reflow on join/leave | 200ms, FLIP".
   *
   * The grid used to declare `transition: grid-template-columns 200ms` and it
   * never once ran — `grid-template-columns` interpolates only between track
   * lists of equal length, and a join changes the count every time. The test
   * above could not see that, because it asserts the end-state shape and the
   * end state was always right.
   *
   * So this asserts the *motion*: that a tile already on screen is actually
   * animated when someone else arrives. Installed before the join, because a
   * 200ms animation is long gone by the time a round trip notices it.
   */
  test("a join FLIPs the tiles that were already there", async ({ browser, meetingCode }) => {
    const ama = await joinAs(browser, "Ama Serwaa", { code: meetingCode, withMedia: false });
    await expect.poll(async () => (await gridShape(ama.page)).cells).toBe(1);

    // Catch the first animation the existing tile runs, and record what it
    // animated — a FLIP is `translate`/`scale`, never a layout property.
    const captured = ama.page.evaluate(() => {
      return new Promise<{ props: string[]; duration: number | null } | null>((resolve) => {
        const grid = document.querySelector(".grid");
        if (!grid) return resolve(null);
        const seen = new Set<string>();
        const timer = setTimeout(() => resolve(null), 20_000);
        const check = () => {
          const tile = grid.querySelector<HTMLElement>("[data-participant]");
          const running = tile?.getAnimations().find((a) => a.playState === "running");
          if (running) {
            clearTimeout(timer);
            const frames = (running.effect as KeyframeEffect).getKeyframes();
            for (const frame of frames) {
              for (const key of Object.keys(frame)) {
                // `offset`, `computedOffset`, `easing` and `composite` are
                // keyframe metadata that `getKeyframes()` always returns —
                // they are not properties being animated.
                if (!["offset", "computedOffset", "easing", "composite"].includes(key)) {
                  seen.add(key);
                }
              }
            }
            resolve({
              props: [...seen],
              duration: Number(running.effect?.getComputedTiming().duration ?? null),
            });
            return;
          }
          requestAnimationFrame(check);
        };
        requestAnimationFrame(check);
      });
    });

    const kwabena = await joinAs(browser, "Kwabena Osei", { code: meetingCode, withMedia: false });
    const result = await captured;

    expect(result, "the existing tile did not animate when someone joined").not.toBeNull();
    // Transform only — CLAUDE.md permits per-tile animation "when and only when
    // it is transform or opacity", and a layout property here would be the
    // thrash the container-only rule exists to prevent.
    for (const prop of result!.props) {
      expect(
        ["translate", "scale", "opacity", "transform"],
        `the reflow animated ${prop}, which is not a compositor property`,
      ).toContain(prop);
    }

    await kwabena.context.close();
    await ama.context.close();
  });
});

/**
 * Is this colour `--tile-border`, `--foreground`, or a point on the line
 * between them?
 *
 * §3.4 specifies a 120ms transition on border-color, so the ring spends real
 * time at interpolated values — and this assertion used to read the computed
 * colour at a single instant and require one of the two endpoints exactly. It
 * caught `rgb(182, 187, 195)` in a full run, which is 60% of the way along:
 * the test racing the transition the spec asks for.
 *
 * Accepting the whole axis is not a weakening. What §3.4 actually forbids is a
 * *hue* — a third colour, off this line, is what a regression would look like.
 * Amber at `rgb(245, 165, 36)` is nowhere near it and still fails, which is
 * the property worth having.
 */
function onTheRingAxis(colour: string): boolean {
  const IDLE = [93, 103, 119];
  const SPEAKING = [242, 244, 247];

  const m = colour.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return false;
  const rgb = [Number(m[1]), Number(m[2]), Number(m[3])];

  // Where each channel sits between the two endpoints. On the axis, all three
  // agree; a hue makes them disagree.
  const positions = rgb.map((c, i) => (c - IDLE[i]) / (SPEAKING[i] - IDLE[i]));
  if (positions.some((t) => t < -0.02 || t > 1.02)) return false;
  return Math.max(...positions) - Math.min(...positions) < 0.05;
}

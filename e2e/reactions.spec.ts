import { expect, test } from "./fixtures";

import { joinAs, leave, wakeControls, type Participant } from "./room.helpers";

/**
 * The reaction arc — BUILD-PLAN v1.3 C6.
 *
 * > "Try the curve before the assets — an arc rather than a straight rise,
 * > slight rotation, and an ease that decelerates before the fade. That may be
 * > the whole complaint, and it is free."
 *
 * **Measured as a path, not as a stylesheet.** Reading back
 * `@keyframes parley-reaction-sway` would test the input; the claim is that the
 * emoji *travels* an arc, and the only thing that knows is the browser. So this
 * pauses the real animation on a real reaction, walks its `currentTime` across
 * the flight, and reads a rendered box at each step — the same discipline as the
 * letterboxed tile that declared `aspect-ratio: 16/9` correctly and rendered
 * 1956px into 1337px.
 *
 * Sampling happens inside one `evaluate` so it is atomic: a reaction removes
 * itself after 2400ms of wall clock, and a round trip per sample would race it.
 */

/** Where the emoji is, and how it is tipped, at each fraction of its flight. */
async function flightPath(participant: Participant, drift: number, spin: number) {
  return participant.page.evaluate(
    async ({ drift, spin }) => {
      const outer = document.querySelector<HTMLElement>(".parley-reaction");
      if (!outer) throw new Error("no reaction on screen");
      const inner = outer.querySelector<HTMLElement>(".parley-reaction-sway")!;

      /*
       * Wait for the image before measuring anything.
       *
       * v1.3 C6 put a `<img>` inside the element these samples measure, and it
       * decodes asynchronously. The box is 30×30 either way — the size is on
       * the element, not on the bytes — but a decode that lands mid-sample
       * moves the measured centre, and this failed under four workers while
       * passing alone. A flake, and the cause is the test measuring a box whose
       * contents were still arriving.
       */
      const glyph = inner.querySelector("img");
      if (glyph && !glyph.complete) {
        await glyph.decode().catch(() => {});
      }

      /*
       * The drift is pinned rather than taken as it comes.
       *
       * `reactionDrift` derives it from the reaction's id and can legitimately
       * land near zero, which would make the arc unmeasurable and the test
       * pass for the wrong reason. What is under test here is the *shape* of
       * the path given a drift; the generator that chooses one is a separate,
       * deterministic function with its own bound in `check:room`.
       */
      outer.style.setProperty("--parley-drift", `${drift}px`);
      outer.style.setProperty("--parley-spin", String(spin));

      const animations = outer.getAnimations({ subtree: true });
      for (const animation of animations) animation.pause();

      const at = [0, 0.15, 0.25, 0.4, 0.55, 0.7, 0.8, 0.9, 1];
      return at.map((fraction) => {
        for (const animation of animations) animation.currentTime = fraction * 2400;
        const box = inner.getBoundingClientRect();
        return {
          fraction,
          x: Math.round((box.left + box.width / 2) * 100) / 100,
          y: Math.round((box.top + box.height / 2) * 100) / 100,
          rotate: getComputedStyle(inner).rotate,
        };
      });
    },
    { drift, spin },
  );
}

async function react(participant: Participant) {
  await wakeControls(participant.page);
  await participant.page.getByRole("button", { name: "Send a reaction" }).click();
  const applause = participant.page.getByRole("button", { name: "React with applause" });
  await expect(applause).toBeVisible();
  await applause.click();
  // The sender draws their own reaction immediately — `sendReaction` adds it to
  // local state before publishing, so nothing here depends on the data channel,
  // which is deliberately lossy.
  await expect(participant.page.locator(".parley-reaction")).toHaveCount(1);
}

test.describe("reactions", () => {
  const open: Participant[] = [];

  test.afterEach(async () => {
    while (open.length) {
      const p = open.pop()!;
      await leave(p).catch(() => {});
      await p.context.close().catch(() => {});
    }
  });

  /**
   * C6's arc, and the two properties that distinguish it from what was there.
   *
   * The old path was `translate: 0 0` to `translate: drift, -rise` on one
   * eased animation — a **straight line**. Horizontal displacement was
   * therefore monotonic: it only ever grew. That is the thing this asserts is
   * no longer true, because a monotonic horizontal is what "straight" means
   * once the easing is factored out.
   */
  test("floats an arc rather than a straight line", async ({ browser, meetingCode }) => {
    const ama = await joinAs(browser, "Ama Serwaa", { code: meetingCode, withMedia: false });
    open.push(ama);
    await react(ama);

    const path = await flightPath(ama, 40, 8);
    const x = path.map((p) => p.x);
    const y = path.map((p) => p.y);

    // It rises, and never falls back.
    for (let i = 1; i < y.length; i++) {
      expect(y[i], `sample ${i} should be above sample ${i - 1}`).toBeLessThan(y[i - 1]);
    }
    expect(y[0] - y[y.length - 1], "and travels a real distance").toBeGreaterThan(40);

    /*
     * The horizontal reverses. A straight line — whatever its easing — can only
     * move one way, so a single reversal is the whole difference between an arc
     * and the rise this replaced.
     */
    const directions = new Set<string>();
    for (let i = 1; i < x.length; i++) {
      if (Math.abs(x[i] - x[i - 1]) > 0.5) directions.add(x[i] > x[i - 1] ? "right" : "left");
    }
    expect(
      [...directions].sort(),
      "the emoji should travel both ways across the flight, not drift one way",
    ).toEqual(["left", "right"]);

    // And it stays inside the drift it was given, which is what keeps adjacent
    // lanes from crossing. `check:room` bounds the coefficients; this checks the
    // browser agrees.
    const spread = Math.max(...x) - Math.min(...x);
    expect(spread, "the swing should stay within the drift band").toBeLessThanOrEqual(40 * 2 + 1);
  });

  /** C6: "slight rotation" — and level again before it goes. */
  test("tips as it sways, and is level again by the time it fades", async ({ browser, meetingCode }) => {
    const ama = await joinAs(browser, "Ama Serwaa", { code: meetingCode, withMedia: false });
    open.push(ama);
    await react(ama);

    const path = await flightPath(ama, 40, 8);
    const degrees = path.map((p) => {
      const match = /(-?[\d.]+)deg/.exec(p.rotate ?? "");
      return match ? Number(match[1]) : 0;
    });

    expect(Math.max(...degrees.map(Math.abs)), "it should tip").toBeGreaterThan(1);
    expect(
      Math.max(...degrees.map(Math.abs)),
      "slightly — past about ten it reads as thrown rather than buoyant",
    ).toBeLessThanOrEqual(8.5);
    // Both ways, like the sway it is derived from.
    expect(Math.min(...degrees)).toBeLessThan(0);
    expect(Math.max(...degrees)).toBeGreaterThan(0);
    // Level at the end: a fading emoji frozen mid-tip looks broken.
    expect(Math.abs(degrees[degrees.length - 1])).toBeLessThan(0.5);
  });

  /**
   * C6: "Reduced motion still fades in place."
   *
   * The blanket reduce block only shortens durations, which for an arc means
   * travelling the whole path instantly — the jump the preference exists to
   * avoid. Both animated elements need their own rule, and C6 added a second
   * one.
   */
  test("under reduced motion it fades in place, with no travel at all", async ({ browser, meetingCode }) => {
    const ama = await joinAs(browser, "Ama Serwaa", {
      code: meetingCode,
      withMedia: false,
    });
    open.push(ama);
    await ama.page.emulateMedia({ reducedMotion: "reduce" });
    await react(ama);

    const path = await flightPath(ama, 40, 8);
    const x = path.map((p) => p.x);
    const y = path.map((p) => p.y);
    expect(Math.max(...x) - Math.min(...x), "no horizontal travel").toBeLessThan(0.5);
    expect(Math.max(...y) - Math.min(...y), "no vertical travel").toBeLessThan(0.5);
    for (const sample of path) {
      expect(sample.rotate === "none" || /^0deg$/.test(sample.rotate)).toBe(true);
    }

    // It still appears and still goes — the opacity is the part reduced motion
    // keeps.
    const opacity = await ama.page.evaluate(() => {
      const el = document.querySelector<HTMLElement>(".parley-reaction")!;
      /*
       * By name, not by index.
       *
       * This was `getAnimations()[0]`, which is whichever the browser lists
       * first — and v1.3 C6 put more animations on this subtree, so the index
       * sometimes landed on a CSS transition instead. Setting *its*
       * `currentTime` moves nothing, opacity reads its end state of 0, and the
       * test failed under four workers while passing alone: a flake whose cause
       * was the test naming its subject by position.
       */
      const fade = el
        .getAnimations()
        .find((a) => (a as CSSAnimation).animationName === "parley-reaction-hold");
      if (!fade) return null;
      fade.pause();
      const read = (t: number) => {
        fade.currentTime = t;
        return Number(getComputedStyle(el).opacity);
      };
      return { start: read(0), middle: read(1200), end: read(2399) };
    });
    expect(opacity!.start).toBeLessThan(0.2);
    expect(opacity!.middle).toBeGreaterThan(0.9);
    expect(opacity!.end).toBeLessThan(0.2);
  });
});

test.describe("the reaction assets", () => {
  const open: Participant[] = [];

  test.afterEach(async () => {
    while (open.length) {
      const p = open.pop()!;
      await leave(p).catch(() => {});
      await p.context.close().catch(() => {});
    }
  });

  /**
   * v1.3 C6's second half: Fluent Emoji 3D, MIT, 96px WebP.
   *
   * **Asserted as loaded, not as present.** `ReactionOverlay` falls back to the
   * platform glyph when the image errors, which is the right behaviour and also
   * the reason a wrong path would ship silently: the reaction still appears,
   * just flat, and every DOM assertion about the reaction would pass.
   * `naturalWidth` is the only thing that knows the bytes arrived.
   */
  test("a reaction floats as the Fluent asset, and the asset actually loaded", async ({
    browser,
    meetingCode,
  }) => {
    const ama = await joinAs(browser, "Ama Serwaa", { code: meetingCode, withMedia: false });
    open.push(ama);
    await react(ama);

    const image = ama.page.locator(".parley-reaction img");
    await expect(image).toHaveCount(1);
    await expect(image).toHaveAttribute("src", "/reactions/clapping-hands.webp");
    expect(
      await image.evaluate((el) => (el as HTMLImageElement).naturalWidth),
      "the asset is 96px at source — a zero here means it did not load and the glyph took over",
    ).toBe(96);
    /*
     * Rendered at design/02's 30px, from a 96px source: 3×.
     *
     * `offsetWidth`, not `boundingBox()`. The pop animates `scale` from 0.8 to
     * 1 over 200ms, and the rect is the *transformed* box — so this measured 24
     * and read as a sizing bug when it was a stopwatch. The same distinction
     * `SelfViewPiP`'s clamp is built on: sizes from the layout box, never from
     * a rect that carries a transform.
     */
    expect(
      await image.evaluate((el) => (el as HTMLImageElement).offsetWidth),
    ).toBe(30);
  });

  /**
   * C6: "Preload the six on room entry" — amended to **after the connection is
   * healthy**, because room entry *is* the join path and 22 kB competing with
   * media negotiation trades time-to-first-video for a decoration nobody has
   * used yet.
   *
   * Asserted as ordering against a fact the room publishes: no reaction asset
   * is requested before the grid exists, and all six are requested after. The
   * grid is the first thing that needs a connection, so it stands in for one.
   */
  test("the six are fetched once, and only after the join has its token", async ({
    browser,
    meetingCode,
  }) => {
    const ama = await joinAs(browser, "Ama Serwaa", { code: meetingCode, withMedia: false });
    open.push(ama);
    await expect(ama.page.locator(".grid")).toBeVisible({ timeout: 30_000 });

    /*
     * Read from the page's own Resource Timing rather than from a request
     * listener, because the listener would have to be attached before the
     * navigation and `joinAs` owns that.
     *
     * The ordering claim is against **the token request**, which is the first
     * thing the join does and the thing the preload must not race:
     * `connection.phase === "healthy"` cannot be reached before it. C6 says the
     * assets arrive "on room entry" and Austine amended that to after the
     * connection is up, because room entry is the join path and 22 kB
     * competing with media negotiation trades time-to-first-video for a
     * decoration nobody has used yet.
     */
    const timing = await ama.page.evaluate(async () => {
      const read = () =>
        performance.getEntriesByType("resource") as PerformanceResourceTiming[];
      // The preload fires on `healthy`, which can land after the grid paints.
      for (let i = 0; i < 60; i++) {
        if (read().filter((e) => e.name.includes("/reactions/")).length >= 6) break;
        await new Promise((r) => setTimeout(r, 250));
      }
      const all = read();
      return {
        assets: all
          .filter((e) => e.name.includes("/reactions/"))
          .map((e) => ({ name: e.name.split("/").pop()!, start: e.startTime })),
        tokenEnd: Math.max(
          0,
          ...all.filter((e) => e.name.includes("/api/livekit/token")).map((e) => e.responseEnd),
        ),
      };
    });

    expect(timing.assets.length, "all six warmed").toBe(6);
    expect(
      new Set(timing.assets.map((a) => a.name)).size,
      "six distinct assets, fetched once each",
    ).toBe(6);
    expect(timing.tokenEnd, "the join fetched a token").toBeGreaterThan(0);
    for (const asset of timing.assets) {
      expect(
        asset.start,
        `${asset.name} was fetched at ${Math.round(asset.start)}ms, before the token finished at ${Math.round(timing.tokenEnd)}ms`,
      ).toBeGreaterThan(timing.tokenEnd);
    }
  });
});

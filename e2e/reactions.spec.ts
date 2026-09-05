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
    ({ drift, spin }) => {
      const outer = document.querySelector<HTMLElement>(".parley-reaction");
      if (!outer) throw new Error("no reaction on screen");
      const inner = outer.querySelector<HTMLElement>(".parley-reaction-sway")!;

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
      const fade = el.getAnimations()[0];
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

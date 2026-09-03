import { expect, test } from "./fixtures";

import {
  gridShape, joinAs, type Participant } from "./room.helpers";

/**
 * §3.4's breakpoint table, with real participants in the room.
 *
 * `npm run check:room` already asserts the arithmetic against the same table.
 * This is the other half of the claim: that the arithmetic is what the grid
 * actually renders when people arrive, which BUILD-PLAN asks for by opening
 * real tabs rather than faking counts. Nothing here stubs a participant.
 *
 * The crowd joins with camera and microphone off. Sixteen tiles × seventeen
 * tabs is 272 video decoders on one machine, and this test is about layout —
 * the video path is covered by `media.spec.ts`, where it can be looked at
 * properly.
 */

// This used to be 6,500ms. §7's flat 10/min/IP meant seventeen people could not
// join one meeting from one address inside a minute, so the test had to trickle
// them in — and the trickle was the product's behaviour, not a test artifact.
//
// The limit is now 60/min overall with the tight tier moved onto unresolvable
// codes, which is exactly the case this test is: seventeen requests that all
// resolve. So the pacing is gone, and its absence is the assertion — if the
// room could not fill at speed, this test would stop passing.
const JOIN_INTERVAL_MS = 0;

/** §3.4, desktop column. [participants, columns, rows, tiles rendered, +N] */
const EXPECTED: [number, number, number, number, number][] = [
  [1, 1, 1, 1, 0],
  [2, 2, 1, 2, 0],
  [3, 2, 2, 3, 0],
  [4, 2, 2, 4, 0],
  [5, 3, 2, 5, 0],
  [6, 3, 2, 6, 0],
  [7, 3, 3, 7, 0],
  [9, 3, 3, 9, 0],
  [10, 4, 4, 10, 0],
  [16, 4, 4, 16, 0],
  // 17+: the last cell stops being a person and becomes the count of everyone
  // who isn't shown, so fifteen faces fit rather than sixteen.
  [17, 4, 4, 15, 2],
];

test("every breakpoint from 1 to 17, with real participants", async ({ browser, meetingCode }) => {
  test.setTimeout(600_000);

  const everyone: Participant[] = [];
  const observer = await joinAs(browser, "Ama Serwaa", { code: meetingCode, withMedia: false });
  everyone.push(observer);

  try {
    for (const [count, columns, rows, tiles, overflow] of EXPECTED) {
      while (everyone.length < count) {
        if (JOIN_INTERVAL_MS) await observer.page.waitForTimeout(JOIN_INTERVAL_MS);
        everyone.push(
          await joinAs(browser, `Guest ${everyone.length + 1}`, { code: meetingCode, withMedia: false }),
        );
      }

      // Wait for the room to agree there are this many people before reading
      // the grid — the SFU takes a moment to tell everyone about a join.
      await expect(
        observer.page.getByRole("heading", {
          name: `Meeting, ${count} participant${count === 1 ? "" : "s"}`,
        }),
      ).toBeAttached({ timeout: 60_000 });

      const shape = await gridShape(observer.page);
      expect(
        { count, ...shape, cells: shape.cells },
        `${count} participants should be ${columns}×${rows}`,
      ).toMatchObject({ columns, rows });

      // Cells include the +N tile when there is one.
      expect(shape.cells, `${count} participants → rendered cells`).toBe(tiles + (overflow ? 1 : 0));

      const plusN = observer.page.getByText(`+${overflow}`, { exact: true });
      if (overflow > 0) {
        await expect(plusN).toBeVisible();
        await expect(
          observer.page.getByText(`${overflow} more participants not shown`),
        ).toBeAttached();
      }

      // §3.4: a lone tile letterboxes; every other count fills the grid, where
      // letterboxing individual tiles is explicitly forbidden.
      expect(shape.aspectRatio, `${count} participants → aspect-ratio`).toBe(
        count === 1 ? "16 / 9" : "auto",
      );

      console.log(
        `  ${String(count).padStart(2)} participants → ${columns}×${rows}` +
          (overflow ? `, +${overflow} overflow` : ""),
      );
    }
  } finally {
    for (const p of everyone) await p.context.close().catch(() => {});
  }
});

/**
 * CLAUDE.md, on the FLIP reflow: "Measure the frame timing at sixteen tiles
 * rather than assuming it. Cheap is a claim until it is a number."
 *
 * So this is the number. Sixteen real participants, then one more joins — the
 * worst reflow the product can produce — and the long-frame count during the
 * 200ms animation is recorded and asserted against a ceiling.
 *
 * The claim being tested is not "FLIP is fast" in the abstract. It is that
 * animating sixteen tiles on the compositor does not cost what animating
 * sixteen *layouts* would, which is the reason CLAUDE.md permits per-tile
 * animation here at all.
 */
test("sixteen tiles reflow without dropping frames", async ({ browser, meetingCode }) => {
  test.setTimeout(600_000);

  const everyone: Participant[] = [];
  try {
    const observer = await joinAs(browser, "Ama Serwaa", {
      code: meetingCode,
      withMedia: false,
    });
    everyone.push(observer);

    while (everyone.length < 16) {
      everyone.push(
        await joinAs(browser, `Guest ${everyone.length + 1}`, {
          code: meetingCode,
          withMedia: false,
        }),
      );
    }
    await expect
      .poll(async () => (await gridShape(observer.page)).cells, { timeout: 60_000 })
      .toBe(16);

    // Watch frame deltas across the next reflow.
    const frames = observer.page.evaluate(() => {
      return new Promise<{ frames: number; longFrames: number; worst: number }>((resolve) => {
        const deltas: number[] = [];
        let last = performance.now();
        const started = last;
        const tick = (now: number) => {
          deltas.push(now - last);
          last = now;
          if (now - started < 600) requestAnimationFrame(tick);
          else {
            // Ignore the first delta: it spans the gap before we started.
            const real = deltas.slice(1);
            resolve({
              frames: real.length,
              // 32ms is two frames at 60Hz — a dropped frame, not a slow one.
              longFrames: real.filter((d) => d > 32).length,
              worst: Math.round(Math.max(...real)),
            });
          }
        };
        requestAnimationFrame(tick);
      });
    });

    everyone.push(
      await joinAs(browser, "Guest 17", { code: meetingCode, withMedia: false }),
    );
    const timing = await frames;
    await expect
      .poll(async () => (await gridShape(observer.page)).cells, { timeout: 60_000 })
      .toBe(16);

    console.log(
      `  reflow at 16 tiles → ${timing.frames} frames, ` +
        `${timing.longFrames} over 32ms, worst ${timing.worst}ms`,
    );

    /*
     * A ceiling rather than a target. Real browsers under a real SFU with
     * seventeen contexts on one machine will drop the occasional frame for
     * reasons that have nothing to do with this animation; what would show a
     * problem is a *run* of them, which is what sixteen simultaneous layout
     * animations would produce.
     */
    expect(
      timing.longFrames,
      `${timing.longFrames} long frames during the reflow (worst ${timing.worst}ms)`,
    ).toBeLessThanOrEqual(6);
  } finally {
    for (const p of everyone) await p.context.close().catch(() => {});
  }
});

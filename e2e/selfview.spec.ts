import { expect, test } from "./fixtures";

import {
  expectParticipants,
  gridShape,
  joinAs,
  wakeControls,
  type Participant,
} from "./room.helpers";

/**
 * The corner self-view — v1.3 C1.
 *
 * "Your own face does not need equal weight with the people you are talking to.
 * On a two-person call that is the difference between two half-screens and one
 * full one."
 *
 * `grid.spec` already covers what this does to the *grid* — every breakpoint
 * shifted by one, because a room of N renders N−1 tiles. This covers the PiP
 * itself, and each test names the guard it pins:
 *
 * - the solo exception in `RoomGrid` (no PiP until someone arrives)
 * - the `relative` on the stage wrapper, which is the whole of C1's warning
 * - the `clamp` in `SelfViewPiP`
 * - `nextCorner`, the single-pointer and keyboard path SC 2.5.7 and SC 2.1.1
 *   require and C1's text does not mention
 * - `data-participant`, without which your own reactions lose their origin
 *
 * Cameras are off throughout. The PiP falls back to the initial avatar, which
 * is the same box in the same place — this is a test about geometry, and the
 * video path has `media.spec`.
 */

const PIP = "[data-self-view]";

/** The PiP's box and the box it is anchored to, both as the browser laid them out. */
async function boxes(page: Participant["page"]) {
  return page.evaluate((selector) => {
    const pip = document.querySelector<HTMLElement>(selector);
    if (!pip) throw new Error("no self view");
    const anchor = pip.offsetParent as HTMLElement | null;
    if (!anchor) throw new Error("self view has no positioned ancestor");
    const a = anchor.getBoundingClientRect();
    const p = pip.getBoundingClientRect();
    return {
      // Insets, so the assertions read as "16px from the edge" rather than as
      // two absolute coordinates whose difference happens to be 16.
      left: Math.round(p.left - a.left),
      top: Math.round(p.top - a.top),
      right: Math.round(a.right - p.right),
      bottom: Math.round(a.bottom - p.bottom),
      width: Math.round(p.width),
      height: Math.round(p.height),
      centre: { x: p.left + p.width / 2, y: p.top + p.height / 2 },
      // What the anchor actually contains. C1's failure mode is that this is
      // the frame, which holds the controls too.
      anchorHasGrid: Boolean(anchor.querySelector(".grid")),
    };
  }, PIP);
}

/**
 * Pins the solo exception in `RoomGrid`: `remote.length === 0` keeps you in the
 * grid. Delete it and the first assertion here fails — one person would render
 * an empty grid with a 200px corner tile, which reads as broken rather than as
 * waiting.
 */
test("alone you are the grid; the first arrival moves you to the corner", async ({
  browser,
  meetingCode,
}) => {
  const everyone: Participant[] = [];
  try {
    const ama = await joinAs(browser, "Ama Serwaa", { code: meetingCode, withMedia: false });
    everyone.push(ama);

    await expectParticipants(ama.page, 1);
    await expect(ama.page.locator(PIP)).toHaveCount(0);
    expect((await gridShape(ama.page)).cells).toBe(1);

    everyone.push(
      await joinAs(browser, "Kwabena Mensah", { code: meetingCode, withMedia: false }),
    );
    await expectParticipants(ama.page, 2);

    await expect(ama.page.locator(PIP)).toBeVisible();
    // Still one tile — and it is the other person's, not hers. Structural
    // rather than text: identities, so this cannot widen the way a name query
    // would once the log starts carrying the same names.
    await expect
      .poll(async () => (await gridShape(ama.page)).cells)
      .toBe(1);
    const inGrid = await ama.page.locator(".grid [data-participant]").getAttribute("data-participant");
    const me = await ama.page.locator(PIP).getAttribute("data-participant");
    expect(me).toBeTruthy();
    expect(inGrid).not.toBe(me);
  } finally {
    for (const p of everyone) await p.context.close().catch(() => {});
  }
});

/**
 * Pins the `relative` on `RoomGrid`'s stage wrapper.
 *
 * C1: "The first build of this mockup had it `position:absolute` inside an
 * unpositioned parent, so on mobile it resolved to the frame and sat on top of
 * the control bar." Remove that one class and `offsetParent` walks up to the
 * room frame, which contains the controls — so this asserts what the PiP is
 * anchored to, not merely where it happens to land at one viewport.
 *
 * On a phone, where the failure was.
 */
test("the self view is anchored to the video area, not the frame", async ({
  browser,
  meetingCode,
}) => {
  const everyone: Participant[] = [];
  try {
    const ama = await joinAs(browser, "Ama Serwaa", {
      code: meetingCode,
      withMedia: false,
      android: true,
    });
    everyone.push(ama);
    everyone.push(
      await joinAs(browser, "Kwabena Mensah", { code: meetingCode, withMedia: false }),
    );
    await expectParticipants(ama.page, 2);
    await expect(ama.page.locator(PIP)).toBeVisible();

    const box = await boxes(ama.page);
    expect(box.anchorHasGrid, "the PiP's anchor contains the grid").toBe(true);

    // And not the controls. The Leave button stands for the bar because it is
    // the one control the suite already names — `wakeControls` waits on it.
    await wakeControls(ama.page);
    const leave = await ama.page.getByRole("button", { name: "Leave" }).first().elementHandle();
    expect(leave).not.toBeNull();
    const anchorHasControls = await ama.page.evaluate(
      ({ selector, control }) => {
        const anchor = document.querySelector<HTMLElement>(selector)?.offsetParent;
        return Boolean(anchor && control && anchor.contains(control));
      },
      { selector: PIP, control: leave },
    );
    expect(anchorHasControls, "the PiP's anchor does not contain the controls").toBe(false);

    // It rests where the design puts it: 16px in from the bottom-right of the
    // video area.
    expect({ right: box.right, bottom: box.bottom }).toEqual({ right: 16, bottom: 16 });

    // The geometric half of the same claim: nothing about the PiP reaches the
    // control bar. Measured against the bar's rendered box rather than a
    // constant, because the bar's height is a wrapped, safe-area-inset thing.
    const bar = await ama.page.getByRole("button", { name: "Leave" }).first().boundingBox();
    const pip = await ama.page.locator(PIP).boundingBox();
    expect(pip!.y + pip!.height).toBeLessThanOrEqual(bar!.y);
  } finally {
    for (const p of everyone) await p.context.close().catch(() => {});
  }
});

/**
 * Pins `clamp` in `SelfViewPiP`.
 *
 * Delete it and the first case still passes — a short drag lands somewhere
 * legal either way — while the second and third fail, because the PiP would
 * follow the pointer straight out of the room. "A PiP you can throw off-screen
 * and then have to guess your way back to is worse than one that will not go."
 */
test("the self view drags, and cannot be thrown out of the room", async ({
  browser,
  meetingCode,
}) => {
  const everyone: Participant[] = [];
  try {
    const ama = await joinAs(browser, "Ama Serwaa", { code: meetingCode, withMedia: false });
    everyone.push(ama);
    everyone.push(
      await joinAs(browser, "Kwabena Mensah", { code: meetingCode, withMedia: false }),
    );
    await expectParticipants(ama.page, 2);
    await expect(ama.page.locator(PIP)).toBeVisible();

    const drag = async (by: { x: number; y: number }) => {
      const from = (await boxes(ama.page)).centre;
      await ama.page.mouse.move(from.x, from.y);
      await ama.page.mouse.down();
      // Two moves: one event is enough for the handler but not for the browser
      // to treat it as a drag rather than a click.
      await ama.page.mouse.move(from.x + by.x / 2, from.y + by.y / 2);
      await ama.page.mouse.move(from.x + by.x, from.y + by.y);
      await ama.page.mouse.up();
      /*
       * `settled`, not `boxes`. A drag ends in a click, and if that click were
       * to move the tile it would move it over 120ms — so reading the box
       * straight after `mouse.up` catches the *in-flight* position, which for
       * the first few frames is indistinguishable from not having moved.
       *
       * That is not hypothetical. Deleting the travel guard in `onClick` left
       * all four tests green until this line waited: the assertion below was
       * reading a corner jump one frame after it started.
       */
      return settled(ama);
    };

    const start = await boxes(ama.page);

    /*
     * It moves at all — and lands where the drag left it.
     *
     * That second half is not incidental. A drag ends in a `click` like any
     * other press, so this case also pins the travel guard in `onClick`:
     * without it the tile would snap to a corner the moment the button came
     * up, and 60px would read as the whole width of the room.
     */
    const moved = await drag({ x: -60, y: -40 });
    expect({ right: moved.right, bottom: moved.bottom }).toEqual({
      right: start.right + 60,
      bottom: start.bottom + 40,
    });

    // Thrown at the top-left corner it stops at the opposite inset rather than
    // leaving — the same 16px, now measured from the other two edges.
    const topLeft = await drag({ x: -4000, y: -4000 });
    expect({ left: topLeft.left, top: topLeft.top }).toEqual({ left: 16, top: 16 });
    expect(topLeft.width).toBe(start.width);

    // And back the other way, to where it started.
    const bottomRight = await drag({ x: 4000, y: 4000 });
    expect({ right: bottomRight.right, bottom: bottomRight.bottom }).toEqual({
      right: 16,
      bottom: 16,
    });
  } finally {
    for (const p of everyone) await p.context.close().catch(() => {});
  }
});


/**
 * Pins `nextCorner`, and the reason it exists.
 *
 * C1 says "draggable" and nothing else, which is not enough to ship: **SC 2.5.7
 * Dragging Movements** wants a single-pointer alternative to any drag that is
 * not essential, and **SC 2.1.1** wants a keyboard one. The floor's own first
 * line — "every control keyboard reachable" — says the same thing in fewer
 * words.
 *
 * Pressing steps clockwise from wherever the tile is, so this walks the whole
 * cycle and back to the start. Enter rather than a click, because the keyboard
 * is the path that did not exist; the pointer path is the same handler.
 */
test("the self view moves corner by corner from the keyboard", async ({
  browser,
  meetingCode,
}) => {
  const everyone: Participant[] = [];
  try {
    const ama = await joinAs(browser, "Ama Serwaa", { code: meetingCode, withMedia: false });
    everyone.push(ama);
    everyone.push(
      await joinAs(browser, "Kwabena Mensah", { code: meetingCode, withMedia: false }),
    );
    await expectParticipants(ama.page, 2);

    const pip = ama.page.getByRole("button", { name: "Move self view to the next corner" });
    await expect(pip).toBeVisible();
    await pip.focus();

    // Bottom-right at rest, then clockwise. Insets rather than coordinates, so
    // each step reads as the corner it is.
    const clockwise = [
      { left: 16, bottom: 16 },
      { left: 16, top: 16 },
      { right: 16, top: 16 },
      { right: 16, bottom: 16 },
    ];
    expect(await settled(ama)).toMatchObject({ right: 16, bottom: 16 });
    for (const [step, corner] of clockwise.entries()) {
      await ama.page.keyboard.press("Enter");
      expect(await settled(ama), `press ${step + 1}`).toMatchObject(corner);
    }
  } finally {
    for (const p of everyone) await p.context.close().catch(() => {});
  }
});

/** The corner step is a 120ms transition; read the box once it has stopped. */
async function settled(participant: Participant) {
  await participant.page.evaluate(
    (selector) =>
      Promise.all(
        document
          .querySelectorAll<HTMLElement>(selector)
          .values()
          .flatMap((element) => element.getAnimations())
          .map((animation) => animation.finished.catch(() => {}))
          .toArray(),
      ),
    PIP,
  );
  return boxes(participant.page);
}

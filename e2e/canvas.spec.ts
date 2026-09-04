import { expect, test } from "./fixtures";

import { joinAs, leave, wakeControls, type Participant, settleAnimations } from "./room.helpers";

/**
 * Track B's canvas, measured.
 *
 * Every assertion here reads a rendered box or a computed value from a live
 * room. BUILD-PLAN v1.2's guardrail is explicit about why: "Half this plan is
 * layout, which is exactly where reading back a class name proves nothing."
 * A tile that declares `rounded-xl` tells you what was typed; only the computed
 * radius tells you what the token resolves to, which is how B3's 0.7rem-versus-
 * 0.75rem discrepancy survived being written down twice.
 */
test.describe("the room canvas", () => {
  const open: Participant[] = [];

  test.afterEach(async () => {
    while (open.length) {
      const p = open.pop()!;
      await leave(p).catch(() => {});
      await p.context.close().catch(() => {});
    }
  });

  /**
   * B3. The avatar used to be a fixed 64px disc, which is a coin adrift in a
   * full-area tile and nearly the whole cell in a filmstrip. It is now a
   * proportion of the tile's shorter side, so one rule covers every breakpoint.
   */
  test("the camera-off avatar scales with its tile", async ({ browser, meetingCode }) => {
    const ama = await joinAs(browser, "Ama Serwaa", { code: meetingCode, withMedia: false });
    open.push(ama);

    /*
     * Settled, and measured as layout boxes rather than rects.
     *
     * The avatar is `min(28cqmin, 128px)`, and `cqmin` resolves against the
     * tile's untransformed layout box while `getBoundingClientRect` returns the
     * transformed one. Mid-FLIP the two disagree — this failed at "avatar 123px
     * against a 596px shorter side", where 123 is 28% of the tile's real 439px
     * layout box and 596 was the inverse transform still showing its old size.
     * Alone it passed; under four workers it did not.
     *
     * So both halves of the comparison now come from the same frame of
     * reference, and nothing is measured while an animation is running.
     */
    await settleAnimations(ama.page);
    const measured = await ama.page.evaluate(() => {
      const tile = document.querySelector<HTMLElement>("[data-participant]");
      const avatar = tile?.querySelector<HTMLElement>(".rounded-full");
      if (!tile || !avatar) return null;
      return {
        shorterSide: Math.min(tile.offsetWidth, tile.offsetHeight),
        avatar: avatar.offsetWidth,
        radius: parseFloat(getComputedStyle(tile).borderTopLeftRadius),
      };
    });

    expect(measured, "no camera-off tile rendered").not.toBeNull();
    const { shorterSide, avatar, radius } = measured!;

    // Roughly 28% of the shorter side, or the 128px ceiling — whichever binds.
    const expected = Math.min(shorterSide * 0.28, 128);
    expect(
      avatar,
      `avatar ${Math.round(avatar)}px against a ${Math.round(shorterSide)}px shorter side`,
    ).toBeGreaterThan(expected - 4);
    expect(avatar).toBeLessThan(expected + 4);

    // It has to be a *proportion*, not a coincidence: the old fixed 64px would
    // satisfy a loose band at exactly one tile size.
    expect(avatar, "the avatar is still the old fixed 64px").not.toBe(64);

    // CLAUDE.md's shape section: tiles are 0.75rem, which is 12px at the
    // default root size. `--radius-xl` computed to 0.7rem before B3.
    expect(radius, "tile radius is not 0.75rem").toBeCloseTo(12, 0);
  });

  /**
   * B3's label scrim: bottom-only, about 30% of the tile, "enough to guarantee
   * contrast, little enough to leave the video alone". A full overlay would
   * also guarantee contrast, which is why the ceiling matters as much as the
   * floor.
   */
  test("the name label sits on a bottom-only scrim", async ({ browser, meetingCode }) => {
    const ama = await joinAs(browser, "Ama Serwaa", { code: meetingCode, withMedia: false });
    open.push(ama);

    // Ratios of two rects in one subtree are transform-invariant, but
    // `bottomGap` is an absolute figure and a scaling tile moves it.
    await settleAnimations(ama.page);
    const measured = await ama.page.evaluate(() => {
      const tile = document.querySelector<HTMLElement>("[data-participant]");
      if (!tile) return null;
      const scrim = [...tile.querySelectorAll<HTMLElement>("div")].find((d) =>
        getComputedStyle(d).backgroundImage.includes("gradient"),
      );
      if (!scrim) return null;
      const t = tile.getBoundingClientRect();
      const s = scrim.getBoundingClientRect();
      return { tileHeight: t.height, scrimHeight: s.height, bottomGap: t.bottom - s.bottom };
    });

    expect(measured, "no gradient scrim under the name").not.toBeNull();
    const { tileHeight, scrimHeight, bottomGap } = measured!;

    expect(bottomGap, "the scrim is not anchored to the bottom").toBeLessThan(2);
    expect(scrimHeight / tileHeight, "the scrim covers too much of the tile").toBeLessThan(0.45);
    // The floor is the label's own line box on a short filmstrip tile.
    expect(scrimHeight).toBeGreaterThanOrEqual(44 - 1);
  });

  /**
   * B4's spacing rhythm. Asserted as *relative* gaps rather than pixel values,
   * because the rhythm is the point — the bar tightens below `sm` and the
   * absolute numbers change with it, while the ordering must not.
   */
  test("the control bar groups by spacing rhythm", async ({ browser, meetingCode }) => {
    const ama = await joinAs(browser, "Ama Serwaa", { code: meetingCode, withMedia: false });
    open.push(ama);
    const { page } = ama;
    await wakeControls(page);

    const box = async (name: RegExp | string) => {
      const b = await page.getByRole("button", { name }).first().boundingBox();
      expect(b, `no control matching ${name}`).not.toBeNull();
      return b!;
    };

    /*
     * v1.3 C2 moved Present into the *primary* tier, so the groups are now
     * [Mute · Stop video · Present] · [reactions · chat · people · more] ·
     * [Leave]. This measured from the camera to "share your screen", which was
     * the old second group's first control and is now the first group's last —
     * the rhythm it was checking is still there, one control along.
     */
    const mic = await box(/^(Mute|Unmute)$/);
    const camera = await box(/^(Stop|Start) video$/);
    // Present is hidden below 900px, where C2 allows six controls; it is in the
    // overflow menu there instead. So the primary group ends at whichever of
    // the two is actually rendered.
    const hasPresent = await page.getByRole("button", { name: /^(Present|Stop presenting)$/ }).count();
    const primaryEnd = hasPresent > 0 ? await box(/^(Present|Stop presenting)$/) : camera;
    /*
     * The secondary group's two ends. Reactions lead it above 900px and are in
     * the overflow menu below, so the first control is whichever is rendered;
     * the last is the overflow trigger, which C2's bar added after this test
     * was written — measuring to Participants spanned it and reported a gap
     * that was really a gap plus a control.
     */
    const hasReactions = await page.getByRole("button", { name: "Send a reaction" }).count();
    const groupStart = hasReactions > 0 ? await box("Send a reaction") : await box("Chat");
    const groupEnd = await box("More options");
    const leaveButton = await box("Leave");

    const withinDevices = camera.x - (mic.x + mic.width);
    const betweenGroups = groupStart.x - (primaryEnd.x + primaryEnd.width);
    const beforeLeave = leaveButton.x - (groupEnd.x + groupEnd.width);

    expect(
      betweenGroups,
      `devices ${withinDevices}px apart, groups ${betweenGroups}px apart`,
    ).toBeGreaterThan(withinDevices);
    expect(
      beforeLeave,
      `groups ${betweenGroups}px apart, leave ${beforeLeave}px out`,
    ).toBeGreaterThan(betweenGroups);
  });

  /**
   * B4: secondary controls are ghost at rest. The border is transparent rather
   * than absent, so the box does not resize when it returns — which is the part
   * worth measuring, since a resizing control is what "ghost" usually costs.
   */
  test("secondary controls are ghost at rest and keep their size", async ({
    browser,
    meetingCode,
  }) => {
    const ama = await joinAs(browser, "Ama Serwaa", { code: meetingCode, withMedia: false });
    open.push(ama);
    const { page } = ama;
    await wakeControls(page);

    const chat = page.getByRole("button", { name: "Chat", exact: true });
    // `offsetWidth`, not `getBoundingClientRect`. B4 scales the control 1.04 on
    // hover, and clicking leaves the pointer on it — so the visual box grows
    // while the layout box does not. "The control resized" is a claim about
    // layout, and a transform is exactly what it must not be confused with.
    const resting = await chat.evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        borderColour: style.borderTopColor,
        background: style.backgroundColor,
        width: (el as HTMLElement).offsetWidth,
        height: (el as HTMLElement).offsetHeight,
      };
    });

    // Transparent, both of them — "ghost until hover or active".
    expect(resting.borderColour).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
    expect(resting.background).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
    // §9's floor still applies to the room: 44px.
    expect(resting.width).toBeGreaterThanOrEqual(44);
    expect(resting.height).toBeGreaterThanOrEqual(44);

    // Active fills it, and the box is unchanged.
    await chat.click();
    await expect(page.getByRole("complementary", { name: "Meeting chat" })).toBeVisible();
    // Let the 120ms fill finish. Read mid-transition this returns
    // `rgba(36, 40, 48, 0.082)` — the right colour part-way through its own
    // animation, which is the same trap a Phase 4 test fell into.
    await page.waitForFunction(
      () => {
        const button = document.querySelector('[aria-label="Chat"]');
        return button ? button.getAnimations().every((a) => a.playState !== "running") : false;
      },
      undefined,
      { timeout: 5_000 },
    );
    const active = await chat.evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        background: style.backgroundColor,
        width: (el as HTMLElement).offsetWidth,
        height: (el as HTMLElement).offsetHeight,
      };
    });
    expect(active.background, "an open panel's toggle is not filled").not.toBe(resting.background);
    expect(active.width, "the control resized when it filled").toBeCloseTo(resting.width, 0);
    expect(active.height).toBeCloseTo(resting.height, 0);
  });

  /**
   * B2's filmstrip, seen by someone watching a share.
   *
   * The column was `overflow-hidden` at a fixed 200px. Clipping is the defect:
   * the capacity cap decides who is shown and the "+N" cell carries the rest,
   * but on a short viewport the last tile — and sometimes the "+N" itself —
   * was simply absent, with nothing to say so.
   */
  test("the filmstrip is a 220px column that scrolls rather than clips", async ({
    browser,
    meetingCode,
  }) => {
    const ama = await joinAs(browser, "Ama Serwaa", { code: meetingCode, withMedia: false });
    open.push(ama);
    const kwabena = await joinAs(browser, "Kwabena Osei", { code: meetingCode, withMedia: false });
    open.push(kwabena);

    await wakeControls(ama.page);
    await ama.page.getByRole("button", { name: "Present" }).click();
    await expect(kwabena.page.getByText("Ama Serwaa is sharing")).toBeVisible();

    await settleAnimations(kwabena.page);
    const strip = await kwabena.page.evaluate(() => {
      const heading = [...document.querySelectorAll("h2")].find((h) =>
        /^Participants, \d+$/.test(h.textContent?.trim() ?? ""),
      );
      const column = heading?.parentElement;
      if (!column) return null;
      const tiles = [...column.querySelectorAll<HTMLElement>("[data-participant], [data-overflow]")];
      const box = column.getBoundingClientRect();
      return {
        width: box.width,
        overflowY: getComputedStyle(column).overflowY,
        // A clipped tile has a bottom past the column's own scrollable extent.
        clipped: tiles.some((t) => t.getBoundingClientRect().height < 1),
        gaps: tiles.slice(1).map((t, i) => {
          const previous = tiles[i].getBoundingClientRect();
          return Math.round(t.getBoundingClientRect().top - previous.bottom);
        }),
        ratios: tiles.map((t) => {
          const r = t.getBoundingClientRect();
          return +(r.width / r.height).toFixed(2);
        }),
      };
    });

    expect(strip, "no filmstrip beside the shared content").not.toBeNull();
    expect(strip!.width, "the filmstrip is not 220px").toBeCloseTo(220, 0);
    expect(strip!.overflowY, "the filmstrip still clips instead of scrolling").toBe("auto");
    expect(strip!.clipped, "a filmstrip tile collapsed to nothing").toBe(false);
    for (const gap of strip!.gaps) expect(gap, "filmstrip gutter is not 8px").toBe(8);
    for (const ratio of strip!.ratios) expect(ratio, "a filmstrip tile is not 16:9").toBeCloseTo(1.78, 1);
  });
});

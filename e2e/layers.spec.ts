import { expect, test } from "./fixtures";

import {
  expectParticipants,
  joinAs,
  leave,
  wakeControls,
  type Participant,
} from "./room.helpers";

/**
 * The stacking scale — BUILD-PLAN v1.5 D1.
 *
 * > "A reaction sent with more than two people in the room draws underneath the
 * > self-view. The one-line fix is a larger number on the reaction layer, and it
 * > would leave the cause untouched."
 *
 * The cause was that there was no rule. `ReactionOverlay` was `z-10` and
 * `SelfViewPiP` was `z-30`, and neither is wrong on its own — C1's PiP arrived
 * after the reaction layer existed and won by picking a bigger number. Twenty
 * bare values across seventeen files, each decided locally.
 *
 * `npm run check:layers` stops new ones appearing. This asserts the part a
 * scanner cannot: that the order the scale describes is the order the browser
 * resolves.
 *
 * **This reads resolved `z-index`, and that is a deliberate exception to
 * "assert rendered geometry, never declared CSS".** The rule exists because a
 * declared value can be overridden by something you did not look at — reading
 * back your own input proves nothing. `getComputedStyle` is the opposite end:
 * it is the value *after* the cascade, the browser's own answer. What it is not
 * is a hit test, and a hit test is genuinely unavailable here — a reaction lives
 * 2400ms, travels, and is laid into one of several horizontal lanes, while the
 * PiP is draggable and parks in a corner. Making them overlap on purpose means
 * moving one of them, which tests the arrangement I set up rather than the one
 * the product produces.
 *
 * So the claim is narrowed to what can be honestly checked: same stacking
 * context, and reactions above the self-view within it.
 */
test.describe("the layer scale", () => {
  const open: Participant[] = [];

  test.afterEach(async () => {
    while (open.length) {
      const p = open.pop()!;
      await leave(p).catch(() => {});
      await p.context.close().catch(() => {});
    }
  });

  test("reactions resolve above the self-view, in one stacking context", async ({
    browser,
    meetingCode,
  }) => {
    test.setTimeout(180_000);
    // Two people, because the PiP only exists once somebody else is here —
    // §3.4: "a lone participant stays a full-size tile and there is no PiP",
    // which is also why the report says "with more than two people".
    const first = await joinAs(browser, "Ama Serwaa", { code: meetingCode, withMedia: false });
    const second = await joinAs(browser, "Kwabena Osei", { code: meetingCode, withMedia: false });
    open.push(first, second);
    await expectParticipants(first.page, 2);
    await wakeControls(first.page);

    const layers = await first.page.evaluate(() => {
      const pip = document.querySelector<HTMLElement>('[aria-label="Move self view to the next corner"]');
      const reactions = document.querySelector<HTMLElement>('[aria-hidden="true"].pointer-events-none.absolute.inset-0');
      if (!pip || !reactions) return { found: false as const, pip: !!pip, reactions: !!reactions };

      const z = (el: HTMLElement) => getComputedStyle(el).zIndex;

      /**
       * The nearest ancestor that creates a stacking context.
       *
       * **Not "do they share a parent".** The first version asked that and
       * failed against a working fix: the PiP hangs off the stage's inner
       * column and the reaction layer off the stage itself, different elements,
       * and their z-indexes compete perfectly well because nothing between them
       * establishes a context. Sharing a parent is sufficient and not necessary,
       * and asserting it fails correct arrangements.
       *
       * The property that actually decides whether two numbers compete is that
       * both resolve into the *same* stacking context — the trap that made a
       * `z-40` row menu lose to a `z-30` control bar in v1.4, where the menu's
       * number was real and simply not in the same competition.
       */
      const contextOf = (el: HTMLElement): HTMLElement => {
        for (let n = el.parentElement; n; n = n.parentElement) {
          const cs = getComputedStyle(n);
          const creates =
            (cs.position !== "static" && cs.zIndex !== "auto") ||
            cs.position === "fixed" ||
            cs.position === "sticky" ||
            Number(cs.opacity) < 1 ||
            cs.transform !== "none" ||
            cs.filter !== "none" ||
            cs.perspective !== "none" ||
            cs.isolation === "isolate" ||
            /transform|opacity|filter/.test(cs.willChange) ||
            /layout|paint|strict|content/.test(cs.contain);
          if (creates) return n;
        }
        return document.documentElement;
      };

      const context = contextOf(pip);
      return {
        found: true as const,
        pipZ: Number(z(pip)),
        reactionsZ: Number(z(reactions)),
        sameContext: context === contextOf(reactions),
        contextTag: `${context.tagName.toLowerCase()}.${String(context.className).split(/\s+/)[0] || "—"}`,
        pipRaw: z(pip),
        reactionsRaw: z(reactions),
      };
    });

    expect(
      layers.found,
      `could not find both layers (pip: ${"pip" in layers ? layers.pip : "?"}, reactions: ${"reactions" in layers ? layers.reactions : "?"})`,
    ).toBe(true);
    if (!layers.found) return;

    expect(
      Number.isNaN(layers.pipZ) || Number.isNaN(layers.reactionsZ),
      `a layer resolved to a non-number — pip "${layers.pipRaw}", reactions "${layers.reactionsRaw}". ` +
        "That usually means the token is missing and the element is `auto`.",
    ).toBe(false);

    expect(
      layers.sameContext,
      `the two layers resolve into different stacking contexts, so their ` +
        `z-indexes never compete (the self-view's is ${layers.contextTag})`,
    ).toBe(true);

    expect(
      layers.reactionsZ,
      `reactions (${layers.reactionsZ}) must resolve above the self-view (${layers.pipZ}) — ` +
        "a reaction hidden behind your own face is the reported bug",
    ).toBeGreaterThan(layers.pipZ);
  });
});

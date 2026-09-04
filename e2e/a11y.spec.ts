import AxeBuilder from "@axe-core/playwright";
import { type Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { signIn } from "./auth";
import { EMPTY_DASHBOARD, PUBLIC_STATES, SIGNED_IN_STATES, type Theme } from "./states";
import { PRESENCE_SETTLE_MS } from "@/lib/hooks/usePresence";

import { joinAs, leave, settleAnimations, wakeControls, type Participant } from "./room.helpers";

/**
 * axe, run against **states rather than routes**.
 *
 * BUILD-PLAN Phase 9: "The acceptance criterion said 'every route' and that was
 * too coarse: a route with the chat panel closed and the same route with it
 * open are different accessibility surfaces, and the second is where the focus
 * trap and the live region actually live. A green run that never opened a
 * panel has tested the easy half."
 *
 * **This is the regression net, not the deliverable.** Automated tooling
 * reaches perhaps a third to a half of WCAG and is blind to everything this
 * phase is actually about: it confirms an accessible name exists, not that it
 * means anything; that elements are focusable, not that the order is sensible;
 * that a live region is present, not that its output is usable. The batching
 * thresholds, the state-toggle versus disclosure split, the announcement
 * policy — none of it is visible here. The real deliverable is the manual
 * traverse and a VoiceOver session, recorded in PROGRESS as not done by this
 * file.
 */

/**
 * What axe is pointed at, and what it is not.
 *
 * `next-route-announcer` is the framework's own assertive live region. It is
 * not ours, we cannot change it, and §9's rule that our announcements stay
 * polite exists precisely because it is there. Excluding it keeps a framework
 * decision out of our results.
 *
 * `nextjs-portal` is the dev-mode error overlay. It should be absent from a
 * production build entirely — BUILD-PLAN asks for it to be kept out of the run,
 * and this is belt and braces.
 */
/**
 * Put the page in a palette before it paints.
 *
 * `emulateMedia` rather than clicking the theme toggle: `defaultTheme="system"`
 * means the media query *is* the state a first-time visitor arrives in, and the
 * toggle writes a preference that then has to be cleaned up between states.
 */
async function inTheme(page: Page, theme: Theme) {
  await page.emulateMedia({ colorScheme: theme });
}

async function scan(page: Page) {
  /*
   * Settled first, for a reason of axe's own: it computes contrast from what is
   * painted, and a dialog fading in paints composites of its own colours
   * against whatever is behind. It reported `#34383e` on `#191c22` for a badge
   * whose settled pairing is `--muted-foreground` on `--secondary` at 5.68:1.
   * Neither number is a token; both are frames.
   */
  await settleAnimations(page);
  return new AxeBuilder({ page })
    .exclude("next-route-announcer")
    .exclude("nextjs-portal")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
}

/** Fails with the rule id and the offending selector, not a bare count. */
function expectClean(results: Awaited<ReturnType<typeof scan>>, state: string) {
  const detail = results.violations
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)
    .join("\n  ");
  expect(results.violations, `${state}\n  ${detail}`).toEqual([]);
}

test.describe("axe, by state", () => {
  /**
   * The list is `states.ts`'s, shared with the touch-target check.
   *
   * The pre-join scan is the only entry that needs a live meeting and takes the
   * test's own; the others are read-only states nothing joins.
   */
  for (const state of PUBLIC_STATES) {
    for (const theme of state.themes) {
      test(`${state.name} is clean in ${theme}`, async ({ page, meetingCode }) => {
        await inTheme(page, theme);
        await state.reach(page, meetingCode);
        expectClean(await scan(page), `${state.name}, in ${theme}`);
      });
    }
  }
});

/**
 * The surfaces behind auth, which axe had never reached.
 *
 * Every state scanned until now was public, so the dashboard and the scheduling
 * screens — the two places light mode is actually used, and the densest markup
 * in the product — were outside the net entirely. `signIn` exists now, so the
 * gap was only ever the state list.
 *
 * One sign-in per test: Supabase invalidates the previous magic link when a new
 * one is minted for the same address.
 */
test.describe("axe, signed in", () => {
  /**
   * One test per theme, derived from the state list rather than written twice.
   *
   * This used to be two near-identical tests, the second differing only by an
   * `emulateMedia` call — and that is precisely why the marketing page and
   * sign-in were still light-only: nobody wrote their second test. The axis now
   * comes from `states.ts`, so a surface that renders in two palettes is
   * scanned in two palettes whether or not anyone remembers.
   *
   * One sign-in per test: Supabase invalidates the previous magic link when a
   * new one is minted for the same address.
   */
  for (const theme of ["light", "dark"] as const) {
    test(`every signed-in state is clean in ${theme}`, async ({ page, hostedSchedule }) => {
      test.setTimeout(180_000);
      await inTheme(page, theme);
      await signIn(page, hostedSchedule.email, "/dashboard");

      for (const state of SIGNED_IN_STATES) {
        if (!state.themes.includes(theme)) continue;
        await state.reach(page, hostedSchedule.code);
        expectClean(await scan(page), `${state.name}, in ${theme}`);
      }
    });
  }

  for (const theme of EMPTY_DASHBOARD.themes) {
    test(`the empty dashboard is clean in ${theme}`, async ({ page, hostEmail }) => {
      await inTheme(page, theme);
      await signIn(page, hostEmail, "/dashboard");
      await EMPTY_DASHBOARD.reach(page, undefined as never);
      expectClean(await scan(page), `${EMPTY_DASHBOARD.name}, in ${theme}`);
    });
  }
});

/**
 * SC 1.4.10 Reflow, which axe has no rule for.
 *
 * The criterion is 320 CSS pixels with no horizontal scrolling — 400% zoom on a
 * 1280px screen, and roughly the narrowest phone. Nothing in the suite measured
 * it, and adding the dashboard to the state list is what surfaced it: the
 * document was 391px wide at both 320 and 375, because the header's action
 * group is three `shrink-0` buttons that had nowhere to wrap.
 *
 * A page that scrolls sideways is not a subtle failure. It is the whole layout
 * sliding under the thumb while you try to press something.
 */
test.describe("reflow", () => {
  const NARROW = { width: 320, height: 812 };

  /** Rendered geometry: the document's own width against the viewport's. */
  async function sideways(page: Page) {
    return page.evaluate(() => {
      const el = document.documentElement;
      return { scroll: el.scrollWidth, client: el.clientWidth };
    });
  }

  test("no public state scrolls sideways at 320px", async ({ page, meetingCode }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(NARROW);
    for (const state of PUBLIC_STATES) {
      await state.reach(page, meetingCode);
      const { scroll, client } = await sideways(page);
      expect(scroll, `${state.name} is ${scroll}px wide in a ${client}px viewport`)
        .toBeLessThanOrEqual(client);
    }
  });

  test("no signed-in state scrolls sideways at 320px", async ({ page, hostedSchedule }) => {
    test.setTimeout(120_000);
    await signIn(page, hostedSchedule.email, "/dashboard");
    await page.setViewportSize(NARROW);
    for (const state of SIGNED_IN_STATES) {
      await state.reach(page, hostedSchedule.code);
      const { scroll, client } = await sideways(page);
      expect(scroll, `${state.name} is ${scroll}px wide in a ${client}px viewport`)
        .toBeLessThanOrEqual(client);
    }
  });

  test("nor does the empty dashboard", async ({ page, hostEmail }) => {
    await signIn(page, hostEmail, "/dashboard");
    await page.setViewportSize(NARROW);
    await EMPTY_DASHBOARD.reach(page, undefined as never);
    const { scroll, client } = await sideways(page);
    expect(scroll, `the empty dashboard is ${scroll}px wide in a ${client}px viewport`)
      .toBeLessThanOrEqual(client);
  });
});

test.describe("axe, in the room", () => {
  let participant: Participant;

  test.afterEach(async () => {
    if (!participant) return;
    await leave(participant).catch(() => {});
    // `joinAs` creates the context by hand, so Playwright never reaps it —
    // every other spec closes it here and these two did not. A context left
    // open holds its participant in the room long enough for the *next*
    // spec's `expectParticipants(1)` to see two, which is how a passing suite
    // starts failing somewhere it was never touched.
    await participant.context.close().catch(() => {});
  });

  test("every in-room state is clean", async ({ browser, meetingCode }) => {
    test.setTimeout(180_000);
    participant = await joinAs(browser, "Ama Serwaa", { code: meetingCode });
    const { page } = participant;

    expectClean(await scan(page), "the room, nothing open");

    // §3.4's panels — the surfaces the closed-room scan never reaches.
    await wakeControls(page);
    await page.getByRole("button", { name: "Chat" }).click();
    await expect(page.getByRole("textbox", { name: /message/i })).toBeVisible();
    expectClean(await scan(page), "the room, chat open");

    await page.keyboard.press("Escape");
    await wakeControls(page);
    await page.getByRole("button", { name: "Participants" }).click();
    expectClean(await scan(page), "the room, participants open");

    await page.keyboard.press("Escape");

    // The shortcuts dialog — a real modal, and the only trapped surface
    // reachable without breaking the connection.
    await page.keyboard.press("?");
    await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
    expectClean(await scan(page), "the room, shortcuts dialog open");
    await page.keyboard.press("Escape");
  });
});

test.describe("keyboard", () => {
  let participant: Participant;

  test.afterEach(async () => {
    if (!participant) return;
    await leave(participant).catch(() => {});
    // `joinAs` creates the context by hand, so Playwright never reaps it —
    // every other spec closes it here and these two did not. A context left
    // open holds its participant in the room long enough for the *next*
    // spec's `expectParticipants(1)` to see two, which is how a passing suite
    // starts failing somewhere it was never touched.
    await participant.context.close().catch(() => {});
  });

  /**
   * The bug this phase found: a keyboard user could open the participants
   * panel and not close it.
   *
   * `ParticipantsPanel` had no effect moving focus into itself, and its Escape
   * handler is `onKeyDown` on its own element — so React never saw the key
   * while focus sat on the trigger. `ChatPanel` focuses its composer on open,
   * which is why only one of the two was broken and why it went unnoticed.
   */
  test("a panel opened from the keyboard can be closed from the keyboard", async ({ browser, meetingCode }) => {
    participant = await joinAs(browser, "Kofi Mensah", { code: meetingCode });
    const { page } = participant;

    await wakeControls(page);
    const trigger = page.getByRole("button", { name: "Participants" });
    await trigger.focus();
    await page.keyboard.press("Enter");

    const panel = page.getByRole("tabpanel", { name: "People" });
    await expect(panel).toBeVisible();

    // Focus must be inside, or Escape below proves nothing.
    await expect
      .poll(async () => page.evaluate(() => {
        const el = document.activeElement;
        return el ? el.closest("aside[aria-label='Chat and people']") !== null : false;
      }))
      .toBe(true);

    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();

    // §9's floor: "Escape closes and returns focus to the trigger."
    await expect(trigger).toBeFocused();
  });

  /**
   * §9's discoverability hint: first focusable thing in the room, invisible
   * until it takes focus.
   */
  test("the shortcuts hint appears on the first Tab and opens the dialog", async ({ browser, meetingCode }) => {
    participant = await joinAs(browser, "Nana Adjei", { code: meetingCode });
    const { page } = participant;

    await page.evaluate(() => document.body.focus());
    await page.keyboard.press("Tab");

    const hint = page.getByRole("button", { name: /Press \? for keyboard shortcuts/ });
    await expect(hint).toBeFocused();
    // Rendered geometry, not a declared class: sr-only elements are clipped to
    // a 1px box, so a visible hint is one that is not.
    const box = await hint.boundingBox();
    expect(box?.height ?? 0, "the hint is still clipped while focused").toBeGreaterThan(20);

    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
  });

  /**
   * The control bar keeps working while a panel is open — PRD §3.4: "Controls
   * remain reachable when both panels are open." This is the requirement that
   * a literal focus trap would have broken, and the reason the floor now
   * distinguishes modal surfaces from live side panels.
   */
  test("the control bar stays reachable with a panel open", async ({ browser, meetingCode }) => {
    participant = await joinAs(browser, "Yaa Asantewaa", { code: meetingCode });
    const { page } = participant;

    await wakeControls(page);
    await page.getByRole("button", { name: "Chat" }).click();
    await expect(page.getByRole("textbox", { name: /message/i })).toBeVisible();

    await wakeControls(page);
    const mic = page.getByRole("button", { name: /^(Mute|Unmute)$/ });
    await expect(mic).toBeVisible();
    await mic.click();
    // The name flips because §9's floor names the action rather than a state.
    await expect(page.getByRole("button", { name: /Unmute/i })).toBeVisible();
  });
});

/**
 * The polite live region stays *visually* hidden while it is doing its job.
 *
 * BUILD-PLAN v1.2 A1 reported panel content painting a second time in the main
 * area and named this region as the likely cause. Measuring it says otherwise —
 * see PROGRESS — but the guard is worth having either way, because the failure
 * mode is silent in exactly the way this project keeps getting caught by: an
 * `sr-only` that stops applying breaks nothing, throws nothing, and simply
 * starts printing every announcement onto the room.
 *
 * §9 routes join, leave, chat, reaction and connection announcements through
 * one region, so a regression here is not one stray label — it is the whole
 * announcement stream rendered over the video.
 */
test.describe("live regions", () => {
  const open: Participant[] = [];

  test.afterEach(async () => {
    while (open.length) {
      const p = open.pop()!;
      await leave(p).catch(() => {});
      await p.context.close().catch(() => {});
    }
  });

  test("the room announcer never paints", async ({ browser, meetingCode }) => {
    const ama = await joinAs(browser, "Ama Serwaa", { code: meetingCode });
    open.push(ama);
    const { page } = ama;

    // A1 reported the leak with a panel open, so measure with one open.
    await wakeControls(page);
    await page.getByRole("button", { name: "Chat", exact: true }).click();
    await expect(page.getByRole("textbox", { name: /message/i })).toBeVisible();

    /**
     * Catch the region *while* it is carrying text, and measure it in the same
     * evaluation.
     *
     * The first version polled from the test side after a second participant
     * had joined, and could not be made reliable: an announcement is visible
     * for `ANNOUNCE_GAP_MS` and dropped after `ANNOUNCE_MAX_AGE_MS`, so by the
     * time `joinAs` returned and a round trip started the region was empty
     * again. It failed as "never carried an announcement to measure" — the
     * guard refusing to measure an empty box, which is what it is for.
     *
     * Installing the observer before the join removes the race rather than
     * widening the window: the page reports the box at the moment text appears,
     * with no round trip in between.
     */
    const measured = page.waitForFunction(
      () => {
        const region = document.querySelector("[data-live-region]");
        const text = region?.textContent?.trim() ?? "";
        if (!region || !text) return null;
        const box = region.getBoundingClientRect();
        return { text, width: box.width, height: box.height };
      },
      undefined,
      { timeout: 30_000, polling: 50 },
    );

    /**
     * Wait out the presence settle window before the second join.
     *
     * `usePresence` discards everything for `PRESENCE_SETTLE_MS` after the
     * connection goes healthy, because a LiveKit reconnect unwinds and re-adds
     * every remote participant and that burst arrives *after* the phase flips
     * back. A join inside that window is dropped on purpose.
     *
     * This test never noticed while the suite shared one room: Ama had been
     * connected for a while by the time anything else happened. In a room of
     * its own the two joins are seconds apart, and the announcement this
     * measures was being discarded exactly as designed.
     *
     * Imported rather than typed, so the test cannot drift from the constant it
     * is waiting on.
     */
    await page.waitForTimeout(PRESENCE_SETTLE_MS + 500);

    // Kofi's arrival is what puts text in it.
    const kofi = await joinAs(browser, "Kofi Mensah", { code: meetingCode });
    open.push(kofi);

    const paint = await measured.then((handle) => handle.jsonValue());
    expect(paint, "the live region never carried an announcement to measure").not.toBeNull();
    // Rendered geometry, not the class list: `sr-only` collapses the region to
    // a 1px box and clips the overflow, so a regression that leaves the text in
    // normal flow shows up here as a box the width of a sentence.
    expect(
      paint!.width,
      `the live region is laid out at its content width carrying "${paint!.text}" — sr-only is not applying`,
    ).toBeLessThanOrEqual(2);
    expect(paint!.height, "the live region is laid out at its content height").toBeLessThanOrEqual(2);
  });
});

import { endedCode, expect, scheduledCode, test } from "./fixtures";
import { generateMeetingCode } from "@/lib/meetings/code";
import { joinAs, leave, wakeControls, type Participant } from "./room.helpers";
import { assertFloor } from "./targets";

/**
 * Touch targets, measured in a browser.
 *
 * `CLAUDE.md`: "Touch targets are gated by **measuring rendered boxes in a
 * browser**, across the same state list Phase 9 uses for axe — not by resolving
 * size classes. A class-resolving check reads `h-11 w-11` and reports 44px
 * while a parent constraint, a conflicting utility, a transform, or a squeezed
 * flex child delivers something smaller."
 *
 * That is the whole reason this file exists and `scripts/check-targets.mjs`
 * does not. On its first run this found five undersized controls the deleted
 * script reported green: two fields at 32px, three device selectors at 32, a
 * 28px dialog close, and a link at 32 on the ended state. Reading a declared
 * value back is the mistake this project keeps making; the letterboxed tile
 * declared `aspect-ratio: 16/9` correctly and rendered 1956px into 1337px.
 *
 * The states are `a11y.spec.ts`'s, deliberately. A route with a panel open is a
 * different surface from the same route with it closed, and both are places a
 * control can be squeezed.
 *
 * **The floor is per surface, not global.** 44px on the room and pre-join —
 * touch-primary, used one-handed, mid-meeting — and WCAG 2.2 AA's 24px
 * elsewhere. Enforcing 44 on a desktop dashboard changes density for no
 * accessibility gain.
 */

/** Well-formed and not in the database, generated rather than typed. */
const UNKNOWN_CODE = generateMeetingCode();

const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 375, height: 812 };

/**
 * `atLeast` is a vacuity guard, not a count worth maintaining.
 *
 * Every filter in `measureTargets` can silently empty the set — a renamed
 * utility, a selector that stops matching, a page that renders a skeleton
 * because the wait was too short. Without a floor on what was *measured*, all
 * of those report a clean run. It fired on the first run for a good reason:
 * pre-join renders three controls here, not the five I guessed.
 */
const STATES = [
  { name: "the marketing page", floor: 24, atLeast: 3, path: () => "/" },
  /**
   * Pre-join as it lands: the permission prompt, the name field, and Join.
   *
   * The device selectors and the mic and camera toggles appear only once
   * permission is answered, which means real capture — so that half of the
   * screen is measured by `prejoin.spec.ts` in the serial `media` project.
   * Three is what this state renders, not a number lowered to make it pass.
   */
  { name: "pre-join", floor: 44, atLeast: 3, path: (live: string) => `/j/${live}` },
  { name: "a meeting that has ended", floor: 44, atLeast: 1, path: () => `/j/${endedCode()}` },
  { name: "a meeting not yet started", floor: 44, atLeast: 1, path: () => `/j/${scheduledCode()}` },
  { name: "an unknown code", floor: 44, atLeast: 1, path: () => `/j/${UNKNOWN_CODE}` },
  { name: "sign-in", floor: 24, atLeast: 2, path: () => "/sign-in" },
] as const;

test.describe("touch targets, by state", () => {
  for (const state of STATES) {
    test(`${state.name} clears its ${state.floor}px floor`, async ({ page, meetingCode }) => {
      // Both widths. A control squeezed by its parent is squeezed at the width
      // where the parent runs out of room, and that is not always the phone —
      // a fixed-width panel gets tighter as the window narrows around it.
      for (const viewport of [DESKTOP, PHONE]) {
        await page.setViewportSize(viewport);
        await page.goto(state.path(meetingCode));
        await page.waitForLoadState("networkidle");

        await assertFloor(page, {
          floor: state.floor,
          atLeast: state.atLeast,
          label: `${state.name} at ${viewport.width}px`,
        });
      }
    });
  }
});

test.describe("touch targets, in the room", () => {
  let participant: Participant;

  test.afterEach(async () => {
    if (!participant) return;
    await leave(participant).catch(() => {});
    await participant.context.close().catch(() => {});
  });

  test("every in-room state clears the 44px floor", async ({ browser, meetingCode }) => {
    test.setTimeout(180_000);
    participant = await joinAs(browser, "Ama Serwaa", { code: meetingCode });
    const { page } = participant;

    const at = (label: string) => assertFloor(page, { floor: 44, atLeast: 6, label });

    for (const viewport of [DESKTOP, PHONE]) {
      const where = `${viewport.width}px`;
      await page.setViewportSize(viewport);

      await wakeControls(page);
      await at(`the room, nothing open, at ${where}`);

      await wakeControls(page);
      await page.getByRole("button", { name: "Chat", exact: true }).click();
      await expect(page.getByRole("textbox", { name: /message/i })).toBeVisible();
      await at(`the room, chat open, at ${where}`);
      await page.keyboard.press("Escape");

      await wakeControls(page);
      await page.getByRole("button", { name: "Participants" }).click();
      await expect(page.getByRole("complementary", { name: "Participants" })).toBeVisible();
      await at(`the room, participants open, at ${where}`);
      await page.keyboard.press("Escape");

      await page.keyboard.press("?");
      await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
      await at(`the room, shortcuts dialog open, at ${where}`);
      await page.keyboard.press("Escape");
    }
  });
});

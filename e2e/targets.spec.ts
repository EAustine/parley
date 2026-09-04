import { expect, test } from "./fixtures";
import { signIn } from "./auth";
import { joinAs, leave, wakeControls, type Participant } from "./room.helpers";
import { EMPTY_DASHBOARD, PUBLIC_STATES, SIGNED_IN_STATES } from "./states";
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
 * The states come from `states.ts`, which axe walks too. They used to be the
 * same list by copy, which is the same list only until someone edits one of
 * them; the signed-in surfaces were in neither.
 *
 * **The floor is per surface, not global.** 44px on the room and pre-join —
 * touch-primary, used one-handed, mid-meeting — and WCAG 2.2 AA's 24px
 * elsewhere. Enforcing 44 on a desktop dashboard changes density for no
 * accessibility gain.
 */

const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 375, height: 812 };

/**
 * Both widths, every state.
 *
 * A control squeezed by its parent is squeezed at the width where the parent
 * runs out of room, and that is not always the phone — a fixed-width panel gets
 * tighter as the window narrows around it, and a wrapping toolbar gets tighter
 * as it widens into one row.
 */
const VIEWPORTS = [DESKTOP, PHONE];

test.describe("touch targets, by state", () => {
  for (const state of PUBLIC_STATES) {
    test(`${state.name} clears its ${state.floor}px floor`, async ({ page, meetingCode }) => {
      for (const viewport of VIEWPORTS) {
        await page.setViewportSize(viewport);
        await state.reach(page, meetingCode);
        await assertFloor(page, {
          floor: state.floor,
          atLeast: state.atLeast,
          label: `${state.name} at ${viewport.width}px`,
        });
      }
    });
  }
});

/**
 * The surfaces behind auth, which the 24px floor was written for.
 *
 * One sign-in per test rather than one per state: Supabase invalidates the
 * previous magic link when a new one is minted for the same address, so signing
 * in repeatedly is both slower and a race waiting to be written. Each state
 * still navigates for itself.
 */
test.describe("touch targets, signed in", () => {
  test("every signed-in state clears the 24px floor", async ({ page, hostedSchedule }) => {
    test.setTimeout(180_000);
    await signIn(page, hostedSchedule.email, "/dashboard");

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      for (const state of SIGNED_IN_STATES) {
        await state.reach(page, hostedSchedule.code);
        await assertFloor(page, {
          floor: state.floor,
          atLeast: state.atLeast,
          label: `${state.name} at ${viewport.width}px`,
        });
      }
    }
  });

  test("the empty dashboard clears the 24px floor", async ({ page, hostEmail }) => {
    await signIn(page, hostEmail, "/dashboard");

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await EMPTY_DASHBOARD.reach(page, undefined as never);
      await assertFloor(page, {
        floor: EMPTY_DASHBOARD.floor,
        atLeast: EMPTY_DASHBOARD.atLeast,
        label: `${EMPTY_DASHBOARD.name} at ${viewport.width}px`,
      });
    }
  });
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

  /**
   * The host's two extra surfaces — v1.3 B1.
   *
   * A separate test because they need a separate fixture: the sweep above
   * joins with `meetingCode`, which makes a guest, and a guest has no leave
   * menu at all. Every state a host can reach that a guest cannot would
   * otherwise never be measured — which is how the control bar itself once
   * shrank below the floor with a green check.
   *
   * The menu items are the interesting ones. They are two lines of text in a
   * button, so nothing about them is obviously 44px, and B1's whole argument
   * for a menu over a split button was about target size.
   */
  test("the host's leave menu and its dialog clear the 44px floor", async ({
    browser,
    hostedMeeting,
  }) => {
    test.setTimeout(180_000);
    participant = await joinAs(browser, "Abena Poku", {
      code: hostedMeeting.code,
      asHost: hostedMeeting.email,
    });
    const { page } = participant;

    for (const viewport of [DESKTOP, PHONE]) {
      const where = `${viewport.width}px`;
      await page.setViewportSize(viewport);

      await wakeControls(page);
      await page.getByRole("button", { name: "Leave", exact: true }).click();
      await expect(page.getByRole("menu", { name: "Leave options" })).toBeVisible();
      await assertFloor(page, {
        floor: 44,
        atLeast: 8,
        label: `the room, leave menu open, at ${where}`,
      });

      await page.getByRole("menuitem", { name: /End meeting for everyone/ }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await assertFloor(page, {
        floor: 44,
        atLeast: 2,
        label: `the room, end-meeting dialog open, at ${where}`,
      });
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }
  });
});

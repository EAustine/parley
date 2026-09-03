import { expect, type Page } from "@playwright/test";

import { endedCode, scheduledCode } from "./fixtures";
import { generateMeetingCode } from "@/lib/meetings/code";

/**
 * The state list, defined once and consumed by both checks that walk it.
 *
 * `CLAUDE.md` says touch targets are gated "across the same state list Phase 9
 * uses for axe". They were the same list by copy: `a11y.spec.ts` held one array
 * and `targets.spec.ts` held a hand-made duplicate, which is the same list
 * right up until someone adds a state to one of them. Now there is one array
 * and the sentence is structural rather than aspirational.
 *
 * **States, not routes.** BUILD-PLAN Phase 9: "a route with the chat panel
 * closed and the same route with it open are different accessibility surfaces".
 * The same is true of a target floor — a control can be squeezed by a layout
 * that only exists once something is open.
 *
 * The room states are not here. They need a second browser context and a real
 * join, so each spec builds them from `room.helpers`; what is shared is
 * everything reachable by navigating one page.
 */

/** Well-formed and not in the database, generated rather than typed. */
export const UNKNOWN_CODE = generateMeetingCode();

export type Theme = "light" | "dark";

/**
 * **The theme axis is declared, not typed out twice.**
 *
 * BUILD-PLAN v1.2: "The state list is states × themes, derived, not
 * hand-maintained. Marketing and sign-in are currently scanned in light only,
 * and that gap exists because the list is written by hand and someone has to
 * remember the second entry."
 *
 * That is exactly what happened: the signed-in states got a dark scan because
 * someone wrote a second test for them, and the three states nobody wrote a
 * second test for stayed light-only. A field cannot be forgotten the way a
 * duplicated test can.
 *
 * Only axe expands this axis. Geometry does not change with the palette, so the
 * touch-target check expands viewports instead and reads one theme — measured
 * rather than assumed: the same nine controls, to the pixel, in both.
 */
const RESPONSIVE: readonly Theme[] = ["light", "dark"];

/**
 * `/j/[code]` and `/room/[code]` carry `.dark` on the route-group wrapper
 * regardless of preference — rule 8b — so a light scan of them would be
 * checking a rendering the product cannot produce.
 */
const FORCED_DARK: readonly Theme[] = ["dark"];

type Reach<Ctx> = (page: Page, ctx: Ctx) => Promise<void>;

type State<Ctx> = {
  name: string;
  /** 44px on the room and pre-join surfaces, 24px elsewhere. */
  floor: 24 | 44;
  /**
   * How many controls this state renders — a vacuity guard for the target
   * check, which axe ignores.
   *
   * It is the state's real count, measured, not a number chosen to pass:
   * without it, a selector that stops matching or a page caught mid-render
   * reports clean. Four of these were 1 or 2 — placeholders that would have
   * accepted a page rendering almost nothing.
   */
  atLeast: number;
  /** Which palettes this surface can actually render in. */
  themes: readonly Theme[];
  reach: Reach<Ctx>;
};

/**
 * Reaching a state is `goto` plus `networkidle`, which is what the axe scan has
 * always done. Pre-join asks for devices on mount and the dashboard queries
 * Supabase on the server, so both need the settle; the target check polls on top
 * of it, because `networkidle` returned on pre-join while the device list was
 * still resolving.
 */
const at = (path: string) => async (page: Page) => {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
};

/** Public surfaces: no session, one meeting code from the test's own fixture. */
export const PUBLIC_STATES: State<string>[] = [
  { name: "the marketing page", floor: 24, atLeast: 5, themes: RESPONSIVE, reach: at("/") },
  /**
   * Pre-join as it lands: the permission prompt, the name field, and Join.
   *
   * The device selectors and the mic and camera toggles appear only once
   * permission is answered, which means real capture — so that half of the
   * screen is measured by `prejoin.spec.ts` in the serial `media` project.
   * Three is what this state renders, not a number lowered to make it pass.
   */
  { name: "pre-join", floor: 44, atLeast: 3, themes: FORCED_DARK, reach: (page, code) => at(`/j/${code}`)(page) },
  { name: "a meeting that has ended", floor: 44, atLeast: 1, themes: FORCED_DARK, reach: (page) => at(`/j/${endedCode()}`)(page) },
  { name: "a meeting not yet started", floor: 44, atLeast: 3, themes: FORCED_DARK, reach: (page) => at(`/j/${scheduledCode()}`)(page) },
  { name: "an unknown code", floor: 44, atLeast: 2, themes: FORCED_DARK, reach: (page) => at(`/j/${UNKNOWN_CODE}`)(page) },
  { name: "sign-in", floor: 24, atLeast: 5, themes: RESPONSIVE, reach: at("/sign-in") },
];

/**
 * The signed-in surfaces, reached in one session.
 *
 * These were in neither check until now — axe had never scanned a route behind
 * auth, so the target list inherited the gap. They are the 24px surfaces the
 * floor's split was written for: "Enforcing 44 on desktop dashboard and
 * scheduling screens changes visual density for no accessibility gain."
 *
 * One sign-in covers all of them. Each entry still navigates for itself, so a
 * state never depends on which one ran before it — except the editing state,
 * which is a click away from its own page and says so.
 */
export const SIGNED_IN_STATES: State<string>[] = [
  {
    name: "the dashboard, with an upcoming and a past meeting",
    floor: 24,
    atLeast: 9,
    themes: RESPONSIVE,
    reach: async (page) => {
      await at("/dashboard")(page);
      await expect(page.getByRole("heading", { name: "Meetings" })).toBeVisible();
    },
  },
  {
    name: "the schedule form",
    floor: 24,
    atLeast: 10,
    themes: RESPONSIVE,
    reach: async (page) => {
      await at("/schedule")(page);
      await expect(page.getByLabel("Title")).toBeVisible();
    },
  },
  {
    name: "a scheduled meeting",
    floor: 24,
    atLeast: 9,
    themes: RESPONSIVE,
    reach: async (page, code) => {
      await at(`/schedule/${code}`)(page);
      await expect(page.getByRole("heading", { name: "Meeting link" })).toBeVisible();
    },
  },
  {
    name: "a scheduled meeting, being edited",
    floor: 24,
    atLeast: 11,
    themes: RESPONSIVE,
    reach: async (page, code) => {
      await at(`/schedule/${code}`)(page);
      await page.getByRole("button", { name: "Edit" }).click();
      /*
       * Wait for the *form*, not for the button beside it.
       *
       * `MeetingSchedule` imports `ScheduleForm` with `next/dynamic`, so the
       * editing branch paints "Loading the form…" and its own Cancel button
       * before the chunk arrives. Waiting on the button measured a state with
       * four controls in it and would have reported the form clean without ever
       * seeing it.
       */
      await expect(page.getByLabel("Title")).toBeVisible();
      await expect(page.getByRole("button", { name: "Cancel editing" })).toBeVisible();
    },
  },
];

/**
 * The empty dashboard, which needs an account that owns nothing.
 *
 * Separate from the walk above because it is a property of the *account*, not
 * of a click: the same session cannot be both empty and populated. §3.10's
 * empty state is also the one place the dashboard renders an inline link inside
 * a sentence, which is the WCAG 2.2 target-size exception the measurement has
 * to honour rather than paper over.
 */
export const EMPTY_DASHBOARD: State<never> = {
  name: "the dashboard, with no meetings yet",
  floor: 24,
  atLeast: 5,
  themes: RESPONSIVE,
  reach: async (page) => {
    await at("/dashboard")(page);
    await expect(page.getByText("No meetings yet.")).toBeVisible();
  },
};

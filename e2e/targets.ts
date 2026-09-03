import { expect, type Page } from "@playwright/test";

import { settleAnimations } from "./room.helpers";

/**
 * Touch targets, measured in a browser rather than resolved from classes.
 *
 * `CLAUDE.md`: "Touch targets are gated by **measuring rendered boxes in a
 * browser**, across the same state list Phase 9 uses for axe — not by resolving
 * size classes. A class-resolving check reads `h-11 w-11` and reports 44px
 * while a parent constraint, a conflicting utility, a transform, or a squeezed
 * flex child delivers something smaller."
 *
 * That is why this exists and `scripts/check-targets.mjs` does not. The script
 * it replaces resolved `size="touch"` through the emitted stylesheet, which is
 * an improvement on reading the source and still not a measurement — and it
 * only ever scanned `<Button>` and raw `<button>`, so a 32px name field sat on
 * the pre-join screen under a green check. Reading a declared value back is the
 * mistake this project keeps making; the letterboxed tile declared
 * `aspect-ratio: 16/9` correctly and rendered 1956px into 1337px.
 *
 * **The floor is per surface, not global.** 44px on the room and pre-join —
 * touch-primary, used one-handed, mid-meeting — and WCAG 2.2 AA's 24px
 * elsewhere. Enforcing 44 on a desktop dashboard changes density for no
 * accessibility gain.
 *
 * Lives here rather than in one spec because pre-join has a state that needs
 * real devices: everything before the permission prompt is answered runs in the
 * `app` project, and the screen with the device selectors on it belongs to
 * `prejoin.spec.ts` in the serial `media` project.
 */

export type Result = { measured: number; undersized: string[]; seen: string[] };

/**
 * Every interactive element's **settled** box, against the floor for the
 * surface.
 *
 * Settled matters: `getBoundingClientRect` includes transforms, and a control
 * caught mid-hover is 1.04 of itself while a panel caught mid-entrance is
 * offset from where it lands. The target is the resting state.
 *
 * Two exclusions, both because the element is not a target rather than because
 * it is inconvenient:
 *
 * - **Nothing rendered.** `display:none`, `visibility:hidden`, or a zero box.
 *   A closed panel is `hidden`, so its composer and send button are not on the
 *   screen to be hit.
 * - **Clipped out of the visual layer.** `sr-only` collapses an element to 1px
 *   and clips it; the shortcuts hint and the live region are there for a screen
 *   reader and are not pointer targets. Detected by the clip, not by the class
 *   name — the class is what a regression would remove.
 *
 * Disabled controls are measured. They become enabled without changing shape,
 * and chat's Send is disabled until you type — excluding it would leave the
 * control this suite already caught rendering under the bar unmeasured.
 *
 * `seen` is returned so a failure can say what it looked at. A guard that
 * reports "nothing measurable" without naming what it did find sends you
 * looking for a rendering bug when the answer is a selector.
 */
export async function measureTargets(page: Page, floor: number): Promise<Result> {
  await settleAnimations(page);

  return page.evaluate((floor) => {
    const SELECTOR = [
      "a[href]", "button", "input", "select", "textarea", "summary",
      '[role="button"]', '[role="link"]', '[role="checkbox"]',
      '[role="switch"]', '[role="menuitem"]', '[role="tab"]', '[role="option"]',
    ].join(", ");

    const undersized: string[] = [];
    const seen: string[] = [];

    for (const el of document.querySelectorAll<HTMLElement>(SELECTOR)) {
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") continue;

      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;

      // The sr-only signature: clipped away rather than laid out.
      if (style.clipPath !== "none" || style.clip !== "auto") continue;

      const label =
        el.getAttribute("aria-label") ??
        el.getAttribute("placeholder") ??
        el.textContent?.trim().slice(0, 40) ??
        "";
      const named = `<${el.tagName.toLowerCase()}> ${label || "(no name)"}`;
      const size = `${Math.round(box.width)}x${Math.round(box.height)}`;

      seen.push(`${named} ${size}`);
      if (box.width < floor || box.height < floor) {
        undersized.push(`${named} ${size} < ${floor}px`);
      }
    }

    return { measured: seen.length, undersized, seen };
  }, floor);
}

/**
 * Wait for the state to finish rendering, then measure it.
 *
 * The wait and the vacuity guard are the same assertion. `networkidle` returned
 * on pre-join while the device list was still resolving, so the first version
 * measured three controls on a screen that renders eight — and a fixed sleep
 * would have been a guess at the same thing.
 */
export async function assertFloor(
  page: Page,
  { floor, atLeast, label }: { floor: number; atLeast: number; label: string },
) {
  let last: Result = { measured: 0, undersized: [], seen: [] };
  try {
    await expect
      .poll(async () => (last = await measureTargets(page, floor)).measured, {
        timeout: 15_000,
      })
      .toBeGreaterThanOrEqual(atLeast);
  } catch {
    throw new Error(
      `${label}: measured ${last.measured} controls, expected at least ` +
        `${atLeast} — the state never finished rendering, or a filter is ` +
        `excluding controls it should not.\n  saw: ${last.seen.join("\n       ") || "nothing"}`,
    );
  }

  expect(last.undersized, `${label}, floor ${floor}px`).toEqual([]);
}

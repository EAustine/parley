import { expect, test } from "./fixtures";
import { signIn } from "./auth";

/**
 * The native `<select>`, on three engines.
 *
 * BUILD-PLAN v1.2 replaced Radix's Select with a native control, and asked for
 * this: "Playwright drives Firefox and WebKit as well as Chromium, so add both
 * as projects for the closed-state geometry and styling. That catches gross
 * regressions cheaply and is worth doing regardless."
 *
 * **What this does not cover, and the same paragraph says so.** "Playwright's
 * WebKit is not Safari, and native form controls are precisely where they
 * diverge, because the rendering is the operating system's rather than the
 * engine's. The definitive closed-state check is a real Safari on a real Mac."
 * That, and the VoiceOver pass, are on `MANUAL.md`. A green run here is
 * evidence about three engines, not about the two things a person still has to
 * do.
 *
 * The *open* list is not tested and cannot be: it is drawn by the operating
 * system, outside the page, and no automation reaches into it. That is the
 * trade the swap accepted — an OS-drawn list nobody can style is also an
 * OS-drawn list nobody can get wrong.
 *
 * `/schedule` rather than pre-join, because pre-join's selectors appear only
 * after camera permission is granted, and the fake-device flags that make that
 * possible are Chromium's alone.
 */

const CONTROLS = ["Duration", "Timezone"] as const;

test.describe("the native select, closed", () => {
  test("is a real select, sized and styled the same on every engine", async ({
    page,
    hostEmail,
  }) => {
    test.setTimeout(120_000);
    await signIn(page, hostEmail, "/schedule");
    await expect(page.getByLabel("Title")).toBeVisible();

    for (const name of CONTROLS) {
      const select = page.getByLabel(name);

      // It is the platform control, not a button pretending. This is the whole
      // point of the swap: the two axe failures it removes are properties of
      // having a custom shell at all.
      await expect(
        select,
        `${name} is not a native <select>`,
      ).toHaveJSProperty("tagName", "SELECT");

      const box = await select.boundingBox();
      expect(box, `${name} did not render`).not.toBeNull();

      // §CLAUDE.md's floor for a document surface. Measured, not resolved.
      expect(
        box!.height,
        `${name} is ${Math.round(box!.height)}px tall, under the 24px floor`,
      ).toBeGreaterThanOrEqual(24);

      // It fills its column rather than shrinking to its longest option, which
      // is what a platform select does by default and what `w-full` prevents.
      // Firefox and WebKit size unstyled selects differently enough that this
      // is the assertion most likely to catch a real cross-engine regression.
      const column = await select.evaluate(
        (el) => el.parentElement?.parentElement?.getBoundingClientRect().width ?? 0,
      );
      expect(
        box!.width,
        `${name} is ${Math.round(box!.width)}px inside a ${Math.round(column)}px column`,
      ).toBeGreaterThan(column * 0.9);

      const style = await select.evaluate((el) => {
        const s = getComputedStyle(el);
        return {
          appearance: s.appearance,
          borderColor: s.borderTopColor,
          borderWidth: s.borderTopWidth,
        };
      });

      // The platform chevron is removed so ours can carry the icon language.
      // Every engine spells the computed value "none" once `appearance-none`
      // applies; a vendor-prefixed fallback would report something else.
      expect(style.appearance, `${name} still draws the platform chevron`).toBe("none");
      expect(style.borderWidth, `${name} has no visible border`).not.toBe("0px");
    }
  });

  /**
   * The border is `--boundary`, resolved from the page rather than typed.
   *
   * Separate from the geometry because it is a different claim: that the
   * control takes the token the palette assigns it, which is what stops a
   * native control drifting back to the platform's own grey. `--input` drew
   * this border until v1.2 and failed SC 1.4.11 at 1.25:1 in light.
   */
  test("takes the boundary token for its edge", async ({ page, hostEmail }) => {
    test.setTimeout(120_000);
    await signIn(page, hostEmail, "/schedule");
    await expect(page.getByLabel("Title")).toBeVisible();

    const measured = await page.evaluate(() => {
      const probe = document.createElement("span");
      probe.style.color = getComputedStyle(document.documentElement)
        .getPropertyValue("--boundary")
        .trim();
      document.body.append(probe);
      const boundary = getComputedStyle(probe).color;
      probe.remove();
      return boundary;
    });

    for (const name of CONTROLS) {
      const border = await page
        .getByLabel(name)
        .evaluate((el) => getComputedStyle(el).borderTopColor);
      expect(border, `${name}'s edge is not --boundary`).toBe(measured);
    }
  });
});

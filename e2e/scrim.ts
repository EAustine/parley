import { expect, type Page } from "@playwright/test";

import { settleAnimations } from "./room.helpers";

/**
 * What is actually drawn on the scrim, measured in a browser.
 *
 * `CLAUDE.md` says adding `scrim-over-white` to the permitted-surface matrix
 * means "any hued element, and any use of the theme-flipping `--foreground`,
 * fails the check instead of shipping". That is not what a permitted-surface
 * calculation does. The matrix answers *would this pairing pass*; it is never
 * shown a pairing that exists. `--state-critical` is simply absent from the
 * scrim's permitted list, and absence is not a failure — nothing asks.
 *
 * That gap shipped. `RoomControls` drew the device-error message as
 * `text-[var(--state-critical)]` on `background: var(--scrim)`: 2.53:1, in the
 * room, on the message that tells you your camera did not start. The matrix was
 * green throughout, because the matrix was never looking.
 *
 * This is the same lesson as `--input` drawing every field's border, and the
 * same lesson as the tile that declared `aspect-ratio: 16/9` and rendered 1956px
 * into 1337px: **the check has to assert the thing, not a proxy for it.** So
 * this walks the rendered DOM and asks, of every element that paints text or an
 * icon, whether the nearest background behind it is the scrim — and if it is,
 * what colour the browser actually resolved.
 *
 * A source scan cannot do this. The scrim is usually on a parent and the colour
 * on a child (`Tile` puts a gradient on the label row and `text-foreground` on
 * the span inside it), so the two never appear in one element's attributes.
 */

/** `--on-scrim` and `--on-scrim-muted`, the two theme-invariant values. */
const PERMITTED = ["rgb(242, 244, 247)", "rgb(198, 202, 209)"] as const;

export type ScrimText = {
  /** A short path, for naming the offender rather than merely counting it. */
  where: string;
  color: string;
  text: string;
};

/**
 * Every element painting text or an icon whose backdrop is the scrim.
 *
 * The ancestor walk stops at the first **opaque** background, which is what
 * makes the rule expressible at all: `ConnectionPill` sits inside the room
 * chrome but paints its own `--popover`, so it is not on the scrim and rule 4's
 * hued-chip exemption falls out of the geometry instead of an exception list.
 */
export async function measureScrimText(page: Page): Promise<ScrimText[]> {
  await settleAnimations(page);

  return page.evaluate(() => {
    // The composited value of `--scrim`, as the browser reports it in both
    // `background-color` and inside a `background-image` gradient.
    const SCRIM = "rgba(14, 16, 19, 0.72)";

    const alphaOf = (c: string) => {
      const m = c.match(/^rgba?\(([^)]+)\)$/);
      if (!m) return 1;
      const parts = m[1].split(",").map((p) => Number(p.trim()));
      return parts.length < 4 ? 1 : parts[3];
    };

    const isScrim = (s: CSSStyleDeclaration) =>
      s.backgroundColor === SCRIM || s.backgroundImage.includes(SCRIM);

    /** A stable-enough name: tag plus the first class that is not a utility. */
    const describe = (el: Element) => {
      const parts: string[] = [];
      let node: Element | null = el;
      for (let i = 0; node && i < 3; i += 1) {
        const id = node.id ? `#${node.id}` : "";
        parts.unshift(node.tagName.toLowerCase() + id);
        node = node.parentElement;
      }
      return parts.join(" > ");
    };

    const out: {
      where: string;
      color: string;
      text: string;
    }[] = [];

    for (const el of Array.from(document.querySelectorAll<HTMLElement>("*"))) {
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none") continue;
      if (!el.getClientRects().length) continue;

      // Only things that actually paint a foreground. An empty layout div
      // inherits a colour it never uses, and flagging it would be noise.
      const ownText = Array.from(el.childNodes).some(
        (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim() !== "",
      );
      const isIcon = el.tagName.toLowerCase() === "svg";
      if (!ownText && !isIcon) continue;

      // Walk up to the first painted background. If it is the scrim, this
      // element's text sits on video; if it is opaque, it does not.
      let node: Element | null = el;
      let onScrim = false;
      while (node) {
        const s = getComputedStyle(node);
        if (isScrim(s)) {
          onScrim = true;
          break;
        }
        if (alphaOf(s.backgroundColor) === 1) break;
        node = node.parentElement;
      }
      if (!onScrim) continue;

      out.push({
        where: describe(el),
        color: style.color,
        text: (el.textContent ?? "").trim().slice(0, 60),
      });
    }
    return out;
  });
}

/**
 * Rule 4, asserted.
 *
 * `atLeast` is the vacuity guard the target check taught this suite to carry:
 * a walk that matches nothing reports clean, and "no violations" and "no
 * elements" are the same green tick. A room state that stops rendering its
 * labels should fail here, not pass quietly.
 */
export async function assertScrimText(page: Page, atLeast: number) {
  const found = await measureScrimText(page);

  expect(
    found.length,
    `expected at least ${atLeast} elements drawn on the scrim — ` +
      "finding none means the walk is not reaching the room chrome, not that it is clean",
  ).toBeGreaterThanOrEqual(atLeast);

  const offenders = found.filter((f) => !PERMITTED.includes(f.color as never));

  expect(
    offenders,
    "Rule 4: only --on-scrim (#F2F4F7) and --on-scrim-muted (#C6CAD1) may be " +
      "drawn on --scrim. Hued state belongs on an opaque --popover chip, where " +
      "the background stops depending on what is on camera.\n" +
      offenders.map((o) => `  ${o.where}\n    ${o.color} — "${o.text}"`).join("\n"),
  ).toEqual([]);
}

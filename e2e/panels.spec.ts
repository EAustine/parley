import { expect, test } from "./fixtures";

import { joinAs, leave, wakeControls, type Participant } from "./room.helpers";

/**
 * §3.4's side panels, and the one-at-a-time rule from BUILD-PLAN v1.2 A3.
 *
 * Panel state used to be two independent booleans, so chat and participants
 * could be open together. Both are `absolute md:right-0 md:w-[360px]` at
 * `z-20`, so the second one to open landed exactly on top of the first and
 * nothing on screen distinguished "participants open" from "participants open
 * over a chat panel you forgot about".
 *
 * Each test takes its own meeting from the `meetingCode` fixture, so no
 * straggler from another spec can appear in the participants panel — there is
 * no other spec in this room.
 */
test.describe("the side panels", () => {
  let participant: Participant;


  test.afterEach(async () => {
    if (!participant) return;
    await leave(participant).catch(() => {});
    await participant.context.close().catch(() => {});
  });

  const chat = (p: Participant) =>
    p.page.getByRole("complementary", { name: "Meeting chat" });
  const people = (p: Participant) =>
    p.page.getByRole("complementary", { name: "Participants" });

  test("opening one panel closes the other", async ({ browser, meetingCode }) => {
    participant = await joinAs(browser, "Abena Poku", { code: meetingCode });
    const { page } = participant;

    await wakeControls(page);
    await page.getByRole("button", { name: "Chat", exact: true }).click();
    await expect(chat(participant)).toBeVisible();

    await wakeControls(page);
    await page.getByRole("button", { name: "Participants", exact: true }).click();
    await expect(people(participant)).toBeVisible();
    await expect(
      chat(participant),
      "chat is still open behind the participants panel",
    ).toBeHidden();

    // And back the other way, so this is not passing on DOM order alone.
    await wakeControls(page);
    await page.getByRole("button", { name: "Chat", exact: true }).click();
    await expect(chat(participant)).toBeVisible();
    await expect(
      people(participant),
      "participants is still open behind the chat panel",
    ).toBeHidden();
  });

  /**
   * The reason A3 is a correctness item and not a preference: §3.4 requires
   * the control bar to stay reachable while a panel is open, and mute is a
   * privacy control. Swapping panels must not cost that.
   */
  test("the control bar still works after swapping panels", async ({ browser, meetingCode }) => {
    participant = await joinAs(browser, "Kwame Nkrumah", { code: meetingCode });
    const { page } = participant;

    await wakeControls(page);
    await page.getByRole("button", { name: "Chat", exact: true }).click();
    await expect(chat(participant)).toBeVisible();

    await wakeControls(page);
    await page.getByRole("button", { name: "Participants", exact: true }).click();
    await expect(people(participant)).toBeVisible();

    await wakeControls(page);
    const mic = page.getByRole("button", { name: /microphone/i });
    await mic.click();
    await expect(page.getByRole("button", { name: /Turn on microphone/i })).toBeVisible();
  });

  /**
   * The panel reads as a surface — BUILD-PLAN v1.2 A1.
   *
   * A1 reported panel content "rendering a second time as grey floating text in
   * the main area". Measurement found no second copy and a correctly hidden
   * live region; what was actually wrong is that the panel had no perceptible
   * boundary, so a 360px column of text read as loose text on the room ground.
   *
   * The load-bearing assertion is the **edge**, not the fill. No fill in the
   * set can carry this: the surface ramp spans 1.09:1 to 1.29:1 against the
   * ground. Only `--tile-border` reads as an edge, and a later change to
   * `--border` would look reasonable in a diff and be invisible on screen at
   * 1.12:1 — so the ratio is computed here rather than the token name matched.
   *
   * Colours are resolved from the room's own custom properties, so this does
   * not go stale if the palette moves; it asserts the relationship.
   */
  test("the panel paints as a surface with a readable edge", async ({ browser, meetingCode }) => {
    participant = await joinAs(browser, "Nana Adjoa", { code: meetingCode });
    const { page } = participant;

    await wakeControls(page);
    await page.getByRole("button", { name: "Chat", exact: true }).click();
    await expect(chat(participant)).toBeVisible();

    const paint = await page.evaluate(() => {
      const panel = document.querySelector<HTMLElement>('aside[aria-label="Meeting chat"]')!;
      const room = document.querySelector<HTMLElement>(".relative.h-dvh")!;
      const cs = getComputedStyle(panel);
      // Resolve a token through a real element so both sides are rgb() and
      // comparable without parsing hex by hand.
      const resolve = (name: string) => {
        const probe = document.createElement("span");
        probe.style.color = getComputedStyle(room).getPropertyValue(name).trim();
        room.appendChild(probe);
        const value = getComputedStyle(probe).color;
        probe.remove();
        return value;
      };
      return {
        panelBackground: cs.backgroundColor,
        edgeWidth: parseFloat(cs.borderLeftWidth),
        edgeColour: cs.borderLeftColor,
        roomBackground: getComputedStyle(room).backgroundColor,
        popover: resolve("--popover"),
        ground: resolve("--background"),
        tileBorder: resolve("--tile-border"),
      };
    });

    expect(paint.panelBackground, "the panel is not on the popover plane").toBe(paint.popover);
    expect(paint.roomBackground).toBe(paint.ground);
    expect(paint.edgeWidth, "the room-facing edge has no width").toBeGreaterThanOrEqual(1);

    const ratio = (a: string, b: string) => {
      const lum = (c: string) => {
        const [r, g, bl] = c.match(/\d+/g)!.slice(0, 3).map(Number).map((v) => v / 255)
          .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
        return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
      };
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };

    /**
     * The ratios are the gate, and they come first deliberately.
     *
     * With the token-identity check above them, swapping the edge to
     * `--border` failed on the *name* and the ratios never ran — a defence
     * being reported as tested while something else did the work, which is the
     * `autolink` allow-list mistake in CLAUDE.md's testing rules. Verified by
     * mutation: with these first, `--border` fails here at 1.12:1 against the
     * fill.
     *
     * 3.33:1 and 2.89:1 as shipped.
     */
    expect(
      ratio(paint.edgeColour, paint.ground),
      "the edge does not read against the room ground",
    ).toBeGreaterThanOrEqual(3);
    expect(
      ratio(paint.edgeColour, paint.panelBackground),
      "the edge does not read against the panel fill",
    ).toBeGreaterThanOrEqual(2.5);

    // A backstop, not the defence: the ratios above are what fail first if the
    // edge stops reading. This says it is also the system's token, not a
    // one-off value that happens to clear the floor.
    expect(paint.edgeColour, "the edge is not --tile-border").toBe(paint.tileBorder);
  });


  /**
   * Escape returns focus to the control that opened the panel — §9's floor for
   * a non-modal panel. Worth pinning here because A3 moved that logic from two
   * per-panel closures onto one shared `closePanel`.
   */
  test("Escape closes the panel and returns focus to its trigger", async ({ browser, meetingCode }) => {
    participant = await joinAs(browser, "Efua Sutherland", { code: meetingCode });
    const { page } = participant;

    await wakeControls(page);
    const trigger = page.getByRole("button", { name: "Participants", exact: true });
    await trigger.click();
    await expect(people(participant)).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(people(participant)).toBeHidden();
    await expect(trigger).toBeFocused();
  });
});

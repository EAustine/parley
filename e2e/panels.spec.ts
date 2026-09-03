import { expect, test } from "@playwright/test";

import { emptyRoom } from "./livekit-admin";
import { LIVE_CODE, joinAs, leave, wakeControls, type Participant } from "./room.helpers";

/**
 * §3.4's side panels, and the one-at-a-time rule from BUILD-PLAN v1.2 A3.
 *
 * Panel state used to be two independent booleans, so chat and participants
 * could be open together. Both are `absolute md:right-0 md:w-[360px]` at
 * `z-20`, so the second one to open landed exactly on top of the first and
 * nothing on screen distinguished "participants open" from "participants open
 * over a chat panel you forgot about".
 *
 * This owns its own participants and empties the room first, because it
 * asserts panel visibility rather than counts and a straggler from another
 * spec would still change what the participants panel renders.
 */
test.describe("the side panels", () => {
  let participant: Participant;

  test.beforeAll(async () => {
    await emptyRoom(LIVE_CODE);
  });

  test.afterEach(async () => {
    if (!participant) return;
    await leave(participant).catch(() => {});
    await participant.context.close().catch(() => {});
  });

  const chat = (p: Participant) =>
    p.page.getByRole("complementary", { name: "Meeting chat" });
  const people = (p: Participant) =>
    p.page.getByRole("complementary", { name: "Participants" });

  test("opening one panel closes the other", async ({ browser }) => {
    participant = await joinAs(browser, "Abena Poku");
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
  test("the control bar still works after swapping panels", async ({ browser }) => {
    participant = await joinAs(browser, "Kwame Nkrumah");
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
   * Escape returns focus to the control that opened the panel — §9's floor for
   * a non-modal panel. Worth pinning here because A3 moved that logic from two
   * per-panel closures onto one shared `closePanel`.
   */
  test("Escape closes the panel and returns focus to its trigger", async ({ browser }) => {
    participant = await joinAs(browser, "Efua Sutherland");
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

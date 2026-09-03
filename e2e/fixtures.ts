import { test as base } from "@playwright/test";

import { emptyRoom } from "./livekit-admin";
import {
  createFixtureHost,
  createMeeting,
  deleteFixtureHost,
  deleteMeeting,
} from "./meeting-admin";

/**
 * `test` with a meeting of its own.
 *
 * `CLAUDE.md`: "A test owns its fixtures." A room is a fixture, and until now
 * every room test borrowed the same one — which is the whole reason the suite
 * ran serially. A test that declares `meetingCode` gets a freshly inserted live
 * meeting nobody else can reach, and it is torn down afterwards whether the
 * test passed, failed, or timed out.
 *
 * Declaring the fixture is what creates the row, so specs that never enter a
 * room — pre-join states, scheduling forms — simply do not ask for one and pay
 * nothing.
 *
 * The LiveKit room is deleted before the database row. A room outlives its
 * meeting on LiveKit's side until its own empty-timeout elapses, and while the
 * name can no longer collide with anything, leaving them to accumulate across
 * runs is untidy in an account we also watch for spend.
 */
export const test = base.extend<{ meetingCode: string; hostEmail: string }>({
  meetingCode: async ({}, use) => {
    const code = await createMeeting();
    await use(code);
    await emptyRoom(code).catch(() => {});
    await deleteMeeting(code);
  },

  /**
   * A signed-in account of this test's own, for the screens behind auth.
   *
   * The scheduling tests shared one account and signed in by minting a magic
   * link for it. Supabase invalidates the previous token when a new one is
   * generated, so two tests running at once raced: whichever consumed its token
   * second found it already dead and never reached the dashboard. Serial
   * execution hid it completely.
   *
   * It also stopped the tests writing meetings onto a real person's dashboard,
   * which they did by default — `CHECK_EMAIL` fell back to the developer's own
   * address.
   */
  hostEmail: async ({}, use) => {
    const host = await createFixtureHost();
    await use(host.email);
    await deleteFixtureHost(host.id);
  },
});

export { expect } from "@playwright/test";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. It is created by e2e/global-setup.ts — run the suite ` +
        "through `npm run check:media` rather than invoking a spec directly.",
    );
  }
  return value;
}

/**
 * The two read-only meetings global setup creates.
 *
 * Shared across workers on purpose: nothing joins them, so there is no room to
 * contend for and no composition to assert. They exist for `/j/[code]` to render
 * "this meeting has ended" and "not yet started".
 */
export const endedCode = () => required("PARLEY_E2E_ENDED_CODE");
export const scheduledCode = () => required("PARLEY_E2E_SCHEDULED_CODE");

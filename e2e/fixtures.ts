import { test as base } from "@playwright/test";

import { signIn } from "./auth";

/**
 * Long enough for the auth rate limit's window to move, short enough that a
 * genuinely broken sign-in still fails the run promptly. Five seconds is a
 * guess at the shape of a limit Supabase does not publish to us — the callback
 * flattens every rejection into one sentence — and is the number to revisit
 * once the dashboard's auth log has been read.
 */
const RETRY_PAUSE_MS = 5_000;
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
export const test = base.extend<
  {
  meetingCode: string;
  hostEmail: string;
  /**
   * A page already signed in as the run's shared fixture host.
   *
   * **One sign-in per worker instead of one per test**, and the reason is a
   * measured limit rather than tidiness. A full suite performs on the order of
   * a hundred and eighty magic-link sign-ins; the second full run of a calendar
   * day fails its last eighteen tests with "That link has expired or has
   * already been used", every one carrying `account: present`,
   * `callback requests: 1` and a fresh link that verifies on the spot. The
   * failures are positional — indices 178 to 194 of 195, nothing before — which
   * is a budget being crossed, not a flake.
   *
   * **It does not contradict "a test owns its fixtures".** `global-setup.ts`
   * already draws the line this follows: "Read-only fixtures are safe to share
   * across parallel workers… The live rooms are the ones that need owning." A
   * session is read-only in exactly that sense — a test that only *looks* at
   * signed-in screens cannot disturb another by looking. A test that creates
   * meetings, blocks somebody, or enumerates what this host owns still takes
   * its own account, because those are writes and the rule is about writes.
   *
   * Worker-scoped rather than global, deliberately. Playwright's `globalSetup`
   * is not guaranteed to run after `webServer`, and a sign-in needs a server to
   * sign in to; a worker fixture cannot race it.
   */
  signedInPage: import("@playwright/test").Page;
  hostedMeeting: { code: string; email: string };
  hostedSchedule: { code: string; email: string };
    namedHost: { code: string; email: string; name: string };
  },
  {
    /**
     * The signed-in cookies, minted once per worker and handed to every
     * `signedInPage` in it. Worker-scoped is the whole saving: Playwright forks
     * a handful of workers and reuses each across many tests.
     */
    sharedHostState: Awaited<ReturnType<import("@playwright/test").BrowserContext["storageState"]>>;
  }
>({
  sharedHostState: [
    async ({ browser }, use) => {
      /**
       * **Retried, and `e2e/auth.ts` deliberately is not — the arithmetic is
       * opposite here.**
       *
       * A blanket retry inside `signIn` was tried and removed: it fired on
       * every test, so a refusal rate doubled the requests against the very
       * endpoint refusing them, and of 26 retries **50 attempts failed twice**.
       * It made its own trigger more likely and recovered almost nothing.
       *
       * This one runs **once per worker** — four times in a full run, against
       * roughly a hundred and eighty before the migration — so a second attempt
       * is a rounding error in the request rate rather than a doubling of it.
       *
       * And its failure is now catastrophic where a test's is local. Ten of the
       * eleven failures in the run after the migration were *this fixture*: one
       * refusal no longer fails one test, it fails every test in the worker,
       * which is how `select` lost five and `waiting-queue` three with nothing
       * wrong in either. Concentrating the sign-ins is what made the suite
       * survivable; it is also what makes this the one place worth defending.
       *
       * **Spaced, not immediate.** The refusals arrive in bursts as a rolling
       * window fills, so retrying instantly retries into the same full window.
       * A few seconds is the difference between a second attempt and the same
       * attempt twice.
       *
       * Bounded at two tries. If a fresh link fails after a wait, that is not
       * the transient refusal and the run should say so rather than grinding.
       */
      const attempt = async () => {
        const context = await browser.newContext();
        const page = await context.newPage();
        try {
          // The run's own fixture host, created by global setup and published
          // for exactly this kind of reuse.
          await signIn(page, required("PARLEY_E2E_HOST_EMAIL"), "/dashboard");
          return await context.storageState();
        } finally {
          await context.close();
        }
      };

      let state;
      try {
        state = await attempt();
      } catch (first) {
        console.warn(
          `sharedHostState: sign-in refused, waiting ${RETRY_PAUSE_MS / 1000}s ` +
            `for the window to slide — ${(first as Error).message.split("\n")[0]}`,
        );
        await new Promise((resolve) => setTimeout(resolve, RETRY_PAUSE_MS));
        state = await attempt();
      }

      await use(state);
    },
    { scope: "worker" },
  ],

  signedInPage: async ({ browser, sharedHostState }, use) => {
    /*
     * A fresh context per test carrying the same cookies. The context is the
     * thing that must not be shared — two tests driving one page is a race —
     * and cookies are just data.
     */
    const context = await browser.newContext({ storageState: sharedHostState });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },

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

  /**
   * A meeting *and* the account that owns it.
   *
   * `meetingCode` and `hostEmail` are independent on purpose — most tests need
   * one or the other. Host-only surfaces need both to be the same person: §7
   * derives role from the session, so a participant is only the host if they
   * are signed in as the account on the meeting's `host_id`.
   *
   * Nothing in the suite had ever been the host of the meeting it was looking
   * at, so §3.8's asymmetry — a host can ask someone to mute and can remove
   * them, and can never unmute anyone — was covered only from the side that
   * cannot use it.
   */
  /**
   * A *scheduled* meeting and the account that owns it.
   *
   * `hostedMeeting` is live, because that is what a room test needs. The
   * signed-in surfaces need the other kind: a scheduled meeting is what puts a
   * row on the dashboard's upcoming list and what gives `/schedule/[code]`
   * something to render.
   *
   * A week out, relative to the run. A fixed date would age past the window the
   * dashboard sorts on, which is the failure two scheduling tests already had:
   * a fixture that is correct on the day it is written and wrong later.
   */
  hostedSchedule: async ({}, use) => {
    const host = await createFixtureHost();
    const start = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const code = await createMeeting({
      host: host.id,
      status: "scheduled",
      title: "Quarterly review",
      scheduledStart: start,
      scheduledEnd: new Date(start.getTime() + 30 * 60 * 1000),
      timezone: "Africa/Accra",
    });
    /*
     * And one that is over, so the dashboard renders both of its sections.
     *
     * `MeetingRow` is a different component in the past: the badges change and
     * Copy link and Join are gated out, leaving Details alone. A state list that
     * only ever sees an upcoming row has not seen the row markup that half the
     * dashboard is made of.
     */
    const week = 7 * 24 * 60 * 60 * 1000;
    await createMeeting({
      host: host.id,
      status: "ended",
      title: "Last month's retro",
      scheduledStart: new Date(Date.now() - week),
      scheduledEnd: new Date(Date.now() - week + 30 * 60 * 1000),
      endedAt: new Date(Date.now() - week + 30 * 60 * 1000),
      timezone: "Africa/Accra",
    });
    /*
     * And one that is happening — v1.3 D1.
     *
     * The live block is a card, not a row: its own boundary, a dot, an elapsed
     * time and a primary Join. Without a live meeting in the fixture it renders
     * for nobody, and the axe walk and the target walk would both go green over
     * a surface neither had ever seen. That is exactly how C1's self-view
     * nearly shipped unscanned, one item earlier.
     */
    await createMeeting({
      host: host.id,
      status: "live",
      title: "Design review",
      timezone: "Africa/Accra",
    });
    await use({ code, email: host.email });
    // `host_id` is `on delete cascade`, so the meeting goes with the account.
    await deleteFixtureHost(host.id);
  },

  hostedMeeting: async ({}, use) => {
    const host = await createFixtureHost();
    const code = await createMeeting({ host: host.id });
    await use({ code, email: host.email });
    await emptyRoom(code).catch(() => {});
    await deleteFixtureHost(host.id);
  },

  /**
   * A host whose account already knows what it is called.
   *
   * Every other fixture host is nameless, the way a magic-link account is:
   * §3.1's other door is Google, which fills `user_metadata.full_name` from the
   * profile, and nothing in the product writes it afterwards. So the branch
   * where an account *does* carry a name — every Google host — had no way to be
   * exercised, and "pre-join stops asking once you have a name" would have been
   * an untested claim in the fix that stopped a host's email address becoming
   * their display name.
   *
   * The name carries a bidi override on purpose. `full_name` is writable by the
   * account holder, so it is untrusted string data arriving by a different road
   * than the join field, and it now goes through the same `sanitiseDisplayName`
   * — the character is stripped, and the tests assert the stripped form.
   *
   * Written as an escape, never as a literal byte: `identity.ts` makes the same
   * point about its own pattern, and a control character typed into a fixture
   * is invisible in every diff and review that will ever look at it.
   */
  namedHost: async ({}, use) => {
    const host = await createFixtureHost({ fullName: "Kofi\u202EMensah" });
    const code = await createMeeting({ host: host.id });
    await use({ code, email: host.email, name: "KofiMensah" });
    await emptyRoom(code).catch(() => {});
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
/**
 * A meeting with the door on and no host — v1.5.
 *
 * Nobody can enter it, which is what makes it shareable: the first gate holds
 * every visitor, so there is no room to contend for.
 */
export const gatedCode = () => required("PARLEY_E2E_GATED_CODE");

/**
 * The run's shared fixture host, for tests that assert *which* account is
 * signed in — the landing page names it, and a page claiming the wrong address
 * would be a real defect.
 *
 * Published by `global-setup.ts`, the same way the read-only meeting codes are.
 */
export const sharedHostEmail = () => required("PARLEY_E2E_HOST_EMAIL");

/**
 * The shared fixture host's id, for tests that need to write a row *about* that
 * host — a session with `identity: user_<id>`, say. Published by global setup
 * alongside the email.
 */
export const sharedHostId = () => required("PARLEY_E2E_HOST_ID");

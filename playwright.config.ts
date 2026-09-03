import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Real Chrome, real WebRTC, real tracks through the real SFU.
 *
 * BUILD-PLAN Phase 4 asks for "two browsers … see and hear each other" and
 * "every grid breakpoint … by opening real tabs, not by faking participant
 * counts". This automates the opening of tabs, which is what that criterion
 * asks for — nothing here stubs a participant, a track, or a count.
 *
 * The flags are Chrome's own synthetic capture devices:
 *
 *   --use-fake-device-for-media-stream   a rolling test pattern and audio
 *   --use-fake-ui-for-media-stream       auto-accepts the permission prompt
 *   --use-file-for-fake-audio-capture    our speech recording, looped
 *
 * The audio file is the point. Chrome's built-in tone is a clean periodic beep
 * that crosses any threshold instantly and never stops, so a speaking detector
 * wired to nothing at all would look perfect. `npm run fixtures:media` builds a
 * recording with speech, silences, and a cough instead.
 */

const SPEECH = resolve("e2e/fixtures/speech.wav");

// Chrome does not complain about a missing file here — it quietly falls back to
// its built-in tone, which crosses any threshold instantly and never stops. The
// speaking test would then pass against a detector wired to nothing. A fixture
// that degrades in silence is worse than one that is absent, so this is loud.
if (!existsSync(SPEECH)) {
  throw new Error(
    `Missing ${SPEECH}. Run \`npm run fixtures:media\` — without it Chrome ` +
      "substitutes a continuous tone and the speaking-ring test proves nothing.",
  );
}
const PORT = 3210;

export default defineConfig({
  testDir: "e2e",
  /**
   * Parallel, because tests no longer share a room.
   *
   * This was `workers: 1` with the note that "these tests share one meeting
   * room, and participants from a parallel worker would show up in another
   * worker's grid and break its count". That was true and the serialism was the
   * right response to it — but the sharing was the defect, not the parallelism.
   * `CLAUDE.md` says a test owns its fixtures, and a room is a fixture. Each
   * test now takes its own meeting from the `meetingCode` fixture, so a
   * participant from another worker cannot appear in this one's grid: it is not
   * a different likelihood, it is a different room.
   *
   * Four workers rather than the default seven (half of fourteen cores). The
   * binding constraint is not CPU, it is `grid.spec.ts`, whose breakpoint sweep
   * puts **seventeen** simultaneous contexts in one room; every other test uses
   * at most two. Four workers therefore peaks around 17 + 3x2 = 23 contexts.
   * Most of the seventeen join with `withMedia: false`, which is why that test
   * is affordable at all.
   *
   * Workers x participants is also the number that has to stay under LiveKit
   * Cloud's concurrent-participant ceiling. At ~23 there is generous headroom
   * against any current plan, but the figure is per-project and not readable
   * from the SDK — check it on the LiveKit Cloud dashboard under the project's
   * limits before raising this. Exceeding it surfaces as joins timing out,
   * which looks exactly like a race condition and is not one.
   */
  workers: 4,
  fullyParallel: true,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: [["list"]],

  use: {
    baseURL: `http://localhost:${PORT}`,
    permissions: ["camera", "microphone"],
    launchOptions: {
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
        // §3.7. `getDisplayMedia` normally opens a picker no automation can
        // answer; this selects a source and returns a real display track —
        // real capture, real `ended` event, real publish through the SFU.
        "--auto-select-desktop-capture-source=Entire screen",
        `--use-file-for-fake-audio-capture=${SPEECH}`,
        // Without this Chrome throttles rendering and media in backgrounded
        // pages, and every context after the first is backgrounded.
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
        "--autoplay-policy=no-user-gesture-required",
      ],
    },
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",

  webServer: {
    // The production build, not `next dev`. Bundle behaviour is what rule 8 is
    // about, and a dev server chunks differently.
    command: `npm run build && npx next start -p ${PORT}`,
    port: PORT,
    // Never reuse. The command above *builds*, so reusing a server skips the
    // build and runs the suite against whatever was on disk last time — which
    // is how a fix that worked produced a confusing failure, and would just as
    // easily let a broken one pass. A rebuild costs about forty seconds; a
    // result that describes code you did not write costs more than that.
    reuseExistingServer: false,
    timeout: 300_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});

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

/**
 * The specs whose assertions depend on media actually *flowing* — decoded video
 * frames, a speaking detector fed by real audio, a shared surface sampled
 * through a canvas. Everything else publishes tracks too, but nothing else
 * fails when a track is merely slow.
 */
const REAL_MEDIA = [
  "media.spec.ts",
  "share.spec.ts",
  "prejoin.spec.ts",
  // A3. Asserts that a tile paints again after the camera is toggled, which is
  // a claim about decoded frames and not about DOM state — the same contention
  // that made media.spec's "frozen frame" flake applies here exactly.
  "camera.spec.ts",
  /*
   * `mobile.spec` is deliberately **not** here, and the reason is worth keeping.
   *
   * Its share-region test failed three times with a `NaN` picture, and I read
   * that as four-worker contention and moved the file across. It then failed
   * again at one worker — so the diagnosis was wrong. The test waited a fixed
   * 500ms for a frame to decode and simply lost a race that contention made
   * more likely; it now polls for a non-zero `videoHeight`.
   *
   * Serialising would have hidden it rather than fixed it, and hidden it in the
   * shape that is hardest to notice: a green suite that is slower for a reason
   * nobody can reconstruct.
   */
  /*
   * `chat.spec` measures wall-clock delivery from a keypress in one browser to
   * the text appearing in another, and its own comment concedes the weakness:
   * "Playwright's own round trips are in the measurement". Under four workers
   * that overhead dominates — 3313ms and 3317ms against a 3000ms bound on two
   * separate full runs, and 197ms and 199ms alone.
   *
   * Serialising removes the contention rather than relaxing the bound, which is
   * the rule. The bound is the point: a 3000ms ceiling on a 500ms target is
   * already an upper bound on an upper bound, and moving it to fit a saturated
   * harness would leave nothing that could fail.
   *
   * The deeper fix is to measure in-page — `Date.now()` at dispatch in the
   * sender and at arrival in the receiver, with no harness IPC between — which
   * would let this run parallel again. Worth doing; not worth doing inside a
   * change about panels.
   */
  "chat.spec.ts",
];

/**
 * Chromium's synthetic capture, and the permissions that go with it.
 *
 * Per project rather than global: Firefox and WebKit do not understand these
 * arguments, and the cross-engine projects below need neither media nor a
 * permission grant — they measure a form control on a page with no camera on it.
 */
const CHROMIUM_MEDIA = {
  args: [
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
    // §3.7. `getDisplayMedia` normally opens a picker no automation can answer;
    // this selects a source and returns a real display track — real capture,
    // real `ended` event, real publish through the SFU.
    "--auto-select-desktop-capture-source=Entire screen",
    `--use-file-for-fake-audio-capture=${SPEECH}`,
    // Without these Chrome throttles rendering and media in backgrounded pages,
    // and every context after the first is backgrounded.
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--autoplay-policy=no-user-gesture-required",
  ],
};

const CAMERA_AND_MIC = ["camera", "microphone"];

/**
 * The spec that runs on all three engines.
 *
 * Deliberately one file, and deliberately not a media one. Everything else in
 * the suite either publishes tracks, grants camera permission, or reads the
 * clipboard — none of which Firefox and WebKit can do the way Chromium's flags
 * make possible. This one signs in and measures a `<select>`.
 */
const CROSS_ENGINE = ["select.spec.ts"];

/** Playwright's device presets, by engine. */
const ENGINE_DEVICE = {
  chromium: "Desktop Chrome",
  firefox: "Desktop Firefox",
  webkit: "Desktop Safari",
} as const;

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
  },

  projects: [
    /**
     * Four projects, and the split is not arbitrary.
     *
     * **The Chrome flags moved out of the global `use` block.** They were
     * inherited by every project, and every project was Chromium, so nothing
     * noticed — but `--use-fake-device-for-media-stream` means nothing to
     * Firefox or WebKit, and a global launch argument is exactly the kind of
     * thing that fails at browser start with a message about the wrong subject.
     * They belong to the engine that understands them.
     */
    {
      name: "app",
      use: { ...devices["Desktop Chrome"], permissions: CAMERA_AND_MIC, launchOptions: CHROMIUM_MEDIA },
      testIgnore: [...REAL_MEDIA, ...CROSS_ENGINE].map((f) => `**/${f}`),
    },
    /**
     * BUILD-PLAN v1.2: "Contention flakes are fixed by removing the contention,
     * not by lowering the worker count." `media.spec`'s video test failed once
     * under four workers with "tile 1 is a frozen frame" and passed seven times
     * in isolation immediately after. That is an understood failure mode, and
     * an understood failure mode still has to be made deterministic — a suite
     * that is re-run until green is a suite that teaches you to ignore it.
     *
     * Playwright has no per-project worker count, so the split is expressed as
     * two runs rather than as one config value — see `check:media`.
     */
    {
      name: "media",
      use: { ...devices["Desktop Chrome"], permissions: CAMERA_AND_MIC, launchOptions: CHROMIUM_MEDIA },
      testMatch: REAL_MEDIA.map((f) => `**/${f}`),
      fullyParallel: false,
    },
    /**
     * The same spec on three engines.
     *
     * BUILD-PLAN v1.2, on replacing Radix's Select with a native one: "Playwright
     * drives Firefox and WebKit as well as Chromium, so add both as projects for
     * the closed-state geometry and styling. That catches gross regressions
     * cheaply and is worth doing regardless."
     *
     * And, in the same breath, what this does not settle: "Playwright's WebKit
     * is not Safari, and native form controls are precisely where they diverge,
     * because the rendering is the operating system's rather than the engine's.
     * The definitive closed-state check is a real Safari on a real Mac." That
     * one is on the manual list, and this does not discharge it.
     *
     * Chromium runs the same file so the three results are comparable — a
     * cross-engine check with no baseline engine tells you two browsers agree
     * with each other and nothing about whether either is right.
     */
    ...(["chromium", "firefox", "webkit"] as const).map((engine) => ({
      name: `select-${engine}`,
      use: { ...devices[ENGINE_DEVICE[engine]] },
      testMatch: CROSS_ENGINE.map((f) => `**/${f}`),
    })),
  ],

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

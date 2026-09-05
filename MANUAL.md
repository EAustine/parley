# Manual verification

One standing list of the verification this project's automated suite cannot
reach.

`PROGRESS.md` remains the record and is unchanged by this file. Every item below
is carried forward from an entry there or from `BUILD-PLAN.md` — the reasoning
lives at the original entry, and this is a consolidated view rather than a
replacement. Nothing here is upgraded to verified that PROGRESS does not already
call verified.

Grouped by what a person has to do, not by the phase that first noticed it. An
item that is closed stays listed, with the evidence PROGRESS gives for closing
it, because a list that only holds open items loses the record of what was once
open and why.

---

## Status vocabulary

Taken from PROGRESS. There is no fifth value.

- **needs a human** — not produced, not seen. No claim in either direction.
- **logic covered, unconfirmed** — the ladder, the classifier or the pure
  function is asserted against the behaviour browsers document. Not the same as
  having seen it.
- **shape verified, browser unconfirmed** — the state was driven through the
  real React tree with the API made to behave that way. Proof the code responds
  correctly; not proof the browser behaves that way.
- **verified** — bolded, with the evidence in parentheses.

The permission matrix's own instruction governs the whole file: an untested path
noted is fine, an untested path assumed working is not.

---

## 1. Media and networking

- **Cross-network media and the TURN relay** — needs a human.
  Every automated context shares one network path, so the connections that need
  a relay are exactly the ones the suite never exercises. `BUILD-PLAN.md` puts
  it at 10–20% of connections. Two machines on genuinely different networks, one
  of them on a phone hotspot, joining the same meeting and holding a
  conversation.

- **Audio being audible** — needs a human.
  A subscribed track is not the same claim as a working speaker path.
  `check:media` proves tracks publish and subscribe through the real SFU;
  nothing between the decoder and a speaker is exercised. Two machines, sound
  on, one person talks and the other confirms hearing it.

- **Speaking-ring tuning** — needs a human.
  Automation proves the ring fires and does not chatter — see the closed item
  below — but a threshold is a judgement about a real room. A real microphone,
  a normal speaking voice, background noise, and someone watching whether the
  2px ring tracks who is actually talking.

- **Device switching mid-call** — needs a human.
  Real hardware and real enumeration changes. Plug in and unplug a headset, a
  USB camera and an external microphone while connected, and confirm the room
  follows the new device and the selection persists.

- **`ConnectionQuality.Poor`** — logic covered, unconfirmed.
  Quality is the server's verdict delivered over the signalling socket, so
  killing the network locally produces *no* quality updates rather than a bad
  one. The amber pill's mapping is exercised in `check:connection` as a pure
  function and nowhere else. A genuinely degraded real network — a weak mobile
  signal, or a link deliberately throttled — long enough for LiveKit to issue
  the verdict.

- **True media-path loss, ICE restart and relay recovery** — needs a human.
  `setOffline` reaches Chromium's network service — HTTP and the signalling
  socket — and not an established PeerConnection, whose ICE/DTLS/SRTP run
  through the P2P path. The e2e exercises the signalling half of an outage,
  which is what drives the bar, the count and the recovery. `BUILD-PLAN.md`
  asks for the whole thing: kill the network for ten seconds mid-call and
  restore it, and confirm the call recovers without a page reload.

- **The autoplay fallback** — needs a human.
  Untestable under the current config:
  `--autoplay-policy=no-user-gesture-required` is the flag that makes every
  other media test work and the flag that makes blocked playback unreachable.
  Join a room in a browser with default autoplay policy and no prior gesture on
  the origin, and confirm the "Enable audio" prompt appears and works.

- **Picking a specific window or tab to share** — needs a human.
  Automation selects "Entire screen" through a flag, so the picker's own
  behaviour is never exercised. Share a single window, then a single tab, and
  look at what Chrome's own sharing bar does over a real page.

- **Audio share** — needs a human.
  §3.7 asks for it "where supported" and the request is made; Chrome only offers
  tab audio. Whether it is audible at the other end is the same speaker-path
  question as above. Share a tab playing sound, with a second machine listening.

---

## 2. Permission states

The classifier, the acquisition ladder and the per-browser hint copy are
asserted exhaustively — `check:permissions` is 39 assertions, and every one
added in the second revision was proved able to fail by reverting its fix. What
cannot be produced from a script
is the condition itself: the Browser pane blocks capture outright, and there is
no camera to unplug or hold open and no prompt to close by hand.

Status as PROGRESS records it after the second revision:

| Row | Chrome | Safari |
|---|---|---|
| Granted | needs a human | needs a human |
| Denied | **verified** (real block, production build) | needs a human |
| Dismissed | needs a human | shape verified, browser unconfirmed |
| Dismissed ×3 (embargo) | logic covered, unconfirmed | n/a |
| No device | logic covered, unconfirmed | logic covered, unconfirmed |
| In use | logic covered, unconfirmed | logic covered, unconfirmed |

How to produce each state on macOS, from `BUILD-PLAN.md`'s matrix:

| State | How to produce it |
|---|---|
| Granted | Allow the prompt |
| Denied | Address bar padlock → Camera → Block, then reload |
| Dismissed | Press Escape on the prompt, or click outside it. Distinct from Denied: the promise never resolves with a decision, and Chrome auto-blocks after three dismissals — so test the third one too |
| No device | System Settings → Screen Time → Content & Privacy → App Restrictions → uncheck Camera. This genuinely hides it from the browser; unplugging is not an option on a laptop |
| In use | Hard to reproduce on macOS, which permits concurrent camera access where Windows does not. Try holding it in Safari while testing Chrome. If it cannot be produced, record it as untested rather than passing |

Run the whole matrix in **Chrome and Safari**. Safari's permission model is
per-session by default and its gesture requirements are stricter, so states that
look identical in Chrome diverge there.

Two things to watch while working the rows:

- **The denied copy is the deliverable.** It must name where the setting lives,
  and that location differs per browser. Chrome's was confirmed in situ on a
  production build; Safari's, and the iOS branch naming the ᴀA button and the
  Settings app rather than a menu bar iPhones do not have, were not.
- **The dismissed → denied escalation in Safari.** Safari has no `camera`
  descriptor in its Permissions API, so the hint that separates "refused" from
  "closed the prompt" is permanently `null` there. The escalation was driven
  through the real React tree with the Permissions API made to throw the way
  Safari's does — idle → "No answer yet" with a retry → "blocked" with the retry
  withdrawn. That proves the code responds correctly; it is not proof that
  Safari behaves that way.

---

## 3. Screen reader and assistive technology

- **The entire Phase 9 announcement policy** — needs a human.
  No screen reader has heard any of it. The queue's ordering, the batching
  phrasing, the suppression during reconnect, whether "2 people joined" lands
  usefully in a real room — all verified as arithmetic and not as sound. axe
  reaches perhaps a third to a half of WCAG and is blind to exactly this: it
  confirms a name exists, not that it means anything; that elements are
  focusable, not that the order is sensible; that a live region is present, not
  that its output is usable. **VoiceOver with Safari** (Cmd+F5) in a room with
  enough people to make the batching matter — more than three joins inside five
  seconds, and a room above eight participants where announcements are
  suppressed entirely.

- **The keyboard traverse of every state, by hand** — needs a human.
  `BUILD-PLAN.md` names it as one of two real deliverables for Phase 9 and
  PROGRESS quotes that line without recording it as done. Tab through every
  state on the Phase 9 list — panel open, modal open, reconnect overlay, each
  permission failure, the ended and cancelled join pages — confirming every
  control is reachable, the ring is visible at 2px offset, Escape returns focus
  to the trigger, and the control bar stays reachable with a panel open.

- **VoiceOver with Safari on the native `<select>`, before and after the swap**
  — needs a human.
  Five instances — three device selectors behind one `DeviceSelect` in pre-join,
  duration and timezone in schedule — moved from Radix `Select` to a native
  control. The swap's stated accessibility argument is that native selects have
  the deepest, best-tested assistive-technology support of any form control, and
  that argument has never been heard. `BUILD-PLAN-v1.2.md` asks for the
  comparison directly: how each announces **its role, its current value, and the
  option list**. Check out the pre-swap commit, listen to all five, then do the
  same on the current build and write down what changed. A screen reader pass
  cannot be automated at all — this is the one item on the list with no
  automated component whatsoever.

- **`prefers-reduced-motion` against the new dialogs** — needs a human.
  Recorded as untested at the end of Phase 9 alongside the mobile layouts. Turn
  on Reduce Motion in System Settings and open every dialog, panel and sheet,
  confirming travel is removed and opacity is kept.

---

## 4. Cross-browser and cross-engine

- **Speaker selection hidden in Safari** — needs a human.
  v1.3 B2 says "feature-detect and hide rather than showing a control that does
  nothing", and `lib/media/output.ts` reads `setSinkId` off
  `HTMLMediaElement.prototype`. `e2e/devices.spec.ts` asserts the control count
  equals the browser's own answer rather than a hard-coded one, so the *linkage*
  is tested — and mutation confirms it: forcing the detection to `false` fails
  the test in Chromium, where the capability exists.

  What Chromium cannot test is the direction the rule was written for. There,
  `setSinkId` is present, so "shown when supported" and "always shown" are the
  same rendering. Only an engine without it separates them, and Playwright's
  WebKit is not Safari — native media routing is precisely where they diverge.
  Open pre-join and the room's audio-and-video settings in a real Safari and
  confirm the Speaker control is **absent**, not disabled and not empty.

Playwright projects now exist for Firefox and WebKit as well as Chromium
(`select-chromium`, `select-firefox`, `select-webkit` in `playwright.config.ts`,
running `e2e/select.spec.ts`), covering the native select's closed-state
geometry and styling on three engines. Chromium runs the same file so the three
results are comparable. **That catches gross regressions cheaply and discharges
neither item in this section.**

- **The native select's closed state in a real Safari on a real Mac** — needs a
  human.
  Playwright's WebKit is not Safari, and native form controls are precisely
  where they diverge, because the rendering is the operating system's rather
  than the engine's. A green `select-webkit` run says WebKit agrees with itself.
  Open `/j/[code]` and `/schedule` in Safari on macOS and look at all five
  controls: the `appearance: none` closed state, the chevron, the focus ring,
  the text baseline, and the dark ground. Then open one — the list is
  OS-rendered, which is a known and accepted inconsistency, but it should be
  seen rather than assumed.

- **Safari's permission behaviour** — see §2. Every Safari row in the matrix is
  open except the one marked shape-verified, and Safari is the browser where the
  Permissions API gap changes what the screen can honestly say.

---

## 5. Calendar clients

- **Importing the `.ics` into Google Calendar, Apple Calendar and Outlook** —
  needs a human.
  `BUILD-PLAN.md` asks for all three by name. The file is correct against the
  spec and checked line by line — `check:ics` is 69 assertions covering CRLF,
  75-octet folding, TEXT escaping and the `SEQUENCE` increments, each
  mutation-tested — but "valid" and "imports cleanly" are different claims and
  only one of them can be made from here. The failure mode is silent: a client
  that dislikes a file imports nothing and says nothing. Download the file from
  `/api/meetings/[code]/ics` and add it to each of the three clients, then edit
  the meeting and re-import to confirm the update lands on the same event rather
  than creating a second, and cancel it to confirm the cancellation is honoured.

- **The prefill links opening a real composer** — needs a human.
  Both the Google Calendar and Outlook Web prefill URLs are undocumented
  query-string conventions. The parameters are pinned by `check:ics`, but
  whether Google and Outlook still honour them needs clicking. Click both from
  `/schedule/[code]` and confirm the composer opens with title, time, zone and
  join link already filled.

---

## 6. Mobile devices

- **The whole flow on iPhone Safari and Android Chrome** — needs a human.
  This is `BUILD-PLAN.md`'s Phase 10 acceptance criterion and the umbrella for
  the three items below: join from a link, hold a meeting, background the tab
  mid-call and return. Emulated viewports in Playwright are geometry, not a
  device.

- **The mobile pager and panel layouts on a real touch device** — needs a human.
  Recorded as untested at the end of Phase 9. Real fingers, one-handed, with the
  home indicator and the safe-area insets actually present rather than
  emulated — the 24px bottom padding sitting under an iPhone's 34px home
  indicator is exactly the class of fault a viewport size does not reproduce.
  Open both panels, drag the sheet by its handle, swipe it down, and confirm mic,
  camera and leave stay reachable throughout.

- **iOS Safari `visibilitychange` and track re-acquisition** — needs a human.
  Unreachable under Playwright: Chromium is not WebKit and does not kill tracks
  on background. PROGRESS calls this Phase 8's largest untested path. Background
  the tab mid-call on a real iPhone, wait, return, and confirm the explicit
  resume state appears and the tracks come back.

- **The resume-versus-failed collision** — needs a human.
  `resumeNeeded` and `phase === "failed"` are the same underlying `disconnected`
  state, distinguished only by cause, and they collide only on iOS
  backgrounding. The precedence fix was found by reasoning rather than by
  running it, and PROGRESS says plainly that no test would have caught it.
  Produce the collision on a real iPhone and confirm the resume prompt wins —
  the failure dialog's copy, "Parley kept trying and the connection didn't come
  back", is simply false when the browser closed a hidden tab.

- **The dashboard refreshing on a real return** — needs a human.
  v1.3 D5's trigger is the browser's own `focus` and `visibilitychange`, and a
  Chromium page driven by Playwright is **always visible and always focused**.
  Measured rather than assumed: `page.bringToFront()` on a second page in the
  same context fires no `focus`, no `blur` and no `visibilitychange` on the
  first; `Emulation.setPageVisibilityState` is gone from the protocol; and
  `Page.setWebLifecycleState` and `Emulation.setFocusEmulationEnabled` both
  succeed and fire nothing.

  **Not a headless limitation, which is the tempting reading and the wrong
  one.** The same probe run with `headless: false` gives byte-identical
  results — `visibilityState` `"visible"`, `hasFocus()` true, an empty event
  log — with a second tab genuinely in front of the page on screen. Playwright
  holds every page in a context foregrounded whatever the mode, because that is
  what lets a test drive a background tab at all. So running this headed is not
  the escape hatch it looks like, and nobody should spend an afternoon on it.

  Everything on our side of the event is tested — a hide ignored, a show acted
  on, the refresh soft, returns inside the gap collapsed to one, and nothing at
  all without an event. What no test here can reach is whether the browser
  dispatches them when a person actually comes back.

  Two checks, both about a minute: on a desktop, open the dashboard, switch to
  another application for more than ten seconds, and confirm on return that a
  meeting created meanwhile has appeared without the page reloading — the open
  filter tab should still be the one you left on. Then the same on a phone:
  background the browser, return, and confirm the same. The phone is the case
  worth doing separately, because `focus` and `visibilitychange` are not
  interchangeable there.

---

## 7. Server-side and account integration

- **Google OAuth, end to end** — needs a human.
  The provider is enabled, the client ID is real, and `/authorize` redirects to
  Google with this project's callback registered — but completing it needs
  interactive consent, which is a browser and a real Google account. Sign in
  with Google from `/sign-in` and confirm the callback lands on the intended
  destination with a session that survives a reload.

- **Magic-link email delivery** — needs a human.
  Assembled rather than carried: PROGRESS records the built-in sender and its
  rate limit as a deferred *task*, and separately records that `dev:signin`
  mints links directly because every screen behind auth is otherwise
  unreachable. It never calls delivery unverified in those words. It is on this
  list because the second fact makes the first one true — nothing in the suite
  has ever caused an email to be sent, and after the v1.2 refactor the send
  happens in a server action rather than the browser.
  Request a link to a real inbox and confirm it arrives, is not filed as spam,
  and completes a sign-in. Production needs real SMTP.

---

## Closed, with the evidence

Kept so the list does not lose the record of what was once open.

- **Denied, in Chrome** — **verified** (the Browser pane blocks media capture,
  which makes it a genuine denied machine rather than a simulated one:
  `permissions.query` returns `denied` and `getUserMedia` throws
  `NotAllowedError`. End to end on a production build that produced "Camera and
  microphone are blocked", naming Chrome's actual location, with no retry button
  offered and "Join meeting" still available).

- **Grid breakpoints above two** — **verified** (`e2e/grid.spec.ts` fills the
  room one participant at a time and reads the computed style at 1, 2, 3, 4, 5,
  6, 7, 9, 10, 16 and 17, asserting columns, rows, rendered cells, the letterbox
  at one and the "+2" overflow cell at seventeen. Nothing stubbed).

- **The speaking ring firing, and not chattering** — **verified** (over 30
  seconds, two full loops of the WAV fixture: 117 samples lit, 30 dark, 12
  transitions; the border is only ever 1px `--boundary` or 2px `--foreground`).
  The *tuning* is still open — see §1.

- **Tracks publishing and subscribing between participants** — **verified**
  (`check:media`, real Chrome, real WebRTC, real tracks through the real SFU).
  Audibility is still open — see §1.

- **A real timezone change** — **verified** (Playwright's `timezoneId` sets the
  real browser timezone, so the whole rendering path runs; three tests in real
  browsers in real zones, including the December case a fixed offset gets wrong
  for half the year, and the `.ics` byte-identical from both browsers).

- **A second sharer replacing the first** — **verified** (built to §3.7 with the
  dialog going to the person acting rather than the person being replaced; the
  test found the both-sides-yield race on its first run).

- **The dashboard and scheduling screens in the axe and touch-target state
  lists** — **verified** (five new states reached in one sign-in each, both
  specs iterating one shared `e2e/states.ts`).

- **Marketing and sign-in scanned in both themes** — **verified** (`states.ts`
  carries `themes` per state and axe expands it, so a theme cannot be forgotten
  the way a duplicated test can).

- **The LiveKit webhook** — **verified** (v1.3 A2, `npm run check:webhook`).
  This was on the open list as "cannot be exercised from this repo at all: it
  needs a public URL and a signed request from LiveKit". Half of that was
  wrong. The signature is a JWT issued by the API key, carrying the base64
  SHA-256 of the body — reproducible with `node:crypto` and the project's own
  credentials, so the handler can be driven down exactly the path LiveKit takes,
  minus the network.

  Five assertions: unsigned refused, wrong-secret refused, signature-over-
  different-bytes refused, and correctly signed `room_started` and
  `room_finished` **accepted and written through to `status`, `started_at` and
  `ended_at`**. That last pair is the one that matters, because A2's warning is
  that "a webhook that 401s on every delivery looks exactly like one that was
  never called" — three rejection tests pass against a handler that rejects
  everything, and only an acceptance that changes the database separates them.
  Mutation-tested: `receive(..., true)` fails the three, and the two would fail
  if verification always threw.

  **Production is answered too, by evidence rather than by a dashboard.**
  `started_at` has exactly one writer in the codebase — the webhook route — and
  LiveKit Cloud cannot reach localhost. Four rows carry it. Those can only have
  been written by the deployed URL accepting a signed delivery, so it is
  registered, reachable and verifying. Of the meetings that anyone actually
  joined, **none is missing `started_at`**: no delivery has failed to land.

  What remains genuinely manual is narrow: confirming the registered URL still
  points at the current production deployment after a domain change. The
  handler, the signature, and the write-through no longer need a human.

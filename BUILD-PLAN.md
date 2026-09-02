# Build plan

Eleven phases. Each is one Claude Code session with a finish line. Do not start the next phase until the current one meets its acceptance criteria.

Read `PRD.md` for the specification, `CLAUDE.md` for the rules and tokens, and `BRAND.md` for identity. All three take precedence over anything below.

---

## Before you start

### Accounts to create

Full walkthrough in **`ACCOUNTS.md`** — ordered, because Supabase generates the callback URL Google needs and Google generates the credentials Supabase needs. Roughly 25 minutes.

Summary: **LiveKit Cloud** (project, keys, usage alert) → **Supabase** (project, API keys, auth URLs, access token, copy the Google callback URL) → **Google Cloud** (OAuth consent screen, web client, paste Supabase's callback URI) → back to Supabase to enable the Google provider.

### Environment

Copy `.env.example` to `.env.local` and fill in seven values. Never commit it; never paste secrets into a chat, an issue, or a screenshot.

```bash
cp .env.example .env.local
git check-ignore -v .env.local     # must print a .gitignore match
npm run check:env
```

Scaffold files are provided in `scaffold/`:

- `.env.example` — the shape, with exposure annotated per variable
- `lib/env.ts` — zod-validated parsing, imported for side effects at the top of the root layout so a bad deploy fails at boot rather than at first request
- `scripts/check-env.mjs` — standalone check for pre-dev and CI, no Next boot required

Both implement rule 2's leak guard. Verified against five cases: valid config, a service_role JWT in a `NEXT_PUBLIC_` var, anon and service_role swapped, the LiveKit secret pasted into a public var, and a missing file. Anything prefixed `NEXT_PUBLIC_` is inlined into the client bundle, so these are hard stops rather than warnings.

Add to `package.json`:

```json
"scripts": {
  "check:env": "node scripts/check-env.mjs",
  "predev": "npm run check:env"
}
```

### Scaffold

```bash
npx create-next-app@latest parley --typescript --tailwind --app --eslint --src-dir=false
cd parley

npx shadcn@latest init

# Install only what the current phase renders. Add per phase, not up front.
npx shadcn@latest add button input label select popover tooltip sonner \
  badge separator skeleton

# sonner replaces the deprecated shadcn `toast` component.
#
# `form` is NOT in this list: `shadcn add form` installs react-hook-form and
# recreates components/ui/form.tsx, reinstalling exactly what rule 9 removed.
# Every form uses native state plus one zod parse on submit.
#
# `calendar` is NOT in this list: the date field is a native <input type="date">,
# which is smaller, keyboard-accessible without work, and gives mobile the OS picker.
#
# The original version of this command installed twenty components up front and
# ten of them were never rendered. shadcn is a copy-paste registry, not a library —
# `npx shadcn add dialog` takes seconds on the day Phase 8 needs a modal. Adding
# late costs nothing; carrying unrendered components pins Radix packages in
# package.json that show up in every audit.

npm i livekit-client @livekit/components-react livekit-server-sdk
npm i @supabase/supabase-js @supabase/ssr
npm i @hugeicons/react @hugeicons/core-free-icons
npm i zod   # lib/env.ts, route handlers, shared client/server schemas
npm i date-fns date-fns-tz nanoid
npm i next-themes
```

---

## Phase 0 — Foundation

**Goal:** the design system and the identity both exist and are verifiable before any feature is built.

Tokens and type:
- Apply the token block from `CLAUDE.md` to `app/globals.css` and wire it into the Tailwind v4 `@theme` layer
- Load Instrument Sans and JetBrains Mono via `next/font/google` as variable fonts
- Set up `next-themes` with a pre-paint script so there is no flash on load

Brand (spec in `BRAND.md`):
- Copy `brand/` into the project — `favicon.ico` (multi-res 16/32/48, correct variant per slice), `apple-icon.png`, `icon-192.png`, `icon-512.png`, `icon-512-maskable.png` to `public/`; `icon.svg` to `app/icon.svg`. Note `app/icon.svg` is the badge variant with literal fills, not `mark.svg` — see rule 7a.
- `components/brand/Mark.tsx` — geometry from the 24-unit grid, `currentColor`, ghost cell switching off below 32px via the `size` prop
- `components/brand/Wordmark.tsx` and `Lockup.tsx` (horizontal and stacked)
- `public/manifest.webmanifest`, linked from the root layout
- Vendor `InstrumentSans-Regular.ttf` and `InstrumentSans-SemiBold.ttf` into `app/fonts/` with the OFL licence file alongside. `next/font/google` does not expose the binary to `ImageResponse`, and static weights work where the variable font does not.
- `app/opengraph-image.tsx` and `twitter-image.tsx` using `next/og` `ImageResponse`, reading those files with `fs.readFile` under `export const runtime = 'nodejs'`. **Absolute URLs, full tags** — crawlers don't run JavaScript. This is the bug that shipped with Hueristic.
- Base layout and header using the horizontal lockup

Verification page:
- `scripts/contrast.mjs` + `npm run check:contrast` — computes the full foreground × surface matrix against each token's declared permitted surfaces and exits non-zero on any violation. This is the source of truth; the tables in `CLAUDE.md` are a regenerable snapshot.
- `/dev/tokens` — every colour swatch with its **computed** contrast ratio against its intended background, every type step named, every icon in the inventory with its resolved export name, and the mark rendered at 16 / 24 / 32 / 64 / 128px

**Done when:** `/dev/tokens` renders correctly in both themes with no flash on reload; every contrast ratio matches the table in `CLAUDE.md`; the mark's ghost cell is present at 32px+ and absent at 16px; and the OG card previews correctly in a link debugger.

---

## Phase 1 — Data and auth

**Goal:** users can sign in; the schema is correct and locked down.

Tasks:
- Migration for `meetings`, `meeting_participants`, the `meeting_status` enum, and indexes (schema is in `PRD.md` §6)
- RLS policies: hosts read and write only their own meetings
- `get_meeting_by_code` as a `security definer` function, granted to `anon` and `authenticated`. It resolves ended meetings within a 30-day window and returns `status`, so the join page can distinguish "ended" from "never existed" — see `PRD.md` §3.2 for why the host's name is not returned.
- Supabase clients: browser, server, and middleware, using `@supabase/ssr`
- Magic link sign-in and Google OAuth
- Protected route middleware
- Sign-out that propagates across open tabs

**Done when:** you can sign in both ways, the session survives a reload, and a scripted attempt to read another user's meeting row is refused by RLS. Prove the RLS test, don't assume it.

---

## Phase 2 — Meetings and dashboard

**Goal:** meetings can be created and listed.

Tasks:
- Code generator: alphabet `abcdefghjkmnpqrstuvwxyz23456789`, format `xxx-xxxx-xxx`
- Generate-and-insert with retry on unique violation
- `POST /api/meetings` with zod validation, for both instant and scheduled
- Dashboard: upcoming and past sections, empty state as an invitation
- "Start meeting" creates an instant meeting and routes to `/j/[code]`
- Copy-link button with a "Link copied" toast
- **Minimal `/j/[code]`** — the real route file, not a placeholder to delete. Resolves the meeting through `get_meeting_by_code` as an anonymous request, renders the title and code, and states plainly that the join screen arrives next. Branches on `status`: live or scheduled renders the placeholder, ended renders "This meeting has ended" with the title, missing renders the unknown-code state. No 404 on any path.

  This is not cosmetic. It is the first anonymous browser call to `get_meeting_by_code`, which is the `security definer` function that decides what a stranger holding a link can see. A script proving it works and a real unauthenticated request proving it works are different claims, and the second is the one that ships. Phase 3 fills this file in rather than replacing it.

**Done when:** both meeting kinds create successfully, codes are unique across 1,000 generated in a loop, and the dashboard lists them correctly.

---

## Phase 3 — Token endpoint and pre-join

**Goal:** the screen that decides whether this feels competent.

First, a small piece of housekeeping carried over from Phase 2:

- `scripts/seed-dev.mjs` + `npm run seed:dev` — replaces ad-hoc test rows with a deliberate fixture set: one live meeting, one scheduled a few days out, one ended. Idempotent, so it can run after any `db reset`.
- Titles are chosen, not leftover. This dashboard ends up in portfolio screenshots, and the same rule that governs empty-state copy governs its content: nothing visible should be accidental. Plausible working titles, not "test" or "asdf".
- **The script refuses to run unless `NEXT_PUBLIC_APP_URL` points at localhost.** Same reasoning as the env guard — a seed script pointed at production has no runtime symptom until someone sees rows they didn't create.
- Delete the existing ad-hoc rows once the seed replaces them.

Then:
- `POST /api/livekit/token` per the contract in `PRD.md` §7. Server-side meeting validation, server-derived identity, name sanitisation, narrow grants, 6h TTL, IP rate limit.
- Fill in `/j/[code]`, which Phase 2 created as a resolving stub: self-preview, camera and mic toggles, live mic level meter, device selectors, display-name field for guests
- All six permission states (`PRD.md` §3.3), each with real copy. Do not fire the browser prompt on page load.
- Unknown code and ended meeting pages
- Selected devices persist into the room
- **Minimal `/room/[code]`** — the real route file, same treatment as the Phase 2 stub. Requests a token from `/api/livekit/token`, reports success or the mapped failure state, and states that the room UI arrives next. Does **not** import `livekit-client`, so the Phase 3 bundle numbers stay clean.

  This exercises the token endpoint from a real browser with a real session — server-side meeting validation, server-derived identity, narrow grants, rate limiting. It is the most security-sensitive surface in the product, and finding it wrong now beats finding it wrong under a video grid. Each of the contract's failure codes (403, 404, 410, 429) gets a designed state, not a crash.

**Done when:** every permission state renders correctly — test each by manipulating browser settings, not by faking state. The mic meter responds within 200ms. Changing camera updates the preview without reload.

#### Manual permission test matrix

A unit-tested classifier proves the error-name mapping. It does not prove the browser emits those names under those conditions, and it proves nothing about whether the copy reads right in situ. Both need a real machine.

| State | How to produce it on macOS |
|---|---|
| Granted | Allow the prompt |
| Denied | Address bar padlock → Camera → Block, then reload |
| Dismissed | Press Escape on the prompt, or click outside it. Distinct from Denied: the promise never resolves with a decision, and Chrome auto-blocks after three dismissals — so test the third one too |
| No device | System Settings → Screen Time → Content & Privacy → App Restrictions → uncheck Camera. This genuinely hides it from the browser; unplugging is not an option on a laptop |
| In use | Hard to reproduce on macOS, which permits concurrent camera access where Windows does not. Try holding it in Safari while testing Chrome. If it cannot be produced, record it as untested rather than passing — an untested path noted is fine, an untested path assumed working is not |

Run the matrix in **Chrome and Safari**. Safari's permission model is per-session by default and its gesture requirements are stricter, so states that look identical in Chrome diverge there.

The copy is the real deliverable in the denied state: it must name where the setting lives, and that location differs per browser. A generic "please enable camera access" is the failure this screen exists to avoid.

---

## Phase 4 — The room

**Goal:** two people can hold a conversation.

Tasks:
- `/room/[code]` as a client route with `livekit-client` dynamically imported
- Connect using the token; `<RoomAudioRenderer />` for remote audio
- Grid implementing every breakpoint in the `PRD.md` §3.4 table
- Participant tile: video with `object-fit: cover`; avatar fallback is the participant's initial on `--secondary`, **uniform, no per-identity hue**; name on scrim; mic-off indicator
- Tile boundary: idle 1px `--tile-border` (3.33:1, clears WCAG 1.4.11), speaking 2px `--foreground` (17.29:1). `--card` against `--background` is 1.09:1, so without this the grid structure is invisible.
- Control bar: mic, camera, leave. Circles at 48px; leave is a wide pill.
- Auto-hide controls after 4s of pointer inactivity on desktop; always visible on touch
- Mic and camera state derived from track state, never a parallel boolean
- Keyboard shortcuts with input-focus suppression

**Done when:** two browsers on different networks see and hear each other. Every grid breakpoint is correct — test by opening real tabs, not by faking participant counts. Toggling mic in one tab reflects in the other within a frame.

#### Automating the media tests

Most of this does not need a human with seventeen tabs. Chrome ships synthetic capture devices for precisely this case:

```
--use-fake-device-for-media-stream      # rolling test pattern + tone
--use-fake-ui-for-media-stream          # auto-accepts the permission prompt
--use-file-for-fake-video-capture=x.y4m # or feed a real file
--use-file-for-fake-audio-capture=x.wav
```

This is real Chrome, real WebRTC, real tracks through the real SFU. It is not faking participant counts — it is automating the opening of tabs, which is what the criterion above actually asks for. Add Playwright as a dev dependency and drive it. **Approved under rule 9**; it does not ship.

What this covers:

- Tracks publish and subscribe between participants — the gap in this report
- Video renders in a tile rather than a black rectangle
- Every breakpoint from 2 to 17+, by spawning N contexts
- Mute-state truth: toggle in one context, assert the track state in another
- Grid reflow on join and leave, without thrash

**Feed a real WAV to `--use-file-for-fake-audio-capture` rather than using the default tone.** The built-in tone is a clean periodic beep and will make any speaking detector look perfect. A recording containing speech, pauses, and a cough is what exercises the hysteresis requirement in §3.4 — that the ring does not flicker on every throat-clear.

What automation cannot reach, and what therefore still needs a real machine:

| Gap | Why |
|---|---|
| Cross-network media, TURN relay | Local contexts share a network path. The 10–20% of connections that need a relay are exactly the ones this never exercises. Two machines, one on a phone hotspot. |
| Audio being audible | A subscribed track is not the same claim as a working speaker path |
| Speaking-ring *tuning* | Automation proves it fires; a real mic in a real room is what sets the threshold |
| Device switching mid-call | Real hardware, real enumeration changes |
| The four Phase 3 permission states | Unchanged |

---

## Phase 5 — Chat and reactions

**Goal:** the two data-channel features.

Tasks:
- `useDataChannel` with a typed message envelope discriminating chat from reaction
- Chat panel: 360px drawer on desktop, bottom sheet on mobile
- Message grouping under one header within 60s, relative timestamps, autolinking with `rel="noopener noreferrer nofollow"`, 1,000 char limit with counter at 900
- Enter sends, Shift+Enter newlines
- Scroll pins to bottom unless the reader has scrolled up, in which case show a "New messages" affordance
- Unread dot on the chat control, clears on open
- Six fixed reactions, floating up from the sender's tile over 2400ms, staggered when simultaneous
- **Rate limit: one reaction per participant per 1000ms.** Extra presses dropped, not queued.
- Reactions from off-screen participants anchor to the overflow indicator
- Reduced-motion: reactions fade in place

**Done when:** messages and reactions cross between clients under 500ms, rapid clicking produces at most one reaction per second, and reactions never occlude name labels.

---

## Phase 6 — Scheduling and calendar

**Goal:** a meeting created in one timezone lands correctly in another.

Tasks:
- Schedule form: title, description, date, time, duration, timezone. Default from `Intl.DateTimeFormat().resolvedOptions().timeZone`.
- Store UTC plus the creator's IANA zone. Render local. **Always print the zone label.**
- `GET /api/meetings/[code]/ics` — RFC 5545, `text/calendar`, UTC with `Z`, `UID` from the meeting id, `URL` and `DESCRIPTION` carrying the join link, `SEQUENCE` incrementing on edit
- Google Calendar prefill URL
- Outlook Web prefill URL
- Edit and cancel for scheduled meetings

**Done when:** the `.ics` imports cleanly into Google Calendar, Apple Calendar, and Outlook, and a meeting created in Accra shows the correct local time with the right zone label to a viewer in Berlin.

The timezone half of that no longer needs a human. Playwright takes `timezoneId` on a browser context, which sets the real browser timezone — `Intl.DateTimeFormat().resolvedOptions().timeZone` returns it and every format call follows. That exercises the whole rendering path, because the code never sees the OS, only the browser. Create in `Africa/Accra`, read in `Europe/Berlin` and `America/Los_Angeles`, assert both the time and the printed zone label.

Importing the file into three real calendar clients stays manual. "Valid against RFC 5545" and "imports cleanly" are genuinely different claims, and only the second one matters.

---

## Phase 7 — Screen share and participants

Tasks:
- `getDisplayMedia` share, desktop only
- Layout shift: shared content main, participants to a filmstrip
- Sharer's own view of their content suppressed
- Persistent "You're sharing your screen" bar with a stop button
- Browser-native stop detected via the track `ended` event
- Second sharer replaces the first, with a confirm dialog for the person being replaced
- Participants panel: name, mic state, camera state, connection quality, host badge
- Host actions: request mute, remove. **A host can silence but never activate** — no remote unmute.

**Done when:** stopping via Chrome's own control updates app state, and share survives panel toggles.

---

## Phase 8 — Connection states

**Goal:** nothing fails silently. This is the phase most clones skip.

Tasks:
- Map LiveKit `ConnectionQuality` to the treatments in `PRD.md` §3.11
- Poor: amber pill on the affected tile; local user gets a bar
- Remote lost: tile dims to 40%, frozen frame, "Reconnecting…"
- Local lost: full-width critical bar, video paused, visible retry count
- Failed after retries: modal with "Rejoin" and "Leave"
- iOS Safari `visibilitychange` handling with an explicit resume state
- Autoplay fallback: an "Enable audio" prompt if playback is blocked

**Done when:** killing the network for 10 seconds and restoring it recovers the call without a page reload, and every degraded state is visually distinct.

---

## Phase 9 — Accessibility

Work the full list in `CLAUDE.md`. Specifically:

- Full keyboard traverse of every route with visible focus
- Focus trapping and restoration on both panels
- `aria-pressed` on toggles; accessible names phrased as the action
- Batched join/leave announcements — 3+ events in 5s collapse; suppressed above 8 participants
- Chat announces sender only when the panel is closed
- Reaction announcements throttled per participant
- Connection state announced once per change
- `?` opens a keyboard shortcuts dialog
- `axe` clean on every route

**Audit what the framework injects before testing our own announcements.** Next mounts its own route announcer as an `role="alert"` live region, which is assertive and interrupts whatever a screen reader is mid-sentence on. Two consequences: every accessibility assertion must be scoped to our tree, or it will match the framework's element and pass without testing anything; and our announcements stay `polite` throughout, since an assertive region already exists and stacking a second one guarantees the flooding §9 is trying to prevent. Check the dev-mode error overlay too — it should not be in the axe run.

**Done when:** the entire product is usable with the keyboard alone, and a screen reader in a 10-person room is not flooded.

---

## Phase 10 — Mobile and polish

Tasks:
- Mobile layouts for grid, controls, chat sheet, participants sheet
- Touch targets at 44px minimum
- iOS Safari viewport handling (`dvh`, not `vh`)
- Landing page
- Error routes: unknown code, ended meeting, meeting full, browser unsupported
- Per-meeting OG variant for `/j/[code]` showing meeting title and host, so a pasted invite renders meaningfully in Slack and iMessage
- Optional: live favicon — swap `app/icon.svg` for an all-four-cells-filled variant while in an active call
- Bundle check: dashboard route under 180KB gzipped, `livekit-client` absent from it

**Done when:** the whole flow works on iPhone Safari and Android Chrome, including backgrounding the tab mid-call and returning.

---

## Kickoff prompt

Paste this into Claude Code in the project directory, with `PRD.md`, `CLAUDE.md`, and `BUILD-PLAN.md` present.

> I'm building Parley, a video conferencing web app. `PRD.md` has the full specification, `CLAUDE.md` has the project rules and design tokens, `BRAND.md` has the identity and asset spec, and `BUILD-PLAN.md` has the phased tasks. Read all four before doing anything. Pre-generated brand assets are in `brand/`.
>
> We're starting Phase 0. Before writing code, tell me:
> 1. Your understanding of what we're building and what's deliberately out of scope
> 2. Anything ambiguous or contradictory across the three documents
> 3. Your plan for Phase 0, as a task list
>
> Don't write code until I've confirmed the plan. Once we're building: no new dependencies without asking, no LiveKit prebuilt UI components, no colours outside the token set, and never fill the mark's fourth cell.
>
> One thing to verify early, in Phase 0: resolve the real export names for every icon in the inventory against the installed `@hugeicons/core-free-icons` package. Don't guess them from memory.

---

## Working rhythm

One phase per session. At the end of each, ask Claude Code to update a `PROGRESS.md` with what shipped, what was deferred, and any decision that departed from the PRD — with the reason. That file is what makes the next session pick up cleanly instead of relitigating settled choices.

When something looks wrong in the UI, describe what's wrong and ask for a rethink rather than a patch. Patches accumulate; rethinks don't.

# Parley — Product Requirements

**Status:** Draft v1
**Owner:** Austine
**Type:** Standalone project. Not part of the twelve-project design suite.

See also: `BRAND.md` (name rationale, logomark, assets) · `CLAUDE.md` (rules and tokens) · `BUILD-PLAN.md` (phases).

*A parley is a conversation between parties who cannot otherwise meet — held at a distance, on neutral ground, under terms both sides agree to.*

---

## 1. What this is

A small, complete video conferencing web app. Create a room, get a link, people join, everyone can see and hear each other, react, and chat. Meetings can be scheduled ahead of time and added to a calendar.

It is a competence demonstration: the point is that every state is handled, every control is reachable by keyboard, and the failure modes are designed rather than left to chance. There is no cleverness to discover. The quality is in the completeness.

### What it is not

Not a Meet or Teams competitor. No recording, no transcription, no breakout rooms, no org administration, no telephony dial-in, no persistent workspaces, no e2e encryption. Each of those multiplies scope and none of them changes what the product demonstrates.

### Success criteria

1. Two people on different networks can join from a link and hold a conversation with no setup instructions.
2. Every in-call control is operable by keyboard, with visible focus.
3. Every degradation — bad network, denied permission, device unplugged mid-call, host leaves — has a designed state that tells the truth.
4. A scheduled meeting lands correctly on a calendar in a different timezone.
5. Runs on desktop Chrome/Safari/Firefox and mobile Safari/Chrome.

---

## 2. Users and flows

### Host (signed in)

Creates meetings, gets links, schedules ahead, controls the room.

### Guest (not signed in)

Arrives via link, enters a display name, joins. Never asked to create an account. This is the highest-traffic flow in the product and should be the most polished.

### Core flows

**A. Instant meeting**
`Dashboard → "Start meeting" → pre-join → room (alone) → copy link → others join`

**B. Join by link**
`Open /j/[code] → meeting exists? → pre-join (name + devices) → room`

**C. Join by code**
`Dashboard or home → enter code → same as B`

**D. Schedule**
`Dashboard → "Schedule meeting" → title, date, time, timezone, duration → created → link + calendar buttons`

**E. Scheduled meeting starts**
`Open link at time → pre-join → room`

---

## 3. Feature specification

Each feature lists behaviour, states, and acceptance criteria. Acceptance criteria are what "done" means; treat them as a test list.

### 3.1 Authentication

Supabase Auth. Email magic link plus Google OAuth. No password flow — one less surface, one less set of states.

Guests are never authenticated. A guest identity exists only for the duration of a room connection.

**States:** signed out · magic link sent · link expired · signed in · signing out

**Acceptance**
- Magic link email arrives within 30s and returns the user to the page they started from
- Session persists across reload
- Signing out from one tab reflects in other open tabs
- Auth is never required to reach a pre-join screen

---

### 3.2 Meeting creation and codes

Two kinds of meeting, one table:

- **Instant** — `scheduled_start` is null, room opens immediately, expires 12h after creation if never joined
- **Scheduled** — has a start time, end time, and IANA timezone

**Code format:** `xxx-xxxx-xxx`, lowercase, alphabet `abcdefghjkmnpqrstuvwxyz23456789` — no `i`, `l`, `o`, `0`, `1`. Ten characters of entropy, roughly 8×10¹⁴ combinations. Read aloud without ambiguity, which is the actual requirement.

Collision handling: generate, insert, retry on unique-constraint violation. Do not check-then-insert.

**Acceptance**
- Code is displayed in mono with letter-spacing, and is selectable as a unit
- Copy link puts the full URL on the clipboard and confirms with a toast that says "Link copied"
- Unknown code shows a dedicated page: what happened, and a field to try another code. Not a 404.
- Ended meeting shows "This meeting has ended", the meeting **title**, and the option to start a new one — distinct from the unknown-code page, never conflated with it
- **Cancelled meeting shows "This meeting was cancelled"** — a fourth enum value, not folded into `ended`

  Cancelling a scheduled meeting and a meeting running to its end are different events, and collapsing them makes the product lie in the commonest case. Someone holding a link for Thursday at 3, cancelled on Wednesday, arrives on time and reads that they missed it. They didn't; it never happened. That is a factual error in user-facing copy, which is a worse cost than the migration, the `get_meeting_by_code` change, and one more join-page state.

  Cancelling never deletes the row — a link already in someone's inbox must keep resolving to a designed state rather than the unknown-code page. On the dashboard, cancelled meetings leave the upcoming list and appear under past, labelled as cancelled rather than silently mixed in with meetings that took place.

  Not the host's name. The original spec asked for it and contradicted §6, where `get_meeting_by_code` deliberately returns no host identity. The title does the same job — it tells someone holding several links which one this was — without exposing a person's name to anyone who has the code. The title is already disclosed to link-holders while the meeting is live, so surfacing it afterwards is no new class of disclosure; a host's identity would be.

  Distinguishing "ended" from "never existed" does confirm that a code was once real. With roughly 8×10¹⁴ codes and a rate-limited endpoint, enumeration is not a practical attack, and the cost of the alternative is real: the common case here is someone with a legitimate link arriving late, and telling them the meeting doesn't exist is a lie.

---

### 3.3 Pre-join

The screen that decides whether the product feels competent. Shown before every room entry, always, including for the host.

Contains: self-preview, camera toggle, mic toggle with a live input meter, camera/mic/speaker selectors, display-name field for guests, meeting title, and who is already in the room.

**Permission states, all designed:**

| State | Behaviour |
|---|---|
| Not yet asked | Preview area shows the reason for the request before the browser prompt fires. Do not fire the prompt on page load. |
| Granted | Preview live, devices enumerable |
| Denied | Preview replaced by instructions for this specific browser. The page cannot re-prompt; say so, and say where the setting is. |
| Dismissed | Offer a "Try again" button that re-triggers the prompt |
| No device present | "No camera found" — allow audio-only join |
| Device in use by another app | Name the likely cause, offer retry |

Device labels are empty strings until permission is granted. Do not render an empty dropdown; show "Allow access to choose a device."

Joining with camera and mic both off is allowed and must not be treated as an error.

**Acceptance**
- Mic meter responds to speech within 200ms
- Changing camera in the selector updates the preview without a page reload
- Selected devices carry into the room
- Guest cannot join with an empty or whitespace-only name
- Preview is mirrored; published video is not

---

### 3.4 The room

#### Layout rules

Write these before writing layout code.

| Participants | Desktop | Mobile portrait |
|---|---|---|
| 1 | Single tile, full area, 16:9 letterboxed | Full area |
| 2 | Side by side | Stacked, equal |
| 3–4 | 2 × 2 | 2 × 2 |
| 5–6 | 3 × 2 | 2 × 2 + page indicator |
| 7–9 | 3 × 3 | 2 × 2 + pages |
| 10–16 | 4 × 4 | 2 × 2 + pages |
| 17+ | 4 × 4, overflow as "+N" | 2 × 2 + pages |

Overflow ordering: most recent speaker first, then join order. The person talking is never the person hidden.

Screen share active: shared content takes the main area, participants collapse to a filmstrip (desktop: right edge; mobile: top strip, 3 visible).

Tile aspect ratio is 16:9. Video is `object-fit: cover`. Never letterbox individual tiles inside the grid — it looks broken.

#### Tile contents

- Video, or an avatar fallback: the participant's initial on `--secondary`, uniform, **no hue**. Colour-coded avatars would be the only chroma in the room and would be decorative — the tile position is stable and the name label is directly below.
- Name label, bottom-left, on a scrim — **never directly on video**
- Mic-off indicator, bottom-right
- Speaking ring
- Connection warning, when relevant

#### Active speaker

LiveKit provides smoothed speaking state. Encode it with **no hue**: idle tiles carry a 1px border at `--tile-border` (3.33:1 against the ground, clearing the 3:1 non-text threshold), the speaking tile a 2px border at `--foreground` (17.29:1). 120ms transition on border-color and border-width.

`--border` at 1.29:1 was the original value and is not a visible boundary. Worse, `--card` against `--background` is 1.09:1 — so a camera-off tile had no readable edge at all, which makes this border the only thing identifying the tile as a component. That brings it under WCAG 1.4.11 at 3:1, which the first replacement value (2.09:1) also missed. `--tile-border` is single-purpose: the room ground, nowhere else.

Rationale for the encoding: hue on the tile edge competes with skin tones and video content, and it fails for colourblind users. Weight and value read at any size against any background.

#### Controls

A floating bar, bottom-centre, on a scrim. Auto-hides after 4s of pointer inactivity on desktop; always visible on touch. Reappears on any pointer movement, keypress, or focus.

| Control | Shape | Behaviour |
|---|---|---|
| Mic | 48px circle | Toggle. Off = filled `--secondary` with a struck-through icon |
| Camera | 48px circle | Toggle. Off = same treatment |
| Screen share | 44px circle | Desktop only. Active = filled `--primary` |
| Reactions | 44px circle | Opens a popover of six emoji |
| Chat | 44px circle | Toggles panel. Unread dot |
| Participants | 44px circle | Toggles panel, shows count |
| Leave | 48px **pill**, wider | The only non-circular control. `--destructive` fill. |

The leave button is distinguished by shape as well as colour, so it is unmistakable without relying on hue.

**Mute-state truth.** Local UI state must derive from the LiveKit track's actual published state, not from a separate React boolean. If a track fails to unmute, the UI shows muted. This is a privacy requirement, not a polish item.

**Acceptance**
- Grid reflows without layout thrash when someone joins or leaves
- Toggling mic updates the icon within one frame of the track state changing
- Controls remain reachable when both panels are open
- Tab order: controls → chat panel → participant panel → back to controls
- `Cmd/Ctrl + D` toggles mic, `Cmd/Ctrl + E` toggles camera — suppressed while focus is in a text input

---

### 3.5 Chat

Ephemeral, over LiveKit data channels. Not persisted.

This is a deliberate scope decision: persistence means a table, realtime subscriptions, a moderation surface, and a retention policy. The cost is that people who join late see nothing. Say so in the empty state: "Messages are only visible to people in the meeting, and disappear when it ends."

- Panel: 360px right drawer on desktop, bottom sheet on mobile
- Message: sender name, relative time, body
- Consecutive messages from the same sender within 60s group under one header
- URLs autolink, `rel="noopener noreferrer nofollow"`, target blank
- 1,000 character limit with a counter appearing at 900
- Enter sends, Shift+Enter newlines
- System messages for join and leave, visually distinct and quieter

**Rate limiting.** Five messages per ten seconds per sender. The send side disables the input on a brief cooldown; **the receive side drops the excess without rendering it, and that is the only real enforcement** — there is no server on this path, so a modified client ignores anything the send side does. The flooder sees their own input disabled; nobody else sees the flood. §3.6 already specifies this shape for reactions; chat needs it for the same reason.

**Ordering.** Timestamps are stamped on arrival, so two receivers can hold slightly different times for the same message. That is correct — a sender-supplied timestamp is unverifiable — but it means display order is per-receiver arrival order, and no client should treat its own ordering as canonical.

**Acceptance**
- Message appears for all participants within 500ms
- Scroll pins to bottom unless the reader has scrolled up, in which case a "New messages" affordance appears
- Unread count clears on panel open
- No XSS: message bodies are rendered as text, never HTML

---

### 3.6 Reactions

Six emoji, fixed: 👍 ❤️ 😂 🎉 👏 😮

Sent over the data channel. Animate upward from the sender's tile and fade over 2400ms. Multiple simultaneous reactions stagger horizontally so they don't overlap.

**Rate limit: one reaction per participant per 1000ms, enforced client-side on send and server-agnostic on receive.** Without this, one person can flood the channel.

Under `prefers-reduced-motion`, reactions appear and fade in place with no travel.

**Acceptance**
- Reaction from a participant not currently visible in the grid still surfaces, anchored to the overflow indicator
- Reactions never occlude the name label or mic indicator
- Rapid clicking does not queue; extra presses are dropped, not buffered

---

### 3.7 Screen share

Desktop only. `getDisplayMedia`. One share at a time. **The confirmation goes to the person taking the action, not the person being replaced.**

A second sharer sees "Ama is presenting. Sharing will replace theirs." with Continue and Cancel. The replaced person gets a non-modal notice: "Kofi is now presenting."

The original spec had this backwards. Confirming with the replaced person blocks the second sharer on someone else's dialog — if the current presenter has stepped away, the share simply hangs with no way forward. It also interrupts an active presenter with a modal mid-sentence to ask permission for something they cannot meaningfully evaluate in the moment. The person whose action has a consequence is the person who should weigh it, and they are the only one who can act without waiting.

- The sharer sees a persistent "You're sharing your screen" bar with a stop button, visible even if the tab is backgrounded when they return
- The sharer's own view of the shared content is suppressed to avoid the infinite mirror
- Browser-native stop (the Chrome bar) must be detected via the track's `ended` event and reflected in the UI

**Acceptance**
- Stopping via the browser's own control updates app state
- Share survives a chat panel open/close
- Audio share, where supported, is passed through

---

### 3.8 Participants panel

List of everyone present: name, mic state, camera state, connection quality, host badge. Host sees per-participant actions: mute (request), remove.

A host cannot unmute someone else. Muting is a request the participant must accept — the host can silence, never activate.

**Built as an absence, not a refusal.** The data envelope has `mute-request` and no counterpart, so a modified client has nothing to send. That is stronger than a receiver declining to honour a message: a refusal is code, and code can be refactored away or bypassed when someone later adds a generic handler. A missing message type is not a rule anyone can forget.

The absence covers client to client. It does not cover the server, and that is where the rule needs restating: **`roomAdmin` carries mute and unmute powers on LiveKit's server API.** The remove route mints that grant for a single request after RLS has verified the caller is the host. It calls `removeParticipant` and nothing else. Any future route that spends `roomAdmin` inherits this constraint — the client-side guarantee is worthless if a server route quietly widens it.

---

### 3.9 Scheduling

Fields: title, optional description, date, start time, duration (15 / 30 / 45 / 60 / 90 min or custom), timezone.

**Timezone handling.** Store UTC in the database. Store the creator's IANA timezone alongside. Render in the viewer's local timezone. Always print the zone label next to a time. This is the one place where a quiet bug produces a missed meeting.

Default timezone is `Intl.DateTimeFormat().resolvedOptions().timeZone`, editable.

**Calendar integration — no OAuth.** Three exports:

1. **`.ics` download** — served from `/api/meetings/[code]/ics` with `Content-Type: text/calendar`. RFC 5545, UTC timestamps with `Z` suffix, `UID` from the meeting id, `DESCRIPTION` containing the join link, `URL` property set.
2. **Google Calendar prefill** — `calendar.google.com/calendar/render?action=TEMPLATE&…`
3. **Outlook Web prefill** — `outlook.live.com/calendar/0/deeplink/compose?…`

This covers every calendar client, requires no consent screen, and saves roughly a week of OAuth work.

**Acceptance**
- `.ics` imports cleanly into Google Calendar, Apple Calendar, and Outlook
- A meeting created in Accra shows the correct local time to a viewer in Berlin, with "CET" printed
- Editing a scheduled meeting regenerates the `.ics` with an incremented `SEQUENCE`
- Past meetings move to a separate dashboard section rather than disappearing

---

### 3.10 Dashboard

Signed-in home. Two sections: upcoming and past. Each row: title, time with zone, code, participant count if ended. Primary actions: "Start meeting" and "Schedule meeting."

Empty state is an invitation, not an apology: "No meetings yet. Start one now, or schedule for later."

---

### 3.11 Connection quality and reconnection

LiveKit reports `excellent | good | poor | lost`.

| Quality | Treatment |
|---|---|
| Excellent, good | No indicator. Silence means fine. |
| Poor | Amber pill on the affected tile: "Unstable connection." Local user also sees a bar: "Your connection is unstable." |
| Lost (remote) | Tile dims to 40%, last frame frozen, label "Reconnecting…" |
| Lost (local) | Full-width bar, `--state-critical`. Video paused. Automatic retry with visible attempt count. |
| Failed after retries | **Overlay over the dimmed, frozen room — not a full-page unmount.** "Rejoin" and "Leave". `--state-critical` is permitted on `--popover` (5.42:1), so the overlay can carry it. |

Never fail silently. A frozen video with no explanation is the worst outcome in this product.

**The failed state is an overlay, not a teardown.** Unmounting the room on `RoomEvent.Disconnected` makes "Leave" meaningless — you already have. Keeping the dimmed, frozen grid behind an overlay is also consistent with the language already used for a lost remote participant, and it preserves the fact that you were in a meeting rather than dropping you somewhere that looks like you never joined.

Rejoin routes back through pre-join rather than reconnecting in place. The failure may have been a device problem, and pre-join is where devices get re-confirmed. **Carry the display name through** — in `sessionStorage`, so a guest is not made to retype it. Their identity will regenerate, so they rejoin as a new participant; that is acceptable and worth knowing.

**Retry policy.** LiveKit's `retryCount` is private, so observing it means supplying a `ReconnectPolicy` — which makes the schedule a choice. Wrap the default rather than inventing one: ten attempts over 45–90s is tuned by people who know that infrastructure, and it covers the real recovery cases, including wifi-to-wifi and mobile handoff, which resolve in five to fifteen seconds.

The long window is only acceptable because it is escapable. **The user can abandon the retry at any point** — "Rejoin now" and "Leave" are live throughout, not revealed after the tenth attempt. Nobody should be made to watch a countdown they cannot interrupt.

**Acceptance**
- Killing the network for 10s and restoring it recovers the call without a page reload
- The reconnecting state is announced once to screen readers, not on every retry

---

## 4. Design system

### 4.1 Typography

**Instrument Sans** for interface. **JetBrains Mono** for meeting codes, timers, and connection data. Both from Google Fonts, loaded as variable fonts with `font-display: swap`.

Instrument Sans over Inter: slightly tighter apertures and a narrower set width give it presence at display sizes without asking for a second family, and it holds up at 13px in dense chrome. It is neutral enough to disappear behind video, which is the actual job.

JetBrains Mono earns its place in exactly one way: a meeting code needs unambiguous `0`/`O` and `1`/`l`, and JetBrains Mono is explicit about both. Do not use it for labels — that is decoration.

*Known limitation:* Instrument Sans has Latin coverage only. Participant names in non-Latin scripts will fall through to the system stack. Set the fallback deliberately: `Instrument Sans, ui-sans-serif, system-ui, "Noto Sans", sans-serif`.

| Role | Size / line | Weight | Notes |
|---|---|---|---|
| Display | 32 / 36 | 600 | Marketing and empty states only |
| H1 | 24 / 30 | 600 | −0.01em |
| H2 | 20 / 26 | 600 | |
| Body | 15 / 22 | 400 | Chat, forms, most UI |
| Small | 13 / 18 | 400 | Tile labels, metadata |
| Caption | 12 / 16 | 500 | Timestamps, counts |
| Code | 20 / 24 | 500 mono | +0.08em, meeting code |
| Data | 12 / 16 | 400 mono | Tabular numerals on |

Enable `font-variant-numeric: tabular-nums` globally on timers and counters so digits don't jitter.

### 4.2 Colour

**Dark is the default and the only mode for the in-call surface.** In a video call the video is the light source; the chrome should recede. The dashboard and scheduling screens are document-like and respond to system theme.

The ground is a cool graphite, not a tinted black. Cool chrome makes warm skin tones read as the live element in the frame.

**Hue is rationed.** Primary actions are near-white on dark. Hue is spent on exactly two things: leaving or ending a call, and connection warnings. Everything else — mute state, active speaker, selection, focus — is encoded in weight and value. This follows the same rule as Passable and Hueristic, and here it has a second justification: hue on the tile chrome competes with the video content behind it.

Note the phrasing: **no hue**, not "weight, not colour." The speaking ring changes weight *and* value (1px `--tile-border` → 2px `--foreground`), and several other states change value too. What holds across the whole system is that nothing depends on hue.

**Dark**

```
--background            #0E1013
--foreground            #F2F4F7
--card                  #171A1F
--card-foreground       #F2F4F7
--popover               #1B1F25
--popover-foreground    #F2F4F7
--primary               #F2F4F7
--primary-foreground    #0E1013
--secondary             #242830
--secondary-foreground  #F2F4F7
--muted                 #1F232A
--muted-foreground      #9AA1AC
--accent                #242830
--accent-foreground     #F2F4F7
--destructive           #D32F2F
--destructive-foreground #FFFFFF
--border                #242830
--input                 #2B303A
--ring                  #F2F4F7
--tile-border           #5D6777   /* room ground only — see §3.4 */
```

State-only, not part of the general palette:

```
--state-critical        #F26669   /* red text/icon on dark surfaces */
--state-warning         #F5A524
--scrim                 rgba(14,16,19,0.72)
```

**Light** — dashboard and scheduling only:

```
--background            #FFFFFF
--foreground            #16181D
--card                  #F7F8F9
--muted-foreground      #5C636E
--primary               #16181D
--primary-foreground    #FFFFFF
--destructive           #C62B31
--destructive-foreground #FFFFFF
--border                #E3E6EA
--ring                  #16181D
```

**Contrast is verified by script, not by hand.** `CLAUDE.md` carries the permitted-surface table and the generated snapshot; `npm run check:contrast` is the source of truth and `-- --snapshot` emits the markdown. This document deliberately does not duplicate it — four separate rounds of hand-copied ratios going stale is enough evidence that a second copy is a liability rather than a convenience.

The shape of the system, which does belong here: every foreground token declares the surfaces it is permitted on and is verified against those. `--state-critical` is permitted on every dark surface except `--input` (4.34:1); validation errors sit below a field on the ground, never inside the filled input. `--tile-border` is permitted on `--background` alone.

Note: `#E5484D` on white is 3.91:1 and fails. That is why light mode has a separate, darker destructive.

**Never place text or icons directly on video.** Every label sits on `--scrim`, which makes contrast deterministic regardless of what is on camera.

### 4.3 Icons

HugeIcons — `@hugeicons/react` with `@hugeicons/core-free-icons`. Stroke rounded variant, 1.5 stroke width, `color="currentColor"` so icons inherit token colours.

Sizes: 20px inline, 24px in controls, 16px in dense lists.

Icons needed, by function — resolve exact export names against the installed package rather than guessing:

mic on · mic off · camera on · camera off · screen share · stop share · chat · participants · emoji/reactions · phone hangup · settings/gear · copy · link · calendar · clock · plus · check · close/x · chevrons · alert triangle · signal/wifi · pin · more-horizontal · user · google logo · mail · loader/spinner

Every icon-only button needs an `aria-label` and a tooltip. No exceptions.

### 4.4 Shape, spacing, motion

Radius: `--radius: 0.5rem`. Tiles `0.75rem`. Circular controls. The leave pill is `999px`.

Spacing on a 4px base: 4, 8, 12, 16, 24, 32, 48, 64.

Motion:

| Change | Duration | Easing |
|---|---|---|
| State toggle (mute, camera) | 120ms | `cubic-bezier(0.2, 0, 0, 1)` |
| Speaking ring | 120ms | linear |
| Panel open/close | 180ms | `cubic-bezier(0.2, 0, 0, 1)` |
| Grid reflow | 200ms | `cubic-bezier(0.2, 0, 0, 1)` |
| Reaction lifespan | 2400ms | ease-out |
| Toast | 150ms in, 100ms out | standard |

All motion answers a user action. No ambient animation anywhere. `prefers-reduced-motion: reduce` removes travel and keeps opacity changes only.

### 4.5 Brand

Full specification in `BRAND.md`. The short version:

**Logomark** is a 2×2 grid of rounded tiles, three filled and one empty. It reads as a video call grid, as presence, and as the product's own encoding rule — fill and weight, never hue. The asymmetry is what makes it a specific thing rather than the generic four-square dashboard icon.

Geometry on a 24-unit grid: 9-unit cells, 4-unit gutters, 2.4 radius, 1 margin, empty cell bottom-right. The gutter was widened from 2 to 4 after testing at 16px, where the tighter cells fused into a single block.

**Responsive rule, functional not stylistic:** at 32px and above the empty cell carries a 1.5 stroke at 40% opacity (present, camera off). Below 32px the stroke is dropped and the cell is fully empty — a 1.5-unit stroke antialiases into a grey smudge at favicon size. Absence survives small sizes; outlines do not.

**Wordmark** is Instrument Sans 600 at −0.02em, sentence case, with no letter substitution. Hueristic and Passable spend their idea in the wordmark; Parley spends it in the mark, so the two don't compete.

**Tagline:** *A link is all anyone needs.*

Pre-generated assets ship in `brand/`. Lockups are built as React components rather than SVG files so they inherit `currentColor` and need no per-theme variants.

---

## 5. Architecture

```
Browser (Next.js App Router, React 19)
   │
   ├── WebRTC media ──────────► LiveKit Cloud SFU
   │                             (video, audio, screen share,
   │                              data channels for chat + reactions)
   │
   ├── POST /api/livekit/token ─► Next.js Route Handler
   │                              signs JWT with LIVEKIT_API_SECRET
   │                              (server only — never in client bundle)
   │
   └── Supabase JS ────────────► Supabase
                                  Auth (magic link, Google)
                                  Postgres (meetings, participants)
                                  RLS on everything
```

**Stack**

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 15, App Router, TypeScript | Server route handler for token signing; shadcn expects React |
| Styling | Tailwind v4 + shadcn/ui | Specified |
| Icons | HugeIcons | Specified |
| Media | LiveKit Cloud | SFU, TURN, simulcast, adaptive bitrate, data channels — all rented |
| Client SDK | `livekit-client` + `@livekit/components-react` | **Hooks only.** See rule below. |
| Server SDK | `livekit-server-sdk` | Token minting |
| Backend | Supabase | Already in use |
| Hosting | Vercel | Route handlers, edge, zero config |
| Forms | Native state + `zod` | One parse on submit. `react-hook-form` was specified here and never used — every form in the product converged on the lighter pattern §10 asked for, so the stack table was describing a plan rather than the build. `zod` stays: env validation, route handlers, shared client/server schemas. |
| Dates | date-fns + date-fns-tz | Timezone-correct formatting |

**Critical rule: use LiveKit's hooks, never its prebuilt UI.**

`useRoomContext`, `useTracks`, `useParticipants`, `useLocalParticipant`, `useConnectionState`, `useDataChannel`, `RoomAudioRenderer` — yes. These handle subscription lifecycle, track state, and audio element management, which is genuinely hard to get right.

`VideoConference`, `ControlBar`, `GridLayout`, `ParticipantTile`, and the `@livekit/components-styles` CSS — no. They carry their own design system and will fight shadcn at every turn. Build the surface from shadcn primitives.

`RoomAudioRenderer` is the one exception: it renders no visible UI and correctly manages `<audio>` elements for remote participants. Use it.

**This project breaks the single-file convention.** LiveKit tokens are JWTs signed with an API secret of service-role sensitivity. It cannot go in client code. A server endpoint is mandatory.

---

## 6. Data model

```sql
create type meeting_status as enum ('scheduled', 'live', 'ended', 'cancelled');

create table meetings (
  id                uuid primary key default gen_random_uuid(),
  code              text unique not null,
  title             text not null default 'Meeting',
  description       text,
  host_id           uuid not null references auth.users(id) on delete cascade,
  status            meeting_status not null default 'scheduled',
  scheduled_start   timestamptz,          -- null = instant meeting
  scheduled_end     timestamptz,
  timezone          text not null default 'UTC',   -- IANA, creator's zone
  sequence          int not null default 0,        -- for .ics updates
  settings          jsonb not null default
                      '{"guests_allowed":true,"mute_on_entry":false}'::jsonb,
  created_at        timestamptz not null default now(),
  started_at        timestamptz,
  ended_at          timestamptz
);

create index meetings_host_idx on meetings(host_id, scheduled_start desc);
create index meetings_code_idx on meetings(code);

create table meeting_participants (
  id            uuid primary key default gen_random_uuid(),
  meeting_id    uuid not null references meetings(id) on delete cascade,
  user_id       uuid references auth.users(id) on delete set null,  -- null = guest
  display_name  text not null,
  identity      text not null,        -- LiveKit identity string
  role          text not null default 'participant',  -- 'host' | 'participant'
  joined_at     timestamptz not null default now(),
  left_at       timestamptz
);

create index mp_meeting_idx on meeting_participants(meeting_id, joined_at);
```

### Row level security

RLS on both tables. Hosts read and write their own meetings. Nobody reads another user's meeting rows directly.

The join flow needs anonymous read access to a meeting's *public* fields. Do not open the table. Use a `security definer` function that returns only what a join page needs:

```sql
create or replace function public.get_meeting_by_code(p_code text)
returns table (
  code text,
  title text,
  status meeting_status,
  scheduled_start timestamptz,
  timezone text,
  guests_allowed boolean
)
language sql
security definer
set search_path = public
as $$
  select m.code, m.title, m.status, m.scheduled_start, m.timezone,
         coalesce((m.settings->>'guests_allowed')::boolean, true)
  from meetings m
  where m.code = p_code
    and (
      m.status not in ('ended', 'cancelled')
      or coalesce(m.ended_at, m.created_at) > now() - interval '30 days'
    )
$$;

grant execute on function public.get_meeting_by_code(text) to anon, authenticated;
```

This deliberately leaks nothing: no host identity, no participant list, no settings beyond the one flag the join page needs.

Ended meetings resolve for 30 days so the join page can show "This meeting has ended" rather than pretending the code was never real. After that they fall through to not-found, and stale links stop resolving. Returning `status` is what lets the client tell the two states apart; it is also why the client must branch on `status` rather than treating any successful result as joinable. **Joinability is enforced at the token endpoint, not here** — this function is display data only, and an ended meeting resolving does not mean its room can be entered.

---

## 7. API surface

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/api/livekit/token` | POST | optional | Mint a room token |
| `/api/meetings` | POST | required | Create meeting |
| `/api/meetings/[code]` | PATCH | host | Update scheduled meeting |
| `/api/meetings/[code]` | DELETE | host | Cancel |
| `/api/meetings/[code]/ics` | GET | public | Calendar file |
| `/api/livekit/webhook` | POST | signature | Room lifecycle → update status |

### Token endpoint contract

```
POST /api/livekit/token
{ "code": "kqr-8mzt-vnp", "displayName": "Ama" }

200 { "token": "eyJ...", "url": "wss://xxx.livekit.cloud", "identity": "guest_a1b2c3" }
403 { "error": "guests_not_allowed" }
404 { "error": "meeting_not_found" }
410 { "error": "meeting_ended" }
429 { "error": "rate_limited" }
```

Rules for this endpoint:

- Verify the meeting exists and is joinable **server-side** before minting
- For authenticated users, derive `identity` from the session, never from the request body
- For guests, generate `guest_${nanoid(10)}` server-side
- Sanitise `displayName`: trim, collapse whitespace, 1–40 characters, strip control characters
- Grant `roomJoin`, `canPublish`, `canSubscribe`, `canPublishData`, `room: code` — nothing wider
- Set `ttl` to 6 hours
- Put `displayName` and `role` in token `metadata`, not in the identity string
- Rate limit in two tiers, keyed on IP (see below)

### Rate limiting

A flat 10/minute/IP was the original figure and it is wrong. Seventeen people joining one meeting from a single office share one public IP, and mobile carriers — Ghanaian networks included — put thousands of subscribers behind carrier-grade NAT. A limit that low blocks a full room and can block unrelated strangers.

The number was also defending the wrong thing. Code enumeration is not a live threat: at roughly 8×10¹⁴ codes, a brute-force run takes geological time regardless of the limit. The real defences are the code space, server-side validation before minting, and narrow grants. Rate limiting here is hygiene against flooding, not the wall.

**The signal that separates an attacker from an office is whether the code resolves.** Seventeen colleagues produce seventeen valid-code requests. An enumerator produces a stream of misses. So limit the misses, not the hits:

| Tier | Limit | Applies to |
|---|---|---|
| Overall | 60 / min / IP | Every request. Accommodates a full room from one NAT with headroom. |
| Unresolvable code | 5 / min / IP | Counted after lookup — unknown or expired codes only |

Authenticated requests get their own bucket keyed on user id rather than IP, since a signed-in host is not the threat model.

**Malformed codes are rejected before lookup and do not count toward the miss tier.** This is deliberate, not an oversight: a code containing a character outside the alphabet costs nothing to reject — no database round trip — so the overall limit is sufficient cover. Only requests that reach a lookup and fail it are worth counting, because those are the ones that cost something.

**A 429 on join is not a dead end.** Return `Retry-After` and have the client hold the pre-join screen in a "joining" state with automatic backoff, not an error. A rare, very large meeting from one network should fill slowly rather than fail — §3.11's rule that nothing fails silently applies here as much as to a dropped connection.

---

## 8. Security

- `LIVEKIT_API_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` are server-only. No `NEXT_PUBLIC_` prefix. Anything with that prefix ends up in the client bundle.
- Add a startup assertion that refuses to boot if a service-role key appears in a public variable. Passable already does the equivalent; keep the habit.
- Room names are meeting codes, and access is gated by the token endpoint. Guessing a code is 8×10¹⁴ attempts; rate limiting closes the rest.
- Chat is rendered as text. Never `dangerouslySetInnerHTML`.
- Autolinked URLs get `rel="noopener noreferrer nofollow"`.
- CSP allowing `wss:` to the LiveKit host and `blob:` for media.
- LiveKit webhooks verified against the signature header before acting.

---

## 9. Accessibility

Target WCAG 2.1 AA. This is the part of the product that separates it from a weekend clone.

**The enforceable per-control rules live in `CLAUDE.md`'s accessibility floor and are not repeated here.** Focus rings, tab order, `aria-expanded` on disclosure controls, action naming on state toggles, touch targets, axe coverage — that is implementation mechanics, and a second copy of it in this document has already drifted once. This section owns the product decisions and the reasoning behind the numbers; `CLAUDE.md` owns how they are built.

### Announcement policy

The hard problem here is not making the room announce things. It is stopping it.

**Join and leave** go into a `polite` region, batched: more than three events in five seconds collapses to "3 people joined", and above eight participants individual announcements are suppressed entirely. The thresholds are a judgement about attention, not a technical limit — in a ten-person standup where everyone arrives at once, a screen reader user who hears ten separate arrivals has learned nothing and lost thirty seconds.

**Chat** announces the sender and that a message arrived, never the body, and only while the panel is closed. Body content belongs in the panel, where it can be read at the user's pace rather than pushed at them mid-sentence.

**Reactions** are throttled to one announcement per participant per two seconds, phrased as "Ama reacted with applause". Reactions are the highest-volume, lowest-information channel in the room; unthrottled they would drown everything that matters.

**Connection state** is announced once per change, never per retry. A reconnection attempt loop that narrates itself is the failure mode §3.11 exists to prevent, transposed into audio.

Everything here is `polite`. Next mounts its own `role="alert"` route announcer, which is assertive, and a second assertive region guarantees exactly the flooding these rules are written to avoid.

### Keyboard shortcuts

`Cmd/Ctrl+D` mic, `Cmd/Ctrl+E` camera, `Cmd/Ctrl+Alt+C` chat, `Esc` closes a panel. All suppressed while focus sits in a text input. `?` opens a shortcuts dialog.

### Ownership

Where a number is a design judgement — the batching thresholds above, the announcement phrasing — this document owns it and `CLAUDE.md` references it. Where it is an implementation mechanic — focus ring offsets, aria attributes, touch target sizes, axe coverage — `CLAUDE.md` owns it and this document does not restate it. The same split already applies to the contrast table. Both duplications drifted before the split existed; neither can now.

### Navigability without sight

The video grid carries a heading and a participant count, so the shape of the room is available without seeing it.

### Out of scope

**Captions.** Live captions need a transcription service and change the cost model, which is the same reason recording is out. Say so plainly in the product rather than leaving people to discover the absence.

---

## 10. Performance targets

| Metric | Target |
|---|---|
| Pre-join interactive | < 1.5s on broadband |
| Join click → first remote video | < 2.5s |
| Grid reflow on join/leave | < 16ms, no thrash |
| Chat message end to end | < 500ms |

### Bundle budgets

All figures are **First Load JS totals, gzipped** — the units Next reports, and inclusive of the shared baseline. Verify that unit assumption once per major Next upgrade rather than trusting it.

| Route | Budget | Route-specific headroom |
|---|---|---|
| Shared baseline | ≤ 180 kB | — |
| `/` marketing | ≤ 190 kB | ~15 kB |
| `/j/[code]` pre-join | ≤ 230 kB | ~55 kB |
| `/room/[code]` | ≤ 250 kB before the dynamic import | ~75 kB |
| `/dashboard` | ≤ 280 kB | ~105 kB |
| `/schedule` | ≤ 290 kB | ~115 kB |
| `/schedule/[code]` | ≤ 290 kB | ~115 kB |

The two scheduling routes are measured at 273 kB and 264 kB, with headroom on the dashboard's reasoning: authenticated, low-traffic, returning users.

`/schedule` sits ~10 kB above `/dashboard` because it is the only signed-in route mounting a Radix overlay primitive from the scroll-locking family — FocusScope, FocusGuards, `react-remove-scroll`, `aria-hidden` — which this build carries per route rather than hoisting. About 7 kB of the excess is that fixed family cost, which any Dialog, Popover, DropdownMenu or Sheet would carry identically; about 3 kB is Select's own implementation. The split comes from an intervention rather than an inspection: adding a throwaway Popover to `/dashboard`, changing `/schedule` not at all, closed the gap from 10 kB to 3 kB.

Not involved, despite two rounds of plausible guessing: `react-day-picker` (removed, and its removal moved no route total), a full IANA zone list (`COMMON_TIMEZONES` is seventeen hand-picked entries), or `date-fns-tz` (its chunk is shared across all three routes). The first draft of this paragraph credited the zone list on the strength of one incidental `Africa/Accra` string inside what turned out to be `react-remove-scroll`. Chunk labels are not evidence.

**No change recommended.** `/j/[code]` renders three of the same primitive, so swapping Select out of `/schedule` alone deletes zero library code while introducing a second select idiom — to relieve a budget sitting at 273 against 290.

Moving the edit form behind `next/dynamic` was the right instinct — most visits to `/schedule/[code]` copy a link and never open it.

`/j/[code]` is the one that matters. It is a cold load for a stranger on a phone with an empty cache, and §3.3 names it the highest-traffic flow in the product. The dashboard is deliberately loose: it sits behind auth, the same people revisit it, and its bundle amortises across sessions.

**The shared baseline is the leveraged number.** At 160 kB it is the dominant term in every route above, so a kilobyte removed there is a kilobyte removed five times. Next's App Router floor is roughly 105–120 kB gzipped, which puts 40–55 kB of our own code in the shared chunk before any feature exists. That is worth an itemised look before optimising any individual route — cutting shared beats cutting `/dashboard`.

**These four route numbers are provisional.** They are inferred from a baseline measured against a nearly empty app, not from any route that does its real work yet. Recalibrate at the end of Phase 3, when pre-join actually exists and there is evidence rather than estimate. A budget invented ahead of the code is a guess wearing a number, and the first version of this table put its tightest constraint on the wrong route for exactly that reason.

Two specifics that follow from the `/j/[code]` budget: pre-join uses `navigator.mediaDevices` directly and needs no LiveKit code, and it should not pull a form library in for a single display-name field. Native state and one parse on submit is a fraction of the weight — a rule that ended up governing every form in the product, not just this one.

`livekit-client` is dynamically imported on the room route only and must not appear in any other bundle. Pre-join uses `navigator.mediaDevices` directly for preview and device enumeration — it needs no LiveKit code at all.

---

## 11. Build phases

Each phase is a Claude Code session with a clear finish line. Do not start the next until the current one meets its criteria.

| Phase | Scope | Done when |
|---|---|---|
| 0 | Scaffold, tokens, theme, shadcn, HugeIcons, fonts, brand assets | A tokens page renders every colour, type step, and icon; brand components render at every size; light/dark toggle works without flash |
| 1 | Supabase schema, RLS, `get_meeting_by_code`, auth | Sign in via magic link and Google; RLS blocks cross-user reads (proved with a test) |
| 2 | Meeting creation, codes, dashboard | Create instant + scheduled meetings; codes are unique; dashboard lists both sections |
| 3 | Token endpoint, pre-join screen | All six permission states render correctly; devices enumerate and carry into the next step |
| 4 | Room: connect, grid, tiles, controls | Two browsers see and hear each other; all layout breakpoints correct; mute truth verified |
| 5 | Chat + reactions over data channels | Messages and reactions cross between clients; rate limit holds under rapid clicking |
| 6 | Scheduling, `.ics`, calendar links | File imports into Google, Apple, and Outlook; cross-timezone display verified |
| 7 | Screen share, participants panel | Browser-native stop is detected; share replacement dialog works |
| 8 | Connection states, reconnection | Network kill for 10s recovers without reload; every degraded state has a designed treatment |
| 9 | Accessibility pass | Full keyboard traverse; SR announcements batched; axe clean on every route |
| 10 | Mobile, error routes, polish | iOS Safari backgrounding recovers; unknown code and ended meeting pages complete |

Rough estimate: 6–8 weeks focused, roughly 3 months alongside other work.

---

## 12. Risks

| Risk | Mitigation |
|---|---|
| iOS Safari kills video tracks on tab background | Detect `visibilitychange`, show an explicit resume state, re-publish on return |
| Autoplay policy blocks remote audio | Join must be a real user gesture; `RoomAudioRenderer` handles the rest; keep a fallback "Enable audio" prompt |
| Bandwidth cost | Egress is the bill, not compute. No recording keeps it low. Set a LiveKit spend alert on day one. |
| Ephemeral chat surprises users | Say it in the empty state, not in a settings page nobody opens |
| Instrument Sans lacks non-Latin coverage | Explicit fallback stack; test with a CJK and an Arabic display name |
| Grid performance at 16+ tiles | Subscribe only to visible tiles; LiveKit adaptive stream handles resolution |
| Scope creep toward recording | It is listed as out of scope here. Point at this document. |

---

## 13. Out of scope for v1

Recording · transcription · live captions · breakout rooms · virtual backgrounds · noise suppression beyond browser default · waiting room / lobby · dial-in · org admin and SSO · persistent chat history · file sharing · polls · whiteboard · e2e encryption · native apps

End-to-end encryption deserves a note: it is a reasonable ask and it breaks server-side recording and transcription. Decide before adding either, because retrofitting in any direction is expensive.

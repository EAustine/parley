# Build plan v1.3 — field findings and the interface pass

From testing the deployed app, plus a design pass done as working HTML.

Read `CLAUDE.md` for rules and tokens, `PRD.md` for spec, `BUILD-PLAN-v1.2.md` for the previous interface pass, `BRAND.md` for identity.

**The `design/` folder is the visual specification.** Three HTML files, every colour written as a `var()` copied verbatim from `CLAUDE.md`. Translate the **token names**, not the computed values: `var(--popover)` → `bg-popover`, `var(--boundary)` → `border-boundary`. Nothing to interpret, and no way for a hardcoded hex to arrive by accident.

| File | Screens | Tracks |
|---|---|---|
| `design/01-signin-prejoin.html` | Landing (signed out, signed in) · sign in · pre-join (asking, ready, denied) | E |
| `design/02-room.html` | Grid · panel · watching a share · sharing · host ended it | B, C, F |
| `design/03-dashboard-schedule.html` | Meetings · empty · schedule · meeting detail | A, D |

Each has a **Phone** toggle in the bottom bar for the mobile layout, and a **Theme** toggle where the surface is theme-responsive. Delete the `.demo-nav` block and its script when translating.

---

## Track A — Defects

### A1. The dashboard partition is wrong. Field issues 7 and 8 are one bug.

An **instant** meeting from Thursday at 22:22 and a **live** meeting from Wednesday were both in "Upcoming · 41", and a meeting whose time had passed never moved to past. One partition computed from the wrong thing.

An instant meeting has no `scheduled_start`, so it can never be upcoming — it is live from creation, or ended, or expired under §3.2's 12-hour rule. A `live` meeting is not upcoming either; it is happening.

| Section | Rule |
|---|---|
| **Live now** | `status = 'live'` — its own block above the filter, never inside either list |
| **Upcoming** | `status = 'scheduled'` **and** `scheduled_start > now()` |
| **Past** | `status in ('ended','cancelled')`, **or** `scheduled_end < now()` |

**A meeting whose end time has passed reads as past whether or not anything told the database so.** That is the belt to the webhook's braces, and it is what was missing.

### A2. Is the LiveKit webhook actually receiving events?

A1's symptom points here. If `room_finished` were arriving, a meeting that ran and emptied would carry `status = 'ended'` and would have sorted correctly without the time fallback.

Check three things in order: the webhook route is deployed and reachable at its production URL; the URL is registered in the LiveKit project settings; signature verification is passing rather than silently rejecting. **A webhook that 401s on every delivery looks exactly like one that was never called.**

### A3. Camera off then on does not restore video

Distinguish before fixing. If `localParticipant.videoTrackPublications` shows a live track while the element is blank, it is attachment. If there is no track, it is acquisition.

This is also a **mute-state truth** failure in the sense rule 3 means: the UI says camera on while nothing is published.

### A5. Vercel Deployment Protection is blocking every guest

**Fix this before anything else.** A visitor joining from another device was redirected to Vercel.

Vercel enables Standard Protection by default on new deployments, bouncing anyone who is not a Vercel user with project access to a Vercel login page. Its scope exempts production *custom* domains, and this project has none — a generated `*.vercel.app` URL sits inside the protected set.

It is invisible to whoever built the project, because they are signed into Vercel. Everyone else hits a login wall for a service they have never heard of. **That is the guest flow, which is the highest-traffic path in the product and the thing the tagline is about.**

Project → Settings → Deployment Protection → Vercel Authentication → **Disabled**. Or add a custom domain, which removes it structurally. If a domain is added, update Supabase's Site URL and redirect list, and `NEXT_PUBLIC_APP_URL`; the Google callback does not change, it is Supabase's.

**Then verify from a device that has never signed into Vercel or Parley**, private window, on a real `/j/[code]` link. Until that passes, "guests can join in production" is **unverified** — it rests on one observation that may have worked for the wrong reason, and it is the claim the product is built around.

### A4. The seed data has become litter

"Upcoming · 41", with eight identical "Quarterly planning" rows. The seed script was specified as idempotent and evidently is not. Fix the idempotency, wipe, reseed. This dashboard is the screenshot people will see.

---

## Track B — Unfinished spec

### B1. Leave and "End meeting for everyone"

`CLAUDE.md`'s vocabulary already distinguishes **Leave** from **End meeting** and says the two must never be conflated. Only Leave exists.

**The whole Leave button opens a menu for a host** — not a split button. A split puts two actions inside one control at different coordinates, and on a 40px mobile bar the target separating "leave" from "end this for everyone" is about 30px wide. That is a mis-click costing other people their meeting.

Two items, each with a second line saying what happens:

- **Leave the meeting** — "It carries on without you. Your link still works."
- **End meeting for everyone** — "Everyone is disconnected and the link stops working." In `--state-critical`.

Ending then **confirms** in a native `<dialog>` opened with `showModal()`. The menu is a choice; the dialog is the commitment. Native gives focus trapping, Escape, and backdrop inert-ing for free — which matters because `CLAUDE.md` says modal surfaces trap and non-modal panels do not.

**A guest has no second option, so for them the button leaves directly and renders no chevron.** A menu with one item, or a chevron opening something disabled, is worse than the button they had.

Ending uses the same server route and `roomAdmin` grant as removal, after RLS confirms the caller is the host. It sets `status = 'ended'` and `ended_at` and disconnects everyone. §3.8 still binds: that route ends and removes, nothing wider.

Everyone else lands on a designed state — "The host ended the meeting", with the duration and no Rejoin, since rejoining would fail. Distinct from a connection failure and from having left voluntarily. See screen 5 of `02-room.html`.

### B2. Device management mid-call. Field issues 2 and 5 are one feature.

§3.3 specified device selectors in pre-join and nothing after. Build once, for all three:

- **Selection mid-call** — camera, microphone, speaker. **Its entry point is "Audio and video settings" in the control bar's overflow menu**, which is where the design puts it.
- **Speaker selection** needs `HTMLMediaElement.setSinkId`, unsupported in Safari. Feature-detect and hide rather than showing a control that does nothing.
- **Hot-plug** — `navigator.mediaDevices.ondevicechange`. **Do not switch silently.** A non-modal prompt: "AirPods connected. Switch?" with Switch and Dismiss.

That last point is a decision. Silently moving someone's audio to a device they did not choose is how a private conversation comes out of a laptop speaker in an open office.

---

## Track C — The room

Specified by `design/02-room.html`. Everything below is visible there.

### C1. Self-view is a corner PiP, and it is draggable

Your own face does not need equal weight with the people you are talking to. On a two-person call that is the difference between two half-screens and one full one.

**It is anchored to the video area, not the screen.** The first build of this mockup had it `position:absolute` inside an unpositioned parent, so on mobile it resolved to the frame and sat on top of the control bar. Wrap the grid and the PiP in a positioned container.

Draggable within that container, `touch-action:none` so the page does not scroll under the drag, and constrained so it cannot be thrown off-screen.

### C2. Control bar tiers, and an overflow menu

Three tiers, as v1.2's B4 described:

- **Primary, labelled** — Mute, Stop video, Present. The ones you hit under pressure, and where a wrong guess costs something.
- **Secondary, icon with tooltip and `aria-label`** — reactions, chat, people. Ghost until hover, filled while their panel is open.
- **Destructive** — Leave, the only non-circular control.

**Mobile is six controls**: mic, camera, chat, people, overflow, Leave. Present and reactions move into the overflow menu, which also holds audio and video settings and, on desktop, keyboard shortcuts. Eight controls do not fit a 390px bar; six fit with room.

The people badge is a 16px pill on the icon's corner. **It must be positioned against a wrapper containing only that button** — in the mockup it briefly anchored to a container holding two buttons and rendered on the wrong one.

### C3. One panel, two tabs

Chat and People in the same surface rather than two panels that cannot coexist — which dissolves the one-at-a-time constraint by removing the second panel.

- **Chat** — sender and timestamp at caption weight, body at 15/22. System messages centred, quieter, structurally different. **A send button beside the composer**, disabled until there is content; Enter still sends, the button is for touch.
- **People** — **copy link at the top**, then each person with mic *and* camera state. Two icons, because one cannot express "camera off, mic on".

On mobile the panel is a bottom sheet capped at 55dvh with a drag handle, so the video stays visible above it.

### C4. Sharing

**When you share, the share region is not rendered at all.** You get the grid at full size and one compact bar: icon, "You're sharing your screen", and Stop inside it. That removes the dead space, removes the triple announcement, and gives the tiles the room the field report asked for. On mobile the bar is full-width rather than a pill — as a pill it sized to its content and the button label wrapped.

**Watching someone else share**: content `object-fit: contain` in the main area, filmstrip a 220px right column on desktop and a **96px horizontal strip** on mobile. Not a 2-up grid consuming the top third.

### C5. Screen share on mobile — the spec is wrong, not the build

Reported three times, and "desktop only" was never the right rule. `getDisplayMedia` is **unsupported on iOS Safari entirely**; **Android Chrome supports it**. Feature-detect and **hide — not disable — where unavailable**. A disabled control invites someone to keep trying.

§3.7's "Desktop only" becomes "Where `getDisplayMedia` is available."

### C6. Reactions

Fluent Emoji 3D, MIT licensed. Preload the six on room entry — a reaction that arrives before its image is worse than a flat one.

On "more realistic": the current 2400ms float is what §3.6 specified and was built correctly. **Try the curve before the assets** — an arc rather than a straight rise, slight rotation, and an ease that decelerates before the fade. That may be the whole complaint, and it is free. Reduced motion still fades in place.

---

## Track D — Meetings and scheduling

Specified by `design/03-dashboard-schedule.html`.

### D1. The list

**Live is its own block** above the filter, with a pulsing dot, elapsed time, participant count, and Join.

**Upcoming groups by day.** 41 rows in one flat list is a wall. Day headers make it scannable, and the time is the leftmost column at 15px so you scan times rather than reading titles to find one. **The zone label is always printed** — §3.9's trap.

Filter is a segmented control: Upcoming and Past with counts. Row actions appear on hover and are always visible on touch, so the list is quiet at rest.

### D2. Header hierarchy

"Sign out" was a peer of "Start meeting", which it is not. It moves into an **account menu** carrying the email, theme, and sign out. Page actions are Start meeting (primary) and Schedule (secondary).

### D3. The schedule form

Three questions rather than a flat stack of six fields: **what it is**, **when it is**, **check it**.

- **Time picker**: a 15-minute select on desktop, native `<input type="time">` on mobile for the OS wheel.
- **The preview is computed from the form**, not static copy. Title, day spelled out, start *and end* derived from duration, zone in bold, and **the UTC equivalent when the selected zone is not UTC**. That is the whole reason the card exists: someone in Accra scheduling for New York should see the mismatch before scheduling, not when nobody joins. Title falls back to "Untitled meeting" so the card does not jump while typing.
- Use `date-fns-tz` with the IANA zone. The mockup hardcodes offsets because it is static; a fixed `+1` for London is right in September and wrong in January.

### D4. Meeting detail

Link with copy, then **"Email an invite"** — a `mailto:` with subject and body pre-filled — beside the `.ics` and calendar prefill buttons. No provider, no deliverability, no bounce handling, most of the value. Real email sending is its own project, not a line item.

Then Edit and Cancel meeting.

### D5. Dashboard freshness

Not a timer. Compute the partition from `now()` at render, which A1 delivers anyway, then `router.refresh()` **on window focus**. Nobody watches a dashboard for five minutes; they come back to it, and that is the moment the data should be current.

### D6. No "Recurring" tag

It appeared in a draft of the design and is removed. No recurrence logic has been decided, and a tag implying behaviour that does not exist becomes a feature request by inference.

---

## Track E — Sign in and pre-join

Specified by `design/01-signin-prejoin.html`.

### E1. Sign in

The wordmark had more weight than the task. Mark at 36px, "Sign in" as the heading, form on a `--popover` card with a `--boundary` edge so it is a surface rather than floating text. A line explaining the magic link has no password and expires. An escape hatch for someone who arrived with a code and needs no account.

**Move `signInWithOtp` and `signInWithOAuth` behind a server action** while here. `/sign-in` builds at 249 kB, is public and cold-load, and carries `supabase-js` for no other reason. It also makes sign-in work without JavaScript. Measure, then set the budget — see `PRD.md` §10.

### E2. Pre-join

Split layout: preview left, meeting title and panel right. Better use of horizontal space than a centred column.

- Mic and camera toggles sit **on the preview**, over a gradient scrim rather than raw video, which puts them where attention already is.
- The level meter is a 4px bar directly under the frame, so it reads as voice rather than as a widget.
- **Every permission state renders inside the preview frame** — the denied state is where the video would be, not a banner elsewhere, so the eye never hunts for the explanation.
- Denied copy names the browser and the steps, and offers **"Join without camera or mic"** rather than dead-ending. Someone blocked at their office should still be able to listen.
- **Mobile**: preview edge-to-edge, device selects behind a disclosure (one camera and one mic on a phone; the join button should not sit four fields down), Join sticky at the bottom with a safe-area inset.

Fix A3's camera bug first. There is nothing to design around a dead preview.

### E3. The landing page, in two states

`PRD.md` §3.10a, now specified in `design/01-signin-prejoin.html`.

**The tagline is the heading, not the wordmark.** The current build sets "Parley" at display size in the page body, repeating the header and pushing both entry points below the fold. "A link is all anyone needs" is the proposition and earns the size.

**The code field validates before enabling Join** — `xxx-xxxx-xxx` against the real alphabet. A permanently grey button that does nothing when pressed is worse than no button.

**Signed in is a different page, not the same page with a swapped button.** Start a meeting becomes primary, joining by code drops to secondary, sign-in disappears, the account is named, and there is a quiet link to Your meetings. Naming the account matters — someone with two Google accounts should know which one they are in before creating a meeting under it.

**Do not redirect a signed-in visitor to `/dashboard`.** They typed the domain or followed a bookmark. Without that decision the signed-in state is unreachable and the work is wasted.

---

## Tokens and rules added during this pass

Already in `CLAUDE.md`; listed here so they are not lost.

**`--on-scrim` and `--on-scrim-muted`.** `--scrim` is theme-invariant — it always sits over video, and video is always dark. `--foreground` flips with the theme, so in light mode it lands at **2.3:1** on the scrim and disappears. That was a live bug: every control and label drawn on a scrim was invisible in light mode. `--foreground` is not permitted there.

**`color-scheme`.** `:root{color-scheme:light}`, `.dark{color-scheme:dark}`, room forced dark. Native controls paint their own parts — date picker glyph, select dropdown list, scrollbars, spinners — and without this the browser draws them for a light UI. It matters more with Radix `Select` replaced by native `<select>`: the trigger is ours, the open list is the operating system's.

**`--boundary`, renamed from `--tile-border` and raised to `#687284`.** It is the boundary colour for any surface with no usable fill contrast against what it sits on — tiles, panel edges, form-field borders. No fill in this palette separates from another, so **any surface that must read as a distinct plane needs an edge**.

---

## Translating the HTML

Three things learned building it that will bite in the port:

**Every rule in a mobile media block must override every property the desktop layout set**, not just the ones that look layout-related. `align-items:start` was correct for a grid with columns of different heights and actively wrong the moment the same selector became a flex column — it left-aligned and shrink-wrapped every child, collapsing a `width:100%` preview to zero.

**Check a selector against everything it can hit, not just the thing in front of you.** A mobile rule sizing `.ctl` to 40×40 also hit the labelled button inside the share bar. A badge written as `.ctl .count` never matched, because `.count` is a sibling.

**Assert rendered geometry, never declared CSS.** Both of the above passed every structural check — balanced tags, valid CSS — and were visible only in a browser. Same rule as the tile that declared `aspect-ratio: 16/9` correctly and rendered 1956px into 1337px.

---

## Sequence

1. **A5** — Deployment Protection. Nothing else matters while no guest can reach the app.
2. **A1, A2** — partition and webhook. Everything on the dashboard is wrong until these are right, and D1 and D5 build on A1.
3. **A3** — camera restore. A core control that does not work, and E2 has nothing to design around without it.
4. **A4** — reseed, so the dashboard is legible while working on it.
5. **B1, B2** — the two pieces of unfinished spec.
6. **C5** — feature-detect share, correct §3.7.
7. **Track E** — sign in and pre-join, from `01-signin-prejoin.html`.
8. **Track C** — the room, from `02-room.html`. The largest surface, best done once the device work in B2 exists.
9. **Track D** — meetings and scheduling, from `03-dashboard-schedule.html`.
10. **C6** — reactions last. Most subjective, least blocking.

## Guardrails

Unchanged. No new colours. No hue except where it is the meaning — reactions remain the sanctioned exception. Nothing on a scrim uses `--foreground`. Every new control keeps its name, its role, and its target size, **measured rather than declared**. Re-run the Phase 9 state list at the end, states not routes, in both themes.

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

**Waiting room** — a per-meeting toggle, **on for scheduled meetings and off for instant** — v1.5 A1.

The default is not a preference, it follows the risk: a scheduled link went out days ago to a list nobody re-reads, an instant link was pasted seconds ago to somebody already waiting. A column default cannot express that, because it cannot see `scheduled_start`, so the create route decides. Reversible in both directions, and worth revisiting once there is usage to look at rather than defended on first principles.

**Three homes, and the reason there is more than one.** For most of v1.5 the door had none: the create route picked a default and the token endpoint enforced it, so "reversible in both directions" was reversible in neither — a scheduled meeting was gated permanently and an instant one could not be gated at all. The switch was specified and never built, and the specification did not notice because it described the setting rather than the control.

| Where | For | Why there |
|---|---|---|
| The schedule form | A meeting being created or edited | The default is the route's to choose; this is where a host overrides it before the link exists |
| Pre-join, host only | Chiefly **instant** meetings | They are created with the door open, and this is the only moment between making the link and being in the room |
| The room's overflow menu, host only | A meeting already running | A menu is where settings live, and this one already holds the other one |

The pre-join control is host-only and the page decides that with RLS rather than by widening `get_meeting_by_code`. §6 keeps that function narrow on purpose — "no host identity, no participant list" — and answering "are you the host?" through it would hand every anonymous caller the thing the narrowness protects. A guest is shown nothing and told nothing; there is no `isHost: false` to read.

**Not in the People panel, which is where it was first put.** The argument for putting it above the queue was that the queue is what the switch causes. The argument against is stronger: the panel's other host sections are *decisions* — someone is waiting, someone is blocked — and a setting sitting among them reads as one more thing to answer rather than a state that is simply true. In the menu it names the action and changes with it, per the state-toggle rule, and carries no `aria-pressed`.

**Hiding the control is not the permission check.** The `PATCH` refuses anyone who is not the host, and that is what makes the setting safe; the visibility rule only keeps a guest from being offered something that would fail.

**Toggling the door is not a calendar revision.** §3.9 increments `SEQUENCE` when a scheduled meeting is edited, and nothing about the waiting room reaches the `.ics` — so a door change leaves the sequence alone. Otherwise every attendee's client re-notifies them about a setting they cannot observe.

With it on, **two gates rather than one**, and this is the part that reads like a contradiction and is not:

1. **Nobody enters before a host has joined** — signed in or not, including the first arrival. The alternative, an open door until the host lands, is open exactly when the risk is highest: the link-holder who should not be there arrives *early*, which is the natural behaviour of anyone unsure of the time.
2. **After that, guests are admitted individually and signed-in participants are not.** Signing in buys accountability, which is enough to skip the second gate and not the first.

The host is never held. There is no co-host, so a door that stops them is a meeting that never starts — and the same absence means **a host who never arrives is a meeting nobody enters**. That is a real regression against an open link and it is accepted rather than overlooked, mitigated by copy rather than mechanism: §3.3's waiting screen says so after a wait instead of spinning.

Host presence means **joined, not sitting in pre-join**. A host choosing a camera has not arrived, so a queue can form while they pick a microphone — which is the feature working, not a fault.

**How presence is decided, and why the two errors are not symmetric.** The database is read first and LiveKit confirms — but only in one direction.

| The database says | Actually | Cost |
|---|---|---|
| Host present | Absent | **Somebody walks into an empty room.** The exact failure this feature exists to prevent |
| Host absent | Present | Somebody waits a moment longer |

So the *permissive* answer is the one that gets confirmed: a row saying a host is here is checked against LiveKit's participant list before the door opens, and a row saying nobody is here is trusted, because being wrong about it costs seconds. **The confirm step is not optional.** LiveKit's webhooks are push-based with no delivery guarantee, so a missed `participant_left` leaves an open row for a host who went home hours ago, and without the confirm the database would answer "host present" indefinitely.

The reverse — trusting the yes and confirming the no — shipped and was invisible, because `participant_joined` was not being delivered at all: the table held no host rows, every check fell through to LiveKit, and the branch that trusts a row was never taken. Configuring the webhook is what brought it to life. **A correctness property that cannot be reached is not a correctness property**, and nothing in the suite could have said so while the table stayed empty.

If LiveKit is unreachable, hold. Failing open turns the feature off silently during an incident, which is the worst moment for it to be off. Never cache the yes: a cached permissive answer is the stale row with extra steps.

**Admission outranks presence, and the order is load-bearing.** An `admitted` row can only be written by a host answering the queue, and the queue is reachable only from inside the room — so the row is evidence a host was there, produced by the host, about this person. Weighing it against an inference drawn from a session table has it backwards. The mitigation this section already relies on — "somebody waits a moment longer, and the host lets them in" — is only true if letting them in actually works while presence says no.

It matters more because the presence check does not fall back to LiveKit on a database *no*: without this ordering, a spell of missed deliveries would make a gated meeting unenterable rather than slow, including for the people the host had already admitted. The narrow cost, stated rather than discovered: a host who admits somebody and then leaves before they connect lets that person into an empty room. That is seconds wide, it took a deliberate act, and it is the same trade this section already makes for a host who leaves a meeting running.

**Signing in does not skip the first gate.** Everybody waits for a host; signing in skips only the individual admission.

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

Contains: self-preview, camera toggle, mic toggle with a live input meter, camera/mic/speaker selectors, display-name field for anyone who has not already said what they are called, meeting title, and who is already in the room.

**The field is not "for guests", and the difference is not pedantic.** It read that way here for two versions, on the assumption that a signed-in account always knows its own name. Only one of the two sign-in methods makes that true: Google fills `user_metadata.full_name` from the profile, and the magic link fills nothing, because §3.1 asks for an address and nothing else. Nothing in the product writes that field afterwards.

So the fallback chain in §7 — request, then account, then **email address** — was not a rare tail. For every magic-link host it was the whole answer, and their email address became the name on their tile, in the participants list, on every chat line, and in "{name} asked you to mute", in front of everyone holding the link. §3.2 spends four paragraphs refusing to show a link-holder the host's *name*; an address someone can write to is a wider disclosure than a name, and nobody chose it.

The field is therefore shown to whoever has not answered yet — a guest, or an account with no name on it — and the token endpoint refuses anyone it cannot name, rather than inventing one. This costs a magic-link host one field, once per tab, on a screen §3.3 already puts before every room entry including theirs. Capturing a name at sign-in would reduce it to once ever, and is a change to §3.1's form rather than to this screen.

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

#### Held at the door

With §3.2's waiting room on, pre-join is followed by a hold rather than a room — v1.5 A3.

**Waiting is not joining, and nothing publishes.** The camera and microphone state chosen at pre-join is *held* and applied at the moment of admission. A waiting person has no token and is not in the room at all, so there is no permission flag that has to be correct for them to be unable to hear it — the queue lives in the database and not in the SFU precisely so that the failure mode "the person you did not admit heard the meeting" is unreachable.

This is §3.4's mute-state truth reaching one step further back, and the same rule as the publish-side one above it: **a person who is not in a meeting is not on camera in it.** The screen shows what is held so that is visible rather than promised.

**Five endings, and they must not share a screen.** §3.11 already refuses to let a dropped connection, a voluntary leave and a host ending the meeting share one; the door adds two more.

| Ending | Says |
|---|---|
| Admitted | Enters the room |
| Denied | "The host didn't let you in." |
| Removed | "The host removed you from the meeting." |
| Host never arrived | Says so, after a wait, rather than spinning |
| Meeting ended while waiting | §3.4's ended state, with no Rejoin |

Denied and removed carry the same block and different words. Being turned away and being ejected are different experiences, and telling somebody the wrong one happened to them is §3.2's cancelled-reads-as-missed error in a new place.

**Leave is live from the first second**, never revealed after a delay — §3.11's rule about the reconnect countdown, applied to a wait whose length nobody controls and which may never end.

**Acceptance**
- Mic meter responds to speech within 200ms
- Changing camera in the selector updates the preview without a page reload
- Selected devices carry into the room
- Nobody joins with an empty or whitespace-only name — a guest, and equally a signed-in person whose account carries none
- A host is never named after their email address, on any surface, whichever way they signed in
- Nothing publishes while somebody is held at the door — asserted by counting `getUserMedia`, not by reading the interface
- The five endings are distinguished by their words, not only by a status code
- Preview is mirrored; published video is not

---

### 3.4 The room

#### Layout rules

Write these before writing layout code.

| Tiles | Desktop | Mobile portrait |
|---|---|---|
| 1 | Single tile, full area, 16:9 letterboxed | Full area |
| 2 | Side by side | Stacked, equal |
| 3–4 | 2 × 2 | 2 × 2 |
| 5–6 | 3 × 2 | 2 × 2 + page indicator |
| 7–9 | 3 × 3 | 2 × 2 + pages |
| 10–16 | 4 × 4 | 2 × 2 + pages |
| 17+ | 4 × 4, overflow as "+N" | 2 × 2 + pages |

**This column counts tiles, not heads, and the two differ by one.** v1.3's C1 lifts the local participant out of the grid and draws it as a corner PiP, so a room of N renders N−1 tiles. Sixteen *remote* participants fill a 4×4 exactly, which puts the "+N" cell at seventeen tiles — eighteen people, not seventeen. The column said "Participants" and meant heads, which left the overflow threshold one out and made "1" ambiguous between one person and one tile.

**Except when you are alone.** With nobody else in the room the grid would hold zero tiles and the only thing on screen would be a small self-view in the corner of an empty rectangle, which reads as broken rather than as waiting. A lone participant stays a full-size tile and there is no PiP; the first arrival takes the grid and you shrink into the corner, which is a reflow the grid already animates. So one person and two people both render one tile, and both letterbox — which is why the letterbox rule is keyed on the tile count and not the head count.

**Self-view.** Your own face does not need equal weight with the people you are talking to; on a two-person call that is the difference between two half-screens and one full one. The PiP is anchored to the video area rather than the viewport, is draggable within it, and cannot be thrown off-screen. Because dragging is not the only way to move it — SC 2.5.7 wants a single-pointer alternative — it is a button with a keyboard path to the same positions, not a `<div>` with pointer handlers.

**The filmstrip is unaffected.** While someone is sharing, the strip is where everyone is, including you, and there is no PiP.

Overflow ordering: most recent speaker first, then join order. The person talking is never the person hidden.

Screen share active: shared content takes the main area, participants collapse to a filmstrip (desktop: right edge; mobile: top strip).

**"3 visible" in an earlier draft described the viewport, not a capacity.** The mobile strip scrolls through everyone up to the same 16 the desktop grid holds, with a "+N" cell beyond that — same rule, same ordering, most recent speaker first. At 96px tall a 16:9 tile is ~171px wide, so roughly two and a bit fit a 375pt screen; the partial third is useful, since a clipped tile is the affordance that says the strip scrolls.

Tile aspect ratio is 16:9. Video is `object-fit: cover`. Never letterbox individual tiles inside the grid — it looks broken.

#### Tile contents

- Video, or an avatar fallback: the participant's initial on `--secondary`, uniform, **no hue**. Colour-coded avatars would be the only chroma in the room and would be decorative — the tile position is stable and the name label is directly below.
- Name label, bottom-left, on a scrim — **never directly on video**
- Mic-off indicator, bottom-right
- Speaking ring
- Connection warning, when relevant

#### Active speaker

LiveKit provides smoothed speaking state. Encode it with **no hue**: idle tiles carry a 1px border at `--boundary` (3.93:1 against the room ground, clearing the 3:1 non-text threshold), the speaking tile a 2px border at `--foreground` (17.29:1). 120ms transition on border-color and border-width.

`--border` at 1.29:1 was the original value and is not a visible boundary. Worse, `--card` against `--background` is 1.09:1 — so a camera-off tile had no readable edge at all, which makes this border the only thing identifying the tile as a component. That brings it under WCAG 1.4.11 at 3:1, which the first replacement value (2.09:1) also missed. `--boundary` is the boundary colour for any surface with no usable fill contrast against what it sits on — tiles, panel edges, form-field borders. `CLAUDE.md` holds its permitted-surface table.

Rationale for the encoding: hue on the tile edge competes with skin tones and video content, and it fails for colourblind users. Weight and value read at any size against any background.

#### Controls

A floating bar, bottom-centre, on a scrim. Auto-hides after 4s of pointer inactivity on desktop; always visible on touch. Reappears on any pointer movement, keypress, or focus.

**Three tiers, and the tier is the affordance.** This was a flat row of eight identical icon circles, which gave the control you reach for under pressure the same weight as the one you reach for idly. v1.3's C2 separated them.

| Tier | Controls | Treatment |
|---|---|---|
| Primary | Mute · Stop video · Present | 48px labelled pills, `--secondary` on a `--boundary` edge. The ones you hit under pressure, where a wrong guess costs something. Off = filled `--secondary` with a struck-through icon. Present renders only where `getDisplayMedia` exists. |
| Secondary | Reactions · Chat · People · More | 44px circles, icon with tooltip and `aria-label`. Ghost until hover — transparent, so the backdrop is the bar's own scrim and the value must be `--on-scrim-muted`, never `--muted-foreground` (2.97:1 over bright video). Filled while their panel is open. People carries a 16px inverted pill badge. |
| Destructive | Leave | 48px pill, `--destructive` fill, in its own group at the end of the bar. Opens a menu for a host; leaves directly for a guest. |

**The visible label is the accessible name on the primary tier.** No `aria-label` — an accessible name that does not contain the visible one fails SC 2.5.3 Label in Name, and "Turn off microphone" over a visible "Mute" does not contain it. Below 900px the label is `sr-only` rather than removed, so the name is "Mute" at every width while only the wide bar draws it.

**More** opens the overflow menu: audio and video settings, keyboard shortcuts on desktop, and below 900px Present and reactions, which leave the bar there. Eight controls do not fit a 390px bar; six fit with room. The reactions appear as a row of six emoji menu items rather than a second popup inside the first.

**Leave is no longer distinguished by shape, and this section used to claim it was.** That was true while the other seven controls were identical circles; the primary tier is pills now, so shape separates Leave from Reactions and not from Present. What separates it is the word — it is the only control whose visible label names a destructive action — plus the `--destructive` fill and its own group at the end of the bar. The label is what keeps this off hue alone. **If that is judged too thin, the next move is a shape or a gap, not a stronger red.**

**Mute-state truth.** Local UI state must derive from the LiveKit track's actual published state, not from a separate React boolean. If a track fails to unmute, the UI shows muted. This is a privacy requirement, not a polish item.

#### Leaving, and ending

Two different actions that are never conflated, which the vocabulary has always said and this section did not specify.

**The whole Leave button opens a menu for a host** — not a split button. A split puts two actions inside one control at different coordinates, and on a mobile bar the target separating "leave" from "end this for everyone" is around 30px wide. That is a mis-click costing other people their meeting.

| Item | Second line |
|---|---|
| **Leave the meeting** | "It carries on without you. Your link still works." |
| **End meeting for everyone** | "Everyone is disconnected and the link stops working." In `--state-critical`. |

Ending then confirms in a native `<dialog>` opened with `showModal()`. The menu is a choice; the dialog is the commitment, and native gives the focus trap, Escape and backdrop inerting that §9 requires of a modal surface.

**A guest has no second option, so the button leaves directly and renders no chevron.** A menu with one item, or a chevron opening something disabled, is worse than the button they had.

Ending uses the same server route and `roomAdmin` grant as removal, after RLS has confirmed the caller is the host. It sets `status = 'ended'` and `ended_at` and disconnects everyone. **§3.8's constraint binds here**: that route ends and removes, and nothing wider — `roomAdmin` also carries unmute on LiveKit's server API, and a route that quietly widened its use would undo the guarantee the client-side absence exists to make.

Everyone else lands on a designed state: "The host ended the meeting", with the duration and **no Rejoin**, since rejoining would fail. Distinct from a connection failure and from having left voluntarily — three different things that must not share a screen.

**Acceptance**
- Grid reflows without layout thrash when someone joins or leaves
- Toggling mic updates the icon within one frame of the track state changing
- Controls remain reachable while the panel is open. Mute is a privacy control and must never be reachable only by shortcut.
- **One panel, two tabs.** Chat and People share a single surface, so opening People while Chat is showing switches tabs rather than closing anything. The one-at-a-time constraint is not enforced any more; the second panel it guarded no longer exists.
- Tab order: controls → panel → back to controls. Within the panel the tabs are real tabs — arrow keys, Home and End, roving `tabIndex` — because `role="tab"` is a promise about keyboard behaviour.
- Both bodies stay mounted with one hidden. Chat pins its scroller to the bottom and counts what arrived while you were away; unmounting on a tab change would lose your place every time you looked at People.
- The two bar buttons stay two disclosures with their own `aria-expanded`. A single flag shared by both would claim chat was on screen when people was.
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

Sent over the data channel. Animate upward from the sender's **origin** and fade over 2400ms. Multiple simultaneous reactions stagger horizontally so they don't overlap.

**"From the sender's tile" was this section's wording and stopped being true in v1.3** — C1 lifted the local participant out of the grid and drew them as a corner PiP, and this sentence was not updated. The same shift moved §3.4's layout table from counting heads to counting tiles and went unnoticed for the same reason: a change to *where somebody is* reads as a layout decision, and nothing else that referred to their tile was re-read.

So the origin depends on how many people are in the room, which is the thing the old sentence could not express:

| Room | Your reaction rises from |
|---|---|
| Alone | Your tile — §3.4 keeps a lone participant full-size with no PiP |
| Anyone else present | Your PiP, which is where you now are |

Everybody else's rises from their tile, or from the overflow indicator when they are not currently shown — which §3.6 already required and which is unchanged.

**Both cases clear the control bar's band rather than passing behind it.** The overlay is `absolute inset-0` on a root padded for the bar, and an absolutely positioned box resolves against the **padding box** — so the overlay covers the bar's strip and nothing about the layout prevents a reaction being drawn under it. This is the same property that produced the letterboxed tile and the mute prompt's offset, and it has to be asserted by measurement rather than assumed from the padding.

**Reactions sit above the self-view and below the chrome** — `CLAUDE.md`'s layer scale, and both halves are load-bearing. Above, because a reaction hidden behind your own face is the defect v1.5 D1 was reported for. Below, because a reaction occluding a control is worse than one occluding a face, which is this section's existing rule — "reactions never occlude the name label or mic indicator" — one layer up.

**Rate limit: one reaction per participant per 1000ms, enforced client-side on send and server-agnostic on receive.** Without this, one person can flood the channel.

Under `prefers-reduced-motion`, reactions appear and fade in place with no travel.

**Acceptance**
- Reaction from a participant not currently visible in the grid still surfaces, anchored to the overflow indicator
- Your own reaction rises from your PiP when others are present, and from your tile when you are alone — measured, not inferred from the anchor's input
- No reaction is drawn inside the control bar's band
- Reactions never occlude the name label or mic indicator
- Rapid clicking does not queue; extra presses are dropped, not buffered

---

### 3.7 Screen share

**Where `getDisplayMedia` is available.** One share at a time. **The confirmation goes to the person taking the action, not the person being replaced.**

**This said "Desktop only", and that was never the right rule** — v1.3 C5, after the same report three times. It was a proxy for the real one, and it excluded the single platform that breaks the correlation: **Android Chrome supports `getDisplayMedia` and has no hover**, so a device that can share was told it could not. iOS Safari does not implement it at all, which the capability check catches on its own without a pointer test standing in.

Feature-detect, and **hide rather than disable** where it is absent. A disabled control invites someone to keep trying — and so does an error saying "try again" on a browser that can never succeed, which is why `NotSupportedError` gets its own sentence rather than the generic one.

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

#### The queue

With §3.2's waiting room on, the People tab gains a section **above** the roster — v1.5 A2. Not a third tab: C3 merged two panels into one surface with two tabs, and a third would undo that rather than build on it.

**Allow and Deny sit side by side, and §3.8's own row rule refused exactly that construction.** The distinction is real. A roster row is *passive* — it exists to be read, and an action beside it acts on somebody you were only looking at. A waiting request is a *pending decision*: the row exists solely to be answered, both answers are expected, and Deny is reversible. Putting one of two expected answers behind a menu costs the common flow and buys no safety.

Allow is primary; Deny is secondary and visually distinct, never `--destructive` — rule 5 spends hue on destructive actions and connection warnings, and a reversible refusal at the door is neither. Both are on the 44px floor, and **neither is hover-revealed**, which is the half this shares with the roster.

**The badge carries the waiting count while a queue exists and hands it back when it clears.** Never added to the roster count: three present and two waiting is not five, and the two numbers must not be mistaken for each other. The distinction is fill and value rather than hue — and the accessible name changes with it, because a badge that silently swaps what it counts is one a screen reader cannot describe.

**The toast is a hint; the panel is the truth.** A toast auto-dismisses, so a request arriving while the host is talking is one the host never sees if the toast is the only notice. The badge persists until the queue empties. Ten people waiting produces **one** toast saying how many, never ten.

#### Verified and typed names are visibly different

Signing in buys **accountability, not authorisation**. Anyone can sign in with any Google account, so a signed-in person is *identifiable* rather than invited — which is why §3.2's second gate is guest-only rather than members-only.

The consequence is that a guest can type your name and sit in the roster looking like you. A surface listing "Austine Eluro" without saying whether that was attested or typed implies an attestation the product cannot make. The queue says which is which, and so does the roster.

#### Host powers

A host cannot unmute someone else. Muting is a request the participant must accept — the host can silence, never activate.

**Built as an absence, not a refusal.** The data envelope has `mute-request` and no counterpart, so a modified client has nothing to send. That is stronger than a receiver declining to honour a message: a refusal is code, and code can be refactored away or bypassed when someone later adds a generic handler. A missing message type is not a rule anyone can forget.

The absence covers client to client. It does not cover the server, and that is where the rule needs restating: **`roomAdmin` carries mute and unmute powers on LiveKit's server API.** The remove route mints that grant for a single request after RLS has verified the caller is the host. It calls `removeParticipant` and nothing else. Any future route that spends `roomAdmin` inherits this constraint — the client-side guarantee is worthless if a server route quietly widens it.

---

### 3.9 Scheduling

Fields: title, optional description, date, start time, duration (15 / 30 / 45 / 60 / 90 min or custom), timezone.

**Timezone handling.** Store UTC in the database. Store the creator's IANA timezone alongside. Render in the viewer's local timezone. Always print the zone label next to a time. This is the one place where a quiet bug produces a missed meeting.

**The schedule preview shows two zones at most: the meeting's, and the reader's own when it differs.** Never UTC. UTC is a neutral anchor for storage and for the `.ics`, not a number to put in front of someone confirming a form — a host scheduling in their own zone would read a third time that nobody in the meeting will use. Test this from a zone that is not GMT+0; from Accra the bug is invisible, because UTC and local coincide.

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

Signed-in home. **Three sections: happening now, upcoming, past** — see `BUILD-PLAN-v1.3.md` A1 for the partition and why a two-way split had a hole in it.

A scheduled meeting between its start and end, that nobody has joined, belongs to **happening now**. It is neither upcoming nor past, and an `else past` fallback makes it disappear at the exact moment someone would look for it. Each row: title, time with zone, code, participant count if ended. Primary actions: "Start meeting" and "Schedule meeting."

Empty state is an invitation, not an apology: "No meetings yet. Start one now, or schedule for later."

A row links to the meeting's detail page, `/schedule/[code]`, which is where a meeting is edited before it happens and read after it has.

---

### 3.10a Landing page

`/` has two jobs and no third. It carries the two entry points §2's flow C names, plus the tagline. Nothing else is specified, deliberately: the product is not seeking users, and an unscoped marketing page built in a final phase is a design exercise with nothing to check it against.

The code field must live here and not only on the unknown-code page. Mounting it exclusively on a dead end makes joining by code reachable only after failing to join.

**The tagline is the heading, not the wordmark.** An earlier build set "Parley" at display size in the page body, repeating what the header already says and pushing both entry points below the fold. "A link is all anyone needs" is the actual proposition and earns the display size; the product name does not.

**The code field validates before enabling Join.** Match `xxx-xxxx-xxx` against the real alphabet. A permanently grey button that does nothing when pressed is worse than no button.

### Signed in is a different page, not the same page with a swapped button

"Sign in to start a meeting" is meaningless to someone already signed in, and the hierarchy inverts:

| | Signed out | Signed in |
|---|---|---|
| Primary | Join with a code | **Start a meeting** |
| Secondary | Sign in | Join with a code |
| Absent | — | Sign in |
| Also | — | Which account, and a quiet link to Your meetings |

Naming the account matters: someone with two Google accounts should know which one they are in *before* they create a meeting under it.

**Do not redirect a signed-in visitor to `/dashboard`.** They typed the domain or followed a bookmark; a redirect they did not ask for is worse than a page that does the two things they came for. This decision is what makes the signed-in state worth building — without it, `/` is unreachable for signed-in users and the state is dead code.

Both states are specified in `design/01-signin-prejoin.html`.

---

### 3.10b Who was here

An ended meeting's detail page carries an attendance record: the name each person entered, when they joined and left, who was removed, and who was denied entry. Host only, enforced by RLS like every other meeting row.

**Verified and typed names are visibly different, and that is the load-bearing part of this section.** Signing in buys **accountability, not authorisation** — anyone can sign in with any Google account, so a signed-in person is identifiable rather than invited. That is the same line §3.2's guest-only door rests on, and it has a consequence here: a guest can type your name and appear in this record looking like you. A list that says "Austine Eluro" without saying which implies an attestation the product cannot make. Each row carries "Signed in" or "Name entered", in the record and in the room's roster both.

A denied person's name is a string typed by somebody who never got in. It runs through the display-name sanitiser before it is persisted — length cap, email-shape rejection — and renders as text. §3.2's rule holds for them as much as for anyone: no route puts an email address in front of anyone.

**The record reads two tables, and the reason is a count rather than a schema preference.** A denied person never joined, so no `participant_joined` ever fired and they have no session row. Giving them one looks obvious and is wrong twice: it writes a join that never happened, and `mp_open_session_idx` is partial on `left_at is null` — which is exactly the set the dashboard's live figure counts. A denied person inserted without a `left_at` is indistinguishable from somebody currently in the meeting, so every gated meeting would report phantom attendees on the surface people trust most. They already have a row in `meeting_waiting` carrying the name and the refusal, so the record merges the two for display. No migration, and no way to corrupt a count.

**It reads the *admitted* rows too, and that is a resilience rule rather than a display one.** A session row is written by the `participant_joined` webhook and is the better record — it carries arrival and departure — but for a while it was the only record, and that made the whole section depend on one delivery path. A host held a scheduled meeting, six people came, and this page said **"Nobody joined this meeting"**: every one of them had been admitted through the queue, and not a single `participant_joined` had ever arrived, because LiveKit had never been configured to send it.

The queue already knew. For a gated meeting the host personally allowed each of those people, and that decision is durable, first-party, and written by us rather than delivered to us. So the record surfaces it.

**They read "Admitted", never "Joined".** The host opened the door; without a session the server never saw them arrive, and saying "joined" claims more than is known — the same distinction this section already draws between a name that was attested and one that was typed. The timestamp shown is when they were let in.

**Sessions win where both exist**, matched on the account first and the entered name second. Once the participant events are configured every admitted person has both rows, and reading both unmatched would replace "nobody was here" with "everybody twice" — a new wrong answer in place of the old one.

This does not make the webhook optional. An **ungated** meeting has no queue to fall back on, so it still has no record at all if the events stop arriving; that is a configuration check, and it lives in `MANUAL.md` rather than being assumed.

**An empty record is a fact, not a gap.** A meeting that ended with nobody in it is an ordinary outcome — a link nobody opened, a call that never started — and "Nobody joined this meeting" beats an absent section, which reads as data lost.

**Acceptance**
- A removed participant reads "Removed", not "Left" — the removal writes its reason, and without that the two are indistinguishable
- A denied person appears in the record and **not** in the meeting's live participant count
- A guest and a signed-in participant who entered the same name are distinguishable in the record
- A non-host requesting the record gets nothing, at the row level

---

### 3.11 Connection quality and reconnection

LiveKit reports `excellent | good | poor | lost`.

| Quality | Treatment |
|---|---|
| Excellent, good | No indicator. Silence means fine. |
| Poor | Amber pill on the affected tile: "Unstable connection." Local user also sees a bar: "Your connection is unstable." |

**The participant row says it shorter, and that is a measurement rather than a preference.** The row is avatar, identity, status and the host's actions, and identity is the only flexible zone — so on the 360px panel the full phrase left the name **32px**, two characters and an ellipsis. The row held one line by erasing who it was about, which is the fault v1.4 B1 was reported for. The row chip drops the word "connection", which its own context already supplies: "Unstable", "Reconnecting". Identity becomes 98px and 70px. The tile keeps the full phrase — it is a video frame with a pill on it and has no such context — and both surfaces still share one treatment mapping, so they cannot disagree about *which* state a quality is.
| Lost (remote) | Tile dims to 40%, last frame frozen, label "Reconnecting…" |
| Quality lost locally, before retry begins | The gap between `ConnectionQuality.Lost` and reconnection actually starting. Amber bar, same language as Poor — do not jump to critical for a state that may resolve without a retry. |
| Signal reconnecting | **Media keeps flowing while the signalling connection is down.** Video and audio look perfect; some subset of the room stops working silently. Amber bar naming exactly what is unavailable. |
| Lost (local) | Full-width bar, `--state-critical`. Video paused. Automatic retry with visible attempt count. |
| Failed after retries | **Overlay over the dimmed, frozen room — not a full-page unmount.** "Rejoin" and "Leave". `--state-critical` is permitted on `--popover` (5.42:1), so the overlay can carry it. |

`SignalReconnecting` is the state this section exists for. Every other row here has a visible symptom — a frozen tile, paused video, a stalled grid. This one looks flawless while part of the room has stopped, which makes it the only failure a user cannot detect unaided.

**Its copy must name what is actually broken, verified rather than inferred.** During signal reconnect, track publish and unpublish are unavailable and participant updates stop propagating; whether data-channel messages continue depends on the transport and the SDK version. "Chat and reactions are unavailable" and "you may not see people join or leave" are different claims, and shipping the wrong one is the same class of error as telling someone a cancelled meeting has ended. Confirm by observation which channels actually stop, then write the bar to match — and note in the same place how it was confirmed, so the next reader is not re-deriving it.

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

Note the phrasing: **no hue**, not "weight, not colour." The speaking ring changes weight *and* value (1px `--boundary` → 2px `--foreground`), and several other states change value too. What holds across the whole system is that nothing depends on hue.

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
--boundary           #687284   /* any surface needing an edge — see CLAUDE.md */
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

The shape of the system, which does belong here: every foreground token declares the surfaces it is permitted on and is verified against those. `--state-critical` is permitted on every dark surface except `--input` (4.34:1); validation errors sit below a field on the ground, never inside the filled input. `--boundary` is permitted wherever a surface needs an edge, and never as a text colour.

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

**The motion table lives in `CLAUDE.md` and is not duplicated here.** Durations, easings, and mechanism — FLIP for the grid reflow, instant panel close, share-region enter — are implementation reference, and a second copy has drifted twice already. This section owns the principles; `CLAUDE.md` owns the numbers. Same split as the contrast table and §9's mechanics.

All motion answers a user action. No ambient animation anywhere. `prefers-reduced-motion: reduce` removes travel and keeps opacity changes only.

**Motion is spent where it carries information, not evenly.** Two decisions show the test:

A panel close is initiated by the person watching it, so it is instant — exit motion would tell them something is leaving, which they know, because they clicked to close it. A grid reflow on join is initiated by *someone else*, and the reflow is the only signal it happened; motion there shows the grid rearranging and lets a viewer track where people went. Same product, opposite answers, because one moment carries information and the other does not.

That is the question to ask of any new motion: does it tell the user something they do not already know?

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
| `/api/meetings/[code]` | PATCH | host | Update scheduled meeting, or set the waiting room |
| `/api/meetings/[code]` | DELETE | host | Cancel |
| `/api/meetings/[code]/ics` | GET | public | Calendar file |
| `/api/livekit/webhook` | POST | signature | Room lifecycle and attendance — **four events** |
| `/api/meetings/[code]/waiting` | POST | optional | Join the queue, or ask where you stand |
| `/api/meetings/[code]/waiting` | GET | host | Who is waiting, who is blocked, and the door's current state |
| `/api/meetings/[code]/waiting/[id]` | POST | host | Allow or deny; denying writes the block |

**The webhook needs all four events, and this is a configuration fact rather than a code fact.** `room_started` and `room_finished` write the meeting's lifecycle; `participant_joined` and `participant_left` write `meeting_participants`, which §3.10b's record is built from and which nothing else writes. Subscribing to only the first pair leaves the attendance record silently empty — that is not hypothetical, it is what shipped, because the handler's own docblock said two events were wanted and the subscription followed the sentence.

No check in this repo can see it. `check:webhook` signs its own events and posts them, which proves the handler; the e2e fixtures write session rows directly and say so. Both exercise our half, and the half that failed is a setting in someone else's dashboard. `MANUAL.md` carries it as a check.

**`PATCH` carries the door, and it is the only field an *instant* meeting accepts.** The guard that refuses a meeting with no `scheduled_start` is right for title, times and timezone — an instant meeting has none of them — and wrong for the one field every meeting has. Instant meetings are the case that most needs it, because §3.2 creates them with the door open.

**Setting the door does not increment the calendar `SEQUENCE`.** §3.9 bumps it when a scheduled meeting is edited so clients re-read the event; nothing about the waiting room reaches the `.ics`, so bumping it would announce a revision of an unchanged event and re-notify every attendee about a setting they cannot observe.

**The waiting `GET` carries the door's current value** rather than offering a second endpoint for it. The host is already polling this route every couple of seconds for the queue, so the room's control reads the same answer the queue does and cannot drift from it — one fact with one source, refreshed on a cadence that already exists.

### Token endpoint contract

```
POST /api/livekit/token
{ "code": "kqr-8mzt-vnp", "displayName": "Ama" }

200 { "token": "eyJ...", "url": "wss://xxx.livekit.cloud", "identity": "guest_a1b2c3" }
400 { "error": "display_name_required" }
403 { "error": "guests_not_allowed" }
404 { "error": "meeting_not_found" }
410 { "error": "meeting_ended" }
429 { "error": "rate_limited" }
```

Rules for this endpoint:

- Verify the meeting exists and is joinable **server-side** before minting
- For authenticated users, derive `identity` from the session, never from the request body
- For guests, generate `guest_${nanoid(10)}` server-side
- Sanitise `displayName`: trim, collapse whitespace, 1–40 characters, strip control characters. A name held on the account goes through the same function — `user_metadata` is writable by its owner, so it is the same untrusted string on a different road
- **A display name has exactly two sources: the request, or a name already on the account.** There is no third, and `400 display_name_required` is the answer when there is neither. This list did not say so, and the omission is what the bug grew in: the route filled the gap with `?? user.email ?? "Host"`, which named every magic-link host after their inbox and named non-host signed-in participants "Host". An endpoint that can identify the caller must still decline to *name* them
- **Check the block, then the door, before minting** — v1.5 A1 and B1. The block first, so somebody who was removed meets the same answer whether or not the meeting has a queue, and never appears in it. Then §3.2's two gates. A refusal returns `403` with `waiting_for_host`, `waiting_for_admission`, `denied` or `removed` — four answers because they are four screens, and `Retry-After` on the two that lapse
- **A waiting person leaves here with no token at all.** That is the design rather than an implementation detail: the queue lives in the database, so there is no permission flag that has to be correct for somebody unadmitted to be unable to hear the meeting. Admitting them with publish and subscribe disabled is the elegant alternative whose failure mode is *the person you did not admit heard the meeting*
- **Admission is looked up by subject, never taken from the request.** A client handing over its own queue-row id is a client claiming to be a queue entry, which is the same mistake this list already refuses when it derives identity from the session
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

**The waiting routes take the same two tiers, and the overall one is wider because polling is the design.** A waiting client asks every two seconds, so one person waiting five minutes is 150 requests and a room filling from one office multiplies that by the people in it. The tight tier is unchanged and still counts only codes that fail to resolve — which is what separates a room full of colleagues from somebody walking the code space, and it is the reason the miss tier exists at all.

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
- **The guest block is a cost, not a wall, and is described as one** — v1.5 B1. A denied or removed guest is identified by an opaque 128-bit id in an `httpOnly` cookie, matched against a row scoped to that meeting. It is unforgeable — you cannot guess what you cannot guess — and it needs no signature or signing key for that, which is why it has neither.

  **A private window defeats it.** So does clearing cookies, and so does a second device. What it holds against is reloads, new tabs and a different browser profile on the same machine. That raises the cost of coming back from nothing to knowing to open a private window, which stops the ordinary case and is worth having.

  Stated as a limit deliberately: the moment this is described as a wall, something gets built on the claim. Signed-in people are blocked by account id, which survives everything short of a second account.

---

## 9. Accessibility

Target WCAG 2.1 AA. This is the part of the product that separates it from a weekend clone.

**The enforceable per-control rules live in `CLAUDE.md`'s accessibility floor and are not repeated here.** Focus rings, tab order, `aria-expanded` on disclosure controls, action naming on state toggles, touch targets, axe coverage — that is implementation mechanics, and a second copy of it in this document has already drifted once. This section owns the product decisions and the reasoning behind the numbers; `CLAUDE.md` owns how they are built.

### Announcement policy

The hard problem here is not making the room announce things. It is stopping it.

**Join and leave** go into a `polite` region. **The first event announces immediately by name; everything else in the following five seconds is held and announced as one aggregate when the window closes.** One further arrival reads as a name, two or more as a count — "3 people joined". Above eight participants, individual announcements are suppressed entirely.

There is no separate collapse threshold, and the earlier wording implied one that could not produce its own example string. First-event-immediate keeps a lone arrival responsive in a quiet meeting, which is the case where a name is worth hearing; window-aggregate handles the burst, which is the case where names are worth nothing. A slow trickle announces each arrival individually, because each one opens a new window — which is correct, and falls out rather than needing a rule.

The judgement here is about attention, not a technical limit. In a ten-person standup where everyone arrives at once, a screen reader user who hears ten separate arrivals has learned nothing and lost thirty seconds.

**Chat** announces the sender and that a message arrived, never the body, and only while the panel is closed. Body content belongs in the panel, where it can be read at the user's pace rather than pushed at them mid-sentence.

**Reactions** are throttled to one announcement per participant per two seconds, phrased as "Ama reacted with applause". Reactions are the highest-volume, lowest-information channel in the room; unthrottled they would drown everything that matters.

**Connection state** is announced once per change, never per retry. A reconnection attempt loop that narrates itself is the failure mode §3.11 exists to prevent, transposed into audio.

Everything here is `polite`. Next mounts its own `role="alert"` route announcer, which is assertive, and a second assertive region guarantees exactly the flooding these rules are written to avoid.

### Keyboard shortcuts

`Cmd/Ctrl+D` mic, `Cmd/Ctrl+E` camera, `Cmd/Ctrl+Alt+C` chat, `Esc` closes a panel. All suppressed while focus sits in a text input. `?` opens a shortcuts dialog.

**Discoverability is a focus-visible hint, not a control in the bar.** A skip-link-pattern element at the start of the room — hidden until focused, reading "Press ? for keyboard shortcuts" — appears exactly when a keyboard user tabs in, is announced by a screen reader, and is never seen by mouse or touch users. Control-bar tooltips also carry their own shortcut, giving incidental discovery.

A **dedicated** shortcuts button in the bar was considered and rejected. The bar is the most contested real estate in the product, and a *keyboard* shortcuts dialog is of no use to the touch visitor it would have been added for — a phone has no keys to press. The population that needs this affordance is exactly the population a focus-visible hint reaches.

**The count this argument used to rest on has moved, and the argument survives it.** It read "§3.4 enumerates seven," which was true of a flat row of identical circles; C2's bar carries an overflow control, so desktop is eight. What was rejected was spending a *slot* on this, and the overflow menu is the opposite of a slot — the shortcuts item sits inside it on desktop, costing nothing and reachable by mouse. The focus-visible hint remains the affordance that reaches keyboard users at the moment they need it, and control-bar tooltips still carry their own shortcut for incidental discovery.

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

| Route | Budget |
|---|---|
| Shared baseline | ≤ 180 kB |
| `/` marketing | ≤ 190 kB |
| `/j/[code]` pre-join | ≤ 230 kB |
| `/room/[code]` | ≤ 250 kB before the dynamic import |
| `/dashboard` | ≤ 280 kB |
| `/sign-in` | ≤ 190 kB |
| `/schedule` | ≤ 290 kB |
| `/schedule/[code]` | ≤ 290 kB |

**Budgets only. Measured figures are not recorded here.** Earlier drafts carried the current size of each route beside its budget, and every commit that changed a bundle made this table wrong.

Not in one batch, and not in Track F. The scheduling figures and the baseline were measured, reproduced across clean builds, and correct — before v1.2 began. They then rotted in three separate places: the baseline drifted somewhere across Tracks A–F with nothing recording it, `/schedule` moved when Radix's `Select` went native, `/sign-in` moved when its auth calls became server actions. The last two were deliberate improvements. **Nothing caught any of it, because `check:bundle` passes a budget and cannot notice a document** — Tracks D and F each recorded a clean 10/10 while the numbers here were going stale behind them. A table that goes wrong piecemeal is worse than one that goes wrong all at once: there is no single moment at which someone would think to look.

`check:bundle` knows the real numbers and enforces the budgets; a `--snapshot` flag can emit them when someone wants a reading. A budget is a decision and belongs in a document. A measurement is a fact about the current commit and belongs in the tool.

Same split as the contrast table, §9's mechanics, and §4.4's motion table.

**`/sign-in` had no budget and should have.** It built at 249 kB when this was written — heavier than every budgeted route but the two scheduling ones — and it is public, cold-load, and the first thing a host sees. That is the same error as the original table budgeting `/dashboard` instead of `/j/[code]`: the principle was right and the route list was wrong. **Budgets belong on public cold-load routes**, and `/sign-in` is one.

Do not set the number at 249. Most of that weight is `supabase-js` on the client, and it does not need to be there — `signInWithOtp` sends its email server-side, and `signInWithOAuth` returns a URL a server action can redirect to. Move both behind a server action and the route becomes a form with no auth SDK in the bundle.

An earlier draft of this paragraph cited "the same reasoning as moving sign-out to a route handler". **No such move happened.** It was recommended once, mid-answer, in the middle of a longer discussion about bundle numbers, and was never tracked or built — sign-out is still a client component calling `supabase.auth.signOut()`.

It is now declined rather than left floating. On `/dashboard` the bundle argument does not apply, because `AuthListener` puts `supabase-js` in that bundle regardless, so moving the button saves nothing. And "works without JavaScript" is thin justification in a product that cannot hold a video call without it. The recommendation was weaker than the way it was phrased at the time.

Sign-in is different on both counts: the route is public, cold-load, and currently carries the SDK for no other reason.

Refactor, measure, then set the budget with headroom. Setting it first is how 180 kB landed on the dashboard and 200 kB on `/j/[code]`, both of which were guesses that later had to move.

Both scheduling routes take the dashboard's reasoning, and their headroom with it: authenticated, low-traffic, returning users. `npm run check:bundle -- --snapshot` for where they actually sit.

**The gap this paragraph investigated has closed.** `/schedule` no longer sits above `/dashboard`. v1.2 replaced Radix's `Select` with a native one — for accessibility, not for weight — and the route came down by more than the gap. The investigation below is kept because it named the right suspect.

What it does **not** establish is that the whole scroll-locking family left with `Select`. `Tooltip` reaches every route through `ThemeToggle`, so a Radix overlay primitive is still mounted on both. `Tooltip` is not in the scroll-locking family — that is the distinction the paragraph below turns on, and it is a distinction nobody has re-measured since the swap. Chunk labels are not evidence, and neither is a total moving in the direction you expected — attributing it again would take the same intervention that produced the split below.

`/schedule` sat above `/dashboard` because it was the only signed-in route mounting a Radix overlay primitive from the scroll-locking family — FocusScope, FocusGuards, `react-remove-scroll`, `aria-hidden` — which this build carries per route rather than hoisting. Most of the excess was that fixed family cost, which any Dialog, Popover, DropdownMenu or Sheet would carry identically; the remainder was Select's own implementation. The split came from an intervention rather than an inspection: adding a throwaway Popover to `/dashboard`, changing `/schedule` not at all, closed most of the gap.

Not involved, despite two rounds of plausible guessing: `react-day-picker` (removed, and its removal moved no route total), a full IANA zone list (`COMMON_TIMEZONES` is seventeen hand-picked entries), or `date-fns-tz` (its chunk is shared across all three routes). The first draft of this paragraph credited the zone list on the strength of one incidental `Africa/Accra` string inside what turned out to be `react-remove-scroll`. Chunk labels are not evidence.

**No change recommended.** `/j/[code]` renders three of the same primitive, so swapping Select out of `/schedule` alone deletes zero library code while introducing a second select idiom — to relieve a budget that was not close to its ceiling.

**Overtaken, and by its own argument.** That reasoning was about swapping Select out of `/schedule` *alone*, and it still holds: the library survives as long as `/j/[code]` renders it. v1.2 swapped all five instances, because Radix `Select` fails axe twice and the open listbox could not enter the scan otherwise — and the library left with them. The weight followed the accessibility decision rather than justifying it, which is the order that made the change worth making.

Moving the edit form behind `next/dynamic` was the right instinct — most visits to `/schedule/[code]` copy a link and never open it.

`/j/[code]` is the one that matters. It is a cold load for a stranger on a phone with an empty cache, and §3.3 names it the highest-traffic flow in the product. The dashboard is deliberately loose: it sits behind auth, the same people revisit it, and its bundle amortises across sessions.

**The shared baseline was called the leveraged number, and it was tested as one and failed.** The reasoning was that it is the dominant term in every route above, so a kilobyte removed there is a kilobyte removed five times, and cutting shared beats cutting any single route.

Deleting the ten unrendered components moved the baseline from **160 kB to 156 kB** and changed **no route total at all** — all ten identical either side, both figures reproduced across two clean builds each. Four kilobytes left the baseline and zero kilobytes left any route.

So whatever "First Load JS shared by all" counts, it is not a term the route totals are built from. It is a classification of which chunks happen to be common to every route, and that classification moved without the bytes moving. **Do not use it as an optimisation target**, and do not infer a route win from it dropping. No mechanism is offered here beyond the four builds, deliberately: the last two attempts to narrate chunk behaviour were read off minified output and were both wrong, which is the same lesson as "chunk labels are not evidence" two paragraphs down.

The one part of the old paragraph that survives is context, not a target: Next's App Router floor is roughly 105–120 kB gzipped, so a chunk of the baseline is not ours to cut in the first place.

**The first four route numbers were provisional, and have been recalibrated.** They were inferred from a baseline measured against a nearly empty app, before any route did its real work, which is how the two guesses above happened — the tightest constraint landing on the wrong route. A budget invented ahead of the code is a guess wearing a number. The table is now set against routes that do their work; the paragraph stays because the mistake is the kind that repeats.

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

Recording · transcription · live captions · breakout rooms · virtual backgrounds · noise suppression beyond browser default · dial-in · org admin and SSO · persistent chat history · file sharing · polls · whiteboard · e2e encryption · native apps

**"Waiting room / lobby" was on this list and is built** — v1.5 Track A. It is
called out rather than quietly deleted because `BUILD-PLAN-v1.5.md` names this
as "the line that most needs deleting, because it is the one a future session
would cite to argue this feature away". A stale out-of-scope entry is not a
harmless leftover; it is an argument sitting in the specification waiting to be
used.

It changed status for a specific finding: the meeting link was the entire
credential, and nothing stood between holding one and being in the room.

End-to-end encryption deserves a note: it is a reasonable ask and it breaks server-side recording and transcription. Decide before adding either, because retrofitting in any direction is expensive.

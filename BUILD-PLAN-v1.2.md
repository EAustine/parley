# Build plan v1.2 — interface, experience, motion

A pass over the shipped product. v1.0 built every state; this one makes them look considered. Read `CLAUDE.md` for the rules and tokens, `PRD.md` for the spec, `BRAND.md` for identity. **The colour tokens do not change.** Everything here is layout, weight, spacing, hierarchy, and motion.

Six tracks. **Track A comes first and is not negotiable** — polishing a surface with a rendering bug on it is wasted work.

---

## Track A — Correctness

These are defects, not preferences. Some were specified in v1.0 and never built.

### A1. Panel content is leaking into the share region

**Visible in production.** With the chat panel open, the entire message log renders a second time as grey floating text in the main area — "Austine joined", "Hi Austine", "Austine left", "jbsidauke", timestamps. With the participants panel open, the same happens with names and mic icons. It appears only while a panel is open.

Almost certainly the Phase 9 announcement live region failing to be visually hidden. Same class as the Phase 5 bug where the panel's `hidden` was outranked by a constant `flex` and only worked because Tailwind's preflight marks `[hidden]` important.

Diagnose before fixing. If it is `.sr-only` not applying, find out why — a missing utility, a specificity conflict, or a class that was never generated. Then **write a test that fails when the live region becomes visible**, measuring the rendered box rather than reading back a class name. The testing rules in `CLAUDE.md` exist because of exactly this shape of bug.

### A2. Camera preview does not work on pre-join

Reported in production testing. §3.3 makes this the screen that decides whether the product feels competent, so a dead preview is the worst possible defect on it.

Check in order: whether `getUserMedia` resolves at all; whether the returned stream is attached to the `<video>` element; whether `autoPlay`, `muted`, and `playsInline` are all present (Safari needs all three); whether the element has non-zero dimensions when the stream attaches. Confirm the fix in Chrome *and* Safari.

### A3. Chat and participants can both be open at once

Panel state should be a single value — `null | 'chat' | 'participants'` — not two booleans. Opening one closes the other. Two open panels also break §3.4's requirement that the control bar stay reachable.

### A4. Reactions do not animate

§3.6 specified float-up from the sender's tile over 2400ms with horizontal stagger, and it was never built. Not new scope; unfinished scope. Full treatment in Track E.

### A5. The sharing state is announced three times

Top bar, a centred paragraph, and a "You are sharing" label bottom-left, all saying the same thing. Say it once. Track B decides where.

### A6. Screen share on mobile is unreadable, not missing

Correcting the field report: the shared screen *does* render on mobile — the "Godcraft is sharing" screenshots confirm it. It renders at unusable scale inside a container with large dead margins. And a mobile user cannot *initiate* a share, which is §3.7 as written and not a bug. Two separate things; Track F handles the first.

---

## Track B — The room canvas

### B1. When you are the sharer, do not render the share region at all

Currently the sharer sees roughly 85% empty black with one line of explanatory text floating in it, plus a filmstrip squeezed into a narrow column.

**The sharer does not need to see their own screen. They need to see the people.** So when you are sharing, show the normal participant grid at full size, with one compact persistent bar at the top: the share icon, "You're sharing your screen", and **Stop sharing inside that bar**. Nothing else. That removes the dead space, removes the triple announcement from A5, and gives the participant tiles the room the field report asked for.

Everyone else keeps the share-plus-filmstrip layout, because they do need to see the content.

### B2. Filmstrip during someone else's share

Fixed 220px column on the right. Tiles stack from the top at 16:9 with a 8px gutter. The column scrolls when it overflows; the overflow indicator sits at its foot rather than leaving dead space.

Shared content uses `object-fit: contain` centred in its region — never `cover`, which crops the thing people are trying to read.

### B3. Tiles

The camera-off tile is currently a small avatar circle marooned in a large empty rectangle. Scale the avatar to roughly 28% of the tile's shorter side with a sensible max, so it grows with the tile instead of floating.

Every tile gets `0.75rem` radius and an 8px gutter — both already in the spec and not visible in the build. The name label sits on a bottom-only gradient scrim about 30% of the tile height, not a full overlay: enough to guarantee contrast, little enough to leave the video alone.

### B4. Control bar hierarchy

Every control currently reads at the same weight. Establish three tiers:

- **Primary** — mic and camera, 48px, filled `--secondary` when off with a struck icon
- **Secondary** — share, reactions, chat, participants, 44px, ghost until hover or active
- **Destructive** — leave, the wide pill, unchanged

Group them with spacing rhythm rather than dividers: `[mic cam]` · gap · `[share reactions chat participants]` · larger gap · `[leave]`.

**A panel toggle reads as active while its panel is open** — filled, not ghost. That is the missing feedback behind the A3 confusion.

Hover: 1.04 scale and a background lift over 120ms. Press: 0.96, 80ms. Both suppressed under `prefers-reduced-motion`.

---

## Track C — Panels

### C1. Chat

Width 360px on desktop. Slide in over 180ms on the standard easing.

Message typography carries the hierarchy: sender name at caption weight in `--muted-foreground`, timestamp beside it at 12/16 weight 400 against the name's 500, body at 15/22 in `--foreground`.

"One step dimmer" was wrong in the first draft — nothing in the set is dimmer than `--muted-foreground`, and it was solving a problem that does not exist. Name and timestamp are peers; both are metadata. The hierarchy that carries meaning is **metadata against body**, not name against timestamp. The weight step is a nice touch and is not load-bearing; identical treatment would also be correct. 4px between name and body, 16px between message groups, 24px between a group and a system message.

**System messages are visually quieter and structurally different** — centred, 12px, `--muted-foreground`, no name, no timestamp. Right now they compete with real messages.

The empty state carries §3.5's honesty about ephemerality: "Messages are only visible to people in the meeting, and disappear when it ends."

### C2. Participants

Same width and motion. Each row: avatar, name, then mic and camera state right-aligned. Host badge as a small outlined chip after the name. "(you)" in `--muted-foreground` rather than the same weight as the name.

### C3. One panel at a time

The single-value state from A3, plus the active toggle state from B4. Opening the second closes the first with the same 180ms motion — no flicker, no simultaneous transition.

---

## Track D — Pre-join

Fix A2 first; there is nothing to design around a dead preview.

**The preview is the hero.** 16:9, centred, up to about 560px wide, `0.75rem` radius. Mirrored. Device controls sit beneath it, not beside it — mic toggle, camera toggle, then a settings row for the three selectors.

The mic meter is a horizontal bar under the preview, not a number: 4px tall, fills `--foreground`, 60ms attack and 200ms release so it reads as voice rather than jitter.

The name field and Join button sit below that as one clear block. Join is the only filled-primary button on the screen.

**Testing the no-device state.** The fake-device harness always presents a camera, so the real condition cannot be produced in automation. Two separable claims sit behind that, and only one is ours:

The browser reporting `NotFoundError` and an empty `videoinput` list when no camera exists is browser behaviour, verified once by hand through the Screen Time trick in the Phase 3 matrix. Our code disabling the toggle and rendering the right copy *given* that state is ours, and it is testable — stub `enumerateDevices` and `getUserMedia` with `page.addInitScript`.

That is not the media-faking the Phase 4 rule forbids. That rule protects claims about WebRTC subscription and track behaviour. This claim is "our UI responds correctly to a state the browser reports", which a stub reproduces exactly.

**Name the test for what it proves** — "renders the no-camera state when the device list is empty", not "works with no camera". The distinction is the whole point of the autolink finding.

Every permission state renders **inside the preview frame**, not as a banner elsewhere — that keeps the eye in one place and makes the denied-state copy impossible to miss.

---

## Track E — Motion

All motion answers a user action. No ambient animation. `prefers-reduced-motion: reduce` removes travel and keeps opacity.

### E1. Reactions — the headline item

Per §3.6, finally built:

- Emitted from the sender's tile, bottom-centre
- Travel upward roughly 40% of the tile height over **2400ms**, ease-out
- Opacity 0 → 1 in the first 15%, hold, fade to 0 over the last 30%
- Slight horizontal drift, randomised within a narrow band, so simultaneous reactions do not stack into a column
- Scale 0.8 → 1.0 in the first 200ms — the "pop" that makes a click feel registered
- Rate limit stays at one per participant per 1000ms; extra presses dropped, never queued
- From a participant not currently visible, anchor to the overflow indicator
- Never occlude the name label or mic indicator — render in a layer that stops short of the bottom scrim

The picker button itself gets press feedback: 0.9 → 1.1 → 1.0 over 200ms. The absence of that is why the current build feels unresponsive on click.

Under reduced motion: appear and fade in place, no travel, no drift.

### E2. Everything else

| Change | Duration | Easing |
|---|---|---|
| Control toggle | 120ms | `cubic-bezier(0.2, 0, 0, 1)` |
| Control hover / press | 120 / 80ms | same |
| Panel open / close | 180ms | same |
| Grid reflow on join or leave | 200ms, FLIP | same |
| Share region enter | 240ms | same |
| Tile speaking ring | 120ms | linear |
| Toast | 150 in / 100 out | same |

**The grid reflow is the one worth care, and the first draft's mechanism could not produce its outcome.** `grid-template-columns` interpolates only between track lists of the same length, and a join changes the count every time — so the declared transition never fires. Use FLIP: measure, invert, animate to identity, transform only. The container-only advice was about layout-triggering properties and does not apply to compositor transforms; see `CLAUDE.md`.

This is the highest-value motion in the product, and for a reason that is not aesthetic. A panel close is initiated by the person watching it, so instant is fine. **A join is initiated by someone else, and the reflow is the only signal it happened** — motion there tells you the grid rearranged and lets you track where people went. It carries information, not just polish.

**Share region enter, not "share layout switch."** The 240ms row had no home in any governing document and described a subtree swap that cannot cross-fade without a remount, which would detach live video tracks. Replace it with a directed transition: when someone else starts sharing, the incoming **share region** fades and scales in — opacity 0→1, scale 0.98→1, 240ms, compositor only, no remount.

Draw the eye to the new thing rather than dipping everything that was already there. A whole-stage opacity dip reads as a glitch in a live call; a full cross-fade claims a continuity between the two layouts that does not exist.

The filmstrip tiles snap into their new positions, and that is accepted. Making them FLIP across the switch requires the same DOM nodes to survive a subtree swap, which is a Track B structural question rather than a motion one. **If the stage already renders one tile list and only the container differs, the FLIP mechanism above handles them for free** — worth checking, not worth restructuring for.

---

## Track F — Mobile

### F1. Sheets must not swallow the video

Chat and participants currently take roughly 60% of the viewport. Cap at **55% of `dvh`**, with the video area shrinking above rather than being covered. A drag handle at the top, and swipe-down to dismiss.

Use `dvh` throughout, never `vh` — iOS Safari's toolbar makes `vh` wrong at exactly the moment the control bar needs to be reachable.

### F2. Viewing a share on mobile

The A6 fix, narrowed. Two things ship: shared content **fits its region with no dead margins**, and a **fullscreen control** in the corner of the share region.

Pinch-to-zoom is deferred, and fullscreen is why. Rotating to landscape and going fullscreen gives the shared content the entire viewport — more than any amount of pinching inside a letterboxed region can recover. It is the real answer to reading a laptop screen on a phone, and it is one button.

It also sidesteps a requirement cleanly. Pinch is a multipoint gesture, so WCAG 2.5.1 (Level A) demands a single-pointer equivalent — and **keyboard shortcuts do not satisfy it**, because the criterion says single *pointer*, not single input. A button never raises the question. If pinch still looks wanted once fullscreen is in use on a real phone, it arrives alongside +/− controls in the same corner cluster and is compliant by construction.

Double-tap-to-fit can stay. It is single-point and not path-based, so 2.5.1 does not reach it.

**The controls sit on the share region, not in the room bar.** §9 rejected an eighth control in the persistent bar; these are contextual to a surface that only sometimes exists, so that reasoning does not transfer. Visible only while someone is sharing.

### F3. Participant tiles while someone shares

Not a 2-up grid consuming the top third. A **horizontally scrollable strip, 96px tall**, tiles at 16:9, above the share region. The active speaker auto-scrolls into view.

**The strip scrolls through everyone, capped at 16 to match the desktop grid, with a "+N" cell beyond.** PRD §3.4's "3 visible" described the viewport and was read as a capacity; it is reworded. A strip that scrolls *and* caps at three is the worst of both — it scrolls through almost nothing and still hides people.

At 96px tall a tile is ~171px wide, so roughly two and a bit fit a 375pt screen. That is fine: the clipped third tile is the affordance that says the strip scrolls.

`check:room` should stop asserting `FILMSTRIP_CAPACITY.mobile === 3`. The invariant worth gating is the one that matters — **no participant is hidden without an overflow indicator** — not a magic number.

### F4. Control bar

44px minimum targets, **measured rather than inferred**. `check:targets` resolves size classes and cannot see a control squeezed by its parent, so it never covered this and the plan overstated it. `mobile.spec` measures directly, which is right; extend that to the full state list rather than mobile alone, since the floor is 44px on room and pre-join and 24px elsewhere.

Bar sits above the safe-area inset. On touch it never auto-hides.

---

## Sequence

| Step | Track | Why here |
|---|---|---|
| 1 | A | Defects first. Polishing over a rendering bug is wasted work. |
| 2 | B | The canvas is the product; it sets the frame everything else fits. |
| 3 | E1 | Reactions are the most visible missing thing and are self-contained. |
| 4 | C | Panels, once one-at-a-time is enforced in A3. |
| 5 | D | Pre-join, once its camera works. |
| 6 | F | Mobile last — it inherits every decision above. |
| 7 | E2 | Motion polish across the finished surfaces. |

---

## Test suite capacity

Fifty serial tests is a ceiling worth attacking rather than accepting, and the ceiling is a symptom rather than a size. Serial execution is forced by tests sharing rooms; `CLAUDE.md` already says a test owns its fixtures, and a room is a fixture.

**Give each test its own meeting code and the suite parallelises.** Turn on `fullyParallel` with workers. Tests that need several participants in one room create several contexts inside one test — that test still owns its room, and different tests own different rooms.

Check LiveKit's concurrent-participant ceiling before setting the worker count. Workers times participants is the number that matters, and a limit will surface as flakes that look like race conditions.

**Contention flakes are fixed by removing the contention, not by lowering the worker count.** Real-media tests belong in their own Playwright project at `workers: 1`; everything else — meetings, chat, ics, layout — runs parallel. That keeps the parallelism win on the bulk of the suite while the handful of tests that actually publish tracks run without competing.

A test that fails once under load and passes seven times in isolation has a understood failure mode, which is fine, but it must be made deterministic rather than tolerated. Re-running until green teaches the suite to be ignored, and false comfort is worse than no check.

**Track B's tests mostly do not need a room at all.** Layout is a function of participant count and container size; it is not a function of media. Grid breakpoints, tile geometry, filmstrip arrangement, and the share-region switch can be asserted at component level with synthetic participant data, real rendering, and measured boxes.

That does not contradict the Phase 4 rule about testing with real tabs rather than faked participant counts. That rule exists to keep WebRTC subscription and track behaviour honest, and those tests stay exactly as they are. Faking participant *data* to test layout maths is a different claim from faking media *state* to test behaviour. The geometry assertion still measures a rendered box, which is the part that was load-bearing.

---

## Accessibility scan coverage

**The state list is states × themes, derived, not hand-maintained.** Marketing and sign-in are currently scanned in light only, and that gap exists because the list is written by hand and someone has to remember the second entry. Every theme-responsive surface gets both; the room and pre-join are forced dark and get one. Generate the pairs rather than typing them.

**Radix `Select` fails axe twice — replace it with a native `<select>` rather than suppressing them.**

The failures are `aria-hidden-focus` (Radix marks the shell hidden with focusable elements inside) and `scrollable-region-focusable` on the viewport. Both are arguably false positives in that Radix Select is genuinely operable, and both would need documented exclusions to get the two listbox states into the scan.

Three independent arguments already point at native, and this is the third:

- **Accessibility** — no custom shell, so neither rule can fire, and native selects have the deepest, best-tested assistive-technology support of any form control
- **Mobile** — the OS picker, which is the same reasoning that made `<input type="date">` beat `react-day-picker`
- **Bundle** — drops `@radix-ui/react-select`, and possibly the scroll-lock family that puts `/schedule` above `/dashboard`

Five instances: three device selectors in pre-join, duration and timezone in schedule. Style the closed state with `appearance: none`; the open list is OS-rendered, which is a minor inconsistency in a dark app rather than a design failure.

Verify with a real screen reader before and after, and check the closed state in Chrome, Safari, and Firefox.

If the swap is judged too much for this pass, the fallback is two **narrowly scoped, documented** exclusions on the Select subtree with the reasoning recorded — never a blanket rule disable, and never an exclusion list that grows. But suppressing a warning about a component we could simply not use is treating the symptom.

---

## Guardrails

Everything in `CLAUDE.md` still binds. Specifically:

- **No new colours.** Every token is verified and the matrix is computed. This pass earns its improvement from layout, weight, and spacing.
- **No hue except where it is the meaning** — destructive and connection state, nothing else.
- **No text or icons directly on video.** Scrim or opaque chip, per rule 4.
- **The accessibility floor holds throughout.** New motion respects `prefers-reduced-motion`; new controls keep their names and roles; new layouts keep their targets. Re-run the Phase 9 state list at the end, not a route list.
- **Assert rendered geometry, never declared CSS.** Half this plan is layout, which is exactly where reading back a class name proves nothing.

## Design references

Mobbin patterns for the room, pre-join, chat, and reactions were not reachable when this was written. When they are, they belong in Tracks B, C, D, and E1 as references against decisions already made here — not as a reason to reopen them. The decisions above come from the screenshots and from what the product already specifies.

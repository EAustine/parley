# CLAUDE.md

Project rules for **Parley**. Read `PRD.md` for the full specification, `BRAND.md` for identity and assets, and `BUILD-PLAN.md` for the phased task list.

---

## What this is

**Parley** — a video conferencing web app: video, audio, screen share, emoji reactions, in-meeting chat, scheduling, and shareable invite links.

*A parley is a conversation between parties who cannot otherwise meet — held at a distance, on neutral ground, under terms both sides agree to.*

Tagline: **A link is all anyone needs.**

## Stack

Next.js 15 (App Router) · TypeScript strict · Tailwind v4 · shadcn/ui · HugeIcons · LiveKit Cloud · Supabase · Vercel

---

## Hard rules

**1. Never use LiveKit's prebuilt UI components.**
Use the hooks: `useRoomContext`, `useTracks`, `useParticipants`, `useLocalParticipant`, `useConnectionState`, `useDataChannel`, `useRoomInfo`. Also use `<RoomAudioRenderer />` — it renders nothing visible and correctly manages remote audio elements.

Do not use `VideoConference`, `ControlBar`, `GridLayout`, `ParticipantTile`, `PreJoin`, or `@livekit/components-styles`. They carry a competing design system. Every visible surface is built from shadcn primitives and the tokens below.

**2. Secrets never reach the client.**
`LIVEKIT_API_SECRET`, `LIVEKIT_API_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are server-only. No `NEXT_PUBLIC_` prefix on any of them. Token minting happens in a route handler, never in a component.

`lib/env.ts` implements this and is imported for side effects at the top of the root layout; `scripts/check-env.mjs` does the same standalone for pre-dev and CI. Both are in `scaffold/` and are already verified against the five failure modes. Do not weaken either into a warning — a leaked key produces no runtime symptom, which is exactly why it needs a hard stop. Account setup is in `ACCOUNTS.md`.

**Never read, `cat`, `echo`, `grep`, or print `.env.local`, and never write values into it.** Austine fills it in his own editor. Anything you read enters your context and can end up quoted back into the conversation or a commit message. To confirm it is correct, run `npm run check:env` — it reports variable *names* and pass/fail, never values. If a variable looks wrong, say which name is wrong and let him fix it.

The same applies to `~/.supabase`, any `*.pem`, and anything under `.vercel/`.

**3. Mute state comes from the track, not from React.**
Derive mic and camera UI state from the LiveKit track's actual published state. Never keep a parallel boolean as the source of truth. If unmuting fails, the UI must show muted. This is a privacy requirement.

**4. No text or icons directly on video — and hue needs more than a scrim.**
Every label, badge, and control sits on `--scrim`. Contrast against arbitrary video content is otherwise undefined.

The scrim is sufficient for neutral foreground and not for hue. Composited over white video it resolves to roughly `#515355`, where `--foreground` still clears 7.01:1 but `--state-warning` drops to 3.79:1 and `--state-critical` to 2.53:1 — both under their floor, and the critical one badly.

**Hued state indicators therefore sit on an opaque chip at `--popover`, never on the scrim.** That restores the verified figures (warning 8.11:1, critical 5.42:1) because the background stops depending on what is on camera. Raising the scrim alpha would need roughly 0.90 to carry critical text, which is a near-solid panel over the video — worse than a chip, and it would darken every neutral label with it.

Dropping hue instead is not the answer here: §4.2 spends the entire chroma budget on exactly two things, and connection state is one of them. This is the case where hue *is* the meaning.

**5. No hue except where it is the meaning.**
Hue is spent on two things only: destructive actions (leave, end) and connection warnings. Everything else — mute, active speaker, selection, focus — is encoded in weight, fill, and value.

The earlier phrasing "weight, not colour" was wrong and the review caught it. The speaking ring changes both weight and value: idle is 1px `--tile-border` at 3.33:1, speaking is 2px `--foreground` at 17.29:1. The principle that actually holds across the system is **no hue**, and nothing depending on hue alone.

**6. Chat is rendered as text.**
Never `dangerouslySetInnerHTML`. Autolinked URLs get `rel="noopener noreferrer nofollow"`.

**7. Every icon-only button needs `aria-label` and a tooltip.**
No exceptions.

**7a. `app/icon.svg` is the one documented exception to `currentColor`.**
A standalone favicon has no inherited colour context, so `currentColor` resolves to black and disappears on a dark tab. `app/icon.svg` is a self-contained badge with literal fills — mark in `#F2F4F7` on a `#0E1013` rounded square — matching the PNG icon set, which already carries the dark ground. It uses the small variant (no ghost cell), because an SVG cannot switch variants by rendered size and a favicon is almost always drawn at 16–32px. `currentColor` remains the rule everywhere it actually pays off: `components/brand/*`.

**7b. Shipped image assets carry no provenance metadata.**
Files delivered into `brand/` may arrive with a C2PA `<metadata>` block that dwarfs the artwork — 7.7KB of provenance around 410 bytes of geometry, on an asset served with every page load. Strip it when copying into `app/` and `public/`. Leave the originals in `brand/` untouched as the record. If a stripped file looks wrong, retype it from the source in `BRAND.md`, which is authoritative.

**8. `livekit-client` is dynamically imported on the room route only.**
It must not appear in any other bundle. Pre-join uses `navigator.mediaDevices` directly and needs no LiveKit code.

Bundle budgets are per-route and live in `PRD.md` §10. The one that matters is `/j/[code]` at ≤ 200 kB — cold load, stranger on a phone, empty cache. The dashboard is deliberately loose.

**8c. Never pass `process.env` as an object to a function.**
Next replaces `process.env.NEXT_PUBLIC_FOO` textually at build time and cannot replace anything when the whole object is handed off, so the client bundle sees every public variable as undefined. Reference each one as a literal. `Buffer` and `Object.entries(process.env)` are server-only — the leak guard must stay behind a `typeof window === "undefined"` check, and `npm run check:env` in CI is what actually catches a leaked key, since by server boot the bundle is already built.

**8a. shadcn base is Radix, not Base UI.** Settled in Phase 0 — Radix is what the registry is built on and what "shadcn primitives" means throughout these docs. Do not revisit.

**8b. `defaultTheme="system"`, not `"dark"`.** My earlier instruction said `"dark"` and contradicted `PRD.md` §4.2. §4.2 wins: the dashboard and scheduling screens follow the OS, because light mode exists precisely for those document-like surfaces and a light mode nobody defaults into is unverified code that still has to be maintained. Force `.dark` on `/j/[code]` and `/room/[code]` via a wrapper element in the route-group layout — the flip happens at the pre-join boundary, which is the right moment to signal "you've entered the call," and it means the video preview is never shown on a light ground.

**8d. Any module holding a server-only secret imports `server-only` at the top.**
`lib/supabase/admin.ts`, the LiveKit token signing module, `lib/env.ts`'s server section — all of them. The package exists solely to turn "this leaked into the client bundle" from a runtime failure into a build failure, which is the same reasoning as the env guard: the thing being prevented has no visible symptom when it goes wrong.

**9. Ask before adding a dependency — and remove it when it stops being used.**
The stack above is the stack. If something seems to need a new package, say why first.

`check:deps` walks the import graph from `app/` and **fails** on anything unreachable, in two categories that need separating:

**Unused npm packages fail outright.** Audit surface, supply-chain surface, lockfile weight. No exceptions.

**Unrendered local components fail too, and the fix is deletion, not justification.** These are vendored source with no supply-chain surface of their own — but seven of the ten unrendered shadcn components pin a Radix package in `package.json`, so most of them are the first category wearing a local file as a disguise. And shadcn is a copy-paste registry, not a library: `npx shadcn add dialog` takes seconds on the day Phase 8 needs a modal. "We'll want it later" is an argument for adding it later, not for carrying it now.

It does not warn. An exception list is how dead code accumulates, and a warning printed on every run becomes furniture within a week. Three dependencies have already been specified in these documents and never used — `react-day-picker`, `react-hook-form`, `@hookform/resolvers`. Each was audit surface, supply-chain surface, and a lie to the next reader about how the product is built. Delete the code that makes an unused package reachable too: `components/ui/form.tsx` existed solely to keep `react-hook-form` in the graph.

When a document and the build disagree about a dependency, the build is usually right and the document is describing a plan reality overtook. Fix the document.

**10. Design decisions are discussed before they are coded.**
If a spec is ambiguous, ask. Do not pick silently and move on.

---

## Design tokens

Dark is the default, and the only mode for the in-call surface. Video is the light source; chrome recedes. Dashboard and scheduling screens follow system theme.

**Follow shadcn's class convention: `:root` holds light, `.dark` holds dark.** Set `next-themes` to `defaultTheme="system"` with `enableSystem`, and force `.dark` on `/j/[code]` and `/room/[code]` regardless of user preference — see rule 8b. Inverting the convention would fight every shadcn component and third-party library that expects `.dark`.

**Keep these hex values verbatim.** Do not convert to OKLCH — the conversion shifts computed values and invalidates the verified contrast table below. Map them through `@theme inline` and override whatever `shadcn init` writes.

```css
/* app/globals.css — .dark block shown; :root mirrors the light values */

@layer base {
  .dark {
    --background:             #0E1013;
    --foreground:             #F2F4F7;
    --card:                   #171A1F;
    --card-foreground:        #F2F4F7;
    --popover:                #1B1F25;
    --popover-foreground:     #F2F4F7;
    --primary:                #F2F4F7;
    --primary-foreground:     #0E1013;
    --secondary:              #242830;
    --secondary-foreground:   #F2F4F7;
    --muted:                  #1F232A;
    --muted-foreground:       #9AA1AC;
    --accent:                 #242830;
    --accent-foreground:      #F2F4F7;
    --destructive:            #D32F2F;
    --destructive-foreground: #FFFFFF;
    --border:                 #242830;
    --input:                  #2B303A;
    --ring:                   #F2F4F7;

    /* state only — never used as decoration */
    --state-critical:         #F26669;
    --state-warning:          #F5A524;

    /* room surface only — tiles sit directly on the ground with no fill
       contrast (--card vs --background is 1.09:1), so they need a
       boundary --border cannot provide at 1.29:1 */
    --tile-border:            #5D6777;
  }

  .light {
    --background:             #FFFFFF;
    --foreground:             #16181D;
    --card:                   #F7F8F9;
    --card-foreground:        #16181D;
    --popover:                #FFFFFF;
    --popover-foreground:     #16181D;
    --primary:                #16181D;
    --primary-foreground:     #FFFFFF;
    --secondary:              #F0F2F4;
    --secondary-foreground:   #16181D;
    --muted:                  #F0F2F4;
    --muted-foreground:       #5C636E;
    --accent:                 #F0F2F4;
    --accent-foreground:      #16181D;
    --destructive:            #C62B31;
    --destructive-foreground: #FFFFFF;
    --border:                 #E3E6EA;
    --input:                  #E3E6EA;
    --ring:                   #16181D;

    --state-critical:         #C62B31;
    --state-warning:          #8A5300;
    --tile-border:            #5D6777;   /* room is dark in both themes */
  }

  /* theme-invariant: the scrim always sits over video, and video
     surfaces are always dark */
  :root, .dark, .light {
    --scrim:  rgba(14, 16, 19, 0.72);
    --radius: 0.5rem;
  }
}
```

Contrast is verified, not assumed. Do not change these values without recomputing.

**Every foreground token declares its permitted surfaces, and is verified against those.** "Verify against all four dark surfaces" was itself too narrow — there are seven, and `--input` and `--secondary` were missing from it. Chasing every surface would also push `--state-critical` so light it stops reading as red.

| Token | Permitted surfaces | Threshold | Worst |
|---|---|---|---|
| `--foreground` | all | 4.5 | 12.01 |
| `--muted-foreground` | all | 4.5 | 5.08 |
| `--state-warning` | all | 4.5 | 6.49 |
| `--state-critical` | background, card, popover, muted, secondary, accent — **not `--input`** (4.34:1) | 4.5 | 4.84 |
| `--tile-border` | `--background` only — the room ground | 3.0 | 3.33 |

Validation error text sits below a field on the ground, never inside the filled input. `--tile-border` is single-purpose and belongs to no other surface.

`npm run check:contrast` computes the full matrix and fails on any violation. It is the source of truth; the numbers above are a snapshot. Do not hand-edit them — regenerate.

Snapshot of the load-bearing pairs. Regenerate with `npm run check:contrast`; do not hand-edit.

| Pair | Ratio |
|---|---|
| `--foreground` / `--background` | 17.29:1 |
| `--muted-foreground` / worst permitted (`--input`) | 5.08:1 |
| `--state-critical` / worst permitted (`--secondary`) | 4.84:1 |
| `--state-warning` / worst permitted (`--input`) | 6.49:1 |
| `--tile-border` / `--background` | 3.33:1 |
| `--foreground` (speaking, 2px) / `--background` | 17.29:1 |
| white / `--destructive` (dark) | 4.98:1 |
| Light `--muted-foreground` / white | 6.06:1 |
| Light `--destructive` / white | 5.54:1 |

`#E5484D` on white is 3.91:1 and fails — that is why light mode has a separate destructive value.

---

## Typography

**Instrument Sans** for interface, **JetBrains Mono** for meeting codes, timers, and connection data. Google Fonts, variable, `font-display: swap`.

```
font-sans:  "Instrument Sans", ui-sans-serif, system-ui, "Noto Sans", sans-serif
font-mono:  "JetBrains Mono", ui-monospace, "SF Mono", monospace
```

| Role | Size / line | Weight |
|---|---|---|
| Display | 32 / 36 | 600 |
| H1 | 24 / 30 | 600, −0.01em |
| H2 | 20 / 26 | 600 |
| Body | 15 / 22 | 400 |
| Small | 13 / 18 | 400 |
| Caption | 12 / 16 | 500 |
| Code | 20 / 24 | 500 mono, +0.08em |
| Data | 12 / 16 | 400 mono, tabular |

Mono is for codes and numbers. Not for labels — that is decoration.

Apply `font-variant-numeric: tabular-nums` to all timers and counters so digits don't jitter.

---

## Icons

HugeIcons, stroke rounded, `strokeWidth={1.5}`, `color="currentColor"`.

```tsx
import { HugeiconsIcon } from "@hugeicons/react";
import { Mic01Icon } from "@hugeicons/core-free-icons";

<HugeiconsIcon icon={Mic01Icon} size={24} strokeWidth={1.5} color="currentColor" />
```

Resolve exact export names from the installed package before using them — do not guess names from memory. Sizes: 20px inline, 24px in call controls, 16px in dense lists.

---

## Brand

Full spec in `BRAND.md`. Rules that bind the code:

**Logomark** — 2×2 grid of rounded tiles, three filled, one empty. 24-unit grid: 9-unit cells, 4-unit gutters, 2.4 radius, 1 margin, empty cell bottom-right.

**Responsive rule.** At ≥32px the empty cell has a 1.5 stroke at 40% opacity. Below 32px the stroke is dropped and the cell is fully empty. This is tested behaviour, not preference — at 16px the stroke antialiases into a smudge. The `Mark` component switches on its `size` prop.

**Never fill the fourth cell.** That cell is the entire idea.

**Everything is `currentColor`, everywhere except `app/icon.svg`** — see rule 7a. In the React components one file serves both themes, with no light and dark variants to maintain. No hue in the mark, ever; even the favicon's literal fills are the two neutral tokens.

**Wordmark** — Instrument Sans 600, −0.02em, sentence case. No letter substitution, no chip in a counter, no accent colour on a glyph. The mark carries the idea; the wordmark stays quiet.

**Lockups are React components**, not SVG files — `components/brand/Mark.tsx`, `Wordmark.tsx`, `Lockup.tsx`. Clear space on all sides equals half the mark's height. Minimums: mark 16px, horizontal lockup 96px, stacked lockup 72px, wordmark 64px.

Pre-generated rasters are in `brand/`: `favicon.ico` (16/32/48, correct variant per slice), `apple-icon.png`, `icon-192.png`, `icon-512.png`, `icon-512-maskable.png`.

---

## Product vocabulary

Fixed. Use these everywhere — UI, copy, comments, variable names.

| Term | Never |
|---|---|
| **Meeting** | "call", "conference", "session" |
| **Room** — internal / LiveKit only | never in user-facing copy |
| **Meeting link** | "invite URL" |
| **Meeting code** | "meeting ID", "PIN" |
| **Host** | "owner", "organiser", "admin" |
| **Participant** | "attendee", "user", "member" |
| **Guest** | "anonymous", "visitor" |

An action keeps its name through the flow: "Copy link" → "Link copied". "Leave" and "End meeting" are different actions and are never conflated.

Meeting links are `https://<host>/j/kqr-8mzt-vnp`. `/j/` rather than a bare root code — a root catch-all would collide with `/dashboard` and `/schedule`.

---

## Shape and motion

Radius `0.5rem`. Tiles `0.75rem`. Call controls are circles: 48px for mic, camera, and leave; 44px for secondary. **The leave button is a wide pill — the only non-circular control.** Shape distinguishes it, not just colour.

| Change | Duration | Easing |
|---|---|---|
| State toggle | 120ms | `cubic-bezier(0.2, 0, 0, 1)` |
| Speaking ring | 120ms | linear |
| Panel open/close | 180ms | `cubic-bezier(0.2, 0, 0, 1)` |
| Grid reflow | 200ms | `cubic-bezier(0.2, 0, 0, 1)` |
| Reaction lifespan | 2400ms | ease-out |

All motion answers a user action. No ambient animation. `prefers-reduced-motion: reduce` removes travel, keeps opacity.

---

## Accessibility floor

Non-negotiable, checked every phase. **This is the authoritative copy** — `PRD.md` §9 owns the announcement policy and the reasoning behind its thresholds, and deliberately does not restate these mechanics. Where the two ever appear to disagree, this file wins and §9 is stale.

- Every control keyboard reachable, `--ring` focus at 2px offset
- Panels focus-trapped; Escape closes and returns focus to the trigger
- **State toggles** (mic, camera) name the action and change with it: "Turn off microphone" → "Turn on microphone". No `aria-pressed` — carrying both an action name and a pressed state announces the same fact twice, in a confusing order
- **Disclosure controls** (chat, participants) are the other pattern: a noun name plus `aria-expanded` and `aria-controls`. The bar button is "Participants"; the panel's close button is "Close participants". They are different controls doing different things and should not share a name

  The rule above was written for mic and camera and over-generalised. A device toggle changes something in the world; a panel toggle reveals part of the interface. Applying "name the action" to both is what produced two controls called "Close participants", heard twice per tab cycle.
- Join/leave announcements batched — more than 3 events in 5s collapses to "3 people joined"; suppressed entirely above 8 participants
- Chat announces "{name} sent a message" when the panel is closed, never the body
- Reactions throttled to one announcement per participant per 2s
- Connection changes announced once, not per retry
- Touch targets 44px minimum
- Nothing depends on colour alone
- `axe` clean on every route

---

## Copy voice

Sentence case. Active voice. A button says what happens: "Copy link", not "Submit". The same action keeps its name through the flow — a "Copy link" button produces a "Link copied" toast.

Errors explain what happened and what to do next. They do not apologise and they are never vague. Empty states are invitations: "No meetings yet. Start one now, or schedule for later."

---

## Testing rules

Earned the hard way; each one comes from a check that passed while exercising the wrong thing.

**Delete the guard. If no test fails, the guard is untested.** A cheap mutation check, and the only way to know a test credits the code it names. The `autolink` scheme allow-list survived deletion because the candidate pattern rejected dangerous schemes first — so the allow-list was a backstop being reported as a defence. Name which gate each case exercises, pin the load-bearing one directly, and document the rest as backstops rather than coverage.

**Assert rendered geometry, never declared CSS.** Reading back `aspect-ratio: 16/9` tests your own input. A tile declaring the right ratio still rendered 1956px inside a 1337px container, because `aspect-ratio` sets a shape and not a bound — fitting one needs whichever dimension is tighter to win, which is `min(100cqw, calc(100cqh * 16/9))`, not any single `max-`. Measure the box.

**A correctness property may not rest on a third-party reset.** The chat panel's `hidden` worked only because Tailwind's preflight marks `[hidden]` important. Declare `[hidden] { display: none !important }` in our own base layer and own the behaviour.

**Scope queries by role or test id, not by visible text.** `getByText("Ama Serwaa")` was precise until Phase 5 added join and leave messages carrying the same name. The product grows; text-based queries silently widen.

**A test owns its fixtures.** Two scheduling tests were wrong before the code was, because they leaned on rows other sections deliberately mutate — one ages the instant meeting past the 30-day window, another renames the scheduled one. Shared mutable fixtures make a test's result depend on what else ran.

**Assert room composition, never assume it.** Two tests passed alone and failed in a full run for exactly this reason.

**A test runner that can reuse a stale build is worse than no runner.** `reuseExistingServer: false`. It failed a fix that worked, and the same defect would have passed a break just as quietly.

---

## Conventions

- Server Components by default; `"use client"` only where interactivity or browser APIs require it
- Zod schemas shared between client validation and route handler validation
- `date-fns` + `date-fns-tz`. Store UTC, render local, always print the zone label.
- Route handlers return typed JSON with a stable `error` string, never a raw exception
- Meeting code alphabet: `abcdefghjkmnpqrstuvwxyz23456789` — no `i`, `l`, `o`, `0`, `1`. Format `xxx-xxxx-xxx`.
- **Test fixtures derive from the same constants as the code under test.** Hand-written codes containing `0` or `1` are rejected as malformed before any lookup, so a miss-tier test using them silently exercises the wrong layer and passes for the wrong reason. Generate them from the exported alphabet; never type them.
- Generate-and-insert with retry on unique violation. Never check-then-insert.
- One component per file. Colocate under `components/room/`, `components/schedule/`, `components/ui/`.

---

## File layout

```
app/
  icon.svg  apple-icon.png  opengraph-image.tsx  twitter-image.tsx
  (marketing)/page.tsx
  (dev)/dev/tokens/page.tsx      — gated on NODE_ENV !== 'production'
  (app)/dashboard/page.tsx
  (app)/schedule/page.tsx
  j/[code]/page.tsx              — pre-join (public meeting link)
  room/[code]/page.tsx          — in-call (client, dynamic import)
  api/livekit/token/route.ts
  api/livekit/webhook/route.ts
  api/meetings/route.ts
  api/meetings/[code]/route.ts
  api/meetings/[code]/ics/route.ts
components/
  brand/                         — Mark, Wordmark, Lockup
  ui/                            — shadcn (sonner for toasts, not the
                                   deprecated toast component)
  room/                          — grid, tile, controls, chat, reactions
  schedule/
  shared/
lib/
  livekit/                       — token, room helpers
  supabase/                      — client, server, middleware
  meetings/                      — code generation, ics
  hooks/
supabase/migrations/
```

---

## Never do

- Reach for `@livekit/components-styles` or any prebuilt LiveKit UI
- Put a secret behind `NEXT_PUBLIC_`
- Add a colour that isn't in the token set
- Give avatars a per-identity hue — the fallback is the initial on `--secondary`, uniform
- Fill the mark's fourth cell, or give the mark a colour
- Ship a state with no design — silent failure is the worst outcome in this product
- Ship a working control that lands on a framework default error page. If a button creates a row, the destination route must exist by the end of that phase, even as a minimal designed state. Phase boundaries are for scope, not for leaving the product broken between them.
- Persist chat (out of scope — it's ephemeral by design)
- Add recording, captions, or transcription (out of scope; they change the cost model)

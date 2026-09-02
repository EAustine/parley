# Progress

One entry per phase: what shipped, what was deferred, and any decision that
departed from the specification — with the reason.

---

## Phase 0 — Foundation

**Status:** complete. Build, typecheck, and lint are clean.

### Shipped

**Scaffold**
- Next.js 15.5.25, React 19.1.0, TypeScript strict, Tailwind v4, App Router,
  Turbopack. No `src/` directory.
- shadcn/ui initialised on the Radix base; 22 components added.
- Every dependency from `BUILD-PLAN.md`, nothing beyond it.
- `.env.example` committed; `.env*` gitignored with `!.env.example`.

**Tokens and type**
- `app/globals.css` carries the `CLAUDE.md` token block **verbatim as hex**,
  mapped through `@theme inline`. Not converted to OKLCH — conversion would
  shift the computed values and invalidate the verified contrast table.
- `:root` holds light, `.dark` holds dark, per shadcn's class convention.
  `--scrim` and `--radius` are theme-invariant; `color-scheme` follows the theme
  so the browser's own canvas never shows white at the edges.
- Instrument Sans and JetBrains Mono via `next/font/google`, variable,
  `display: swap`, with the explicit non-Latin fallback stack.
- The eight named type roles as `.type-*` classes, absolute px so a step cannot
  drift with a parent's font-size. `tabular-nums` on Code and Data.
- `prefers-reduced-motion: reduce` removes travel globally.

**Brand**
- `components/brand/Mark.tsx` — 24-unit geometry, `currentColor`, ghost cell
  switching on the `size` prop at 32px. The fourth cell is never filled.
- `Wordmark.tsx` with a `wordmarkSizeForMark()` helper so cap height equals the
  mark height in every lockup. `Lockup.tsx` for horizontal and stacked.
- Assets copied from `brand/` into `app/` and `public/`, C2PA stripped.
- `public/manifest.webmanifest` exactly as `BRAND.md` §5 specifies.
- `app/opengraph-image.tsx` and `twitter-image.tsx` via `next/og`, reading
  vendored static TTFs under `runtime = "nodejs"`. Absolute URLs verified baked
  into the served HTML.

**Verification**
- `/dev/tokens` renders the full contrast matrix, swatches, type scale, mark at
  five sizes, both lockups, and all 35 icons with their resolved export names.
- `lib/env.ts` boot assertion throws if a service-role JWT appears in any
  `NEXT_PUBLIC_` variable. Imported from the root layout.

### Verified, not assumed

- **Every contrast ratio recomputed at runtime** from the live CSS custom
  properties. All pairs clear their threshold in both themes. Dark
  `--state-critical` reads 6.24 / 5.71 / 5.16 / 5.42 / 4.84 across background,
  card, muted, popover, secondary — matching the documented ≥5.16 on the four
  named surfaces.
- **Mark responsive rule** — ghost cell absent at 16 and 24px, present at 32,
  64, and 128px.
- **`favicon.ico`** decoded: three slices (16/32/48), ghost absent at 16 and
  present at 32 and 48.
- **`/dev/tokens` returns 404** under a production build.
- **`livekit-client` absent from every client chunk** (rule 8 — nothing imports
  it yet, and the check is now part of the routine).
- **All 35 icon export names** resolved against the installed
  `@hugeicons/core-free-icons@4.3.0`, not guessed.

### Decisions that departed from, or resolved, the specification

1. **Next.js pinned to 15, not `@latest`.** `create-next-app@latest` now
   scaffolds Next 16. `CLAUDE.md` and `PRD.md` §5 both name Next.js 15, so the
   scaffold was pinned to `create-next-app@15`.

2. **shadcn base: Radix, not Base UI.** The shadcn CLI now asks which component
   library to build on. The documents say "shadcn primitives" without
   specifying; Radix is the long-established reading and every existing shadcn
   snippet assumes it. Style is `radix-nova`.

3. **`form` came from the canonical registry.** `@shadcn/form` resolves to an
   empty stub under the `radix-nova` style. It was pulled from
   `ui.shadcn.com/r/styles/new-york-v4/form.json` instead. Its imports use the
   unified `radix-ui` package, matching every other component in `components/ui`.

4. **`lucide-react` is installed.** shadcn's own primitives use it internally
   for chevrons and check marks. It is not used for any Parley icon — those are
   HugeIcons, centralised in `lib/icons.ts`.

5. **`defaultTheme="system"`.** *Superseded — see the Phase 0 revision below.*
   Originally `"dark"`, per `CLAUDE.md`'s then-current wording, with the tension
   against `PRD.md` §4.2 flagged rather than silently resolved. Rule 8b settled
   it the other way.

6. **The pre-paint ground is CSS, not a server-rendered class.** *Revised — see
   below.* next-themes' script sits at the top of `<body>`, so with streaming
   there is a window in which the browser could paint the `:root` (light) ground
   before it runs.

7. **The focus ring is declared unlayered.** `CLAUDE.md`'s accessibility floor
   is a 2px ring at `--ring` with 2px offset. shadcn's buttons carry an
   unconditional `outline-none` plus a 3px shadow at 50% opacity. Tailwind's
   utility layer outranks `@layer base` regardless of specificity, so the floor
   is declared outside any layer — the one rule a component utility may not
   switch off. Verified as `2px solid var(--ring)` at 2px offset.

8. **`app/favicon.ico` deleted.** create-next-app leaves its own 26KB default
   there, and it shadowed the brand mark in the tab. The brand `.ico` lives at
   `public/favicon.ico` per `BRAND.md` §5; `app/icon.svg` is the App Router
   icon. Verified: the served HTML links `/icon.svg` and `/apple-icon.png`.

9. **Fonts vendored as instanced statics.** Google Fonts ships Instrument Sans
   only as a variable font, and `BRAND.md` §6 calls for static weights. The 400
   and 600 instances were fetched from the Google Fonts CSS API and vendored to
   `app/fonts/` with `OFL.txt` alongside, as the SIL licence requires.

10. **The contrast matrix grades against three thresholds, not one.** Text needs
    4.5:1 and the focus ring needs 3:1, both enforced. `--border`, `--input`,
    and `--tile-border` are reported but not graded — they are deliberately
    below 3:1 (`--tile-border` at 2.09:1 is documented as a hairline that
    defines the grid), and grading them would make the pass/fail signal
    meaningless. Hairline rows print in `--muted-foreground` with a swatch,
    since printing them in their own colour is illegible by design.

11. **Icon pair correction.** `Mic02Icon` / `MicOff02Icon` are used rather than
    the `01` pair: `Mic01Icon` is centred at x=11.5 and `MicOff01Icon` at x=12,
    so the glyph jumps half a unit when the control toggles. The `02` pair
    shares an identical stem path. Also recorded in `lib/icons.ts`:
    `CrossIcon` is a religious cross, not an X — close is `Cancel01Icon`.

### Known issues, deferred

- **`npm audit` reports a high-severity postcss advisory** inside Next's own
  bundled dependencies. The only fix is Next 16, which is a breaking change and
  contradicts the pinned stack. It is a build-time CSS tool, not a runtime
  surface. Revisit if the stack moves to Next 16.
- **Per-meeting OG variant** for `/j/[code]` — Phase 10, as scheduled.
- **Live favicon** (all four cells filled while in a meeting) — Phase 10,
  optional.
- **`NEXT_PUBLIC_APP_URL`** must be set per environment for social meta tags to
  carry the right absolute origin. `lib/site.ts` falls back to `VERCEL_URL`,
  then `localhost:3000`.

---

## Phase 0 — revision

`CLAUDE.md`, `PRD.md`, and `BUILD-PLAN.md` were updated after the first Phase 0
pass. Three changes needed code, and two of them reverse decisions above.

### `--tile-border` is now `#5D6777` — 3.33:1

Was `#414954` at 2.09:1, which I had classified as an ungraded "hairline" on the
reasoning that nothing depends on it alone. That reasoning was wrong, and
`PRD.md` §3.4 now says why: a camera-off tile has no fill contrast to fall back
on (`--card` on `--background` is 1.09:1), so this border is the only thing
identifying the tile as a component — which puts it under **WCAG 1.4.11 at
3:1**, not outside grading. `#5D6777` clears it at 3.33:1.

The tokens page no longer has a "hairline, not graded" category. It grades every
token against its permitted surfaces.

### `defaultTheme="system"`, not `"dark"` — rule 8b

Reverses decisions 5 and 6 above. `PRD.md` §4.2 wins: a light mode nobody
defaults into is unverified code that still has to be maintained.

Consequently the server no longer renders `class="dark"` on `<html>`. With
`system` the server cannot know the answer, and guessing would flash the other
way for half the audience. The flash is closed in CSS instead:

```css
@media (prefers-color-scheme: dark) {
  html:not(.light):not(.dark) { background-color: #0e1013; color-scheme: dark; }
}
```

Two properties, not a duplicated palette — nothing here can drift out of step
with the tokens. It paints the correct ground with no JavaScript involved, and
once next-themes' script writes a class, the class wins. Verified in both
directions by emulating the OS preference: system-dark with no stored theme
resolves to `.dark` on a `#0E1013` ground, system-light to `.light` on white.

**Not yet built:** forcing `.dark` on `/j/[code]` and `/room/[code]` via their
route-group layouts. Those routes arrive in Phases 3 and 4; the wrapper goes in
with them.

### `npm run check:contrast` is now the source of truth

`scripts/contrast.mjs` parses the hex values out of `app/globals.css` — not a
table someone remembered to update — and checks every foreground token against
the surfaces it is *permitted* to sit on, exiting non-zero on any violation.
24 checks across both themes, all passing.

`lib/contrast-rules.ts` holds the rules, imported by both the script and
`/dev/tokens`, so the gate and the visual check cannot disagree.

The permitted-surface model replaces "check every surface", which was both too
narrow (it missed `--input` and `--accent` — seven surfaces, not four) and too
blunt (chasing every surface would push `--state-critical` light enough to stop
reading as red). Two exclusions are declared rather than papered over:

- **`--state-critical` is not permitted on `--input`** (4.34:1). Validation
  error text sits below a field on the ground, never inside the filled input.
- **`--tile-border` is permitted only on `--background`.** Single-purpose: the
  room ground, nowhere else.

`/dev/tokens` shows excluded pairs greyed **with their ratio still printed**, so
the exclusion is legible rather than hidden — you can see that
`--state-critical` on `--input` really is 4.34:1, and that it was excluded
deliberately rather than missed.

### Verified after the revision

Every value in `CLAUDE.md`'s new permitted-surfaces table reproduces exactly:
`--foreground` 12.01, `--muted-foreground` 5.08, `--state-warning` 6.49 (all
worst on `--input`), `--state-critical` 4.84 on `--secondary`, `--tile-border`
3.33 on `--background`. The excluded pair is 4.34 as stated.

### The stale table — resolved by deletion

`PRD.md` §4.2's duplicated "Verified contrast" block is gone. It was not
corrected, it was removed: the document now points at `CLAUDE.md` and the script,
on the grounds that a second copy of the numbers is a liability rather than a
convenience. §3.11 now states the claim it can actually support —
`--state-critical` is permitted on `--popover` (5.42:1), so the modal can carry
it — rather than the broader "every dark surface", which `--input` breaks.

`--snapshot` now emits `CLAUDE.md`'s two tables in their exact format, so
"regenerate, do not hand-edit" is an instruction that can be followed rather
than an aspiration. The rule labels (`all`, the `--state-critical` exclusion
prose, `--background` only) live in `scripts/contrast.mjs` beside the surfaces
they describe, so a label and its number cannot drift apart. The worst-surface
name in each pair row is resolved from the rules rather than typed, for the same
reason.

**Proven, not assumed:** both tables in `CLAUDE.md` were diffed against the
generated output and are **byte-identical** — 5 rows and 9 rows, reproduced from
the hex in `app/globals.css`. Every inline ratio in the prose of both documents
was recomputed as well: 9 of 9 verify, including the ones recording rejected
values (`--border` 1.29:1, the first `--tile-border` replacement at 2.09:1).

There is now no hand-maintained contrast number anywhere in the project.

---

## Next: Phase 1 — Data and auth

Schema, RLS, `get_meeting_by_code`, Supabase clients, magic link and Google
OAuth. Requires the LiveKit, Supabase, and Google Cloud accounts from
`BUILD-PLAN.md` § Before you start.

---
---

## Phase 1 — Data and auth

**Status:** complete. Sign-in works both ways, the session survives a reload,
and RLS is proven rather than assumed.

### Shipped

- `supabase/migrations/20260901231827_meetings.sql` — `meeting_status`, both
  tables, both indexes, exactly as `PRD.md` §6.
- RLS on both tables. Hosts select/insert/update/delete only where
  `host_id = auth.uid()`. Participants readable only through a meeting you host.
- `get_meeting_by_code` as `security definer`, `search_path` pinned, six columns.
- `lib/supabase/{client,server,middleware}.ts` on `@supabase/ssr`, plus
  hand-maintained `types.ts`.
- `middleware.ts` — protects `/dashboard` and `/schedule`, preserves the
  intended destination, bounces signed-in users off `/sign-in`.
- `/sign-in` with magic link and Google; `/auth/callback`; `/auth/complete`.
- Sign-out that reaches other tabs.
- `npm run check:rls` — 15 assertions against the live project.

### Verified, not assumed

**RLS, 15/15.** Every read is made with a *user's own JWT*. The service-role key
bypasses RLS entirely, so a test written with it would pass whether the policies
existed or not; it is used only to create and delete the two fixture users.

Pass means an empty result set, not a 403. PostgREST filters a forbidden read
rather than refusing it — a test asserting on 403 would pass for the wrong
reason today and break the day the behaviour is correct.

The suite opens with a control, because without one it has a silent failure
mode: if the inserts had gone nowhere, every "sees nothing" assertion would pass
while proving nothing. Same query, three identities —
**service-role 2, alice 1, bob 1**. The difference is the evidence.

Covered: cross-user read, read by id, update, delete, insert forged under
another host (403), anonymous read of the table, the function's six columns, the
absence of `host_id`/`id`/`settings` from the anonymous payload, an ended
meeting falling out of the function, and participants in both directions.

**Magic link end to end.** Callback → session cookie → `/dashboard` rendering
the signed-in email → reload keeping the session → signed-in user bounced off
`/sign-in`. Fixture users deleted afterwards; the project is left empty.

**Open-redirect guard, 11/11**, including `//evil.example.com`,
`/\evil.example.com`, and `javascript:`.

### Decisions that departed from, or hardened, the specification

1. **`(select auth.uid())`, not bare `auth.uid()`.** Called bare it is
   re-evaluated per row; as a scalar subquery the planner hoists it to an
   InitPlan and evaluates it once. On a large table that is the difference
   between an index scan and a sequential one.

2. **`revoke all … from public` before the grant.** `PRD.md` §6 grants EXECUTE
   to `anon` and `authenticated`, but Postgres already grants EXECUTE on new
   functions to `PUBLIC`, so the grant alone changes nothing and the default
   stays. Revoking first is what makes the grant the actual access list.

3. **The callback handles three shapes, not one.** `?code=` is PKCE, which our
   own form produces. `?token_hash=` arrives when there is no verifier — a link
   requested on a laptop and opened on a phone, which is ordinary behaviour.
   Supabase's default email template points at its own `/verify`, which in that
   case returns the session in the URL **fragment**, and a fragment never
   reaches a server. Handling only `code` turns a valid link into "this link is
   broken" for every cross-device open. `/auth/complete` reads the fragment in
   the browser, calls `setSession`, and strips it from history immediately —
   a refresh token left in the address bar survives in back-button history.

4. **`lib/env.ts` now names each public variable as a literal.** As delivered it
   parsed `process.env` wholesale, which works on the server and throws in the
   browser: Next replaces `process.env.NEXT_PUBLIC_X` textually and cannot
   replace anything when the whole object is passed to a function, so in the
   client bundle every variable read as missing. This surfaced the moment a
   client component imported the Supabase browser client. The parse now receives
   an object built from literal member expressions.

5. **`AuthListener` sits in the `(app)` route group, not the root layout.** In
   the root layout it pulled supabase-js into every route and took shared JS
   from 174 kB to 256 kB — a cost paid by the marketing page and, later, by
   `/j/[code]`, the guest join screen, which is the highest-traffic route and
   the one that never needs a session. Moved, shared is back to 175 kB.

6. **Provider error strings are rewritten in Parley's voice.** Supabase says
   `Email address "…" is invalid`; the copy rule says an error states what
   happened and what to do next. `lib/auth/errors.ts` maps the ones people
   actually hit and passes anything unrecognised through unchanged — a
   wrong-but-specific provider message beats a vague one of our own.

7. **`lib/supabase/types.ts` is hand-maintained**, not generated at build time,
   so a mismatch shows up in review rather than in CI and the build needs no
   network access. Regenerate with `supabase gen types typescript --linked`.

8. **Forward migrations only.** `db push`, never `db reset`.

### Known issues, deferred

- **The dashboard is 242 kB of First Load JS against `PRD.md` §10's 180 KB
  gzipped target.** Next's figures *are* gzipped — confirmed by gzipping a
  chunk: 188.7 kB raw compressed to 59.2 kB, exactly the reported number. The
  67 kB over the 175 kB baseline is supabase-js, pulled in by `AuthListener` and
  `SignOutButton`. The fix is to move sign-out to a route handler and see
  whether the listener can work from `BroadcastChannel` alone, which would take
  supabase-js out of the signed-in client bundle entirely. That is a design
  change, so it is flagged rather than taken; Phase 10 owns the bundle check.
- **Google OAuth is not verified end to end.** The provider is enabled, the
  client ID is real, and `/authorize` redirects to Google with this project's
  callback registered — but completing it needs interactive consent. First
  human sign-in will confirm it.
- **Email delivery is Supabase's built-in sender**, rate-limited to a handful
  per hour. Production needs real SMTP — Phase 10.

---

## Phase 1 — revision

`CLAUDE.md` and `PRD.md` were updated after Phase 1 landed. Three changes, two
of which needed code.

### Rule 2 now forbids reading `.env.local`. It was being read.

The rule postdates the work, but the concern is real and worth recording rather
than quietly complying with.

**What happened.** Several throwaway probe scripts parsed `.env.local` to reach
Supabase and LiveKit, and `scripts/check-rls.mjs` did the same. Worse, when the
project moved to the dedicated Parley instance, the Supabase keys were written
into the file programmatically from the authenticated CLI.

**What reached the transcript.** No secret value was printed. Diagnostics
reported lengths, character classes, and JWT `role` claims — never the keys. One
exception: the LiveKit **API key** (`APIPC5…`, the identifier half of the pair)
appeared in a token-claims dump. It cannot mint anything without the secret,
which was never shown, but it should not have been printed either.

**What changed.** `check:rls` now runs as
`node --env-file=.env.local scripts/check-rls.mjs` and reads `process.env`. It
never holds the file's contents as a string, so there is nothing to log by
accident. `scripts/check-env.mjs` remains the only script that opens the file,
which rule 2 explicitly sanctions — it reports variable names and verdicts and
never values. No further probing of `.env.local`, `~/.supabase`, `*.pem`, or
`.vercel/`.

### Rule 8c: the leak guard is now server-only

`assertNoSecretsInPublicVars()` ran at module scope, so it was reachable from
the client bundle. It could never catch anything there —
`Object.entries(process.env)` is empty in the browser by construction, and by
the time client code runs, the leak it looks for is already compiled in — while
`Buffer` risked pulling a polyfill in to scan an empty object. Now behind
`typeof window === "undefined"`. `npm run check:env` is what actually stops a
leaked key, because it runs before the build rather than after. Verified:
`typeof Buffer` is `undefined` on the client.

### Bundle budgets: measured, and the baseline itemised

`PRD.md` §10 now states the unit explicitly — **First Load JS totals, gzipped,
inclusive of the shared baseline** — which settles the earlier ambiguity. The
first version of the table put its tightest number on `/dashboard`, the route
behind auth that the same people revisit; it now sits on `/j/[code]`, the cold
load for a stranger on a phone.

| Route | Now | Budget | Headroom |
|---|---|---|---|
| Shared baseline | 175 kB | ≤ 180 kB | **5 kB** |
| `/` marketing | 161 kB | ≤ 190 kB | 29 kB |
| `/dashboard` | 242 kB | ≤ 280 kB | 38 kB |
| `/j/[code]` | — | ≤ 230 kB | Phase 3 |
| `/room/[code]` | — | ≤ 250 kB | Phase 4 |

Every route is within budget. `/sign-in` (250 kB) and `/auth/complete` (242 kB)
have no budget of their own; both are auth surfaces, comparable to `/dashboard`.

**The itemised look §10 asks for.** The shared baseline is the tightest number
of the five and the only leveraged one, so it is where a kilobyte is worth five.
The four named shared chunks account for 116.8 kB gzipped:

| Chunk | Size | Contents |
|---|---|---|
| `9f66e819…` | 57.8 kB | react-dom, Next client |
| `b3bdc7c2…` | 29.1 kB | **ours** — radix-ui, next-themes, sonner, HugeIcons, lucide |
| `e48fa16f…` | 16.8 kB | Next client |
| `92fbc226…` | 13.1 kB | Next client |

So roughly 88 kB is framework, matching §10's stated 105–120 kB floor once the
unnamed chunks and CSS are counted, and **29 kB is what the root layout drags in
for every route**.

Two measurements, taken by removing each and rebuilding rather than estimating:

- **`TooltipProvider` cannot be removed.** The build fails —
  `` `Tooltip` must be used within `TooltipProvider` `` — because the header's
  own theme toggle uses one. Radix's tooltip and HugeIcons are genuinely shared,
  since the header is on every route by design.
- **`<Toaster />` costs 10 kB.** Removing it takes shared from 175 kB to 165 kB
  and `/` from 161 kB to 151 kB, tripling the baseline's headroom from 5 kB to
  15 kB. Nothing renders a toast yet, so the cost is currently paid for nothing.

**Not acted on, deliberately.** Moving `<Toaster />` into a route group means
deciding which surfaces raise toasts. `(app)` is the obvious home — Phase 2's
"Link copied" fires on the dashboard — but `/j/[code]` sits outside that group
and may want one too. That is a design decision, and §10 says to recalibrate at
the end of Phase 3 when pre-join exists and there is evidence rather than
estimate. The 10 kB is banked and waiting.

Two constraints §10 adds for Phase 3, recorded now so they are not discovered
late: pre-join uses `navigator.mediaDevices` and needs no LiveKit code, and it
should not pull in `react-hook-form` and `zod` for a single display-name field.

---

## Phase 2 — Meetings and dashboard

**Status:** complete. Both meeting kinds create, codes are unique and unbiased,
and the dashboard lists upcoming and past.

### Shipped

- `lib/meetings/code.ts` — generator and a normaliser for codes typed by hand.
- `lib/meetings/schema.ts` — a zod discriminated union over instant and
  scheduled, shared between client and route handler.
- `POST /api/meetings` — generate-and-insert with retry on unique violation.
- `app/(app)/dashboard` — upcoming and past, empty state as an invitation.
- `StartMeetingButton`, `CopyLinkButton`, `MeetingRow`.
- `npm run check:codes` and `npm run check:meetings`.

### Verified, not assumed

**The generator, 7/7.** 100,000 codes — the build plan asks for 1,000 — all
unique, all matching `xxx-xxxx-xxx`, and not one `i`, `l`, `o`, `0` or `1` in a
million characters.

The interesting one is bias. The alphabet is 31 characters and a byte holds 256
values, so `byte % 31` makes the first eight characters about 3% likelier.
`randomCharacters` rejects bytes at or above 248 and redraws, at a cost of
looping ~3% of the time. Measured both ways: this generator scores **18.9** on
chi-squared across 30 degrees of freedom, the naive version scores **2,962.9**,
and the threshold is 59.7. Max/min character frequency is 1.019 against 1.148.
The test fails by two orders of magnitude on the wrong implementation, which is
the only reason to trust it passing on the right one.

**Creation, 15/15,** through the real route handler with a real session cookie —
so the zod schema, the session lookup and RLS are all on the path. Covers: 401
for an unauthenticated caller, both meeting kinds, `scheduled_end` computed
server-side as start + duration, six malformed payloads rejected with 400
(including an invented timezone and a whitespace-only title), and `host_id` in
the request body being ignored in favour of the session. The dashboard is then
fetched over HTTP and asserted to contain what was just created.

### Decisions

1. **Rejection sampling, not `byte % 31`.** Above. A biased keyspace is the kind
   of flaw that never announces itself.

2. **`<Toaster />` moved into `(app)`,** taking the 10 kB banked last round.
   Phase 2 is where toasts became real, so the question "which surfaces raise
   toasts" now has an answer instead of a guess: every one of them — "Link
   copied", meeting-creation failures — is inside this group. The room route
   gets its own in Phase 4 rather than the marketing page paying for it.
   Shared dropped 175 → 165 kB, `/` 161 → 150 kB, and `/sign-in` and
   `/auth/complete` fell 10 kB each as a side effect.

3. **Two sections, two sort orders, done in JS rather than SQL.** Upcoming reads
   soonest-first — the next thing you have to be at. Past reads
   most-recent-first. A single `ORDER BY` cannot do both, and the first version
   shipped with upcoming sorted backwards: a meeting three days out sat above
   one two hours away. Instant meetings have no scheduled time and are startable
   now, so they lead the upcoming list.

4. **`MeetingRow` is a client component** because the time must render in the
   *viewer's* zone, which the server does not know. Rendering it server-side
   would print the server's zone and then hydrate into a different string.

5. **The copy-link URL is built from `location.origin`,** not from
   `NEXT_PUBLIC_APP_URL`, so a link copied on a preview deployment points at
   that deployment.

6. **No "Schedule meeting" button yet.** `PRD.md` §3.10 lists it as a primary
   dashboard action, but the form is Phase 6. The API accepts scheduled
   meetings today and `check:meetings` proves it; shipping a button that leads
   nowhere would be worse than not shipping it.

### Two test bugs found by running against real data

- **`check-rls`'s control asserted the service role saw exactly two rows.** True
  only while the project was empty. Seeded data broke it, correctly — the
  assertion was about the project, not about RLS. It now counts only its own two
  fixtures. A side benefit: "anonymous reads see no meetings at all" is now
  meaningful, because it sees zero while the table holds five.
- **`admin/generate_link` returns the user flattened** — `id` at the top level,
  not under `.user`. Reading it wrongly meant the cleanup's `user?.id` guard
  skipped in silence and stranded eight fixture accounts. Fixed, and cleanup now
  says so out loud rather than optional-chaining past the problem.

### Phase 2 revision — `/j/[code]` now exists

`CLAUDE.md` gained a rule that names exactly what shipped: *never ship a working
control that lands on a framework default error page.* "Start meeting" created a
row and then dropped the user on Next's 404, and calling that a phase boundary
was the wrong call — the boundary is for scope, not for leaving the product
broken in between. `BUILD-PLAN.md` Phase 2 now requires the real route file, and
Phase 3 fills it in rather than replacing it.

**`app/j/[code]/page.tsx`** resolves the meeting and renders its title and code,
or a designed not-found state with a field to try another code. Native state and
one parse on submit, not react-hook-form and zod — §10 forbids a form library on
this route for a single field.

**It resolves anonymously, and that is the point.** `lib/supabase/anon.ts` is a
session-less client. Using the cookie-backed server client would send the
browser's session, so a signed-in host would exercise the `authenticated` path
and the `anon` path — the one guests actually get — would never be tested by
anyone looking at the page. `get_meeting_by_code` is `security definer`: it runs
with the owner's rights and is the only thing between a code and the row behind
it, so it is called as the least-privileged caller there is, on the real page,
every time. The fetch is server-side, so no supabase-js reaches the browser.

**Four new assertions in `check:meetings`,** run with `fetch` rather than the
signed-in helper so no cookie is sent: the page resolves with no session; it
leaks no host id, row id or email; an unknown code answers **200** with a way
forward while a genuinely missing route still answers **404**; a malformed code
lands in the same state.

One of those found a bad test of my own. I had asserted the absence of "This
page could not be found" — but Next inlines its default not-found component into
every page's payload, so that string is present in the HTML of a perfectly
healthy page. It discriminated nothing. Status code and our own content do.

### The header moved out of the root layout

Rule 8b forces `.dark` on `/j/[code]`. With the header in the root layout it
stayed on the *viewer's* theme, so on a light system a white bar sat on top of a
dark pre-join screen — a seam at exactly the moment the product is meant to
signal "you've entered the call". The dark surface also failed to fill the
viewport, leaving white below it.

`components/shared/SiteShell.tsx` now carries header plus content, and is
rendered by the document surfaces only: `(marketing)`, `(auth)`, `(dev)`, and
`(app)`. `/j/` renders its own full-height dark shell with no header. The
marketing page moved into `(marketing)/`, which is what `CLAUDE.md`'s file
layout specified all along.

Verified with the viewer's theme forced to light: `/` renders `html.light` on a
white ground, `/j/[code]` renders fully dark with no seam.

It also paid for itself. The header carries HugeIcons, a Radix tooltip and
next-themes; in the root layout every route paid for them, including the two
that never render it.

| Route | Phase 1 | Now | Budget |
|---|---|---|---|
| Shared baseline | 175 kB | **160 kB** | ≤ 180 |
| `/` marketing | 161 kB | **151 kB** | ≤ 190 |
| `/j/[code]` | — | **148 kB** | ≤ 230 |
| `/dashboard` | 242 kB | 259 kB | ≤ 280 |

### Ended meetings now resolve — the last Phase 2 gap closed

`get_meeting_by_code` filtered `status <> 'ended'`, so an ended meeting and a
code that never existed both returned nothing and landed on the same page. The
common case there is someone with a legitimate link arriving late, and telling
them the meeting doesn't exist is a lie.

**Migration `20260902010539_resolve_ended_meetings.sql`** widens the window:
ended meetings resolve for 30 days, then fall through. `coalesce(ended_at,
created_at)` because a meeting can reach `ended` without `ended_at` being set —
a webhook that never fired, a status changed by hand — and the window has to
close on those rather than leaving them resolvable forever.

`/j/[code]` branches on `status`: scheduled or live renders the placeholder,
ended renders "This meeting has ended" with the title, missing renders the
unknown-code state. No 404 on any path.

**The title, not the host's name.** §3.2 originally asked for the host and
contradicted §6, where the function returns no host identity. The title does the
same job — telling someone with several links which one this was — without
handing a person's name to anyone holding a code. It was already visible to
link-holders while the meeting ran, so showing it afterwards is no new class of
disclosure.

**Joinability is not decided here.** A resolving row is display data. Whether a
room can be entered is the token endpoint's call in Phase 3, which is why the
page branches on `status` rather than treating any successful result as
joinable.

### Verified

`check:rls` **18/18**, up from 15. The old assertion — *"refuses an ended
meeting"* — failed the moment the migration landed, which is what it was for.
It is replaced by four that test both sides of the window: a recently ended
meeting resolves and reports `status: ended`; it still discloses only the same
six columns; one ended 31 days ago stops resolving; and one with a null
`ended_at` falls back to `created_at` rather than resolving forever.

Testing only that a recent ending resolves would have passed equally against a
function with no window at all — the version that leaves every stale link alive.

`check:meetings` **23/23**, up from 20, including the three page-level states
end to end: ended says so and is not the unknown-code state, shows the title and
not the host, and past 30 days falls through to unknown-code.

Bundles unchanged within noise: shared 160 kB (≤ 180), `/j/[code]` 151 kB
(≤ 230), `/dashboard` 259 kB (≤ 280).

### Phase 2 → 3 housekeeping: `npm run seed:dev`

`BUILD-PLAN.md` opens Phase 3 with the carry-over this file had been listing as
open — ad-hoc test rows on the live account. `scripts/seed-dev.mjs` replaces
them with three deliberate fixtures, one per dashboard state:

| Code | Status | Title |
|---|---|---|
| `wcz-4npm-hjd` | live | Design review |
| `tgr-6xkv-bqs` | scheduled, 3 days out | Roadmap planning |
| `mzn-3fhw-dpy` | ended, 3 participants | Sprint retro |

Fixed codes, so a second run produces the same three rather than six. Verified
by running it twice: the first removed six ad-hoc rows, the second removed and
replaced its own three.

The titles are chosen. This dashboard ends up in screenshots, and the rule that
governs empty-state copy governs its contents — "asdf" in a portfolio shot is
the same failure as an undesigned error state, just quieter.

**The script refuses to run unless `NEXT_PUBLIC_APP_URL` is localhost.** It
deletes every meeting belonging to its host before inserting; pointed at a real
deployment that is silent, irreversible loss with no runtime symptom, which is
the same class of failure the env guard exists for. Verified against a
production-looking URL and a malformed one: both refuse, **both exit 1**, and
neither touches the database. The exit code is worth stating because the first
check appeared to pass while actually reading `head`'s status.

It also names the host rather than guessing: `SEED_EMAIL` if given, the sole
non-`@example.com` account otherwise, and a clear list to choose from if there
are several. Fixture accounts from the check scripts are never a seed target.

### One defect the fixtures exposed

A live instant meeting rendered **both** a "Live" and an "Instant" badge — the
same thing said twice, with the half that matters buried. Live is what is
happening now; instant is only how it was created. One badge at most now, live
winning. Nothing but real fixtures would have surfaced it, since no meeting had
previously been both.

### Known, deferred

- **No "Schedule meeting" button.** §3.10 lists it; the form is Phase 6. The API
  accepts scheduled meetings today and `check:meetings` proves it.

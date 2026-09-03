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

---

## Phase 3 — Token endpoint and pre-join

**Status:** the token endpoint is complete and verified. Pre-join is built; four
of its six permission states could not be produced in this environment — see
below for exactly which, and what was checked instead.

### Shipped

- `POST /api/livekit/token` — the full §7 contract.
- Migration `20260902013014_rate_limits.sql` + `lib/rate-limit.ts`.
- `lib/livekit/identity.ts` — name sanitisation and identity derivation.
- `lib/supabase/admin.ts` — service-role client, for the limiter only.
- `lib/hooks/useMediaPreview.ts`, `lib/media/classify.ts`, and the pre-join
  components. `/j/[code]` is now the real screen.
- `npm run check:permissions` and `npm run check:bundle`.

### Decisions

1. **The rate limiter counts in Postgres, not in memory.** §8 leans on it as a
   security control, and a module-level `Map` does not survive serverless — each
   cold instance starts at zero, making the real limit "10 per minute per
   instance", a number nobody chose and nobody can observe. One extra round trip
   on the join path, well inside §10. No new dependency; a Redis would have
   needed asking for.

   It **fails open** on a database error, deliberately. This guards against code
   enumeration, already implausible at 8×10^14 codes; a Supabase blip should not
   take the product down to protect a defence that is not the load-bearing one.
   The opposite call would be right for a login endpoint.

2. **Host is decided by RLS, not by an ownership check.** The endpoint tries to
   read the meeting row *as the caller*; the policy returns it only to its
   owner, so a successful read is the authorisation. A separate `host_id ===
   user.id` comparison would be a second place for the rule to live and drift.

3. **`server-only` was not added.** `lib/supabase/admin.ts` would benefit — it
   turns a runtime failure into a build error. The key cannot leak either way,
   because Next inlines only `NEXT_PUBLIC_` variables, so importing it client-side
   fails loudly rather than shipping a secret. It is a one-line dependency and
   rule 9 says ask, so: worth adding if you want it.

4. **Control characters and bidi overrides are stripped server-side, once.** A
   display name is drawn on a tile, in the participants panel, and read aloud by
   screen readers. A bidi override in it reorders the text around it; a
   zero-width joiner lets two participants render identically. Stripping at the
   single point of entry beats escaping at each point of use.

5. **`canUpdateOwnMetadata` is deliberately not granted.** It is not in §7's
   list, and granting it would let a participant rename themselves mid-call,
   undoing the sanitisation above.

### Verified

**`check:meetings` 34/34**, up from 23. The token assertions decode the JWT
rather than trusting a 200: a token *is* authority, so what it grants matters
more than that the request succeeded. Grants are exactly the five in §7 and
nothing wider — `roomAdmin`, `roomCreate`, `roomList` and
`canUpdateOwnMetadata` are each asserted absent. TTL is 6 hours, guest identity
matches `guest_[10 chars]` and is server-generated, the display name is
sanitised into metadata rather than the identity string, a blank guest name is
refused, and the host is recognised with `identity = user_<id>`.

**The rate limit is asserted as a count, not a vibe:** ten allowed, the eleventh
refused. "Some request eventually 429s" would pass against a limiter off by
several, which is still a bug.

**`check:permissions` 13/13** — the classifier that decides which of the six
states you see.

### What could not be tested, and why

BUILD-PLAN asks for each permission state to be produced by manipulating browser
settings rather than faked. Two were, in a real browser: **not yet asked**
(reason shown, no prompt fired on load) and **blocked** (Chrome-specific
instructions, and correctly *no* "Try again" button, because the browser will
not ask again).

The remaining four — granted, dismissed, no-device, in-use — need a camera to
grant, unplug, or hold open, and a prompt to close by hand. The Browser pane
blocks capture outright. Rather than fake them, `lib/media/classify.ts` extracts
the mapping from `getUserMedia` failures to states, and `check:permissions`
tests it exhaustively, including the pair that shares one error name and needs
different copy: a refusal the browser remembers, and a prompt someone closed.
An absent Permissions API resolves to "dismissed" — the kinder wrong answer,
since sending someone to a settings page to fix a permission they never refused
is the more annoying mistake.

**These four still need a human at a real machine.** That is the honest state.

### Two bad tests of my own, found and fixed

- **`ttl is 6 hours` measured `exp - iat`.** The LiveKit SDK emits `nbf` and
  `exp`, not `iat`, so the subtraction gave `NaN` — which compares false and
  looked like a real failure. Now `exp - nbf`.
- **`check:bundle` first recomputed sizes itself** by gzipping manifest chunks.
  It did not reconcile with Next: 142 kB against 160 for the shared baseline,
  191 against 181 for `/j/[code]`. A second measure that disagrees with the
  documented one is worse than none, because §10 states budgets in Next's units.
  It now parses the build output. It also has to run `npm run build` rather than
  a bare `next build` — the project passes `--turbopack`, and webpack reported a
  103 kB baseline against Turbopack's 160.

Also worth recording: **grepping client chunks for "livekit" is the wrong rule-8
test.** It matches `/api/livekit/token`, our own endpoint path, and the value of
`NEXT_PUBLIC_LIVEKIT_URL`, which Next correctly inlines. Both belong there.
`check:bundle` looks for identifiers that only exist inside the library, and
confirms 32 chunks carry none of them.

### Bundles

| Route | Now | Budget |
|---|---|---|
| Shared baseline | 160 kB | ≤ 180 |
| `/` | 151 kB | ≤ 190 |
| `/j/[code]` | **181 kB** | ≤ 230 |
| `/dashboard` | 260 kB | ≤ 280 |

Pre-join added 30 kB and stays 49 kB inside its budget — it carries no LiveKit
code and no form library, per §10.

### Phase 3 revision — `server-only`, and the real `/room/[code]`

**Rule 8d approves `server-only`,** which I had flagged and left out under rule
9. Installed and applied — and applying it required a split, because
`lib/env.ts` is imported by client components for `publicEnv` and could not take
the import wholesale.

`lib/env.server.ts` now holds `serverEnv` behind `server-only`. Before this,
`serverEnv` was exported from a module client code imports, with only a
`typeof window` check stopping it evaluating there — a runtime guard where a
structural one belongs. `lib/supabase/admin.ts` imports it too. The values could
never have reached a bundle either way, since Next inlines only `NEXT_PUBLIC_`
variables; what changes is *when you find out*.

**`/room/[code]` exists**, which closes the gap flagged at the end of Phase 3.
It requests a token from a real browser with a real session — the most
security-sensitive surface in the product — and gives each contract failure its
own state. It deliberately does not import `livekit-client`: Phase 4 adds it
behind a dynamic import, and pulling ~200 kB in now would both break rule 8 and
make the Phase 4 measurement meaningless. The route lands at **152 kB against a
250 kB budget**.

### Two bugs the room route exposed immediately

Both were found by walking the flow rather than by a test, and neither would
have been visible without the route existing.

**A guest's name never reached the room.** Pre-join collected it, then navigated
to `/room/[code]`, which minted its own token with no name — so the endpoint
correctly refused and *every guest* hit "a name is needed first" having just
typed one. `lib/prejoin-handoff.ts` carries it in `sessionStorage`: per-tab, so
two meetings side by side don't overwrite each other, and cleared when the tab
closes. Not the URL — a query parameter would put the name in history, in
referrer headers, and in any link the person pastes onward.

**A failure state whose copy and control disagreed.** The first version had one
`retry` flag deciding whether "Back to the join screen" appeared. On
`display_name_required` the copy said "go back to the join screen" above a
button labelled "Start a new meeting". Each failure now names its own way out:
ended → start a new meeting, guests-not-allowed → sign in with `next` set back
to the join link, everything else → back to pre-join.

### Verified

`check:meetings` **37/37**, up from 34 — the room route renders rather than
404ing, is forced dark like the pre-join boundary, and an unknown code still
reaches a designed state.

In a real browser, end to end: a guest typed a name on pre-join, landed in the
room as **Ama Serwaa · participant** with the handoff intact in
`sessionStorage`, and navigating directly to an ended meeting's room produced
"This meeting has ended" with the right action.

`check:bundle` **6/6** — `/room/[code]` is now budgeted and measured, and
rule 8 still holds across 33 chunks.

| Route | Now | Budget |
|---|---|---|
| Shared baseline | 160 kB | ≤ 180 |
| `/` | 151 kB | ≤ 190 |
| `/j/[code]` | 181 kB | ≤ 230 |
| `/room/[code]` | **152 kB** | ≤ 250 |
| `/dashboard` | 262 kB | ≤ 280 |

### Known, deferred

- **Four of the six permission states still need a human at a real machine** —
  granted, dismissed, no-device, in-use. The classifier is tested exhaustively,
  but producing the conditions needs a camera to unplug or hold open and a
  prompt to close by hand. See the matrix status table at the end of this file
  for where each row stands after the second revision.
- **Speaker selection is stored but not applied.** `setSinkId` belongs on the
  room's audio elements, which arrive in Phase 4.
- **No "Schedule meeting" button.** §3.10 lists it; the form is Phase 6.

---

## Phase 3, second revision — working the permission matrix

BUILD-PLAN gained a **manual permission test matrix** under Phase 3: how to
produce each of §3.3's states on macOS, an instruction to run them in Chrome
*and* Safari, and a blunt statement that in the denied state the copy is the
deliverable — it must name where the setting lives, and that differs per
browser.

Working the matrix against the code found four bugs before any of them reached
a human tester. None were visible from the classifier, because none of them
were classification mistakes — they were about what gets *asked for*, and what
gets thrown away on the way.

### Safari would have shown a button that does nothing

Safari has no `camera` descriptor in its Permissions API, so the hint that
separates "refused" from "closed the prompt" is permanently `null` there. Every
refusal therefore read as a **dismissal**, which offers "Try again" — and
Safari will not re-prompt within a session, so that button was guaranteed to do
nothing. A control that looks broken is exactly what this screen exists to
avoid, and it would have been invisible in Chrome.

Rather than sniff for Safari, `classifyMediaError` now takes what the screen
was showing before the attempt. If the retry we offered was taken and produced
the same refusal, the retry demonstrably did not work, so it is not a
dismissal. The browser's behaviour answers the question its API won't. The same
rule covers Chrome's embargo after three dismissals, which the matrix calls out
separately.

### A missing camera took the working microphone with it

`getUserMedia({video, audio})` succeeds or fails as a pair. On the matrix's own
"No device" row — camera switched off in Screen Time — the combined request
throws `NotFoundError` and there is no preview, no level meter, no device list,
and copy offering to join with audio only above a screen that never found any
audio either. Each device is now asked for separately once the pair fails.

### A remembered device could lock someone out permanently

A stored `deviceId` is a *hard* constraint, and hardware leaves. Asking for a
dead id meant every attempt failed identically and "Try again" could never
succeed, because each attempt asked for the same missing device. The constraint
is now dropped and the stored ids forgotten.

### …but not when the answer was simply "no"

Measured in Chromium rather than assumed: **an exact `deviceId` is evaluated
before permission is checked**. Asking for a device nobody has throws
`OverconstrainedError` even when permission is already denied. So someone who
clicks Block *and* has a device remembered arrives at the "hardware has gone"
rung — and the first version wiped their preference as a side effect of the
answer they gave. They would have found their camera choice missing after
going to settings and allowing. The ids are now forgotten only once the
unconstrained retry proves they were the problem.

This one is worth naming as a method note: it was found by asking a real
browser what it does, not by reasoning about what it should do.

### iOS Safari was being sent to a menu that isn't there

The denied copy named "Safari → Settings for This Website" for every Safari
user. iPhones have no menu bar. It now names the ᴀA button and the Settings
app.

### What is now provable without hardware

Two more pure modules, extracted for the same reason `classify.ts` was — the
conditions can't be produced from a script, but the decisions can be driven
exactly:

- **`lib/media/acquire.ts`** — the ladder. What to ask for, and what to ask for
  next when that fails. Returns every attempt it made, so a test can assert
  that a dead id is never asked for twice and that a refusal is never retried.
- **`lib/media/browser-hint.ts`** — where the setting lives, per browser. The
  matrix makes this copy the deliverable, so it is asserted rather than
  eyeballed once. Chrome's UA contains `Safari/` and Edge's contains `Chrome/`;
  the table checks that five families get five distinct locations.

`check:permissions` is now **39 assertions**, up from 13. Every new one was
proved able to fail by reverting its fix and watching the suite go red — the
split-request rung, the second-refusal rule, the dead-id drop, the
forget-only-when-proven rule, and the iOS branch each break a named check.

### Verified in a real browser

The Browser pane blocks media capture, which makes it a genuine **Denied**
machine rather than a simulated one: `permissions.query` returns `denied` and
`getUserMedia` throws `NotAllowedError`. End to end on a production build, that
produced "Camera and microphone are blocked", naming Chrome's actual location,
with no retry button offered and "Join meeting" still available. That is one
matrix row genuinely closed.

The dismissed → denied escalation was driven through the real React tree with
the Permissions API made to throw the way Safari's does: idle → "No answer yet"
with a retry → "blocked" with the retry withdrawn. That proves the escalation
works when a browser behaves that way; it is **not** proof that Safari does,
which the matrix is right to insist a human confirms.

### Matrix status

| Row | Chrome | Safari |
|---|---|---|
| Granted | needs a human | needs a human |
| Denied | **verified** (real block, production build) | needs a human |
| Dismissed | needs a human | shape verified, browser unconfirmed |
| Dismissed ×3 (embargo) | logic covered, unconfirmed | n/a |
| No device | logic covered, unconfirmed | logic covered, unconfirmed |
| In use | logic covered, unconfirmed | logic covered, unconfirmed |

"Logic covered" means the ladder and the classifier are asserted against the
error names browsers document. It is not the same as having seen it, and the
matrix's own instruction stands: an untested path noted is fine, an untested
path assumed working is not.

### Checks

`check:env`, `check:contrast` 24, `check:codes` 6, `check:permissions` **39**,
`check:rls` 18, `typecheck`, `lint`, `check:meetings` **37/37**, `check:bundle`
**6/6** — all pass. `/j/[code]` moved 181 → **182 kB** against a 230 kB budget
for the extra branches.

---

## Phase 4 — The room

Two people can hold a conversation. `/room/[code]` connects to LiveKit, the
grid implements §3.4's table, and mic, camera and leave work.

### Rule 8 is now a real constraint rather than an absence

Until this phase `livekit-client` was in no chunk at all, so rule 8 could be
checked by grepping for library markers and expecting zero. That answer is no
longer right — the room genuinely loads the SDK — and a test whose expected
value has changed from "never" to "exactly once, over there" needs to say
*where*.

`check:bundle` now reads Next's own route→chunk manifest and asserts that no
chunk any route pulls into its **first load** carries a marker. A dynamically
imported chunk appears against no route, which is precisely the property being
claimed. Two supporting checks stop it passing vacuously: one that the manifest
paths resolve to real files (otherwise every lookup misses and everything
passes), and one that the markers appear in exactly one chunk — zero would mean
the dynamic import had been deleted and the room could not connect, which the
first check would happily call a success.

Proved by making the import static and rebuilding: `/room/[code]` jumps to
**316 kB against a 250 kB budget** and rule 8 names both the offending chunk and
the route that pulls it. With the dynamic import, **153 kB**.

### The grid is arithmetic, and the arithmetic is checked

§3.4 opens with "write these before writing layout code" and then gives the
breakpoints as a table. A table is a specification, so it is transcribed once
into `lib/room/layout.ts` and asserted row by row — desktop and mobile, every
row, in the PRD's own words — by the new `npm run check:room`. A wrong cell
count is otherwise only visible with seven real people in a room, which is the
most expensive place to find one.

Desktop and mobile differ in *kind*, not just in size: desktop overflows into a
"+N" cell and never pages, mobile pages and never overflows. That is why the
viewport is matched in JS rather than expressed as a CSS breakpoint — no media
query renders a different number of children.

**One reading had to be settled.** §3.4 says "most recent speaker first, then
join order", and §3.4's own acceptance criteria say the grid must reflow
"without layout thrash". Taken as an instruction about *arrangement* those
contradict each other — sorting every tile by speaking recency reshuffles the
whole grid every time someone says a word. They are only in tension on that
reading. The rule is headed "overflow ordering" and exists to decide who makes
the cut, so: **speaking recency picks the visible set, join order arranges it.**
Nobody moves while everyone fits.

### A test that passed for the wrong reason

The first version of the overflow fixture put the local participant first in
join order. Deleting the local-priority rule from the ranking still passed —
join order alone kept them visible. The fixture now makes the local participant
the worst candidate on both counts, joined last and never having spoken, so the
rule is the only thing keeping them on screen.

Re-run against three deliberate breakages, each now failing distinctly: losing
local priority in the visible set, losing it in the arrangement, and sorting the
whole grid by speaking recency — that last one being exactly the thrash bug the
PRD warns about.

### Decisions worth naming

- **`RoomContext.Provider`, not `<LiveKitRoom>`.** Rule 1 says the hooks; the
  hooks need a room in context and nothing more. The wrapper additionally
  renders a div carrying their class names, which is the edge of a design
  system we have declined. `RoomAudioRenderer` stays the documented exception.
- **Tracks are attached by hand**, not through `VideoTrack`. `useIsSpeaking`
  earns its import because smoothing speech detection is hard;
  `track.attach(element)` is two lines and keeps every class on the tile ours.
- **The local participant is always visible, and arranged first.** §3.4 does not
  say. Being pushed off your own screen by a crowd is the wrong failure when
  rule 3 makes your own mute state a privacy matter.
- **Only mic, camera and leave.** §3.4's table lists four more controls; screen
  share, reactions, chat and participants belong to Phases 5 and 7. A button
  that does nothing is worse than a button that isn't there yet.
- **Leaving is a decision, not a failure.** The disconnect the Leave button
  causes is otherwise indistinguishable from the connection dropping, and the
  person who just left would be told something went wrong.

### Deferred items closed

**Speaker selection now applies.** Pre-join collected it and had nowhere to put
it — `setSinkId` needs audio elements, and until this phase there were none.
`switchActiveDevice("audiooutput", …)` runs after connect, failing quietly on
Firefox, which has no `setSinkId` and where the default output is the right
outcome.

`lib/media/devices.ts` now holds the device store both ends share. A second copy
of the `"parley:devices"` key is the kind of thing that drifts silently: the
preview would honour a choice the room ignored, and nothing would look broken
from either side.

### Verified in two real browser tabs

Not by faking participant counts — two tabs, two guests, one meeting:

- Both tabs showed **both participants**, each listing itself first
- Two participants rendered **2 columns × 1 row** — §3.4's "side by side"
- Tile borders measured `rgb(93, 103, 119)` at 1px: `--tile-border`, the idle
  state, exactly as specified
- Leaving in one tab reflowed the other **live to 1 × 1 with `aspect-ratio:
  16 / 9`**, and the heading updated to "1 participant"
- Mic-off indicators on both tiles, named "{name} is muted"
- The mic control read "Turn on microphone" with `aria-pressed="true"` — the
  accessible name states the action, `aria-pressed` carries the state
- Controls hid after 4s idle and returned on both pointer movement and a
  keypress; hidden controls keep their tab stops but stop accepting clicks

**Rule 3 demonstrated itself.** The Browser pane blocks media capture, so
`setMicrophoneEnabled(true)` genuinely failed — and the UI showed muted and said
so, rather than showing a live microphone to someone who had none. That is the
privacy requirement working, observed rather than asserted.

One measurement misread at first: a backgrounded tab does not advance CSS
transitions, so the control bar's opacity appeared stuck at 0. Fronting the tab
showed the transition working correctly. Worth remembering — it looks exactly
like a bug.

### Checks

`check:env`, `check:contrast` 24, `check:codes` 6, `check:permissions` 39,
`check:room` **65** (new), `check:rls` 18, `typecheck`, `lint`,
`check:meetings` 37/37, `check:bundle` **8/8** — all pass.

| Route | Now | Budget |
|---|---|---|
| Shared baseline | 160 kB | ≤ 180 |
| `/` | 151 kB | ≤ 190 |
| `/j/[code]` | 182 kB | ≤ 230 |
| `/room/[code]` | **153 kB** | ≤ 250 |
| `/dashboard` | 262 kB | ≤ 280 |

### Still needs a human at a real machine

- **Hearing each other.** The Browser pane blocks capture, so nothing was ever
  published. Presence, roster, grid, borders and controls are verified; audio
  and video actually flowing between two machines on different networks is
  not, and BUILD-PLAN asks for exactly that.
- **The speaking ring.** 2px `--foreground` is specified and coded, but
  producing speech needs a microphone. The idle 1px state is measured.
- **Grid breakpoints above two.** The arithmetic is asserted for every row of
  §3.4's table; 1 and 2 were confirmed with real tabs. Three through seventeen
  need more tabs than were opened.
- **The four permission states** from Phase 3's matrix are unchanged.

---

## Phase 4, revision — automating the media tests

BUILD-PLAN gained a section approving Playwright under rule 9 and pointing at
Chrome's synthetic capture devices. The argument is right: driving real Chrome
with `--use-fake-device-for-media-stream` is not faking participant counts, it
is automating the opening of tabs, which is what Phase 4's acceptance criterion
actually asks for. Real Chrome, real WebRTC, real tracks through the real SFU.

`npm run check:media` — **7 tests**, and every gap the hand-testing report left
open except the ones automation genuinely cannot reach.

### The audio fixture is the point

The plan is specific: feed a real WAV, not the built-in tone, because "the
built-in tone is a clean periodic beep and will make any speaking detector look
perfect." That is exactly right — a continuous sine crosses any threshold
instantly and never stops, so a ring wired to nothing at all would light up and
stay lit.

`npm run fixtures:media` builds one. The speech is real speech: macOS ships a
synthesiser, so it has formants and prosody rather than a shaped tone. The
timeline is 4s speech · 3s silence · a 200ms cough · 2.8s silence · 4s speech,
looped by Chrome. Measured before being trusted — the cough peaks as loud as
the speech and is gone within 150ms, which is what makes it a hysteresis probe
rather than another syllable.

On a machine without `say` it falls back to a synthesised approximation **and
says so**, because a fixture that quietly degrades makes a test weaker without
anyone noticing.

The same reasoning put a hard stop in `playwright.config.ts`: Chrome does not
complain about a missing `--use-file-for-fake-audio-capture` path, it silently
substitutes its tone. The config now refuses to start without the fixture, and
that refusal was verified by deleting the file.

Result over 30 seconds, two full loops of the fixture: **117 samples lit, 30
dark, 12 transitions.** Both states occur, the border is only ever 1px
`--tile-border` or 2px `--foreground`, and the transition count is far below
what a detector chattering on every pause between words would produce.

### What the automation found

**Joining minted two tokens.** Pre-join minted one to check the meeting would
admit you, threw it away, and the room minted a second. Two signed six-hour
credentials per join, one never used — and two slots against §7's limit of ten
requests a minute per IP. Behind one office NAT that is **five people joining a
meeting, not ten**, and the sixth is told to wait a minute for no reason they
can see.

Found the way it would be found in production: the suite exhausted the limit
doing what a small team arriving at once would do, and a test failed with a
join that never navigated. Pre-join now mints once and hands the token to the
room through the handoff that already carried the name. A test asserts one join
costs exactly one token request, so it cannot drift back.

**Entering the room was gated on publishing.** `setStage("connected")` waited
for `setMicrophoneEnabled` and `setCameraEnabled` to settle, so a device that
stalled left someone on "Connecting you…" indefinitely with no explanation and
no way out — precisely what §3.11 forbids. Connecting and publishing are
different things: you are in the meeting once the connection is up, and you can
see and hear everyone else whether or not your own camera ever comes on.
Publishing now happens after the room is shown, and a failure surfaces through
`lastCameraError` on the control bar, next to the control that fixes it.

**A test that had to match the product, not the other way round.** Two tests
failed clicking controls that had auto-hidden after 4s — Playwright clicks
without moving the mouse, so the bar was correctly inert. The fix belonged in
the test: `wakeControls` does deliberately what a hand does incidentally on the
way to a button. Keeping controls inert while hidden is the right call, most of
all for Leave, where a stray click in dead space would drop someone out of a
meeting.

### Every breakpoint, with real people in the room

`e2e/grid.spec.ts` fills the room one participant at a time and reads the grid's
computed style at each of §3.4's boundaries — **1, 2, 3, 4, 5, 6, 7, 9, 10, 16,
17** — asserting columns, rows, rendered cells, the letterbox at one, and the
"+2" overflow cell at seventeen. Nothing is stubbed.

Two details worth keeping. The crowd joins with camera and microphone off:
sixteen tiles across seventeen tabs is 272 video decoders on one machine, and
this test is about layout. And joins are paced at 6.5s, because §7's rate limit
is real — pacing is what the product does to a room filling from one office,
which is worth seeing rather than working around.

### An open question for the next session

**§7's rate limit and §3.4's 17-person grid are in tension.** Ten token requests
a minute per IP means a seventeen-person meeting cannot be joined from one
office within a minute, even now that each join costs one request rather than
two. The limit is the specified value and the grid is the specified size, so
this is a design decision rather than a bug to quietly fix. Options: raise the
limit, key it on something narrower than IP, or accept that a full room fills
over two minutes.

### What automation still cannot reach

| Gap | Why |
|---|---|
| Cross-network media, TURN relay | Every context here shares one network path. The connections that need a relay are exactly the ones this never exercises. Two machines, one on a phone hotspot. |
| Audio being audible | A subscribed track is not a working speaker path |
| Speaking-ring *tuning* | Automation proves it fires and does not chatter; a real mic in a real room sets the threshold |
| Device switching mid-call | Real hardware, real enumeration changes |
| The four Phase 3 permission states | Unchanged |

### Checks

`check:env`, `check:contrast` 24, `check:codes` 6, `check:permissions` 39,
`check:room` 65, `check:rls` 18, `typecheck`, `lint`, `check:meetings` 37/37,
`check:bundle` 8/8, `check:media` **7/7** — all pass.

`@playwright/test` is a dev dependency and does not ship. `e2e/fixtures/*.wav`
is generated rather than committed, and `check:media` builds it first.

---

## §7 rate limiting — two tiers, and a 429 that isn't a dead end

The open question from the last session is answered in the PRD: the flat
10/min/IP was wrong, and it was wrong twice over.

It blocked the product's own spec — seventeen colleagues joining one meeting
share one office IP, and carrier-grade NAT puts thousands of Ghanaian mobile
subscribers behind a handful of addresses, so a limit that low blocked a full
room and could block unrelated strangers. And it was defending the wrong thing:
at 8×10¹⁴ codes, enumeration takes geological time whatever the limit is. The
real defences are the code space, server-side validation before minting, and
narrow grants.

**The signal that separates an attacker from an office is whether the code
resolves.** Seventeen colleagues produce seventeen hits; an enumerator produces
a stream of misses. So the tight limit moved onto misses.

| Tier | Limit | Counted |
|---|---|---|
| Overall | 60 / min | Every request |
| Unresolvable code | 5 / min | **After lookup** — unknown or expired codes only |

Signed-in callers get a bucket keyed on user id rather than address, so an
office of seventeen is seventeen buckets rather than one.

### Where the ordering does the work

The miss tier is consumed *after* `get_meeting_by_code` returns, and that
placement is the whole design. Counted before the lookup it would be a limit on
joining again, just with a different number — which is what §7 removed.

Past the miss allowance the response stops distinguishing "no such code" from
"expired", because that distinction is exactly what an enumerator is paying
for. A legitimate late arrival with one expired link never reaches it.

`consume_rate_limit` now returns `(allowed, retry_after)` — a return-type change
that needed a drop and recreate rather than a `create or replace`. `retry_after`
is floored at 1: a `Retry-After: 0` invites an immediate retry, which is the
stampede this exists to spread.

### A 429 on join is not a dead end

§7 asks for the client to hold the join screen with automatic backoff rather
than showing an error, and both entry paths now do.

Pre-join keeps its "joining" state, counts down, and retries by itself — the
button reads "Joining in 4s…" and the copy says there is nothing to do.
`/room/[code]` does the same, which matters more than it looks: that is the
path a link opened directly takes, and there is no pre-join screen behind it to
be sent back to.

No exponential backoff. The server knows exactly when the window resets and
says so, so doubling would keep waiting long after the allowance returned. The
one addition is a second or two of jitter, because everyone refused inside one
window is told the same reset second and retrying precisely on it recreates the
pile-up.

Five attempts — roughly five minutes — before it becomes an error. §7 says a
large meeting should fill slowly rather than fail, but an unbounded silent loop
is its own kind of failure.

### Verified

`check:meetings` is now **41 assertions**, and the four new ones are the ones
that matter:

```
✔ unresolvable codes are limited to 5 a minute, and the 6th is refused  — 5 allowed, then HTTP 429
✔ a real code still joins after the miss allowance is spent             — HTTP 200
✔ a 429 carries a usable Retry-After                                    — Retry-After: 58
✔ seventeen people can join one meeting from one address                — statuses: 200
✔ the overall limit allows 60 a minute and refuses the 61st             — 60 allowed, then HTTP 429
```

Proved able to fail by moving the miss tier back before the lookup — the old
shape. Four assertions go red, and the two in the middle are the real-world
symptom stated plainly: *"a real code still joins after the miss allowance is
spent — HTTP 429"* and *"seventeen people can join one meeting from one address
— 200, 429."*

**The e2e grid test stopped needing its pacing.** It had a 6.5s gap between
joins because seventeen people could not join from one address inside a minute
under the old limit — and that gap was the product's behaviour, not a test
artifact. It is now zero, and the seventeen-participant sweep went from **2.9
minutes to 41 seconds**. Its absence is the assertion: if a full room could not
fill at speed, that test would stop passing.

A ninth e2e test covers the client half — a 429 is intercepted on the first
attempt, and pre-join is asserted to hold, count down, show no error copy, and
go through on its own with nothing more from the person.

### Two things worth writing down

**A test fixture that quietly tested nothing.** The miss-tier assertion first
used codes `zz0-zzzz-zzz` through `zz5-zzzz-zzz`. `0` and `1` are not in the
code alphabet, so those two were rejected as malformed before any lookup and
never reached the miss tier — four misses instead of six, and no 429 to read a
`Retry-After` from. The failure looked like a bug in the limiter. Fixture codes
now use letters that are actually in the alphabet.

**Next's route announcer is a `role="alert"` live region.** An assertion that no
`role=alert` existed matched the framework's own page-title announcer rather
than our copy. Scoped to our text instead. Worth remembering for Phase 9: a
`role="alert"` is assertive and interrupts, and that one is Next's, not ours.

### Checks

`check:env`, `check:contrast` 24, `check:codes` 6, `check:permissions` 39,
`check:room` 65, `check:rls` 18, `typecheck`, `lint`, `check:meetings`
**41/41**, `check:bundle` 8/8, `check:media` **8/8** — all pass.

---

## Applying the three document updates

All three answered something flagged in the last two sessions.

### Fixture codes now come from the generator, never the keyboard

CLAUDE.md's conventions gained a rule, and this repository is why it exists:

> **Test fixtures derive from the same constants as the code under test.**
> Hand-written codes containing `0` or `1` are rejected as malformed before any
> lookup, so a miss-tier test using them silently exercises the wrong layer and
> passes for the wrong reason. Generate them from the exported alphabet; never
> type them.

`check-meetings.mjs` now compiles `lib/meetings/code.ts` and calls
`generateMeetingCode()` for every unknown-code fixture. A generated code is
well-formed by construction, and at 8×10¹⁴ combinations it will not collide
with a real meeting. Four typed `zzz-zzzz-zzz` literals are gone with it — they
happened to be valid, but "happened to be" is the failure mode the rule names.

Worth noting the first fix was only half a fix: after the `zz0-` mistake I
replaced the digits with hand-picked letters, which was still typed. The rule
in CLAUDE.md is the stricter and correct version.

### Malformed codes bypassing the miss tier is now documented, and asserted

§7 settled it as deliberate rather than an oversight: a code containing a
character outside the alphabet costs nothing to reject — no database round trip
— so the overall limit is sufficient cover, and only requests that reach a
lookup and fail it are worth counting.

Two assertions pin it. Ten malformed codes on a fresh bucket all return 400,
and a genuine miss immediately afterwards still gets its 404 — proving the miss
allowance was untouched. Proved able to fail by counting malformed codes as
misses: both go red, the second with `HTTP 429`.

`check:meetings` is now **43**.

### The room has no assertive live region

BUILD-PLAN's Phase 9 section gained the audit note about what the framework
injects. It is Phase 9's work, but two parts were actionable now and cheap.

`RoomControls` carried `role="alert"` on the "your microphone didn't turn on"
message. `role="alert"` is assertive: it interrupts whatever a screen reader is
mid-sentence on. Next already mounts its route announcer as one, and a second
inside the room stacks on top of it — the room being exactly where announcements
arrive in volume. It is now `role="status"`, and nothing is lost: the message
stays on screen next to the control that fixes it.

Three checks in `check:room` pin this, and the third exists because of how the
second could lie:

```
✔ the room has components to scan  (5 files)
✔ no assertive live region in the room — the framework already owns one
✔ the room does announce, politely  (RoomControls, RoomEntry, RoomGrid, RoomStage)
```

A source scan rather than a rendered assertion, deliberately — it catches the
next `role="alert"` as it is typed, in the file where someone would reach for
it, rather than after a room is full enough to notice.

Both were proved able to fail: putting `role="alert"` back names the file;
stripping every polite region trips the vacuity guard.

**The form errors were left alone**, and that is a judgment worth stating rather
than burying. `role="alert"` remains on the dashboard, pre-join, sign-in and
join-code validation messages. §9's list of "announcements" is join and leave
events, chat, reactions, and connection state — the high-frequency room traffic
the flooding argument is about. A validation error that appears in response to
someone's own submit is a different case, and converting it to polite is a real
accessibility trade-off rather than an obvious win. Phase 9 is where that gets
decided; flagging it rather than deciding it quietly.

### Two process notes

**A `python` replacement silently did nothing.** The anchor for the new
live-region section was stale — an earlier edit had changed `+ 5 + 3` to
`+ 6 + 3` — so the section was never inserted while the import line was. The
suite still said `65/65 passed`. What caught it was the count not moving, which
is the argument for printing totals rather than only failures. Subsequent
replacements assert the anchor exists before writing.

**A check matched its own documentation.** The live-region scan first reported
`RoomControls.tsx` as assertive immediately after it had been fixed — it was
matching the comment *explaining* why `role="alert"` is wrong. Comments are
stripped before scanning now. A check that reads prose as code will keep finding
the documentation of its own rule.

### Checks

`check:env`, `check:contrast` 24, `check:codes` 6, `check:permissions` 39,
`check:room` **68**, `check:rls` 18, `typecheck`, `lint`, `check:meetings`
**43/43**, `check:bundle` 8/8, `check:media` 8/8 — all pass.

---

## Phase 5 — Chat and reactions

Both data-channel features, and the wire format they share.

### One envelope, and nothing in it that could lie

§3.5 and §3.6 are separate features on one transport, so there is one decoder
to get right rather than two. What is *not* in the envelope is the design:

- **No sender.** LiveKit hands the receiver the `Participant` a packet came
  from, and that is the only sender there is. A name in the body would let
  anyone in the room type as anyone else, and no validation downstream undoes
  that. Same rule the token endpoint follows for identity.
- **No timestamp.** A sender's clock can be wrong or hostile, and the time is
  one of the two things §3.5 renders. The receiver stamps arrival.
- **No id.** `publishData` does not echo to the sender, so the sender adds its
  own copy and mints its own key. An id on the wire would be an
  attacker-chosen React key for no benefit.

There is **no server on this path at all** — packets go participant to
participant through the SFU — so `decode` is the only thing between a crafted
packet and the render tree. It is tested the way an endpoint would be: fourteen
malformed payloads, a byte cap checked before `JSON.parse` is asked to chew
through anything, and reactions validated by membership in the fixed six rather
than by looking like an emoji.

### Where the security actually is

Rule 6 settles how a message is drawn: as text, never through
`dangerouslySetInnerHTML`. `autolink` is the one place a substring of someone
else's message becomes an element, and it returns **segments** rather than
markup so there is no string anywhere on the path that could be mistaken for
HTML.

Chasing that properly turned up something worth recording. There are three
gates — the candidate pattern, `URL` parsing, and a scheme allow-list plus a
required hostname — and **only the first is load-bearing today**. Deleting the
allow-list broke no test, because every dangerous scheme parses to an empty
hostname and the hostname check rejects it first; and `ftp://example.com`, which
*does* have a hostname, is never offered as a candidate at all.

So the checks were relabelled to say which gate they exercise, cases were added
that pin the pattern directly (`ftp://`, `ws://`, `chrome://` — all with real
hostnames), and the redundant gates are documented as backstops for the day
someone widens the pattern for a good reason. A check that credits the wrong
guard gives false comfort, which is worse than no check.

One real defect found the same way: `\b` matches between `:` and `h`, so
`blob:https://example.com/abc` offered the inner `https://…` as a candidate —
linking a substring nobody shared. Candidates now have to start a token,
checked by looking at the preceding character rather than with a lookbehind,
because Safari only gained those in 16.4 and §1 lists Safari as a target.

### The rate limit, on both sides

§3.6's "enforced client-side on send and server-agnostic on receive" is the
whole design: the sender declines to send and the receiver declines to render,
and neither depends on the other. A patched client is exactly what the
receiving half is for.

Keyed per participant, which the checks pin explicitly — a single global gate
would let one person flooding silence everyone else's reactions, and that would
look exactly like the product being broken.

### Two bugs the browser found that the tests did not

**The letterbox overflowed.** One participant with the chat open rendered a
grid **1956px wide inside a 1337px area**, running underneath the panel. The
declared `aspect-ratio: 16/9` was correct and the computed style said so — which
is why the existing assertion passed. Fitting a ratio inside a box needs
*whichever* dimension is tighter to win, and no single `max-` can do that:
`aspect-ratio` with `max-height` overflows a narrow container horizontally, and
with `max-width` it overflows a wide one vertically. Now
`min(100cqw, calc(100cqh * 16 / 9))` against a size container, and the new
assertion measures the rendered box rather than the declared property.

**The panel's `hidden` attribute was outranked.** `hidden` sets `display: none`
from a UA rule that any author `display` declaration beats, and the panel's
class list had a constant `flex`. It worked only because Tailwind's preflight
marks its `[hidden]` rule important. `flex` is now conditional — a correctness
property should not rest on a detail of someone else's reset.

### And one in the tooling

`reuseExistingServer` was skipping the rebuild, so a run could test whatever was
on disk from last time. It produced a failure for a bug I had already fixed, and
would just as easily have let a broken one pass. Now `false`: a rebuild costs
about forty seconds, and a result that describes code you did not write costs
more.

Two tests also assumed room composition rather than asserting it — they passed
alone and failed in a full run, which is the worst way for a test to be wrong.
`expectParticipants` waits for the count that is the premise of the measurement.

A third was a Phase 4 test that Phase 5 made ambiguous: `getByText("Ama
Serwaa")` began matching join and leave messages as well as the tile label. The
product grew and a precise test became imprecise; scoped to the tile.

### Verified between two real browsers

`check:media` is now **17 tests**. The new nine:

```
chat end to end: 198ms  (§3.5 target < 500ms, harness overhead included)
```

- a message crosses, and the sender sees their own copy as "You"
- a message containing `<img src=x onerror=…>` arrives as visible text; no
  element is created and no handler runs
- `https://` is linked with `rel="noopener noreferrer nofollow"` and
  `target="_blank"`; `javascript:alert(1)` in the same message stays text
- the unread dot appears only while the panel is shut, and the announcement
  names the sender without the body — §9
- three messages from one sender group under one header; a new sender breaks it
- opening the panel reflows the grid rather than covering it, at 360px
- Escape closes and returns focus to the control
- a reaction crosses and is announced as "reacted with applause", and twelve
  presses inside a second produce at most two — with nothing released afterwards
- reactions do not intersect the name label, measured, and clear themselves

### Checks

`check:env`, `check:contrast` 24, `check:codes` 6, `check:permissions` 39,
`check:room` 68, `check:chat` **57** (new), `check:rls` 18, `typecheck`, `lint`,
`check:meetings` 43/43, `check:bundle` 8/8, `check:media` **17/17** — all pass.
`/room/[code]` is unchanged at 153 kB against 250.

### Deferred, deliberately

- **Focus trapping and the full tab order** are Phase 9's. Escape-to-close with
  focus restoration is here, because a panel you cannot close from the keyboard
  is a trap rather than a partial implementation.
- **Batched join/leave announcements** (§9: 3+ in 5s collapse, suppressed above
  eight participants) are Phase 9's. The system messages themselves are here,
  since §3.5 asks for them in the panel.
- **Screen share and participants** remain the two controls §3.4 lists that are
  not in the bar. Phase 7.

---

## Applying the chat rate limit, and the testing rules

### §3.5's rate limit, in the shape the spec argues for

Five messages per ten seconds per sender. The spec is explicit about where the
enforcement actually is:

> the receive side drops the excess without rendering it, and **that is the only
> real enforcement** — there is no server on this path, so a modified client
> ignores anything the send side does.

`lib/room/reaction-limit.ts` became `lib/room/limits.ts`, since it now holds two
shapes for two features. Reactions get a **minimum gap** — the press is
reflexive, so one a second. Chat gets a **burst allowance** — typing three quick
lines is normal, and a minimum gap between them would be an odd thing to enforce
on a conversation.

Rolling rather than fixed, and the reason is concrete: a fixed window resets on
a boundary, so a sender who used one slot early and four just before the
boundary gets all five back the instant it passes — ten messages inside half a
second, which is the burst the limit exists to stop.

The send half is not decoration. It disables the composer with a countdown, so a
flooder sees why nothing is happening rather than typing into a void. Nothing is
sent *and* nothing is added locally: a message that appears on the sender's
screen and nowhere else is a lie about what happened.

`check:chat` is now **67**.

### The first testing rule, applied to the new guards

CLAUDE.md gained six testing rules, all from things that went wrong here. The
first one — *"Delete the guard. If no test fails, the guard is untested"* —
caught two of my own in the space of an hour.

**A test that could not tell rolling from fixed.** The mutation was supposed to
break it and did not. Neither the test nor my mutation modelled a real fixed
window: the difference only shows in one arrangement, where a slot is used early
and the rest just before the boundary. Rewritten so it distinguishes them, and
re-run against a genuine fixed-window mutation, which now fails it.

**An e2e test that overclaimed in its own name.** It was called *"a flood is
dropped at the receiving end, not just at the sender's"* — and it passed with
the receive-side gate deleted.

The reason is worth keeping, because it is not fixable by writing a better test:
**no test driven through this UI can reach the receive half.** A well-behaved
client never sends the sixth message, so the receiver never gets one to drop.
Exercising it needs a client that ignores its own limit, which is precisely the
threat it exists for and not something the product's own controls can do.

So the test was renamed to what it proves — the sender's cooldown, and that a
burst reaches nobody as a burst — with the gap named in the test and the pure
check pointed at as where the receive half is actually covered. An honest
smaller claim beats a bigger one that is not true.

### Owning `[hidden]`

*"A correctness property may not rest on a third-party reset."* `app/globals.css`
now declares `[hidden] { display: none !important }` in our own base layer,
excluding `until-found` so find-in-page can still reveal collapsed content.
`check:room` asserts both, and fails if the declaration is removed — which is
what makes it ours rather than Tailwind's to keep.

### One more flake, one more sample-versus-poll

The video liveness assertion sampled two frames 250ms apart and failed once with
motion of exactly zero, then passed alone. LiveKit's `adaptiveStream` pauses
video it believes is off-screen, and every browser context after the first is a
background tab — so identical frames are not necessarily a bug. Polled now: a
genuinely frozen track stays frozen, so this separates "paused for a moment"
from "never moving" without weakening anything.

That is the same lesson as the reaction counter earlier in this phase. A
snapshot of a thing that changes on its own is a race; observe over an interval
instead.

### Checks

`check:env`, `check:contrast` 24, `check:codes` 6, `check:permissions` 39,
`check:room` **70**, `check:chat` **67**, `check:rls` 18, `typecheck`, `lint`,
`check:meetings` 43/43, `check:bundle` 8/8, `check:media` **18/18** — all pass.

---

## Phase 6 — Scheduling and calendar

A meeting created in one timezone lands correctly in another, and can be put
into any calendar without an OAuth consent screen.

### The DST gap, which was a silent hour

§3.9 calls timezones "the one place where a quiet bug produces a missed
meeting". Measuring rather than assuming found one, in the platform itself:

```
02:30 Europe/Berlin, 29 March 2026  →  00:30Z  →  01:30 local
```

That morning the clocks go forward at 02:00, so 02:30 never happens.
`fromZonedTime` resolves it **backward** — the meeting lands an hour *earlier*
than typed, not later, and nothing throws or marks it. An hour early is the
direction nobody checks.

`resolveWallClock` round-trips the instant back through the same zone; if it
does not come back as what was typed, the time does not exist. The form then
says so and says what it will schedule instead, rather than being quietly
wrong. Verified in a browser:

> 02:30 doesn't exist on 2026-03-29 in Europe/Berlin — the clocks change that
> day. This will be scheduled for **01:30** instead.
> Starts Sun 29 Mar, 01:30 GMT+1 · 00:30 GMT where you are

It is not blocked. An hour that does not exist is a fact about the calendar,
not a mistake to be scolded for. The autumn case needs no warning at all: when
the clocks go back, 02:30 happens twice, both are real, and the round trip is
exact.

### §3.9's own acceptance case, demonstrated

A meeting scheduled at 14:30 Europe/Berlin, viewed from Africa/Accra, renders:

```
Tue 15 Sep, 12:30 GMT
Tue 15 Sep, 14:30 GMT+2 where it was scheduled
```

Both numbers carry their zone, which is what makes either of them checkable.
The `.ics` for the same meeting writes `DTSTART:20260915T123000Z` — the instant,
not the wall clock, so it is the same moment for everyone who imports it.

### The calendar file, written by hand

No dependency: rule 9 would need asking, and the format is a hundred lines of
string handling whose every rule is checkable. What makes it worth writing
carefully is that the failure mode is silent — a client that dislikes a file
imports nothing and says nothing.

Three rules do most of the work and all three are easy to get almost right:
CRLF everywhere; folding at **75 octets, not characters**; and escaping TEXT
values. A title with a comma silently truncates the property otherwise, because
the comma starts a second value. Verified on a real file:

```
SUMMARY:Quarterly planning\, with numbers
DESCRIPTION:Bring the Q3 figures.\n\nJoin: http://localhost:3000/j/3ku-zn4a
 -2u3
```

Every line within 75 octets, the fold continuing with a single space. Multi-byte
titles fold by byte and never split a code point — a Greek title and a string of
emoji are both checked, because a character-counting fold produces a file that
is no longer valid UTF-8 and only for people whose names are not ASCII.

`SEQUENCE` increments on edit *and* on cancellation. Without the second, a
calendar already holding the event ignores the cancellation.

### Decisions worth naming

- **Cancelling ends the meeting rather than deleting the row.** §3.9 keeps past
  meetings, and a link already sent has to keep resolving to §3.2's designed
  "This meeting has ended" rather than to a 404 that tells someone holding a
  real invite it was never real. `ended` rather than a new `cancelled` status:
  a fourth enum value means a migration, a change to `get_meeting_by_code`, and
  a new join-page state. **Flagged rather than decided** — worth doing if
  cancelled should read differently from ended.
- **No `METHOD` in the file.** `METHOD:REQUEST` makes it an iTIP message needing
  an ORGANIZER and ATTENDEEs; without them some clients import it as a
  scheduling request from nobody. This is a file someone adds to their own
  calendar.
- **Editing cannot change a meeting's kind.** An instant meeting becoming a
  scheduled one is a different meeting, and should have a different link rather
  than changing under people who already hold this one.
- **Ownership is RLS, in both new routes.** Someone else's meeting is not found
  — true, and it declines to confirm the code exists. Same authority the token
  endpoint uses.

### Two new routes, and a budget question for §10

`/schedule` at **273 kB** and `/schedule/[code]** at **263 kB**. §10's table
does not list them; `check:bundle` now carries 290 kB for both, measured plus
headroom, on the reasoning §10 gives the dashboard. **Proposed, not settled —
§10 should carry the rows.**

`/schedule/[code]` was 282 kB until the edit form was moved behind
`next/dynamic`. Most visits to that page copy a link or add a calendar entry
and never open the form, and weight only some visits need should only be
fetched by those visits — the same argument rule 8 makes for `livekit-client`.

### A dev tool that was overdue

Every screen behind auth was unreachable in a browser, because magic links
arrive by email. `npm run dev:signin -- you@example.com` mints one directly.
It **refuses unless `NEXT_PUBLIC_APP_URL` is localhost** — the same guard
`seed-dev.mjs` carries, for a stronger reason: the output is a working
credential for whatever account is named.

### Checks

`check:ics` is new at **64**, covering the format's own rules, both prefill
conventions, and the timezone arithmetic. Every RFC rule was mutation-tested
per CLAUDE.md's first testing rule — removing CRLF, comma escaping, octet
folding, `DTSTAMP` or the `SEQUENCE` increment each turns the suite red.

`check:meetings` went 43 → **63**, against a running server: content type,
disposition, `no-store`, the join link, an instant meeting having no calendar
file and saying so, edit incrementing `SEQUENCE`, cancellation writing
`STATUS:CANCELLED` with a further increment, and the cancelled link still
resolving to the ended state.

`check:bundle` 8 → **10**. All pass, with `check:room` 70, `check:chat` 67,
`check:permissions` 39, `check:rls` 18, `check:media` 18/18.

**Two of my own tests were wrong before the code was**, both from reusing
fixtures other sections deliberately mutate: the instant meeting is aged past
the 30-day window by an earlier check, and my edit renamed the scheduled one an
existing assertion depends on. The scheduling section now creates its own.

### Still needs a human

- **Importing the `.ics` into Google, Apple and Outlook.** BUILD-PLAN asks for
  all three. The file is correct against the spec and checked line by line, but
  "valid" and "imports cleanly" are different claims and only one of them can
  be made from here.
- **The prefill links opening a real composer.** Both are undocumented
  query-string conventions; the parameters are pinned, but whether Google and
  Outlook still honour them needs clicking.
- **A real timezone change**, which BUILD-PLAN asks for by name. The
  arithmetic is checked across Accra, Berlin, Kolkata and two DST transitions;
  changing the machine's own zone is a different test.

---

## `cancelled` as a fourth status, and the timezone tests automated

### The flag was overruled, correctly

Phase 6 folded cancellation into `ended` and flagged it. §3.2 now settles it the
other way, and the argument is better than the one I made:

> Someone holding a link for Thursday at 3, cancelled on Wednesday, arrives on
> time and reads that they missed it. They didn't; it never happened. That is a
> factual error in user-facing copy, which is a worse cost than the migration.

I had weighed the migration against a wording difference. It is not a wording
difference — it is the product being wrong about whether someone was late.

Two migrations, because Postgres will not let a new enum value be *used* in the
transaction that adds it. The 30-day resolution window now covers cancelled as
well as ended, so a link already in an inbox keeps reaching a designed state
rather than falling through to the unknown-code page.

Through the read paths:

- **Join page**: "This meeting was cancelled — was called off. Whoever sent the
  link will know more." Never "you missed it".
- **Token endpoint**: unjoinable, by the same 410 an ended meeting uses. The
  contract has one answer for "resolved but not joinable"; the join page draws
  the distinction, because that is where it changes what someone reads.
- **Dashboard**: leaves upcoming, appears under past with a "Cancelled" badge,
  and the participant count is suppressed — there were none.
- **The calendar file**: `STATUS:CANCELLED` only for a cancellation. A meeting
  that ran to its end happened, and telling a calendar otherwise would remove
  it from the record of a day that did take place.

`check:meetings` 63 → **68**, including that the cancelled page never contains
"has ended", that a cancelled meeting cannot be joined or edited back into
existence, and that cancelling twice is a no-op.

### The timezone half no longer needs a human

BUILD-PLAN is right that Playwright's `timezoneId` sets the *real* browser
timezone, and that this exercises the whole rendering path because the code
never sees the OS. `check:ics` proves the arithmetic; these prove the arithmetic
is what reaches the screen, which is a different claim — a formatter called with
the wrong zone produces a number that is internally consistent and wrong.

Three tests, in real browsers set to real zones:

```
made in Accra at 14:30  →  Accra   Tue 15 Sep, 14:30 GMT
                        →  Berlin  Tue 15 Sep, 16:30 GMT+2   (+ "14:30 GMT where it was scheduled")
                        →  LA      Tue 15 Sep, 07:30 PDT
```

…the same wall clock in December reading 15:30 GMT+1 in Berlin rather than
16:30, which a fixed offset would get wrong for half the year; and the `.ics`
being byte-identical from both browsers, because it describes the instant.

Proved able to fail: rendering in a fixed zone rather than the viewer's breaks
two of the three, and dropping the zone label breaks all three.

**My expected label was wrong, not the code.** Los Angeles renders `PDT`, not
`GMT-7` — `zzz` prefers a named abbreviation wherever a zone has one. The
dashboard assertion had the same bug and passed only because the browser was
Berlin. §3.9 requires *a* label, not a spelling, so both now accept any of the
forms zones actually use, and `check:ics` pins the four shapes directly.

### One correction to the documents

§10 explains the two scheduling budgets as carrying `react-day-picker`. They do
not — neither route imports it, and shadcn's `Calendar` is not used anywhere.
The form is native `<input type="date">` and `<input type="time">`, which was a
§10 instruction in the first place. The numbers are right; the reason given for
them is not, and the weight is `date-fns-tz` plus Radix `Select` plus `sonner`.

### Checks

`check:ics` 64 → **69**, `check:meetings` 63 → **68**, `check:media` 18 → **21**.
All pass, with `check:room` 70, `check:chat` 67, `check:permissions` 39,
`check:contrast` 24, `check:codes` 6, `check:rls` 18, `check:bundle` 10/10.

Importing the `.ics` into Google, Apple and Outlook remains the one manual item
from Phase 6 — and stays manual by BUILD-PLAN's own reasoning.

---

## Phase 7 — Screen share and participants

The control bar is now §3.4's full table: mic, camera, screen share, reactions,
chat, participants, leave.

### Screen share turned out to be automatable

`getDisplayMedia` normally opens a picker no automation can answer, but Chrome
takes `--auto-select-desktop-capture-source` and hands back a genuine display
track — real capture, real `ended` event, real publish through the SFU. Probed
before building anything, because it decided how much of §3.7 could be verified
rather than asserted.

So all of it is: the share reaching the other participant as moving video, the
filmstrip, the persistent bar, the browser's own stop, and surviving a panel
toggle.

### A guard I wrote that did nothing

The hook listened for `ended` on the display track and unpublished, with a
comment calling it "the acceptance criterion for the phase". Deleting it failed
no test.

That sent me to the SDK rather than to the test.
`LocalParticipant.handleTrackEnded` already unpublishes any ended track whose
source is `ScreenShare` — its own log line reads *"unpublishing local track due
to TrackEnded"*. Our listener sat downstream of that and never fired.

Removed rather than kept as a backstop, which is the opposite call from the
`autolink` allow-list and for a reason worth stating: that one guards against a
change *we* might make to a pattern we own, and is reachable by widening it.
This one guarded against a library changing its own documented behaviour, could
not be reached at all, and carried a comment claiming it was the mechanism. A
guard that cannot fire cannot be tested; one that misdescribes itself is worse
than none.

The end-to-end test stays and matters more for it — it pins the *behaviour*
whoever provides it, so if LiveKit ever stops doing this the test goes red and
the listener comes back with evidence behind it.

### §3.8's asymmetry, built as an absence

> A host cannot unmute someone else. Muting is a request the participant must
> accept — the host can silence, never activate.

There is no unmute action because **there is no unmute message**. The envelope
has `mute-request` and no counterpart, so a modified client has nothing to send
— which is a stronger guarantee than a receiver that declines to honour one. A
test asserts the word "unmute" appears nowhere in the room at all.

The mute request is a prompt, not an effect: the host has asked, the microphone
is still on, and ignoring it is a valid answer that costs nothing. That is what
"a request the participant must accept" means, and it is the reading that
survives our narrow token grants — force-muting would need `roomAdmin` or a
server endpoint, and §7 withholds the first deliberately.

**Remove** does need server authority, so it is a route: the host is verified
by RLS the same way everywhere else, and the `roomAdmin` power is spent once per
request rather than living in a token for six hours. Removing is not muting —
it is visible to the person, and it is the power a host actually needs when
something has gone wrong.

### Decisions worth naming

- **`object-fit: contain` on shared content**, against the room's `cover`
  everywhere else. A cropped face is still a face; a cropped screen cuts off
  the thing being pointed at. The one surface where letterboxing is right.
- **The sharing bar does not auto-hide** with the control bar. What it says is
  that other people can see your screen, which is exactly the fact that must
  not quietly disappear while you work in another window.
- **Screen share is hidden, not disabled, off desktop.** §3.7 is desktop only;
  a control that can never work on this device is not a control. Gated on the
  API existing *and* a hover-capable pointer, because iPad Safari exposes
  `getDisplayMedia` and then refuses.
- **Filmstrip capacity: 5 on desktop, 3 on mobile.** The three is §3.4's; the
  five is a choice — what a right rail holds at a legible size — and the only
  number in `layout.ts` that is not a transcription.

### One thing for Phase 9

Two controls share the accessible name "Close participants": the panel's own X
and the control-bar toggle. The same duplication exists for chat. Both members
of each pair do close the panel, so it is a naming smell rather than a defect —
but a screen reader user hears the same name twice in one tab cycle. The
conventional fix is naming a disclosure for its target and letting
`aria-expanded` carry the state, which conflicts with the accessibility floor's
"name the action" rule as currently written. Phase 9 owns tab order and
naming; flagged rather than churned mid-phase.

### Checks

`check:room` 70 → **87** (filmstrip geometry, the cut at five places rather than
sixteen), `check:chat` 67 → **73** (the new envelope kind, and that an unmute
message does not decode), `check:media` 21 → **27**.

All pass, with `check:meetings` 68, `check:ics` 69, `check:permissions` 39,
`check:contrast` 24, `check:rls` 18, `check:bundle` 10/10. `/room/[code]` is
unchanged at 154 kB against 250.

### Still needs a human

- **Picking a specific window or tab.** Automation selects "Entire screen"
  through a flag; the picker's own behaviour, and what Chrome's bar looks like
  over a real page, is a real machine's job.
- **Audio share.** §3.7 asks for it "where supported" and the request is made;
  Chrome only offers tab audio, and whether it is audible at the other end is
  the same speaker-path question Phase 4 left open.
- **A second sharer replacing the first**, with the confirm dialog for the
  person being replaced. Not built: §3.7 specifies it, and it needs a design
  decision about what the replaced person sees and how long they have to
  object. Flagged rather than guessed.

---

## Share replacement, the roomAdmin constraint, and the toggle/disclosure split

### The direction I declined to guess

§3.7 settles it, and the reasoning is the part worth keeping:

> Confirming with the replaced person blocks the second sharer on someone
> else's dialog — if the current presenter has stepped away, the share simply
> hangs with no way forward. It also interrupts an active presenter with a
> modal mid-sentence to ask permission for something they cannot meaningfully
> evaluate in the moment.

So the dialog goes to the person acting: *"Ama Serwaa is presenting. Sharing
will replace theirs."* — Continue or Cancel. The replaced person gets a
non-modal notice that dismisses itself, because their share has already stopped
and there is nothing left to decide. A notice that must be cleared is a dialog
wearing a different shape.

No message crosses the wire for this. The replacement *is* the new track
appearing — whoever was already sharing sees a second share and stops.

### The rare race was the normal path

I wrote that rule with a comment calling the simultaneous case "rare,
recoverable" — and shipped a bug. "I am sharing and someone else's share
exists, so I stop" is true for the *incoming* presenter too, during the moment
both tracks are live. Both sides yielded and the room had nobody presenting.

The test found it on the first run, which is the argument for having written it.
The fix is a flag the confirming side sets: the person who just took over does
not yield to the person they took over from, and it clears when the other share
goes — which is the acknowledgement that the handover finished. Nothing depends
on clocks agreeing.

Worth recording as a pattern, not just a bug: **a comment describing a race as
unlikely is a claim, and claims in comments are the ones nothing checks.**

### `roomAdmin` is now constrained by something other than good intentions

§3.8 makes the point sharply — the client-side guarantee (no unmute message
exists, so no client can send one) is worthless if a server route quietly
widens it, because `roomAdmin` carries mute *and* unmute on LiveKit's server
API.

`check:room` now reads every file that constructs a `RoomServiceClient` and
asserts it calls only an allow-listed method — currently `removeParticipant`
alone — and separately that it never names `mutePublishedTrack`,
`updateParticipant`, `updateSubscriptions` or `sendData`. A guard against
vacuity comes first: if no file spends `roomAdmin` at all, that is reported
rather than silently passing.

Adding a method is now a deliberate act with a failing check in front of it.
Proved by adding `mutePublishedTrack` to the remove route: two assertions go
red and name it.

### The naming flag, resolved into two patterns

The duplication I raised is settled by splitting the rule rather than bending
one to fit:

- **State toggles** (mic, camera, screen share) name the action and change with
  it. `aria-pressed` is **gone** — an action name plus a pressed state
  announces the same fact twice, in an order that reads as a contradiction.
- **Disclosures** (chat, participants) take a noun name plus `aria-expanded`
  and `aria-controls`. The bar button is "Participants"; the panel's close
  button is "Close participants". Different controls, different names.

That is a better resolution than the one I was heading towards. I had assumed
the floor's "name the action" rule applied to both and that the collision was
the price; the rule was written for device toggles and over-generalised.

**One document conflict to flag.** PRD §9 still reads *"Mic and camera buttons
use `aria-pressed`, and the accessible name states the action"*, which CLAUDE.md
now contradicts with its reasoning stated. I followed CLAUDE.md — it is the
rules file and the newer, argued position — but §9 should be updated to match
or the next session will find them disagreeing.

### Checks

`check:room` 87 → **90**, `check:media` 27 → **29**. All pass, with
`check:chat` 73, `check:ics` 69, `check:meetings` 68, `check:permissions` 39,
`check:contrast` 24, `check:rls` 18, `check:bundle` 10/10.

Two new e2e tests cover the replacement in both directions: that Cancel leaves
everything as it was, that Continue hands over and tells the replaced person,
that the notice is not a dialog, and that sharing when nobody else is presenting
asks nothing at all.

---

## The accessibility conflict, resolved by ownership rather than by picking

The flagged contradiction is settled the better way: not by deciding which
document was right, but by giving each one a domain and saying so in both.

- **CLAUDE.md's floor** is now marked the authoritative copy of the per-control
  mechanics. "Where the two ever appear to disagree, this file wins and §9 is
  stale."
- **PRD §9** was rewritten to own what it is actually good at — the announcement
  policy and the reasoning behind its thresholds. It defers the mechanics
  explicitly and says who owns them.

The reasoning is the same one that took the contrast table out of the PRD
several phases ago: two copies of a fact drift, and the second copy is a
liability rather than a convenience. This is the second time that lesson has
been applied to the same pair of documents, which is what makes it a pattern
rather than a fix.

No code changed. I had already followed CLAUDE.md and said so; the resolution
confirms that reading.

### But a stated invariant is not an enforced one

Both files now claim the two "cannot now" drift. Nothing made that true, so
three checks do — this project's habit of turning a rule into something that
fails:

```
✔ no aria-pressed anywhere — state toggles carry the action in the name
✔ RoomControls.tsx pairs every aria-controls with aria-expanded
✔ CLAUDE.md's floor declares itself authoritative
✔ PRD §9 defers the mechanics and says who owns them
```

The first two are the floor's two patterns, read out of the source with comments
stripped — a scan that reads its own documentation finds the rule wherever the
rule is written down, which is a mistake this suite has made before.

The last two check the *markers*, not the prose. Policing wording would be
fragile and would false-positive on the very sentence that names what is being
deferred; checking that the split is still declared is cheap, and if someone
deletes the marker the check fails and they have to think about why it was
there. Both were proved by removing them.

`aria-expanded` is asserted as a pair with `aria-controls` rather than alone:
either half by itself leaves a screen reader knowing something opened and not
what.

### Still outstanding, twice now

§10 still explains the two scheduling budgets as carrying `react-day-picker`.
Neither route imports it and shadcn's `Calendar` is unused anywhere — the form
is native `<input type="date">`, which §10 itself asked for. The numbers are
right; the reason attached to them is not. Reported after Phase 6 and unchanged,
so flagging once more rather than letting it settle into the record as true.

### Checks

`check:room` 90 → **96**. All pass, with `check:chat` 73, `check:ics` 69,
`check:meetings` 68, `check:permissions` 39, `check:contrast` 24, `check:rls`
18, `check:bundle` 10/10, `check:media` 29/29.

---

## Rule 9 becomes a check, and §10 gets its itemisation

Three documents were updated together. Rule 9 grew a second clause — "and remove
it when it stops being used" — and made `check:deps` fail rather than warn, with
no exception list. §10 replaced its blank with the attribution. BUILD-PLAN
dropped the form libraries from the scaffold.

### The decision I had been holding

I had found `react-hook-form` and `@hookform/resolvers` unreachable and *not*
removed them, on the grounds that two documents still specified them. Rule 9 is
the answer, and it is also a verdict on how I held the question open: the check
printed them loudly on every run, and rule 9 says a warning printed on every run
becomes furniture within a week.

Removed: both packages, and `components/ui/form.tsx`, which existed solely to
keep `react-hook-form` in the graph. With `react-day-picker` and
`components/ui/calendar.tsx` from the previous round, that is all three
dependencies rule 9 names.

No route total moved. That is not luck and did not need measuring to predict —
`form.tsx` was unreachable from `app/`, so it was never in a bundle. What these
cost was audit surface and supply-chain surface, which is exactly how rule 9
describes them. A dependency can be free in the bundle and still worth deleting.

### Rewriting the check, and two things that fell out

The exception list is gone. Two findings came out of removing it:

**Three of four exemptions were exempting nothing.** `IMPLICIT` held `react`,
`react-dom`, `next`, and `shadcn`. The walk finds three of them on its own —
`react` via the JSX runtime, `next` directly, and `shadcn` via
`@import "shadcn/tailwind.css"` in `globals.css`. Only `react-dom` is genuinely
never imported. An exception list quietly holding unnecessary entries, inside
the check that exists to enforce rule 9 against exactly that.

**The entry set was wrong.** It walked `app/` only. The root `middleware.ts` is
an entry point too, and `lib/supabase/middleware.ts` hangs off it.
`@supabase/ssr` was reported reachable only because `app/` happens to reach it
as well — one refactor from this check calling a live dependency dead. Fixed by
adding `middleware.ts` and `next.config.ts`.

That second one is recorded honestly rather than as a save: deleting
`ENTRY_FILES` still does not fail the package gate today, because no package is
currently reachable through middleware alone. It is a backstop, not a live
defence, and the file says so. Naming which gate a case actually exercises is
the rule here.

Both real gates are proved by mutation: an invented dependency fails the
reachability gate, and deleting `react-dom` from `package.json` fails the
staleness gate on its own exemption.

**Dead local modules are reported behind `--dead`, not checked.** The sweep
finds ten shadcn components nothing renders. Failing on them would be wrong:
BUILD-PLAN's scaffold installs them deliberately and Phases 8–10 have not
reached them yet. That is a phase not having happened, not a plan reality
overtook. It is also not a warning, because it is not printed on every run.
Whether that distinction is faithful to rule 9 or an evasion of it is a
judgement I have flagged rather than settled.

### Verifying §10 rather than trusting my own paragraph

§10 now carries numbers that went in on my measurement, and I had removed three
packages since. Re-measured against a clean build:

| Claim | Measured |
|---|---|
| `/schedule` 273 kB | **273** ✓ |
| `/dashboard`, ~10 kB below | **263**, gap exactly 10 ✓ |
| Popover intervention closes the gap to 3 kB | 263 → 271, `/schedule` untouched, **gap 3** ✓ |
| `COMMON_TIMEZONES` is seventeen entries | **17** ✓ |
| `/j/[code]` renders three of the same primitive | **3** — `DeviceSelect` at PreJoin 271/279/287, one `<Select>` inside ✓ |
| `date-fns-tz` reached by all three routes | ✓ |
| `/schedule/[code]` 263 kB | **264** |
| Shared baseline 175 kB | **160** |

The last two are the spec's, not the build's, and are in the message with this
commit as proposed edits.

One claim nearly failed and did not. Source reachability says `date-fns` is
reached by both schedule routes and **not** by `/dashboard` — an unattributed
differentiator §10 does not mention, which would have made "about 3 kB is
Select's own implementation" a residual dressed as an attribution. Adding
`date-fns` to `/dashboard` moves it 0 kB: it is already there through
`date-fns-tz`. The test that could have refuted the paragraph cleared it.

**A new testing rule, earned the same way as the others: markers do not survive
minification.** Grepping production chunks for `tzTokenizeDate`,
`formatInTimeZone` or `RemoveScroll` returns nothing at all — the identifiers
are minified away. String literals survive, which is why an incidental
`"Africa/Accra"` was the one thing my original chunk-labelling found, and why it
labelled the wrong library. Chunk archaeology cannot attribute. Source
reachability and intervention can, and both were used here.

### What the numbers actually do between builds

I had been treating single-kilobyte movement as instrument noise. It is not,
and the calibration says so: two builds of byte-identical source produced
identical route tables — 263 / 273 / 264 / 160 both times. There is no
build-to-build variance to speak of.

The ±1 kB I kept seeing appeared only in builds where I had modified
`/dashboard`. `/schedule`, untouched, read 274 in those and 273 in both clean
builds. That is not noise but coupling: adding code to one route repacks the
shared chunks and shifts unrelated routes by about a kilobyte. Worth knowing
before attributing a small difference to anything, and it means a single-digit
gap is real signal rather than something to shrug at.

It also settles `/schedule/[code]` at 264 as reproducible rather than a sample.

And the 175 kB in §10 was never measured: this file recorded the shared baseline
at 160 kB during the Phase 2 → 3 housekeeping, which is what it still reads
today. The figure has been stale for the whole build, not just since Phase 7.

### Checks

`check:deps` **4/4** (new). All others green: `check:room` 96, `check:chat` 73,
`check:ics` 69, `check:meetings` 68, `check:permissions` 39, `check:contrast`
24, `check:rls` 18, `check:bundle` 10/10, `check:media` 29/29.

---

## Rule 9's second category, and what the shared baseline actually measures

Rule 9 grew a second half: unrendered local components fail too, "and the fix is
deletion, not justification." That settles the question I had flagged rather
than answered — I had put the dead-module sweep behind a `--dead` flag on the
grounds that Phases 8–10 would want those components. Rule 9's answer is that
shadcn is a copy-paste registry, not a library, so `npx shadcn add dialog` on
the day Phase 8 needs a modal costs seconds, and "we'll want it later" is an
argument for adding it later.

Deleted: `alert`, `avatar`, `card`, `dialog`, `dropdown-menu`, `scroll-area`,
`sheet`, `switch`, `tabs`, `textarea`. What survives — badge, button, input,
label, popover, select, separator, skeleton, sonner, tooltip — is exactly
BUILD-PLAN's new scaffold list, which is the check the two documents now
constitute for each other.

`--dead` is gone; it is a failing gate, proved by mutation with a throwaway
unrendered component, and the exit code checked directly rather than through a
pipe that was reporting `grep`'s status.

### One premise did not survive the check

Rule 9 says "seven of the ten unrendered shadcn components pin a Radix package
in `package.json`, so most of them are the first category wearing a local file
as a disguise."

The count is exactly right — seven of the ten import Radix. The consequence is
not, here. This project installs Radix as the single unified `radix-ui` package,
and `select`, `popover`, `tooltip`, `button`, `badge`, `separator` and `label`
all require it. Same for `lucide-react`, which `sonner` and `select` import, and
`class-variance-authority`, which `button` and `badge` import.

**Deleting all ten freed no package at all.** The decision stands on rule 9's
other reasoning — vendored source that costs seconds to reinstate and lies to
the next reader about how the product is built — but not on supply-chain
grounds, which is the ground the rule leads with.

### And the shared baseline is not what §10 thinks it is

§10 calls the shared baseline "the leveraged number": "a kilobyte removed there
is a kilobyte removed five times."

Deleting the ten components moved it from **160 kB to 156 kB**. Both figures
reproduce across two clean builds each.

**Not one route total changed.** All ten are byte-identical either side of the
deletion — `/` 152, `/_not-found` 146, `/auth/complete` 229, `/dev/tokens` 155,
`/j/[code]` 184, `/room/[code]` 154, `/dashboard` 263, `/schedule` 273,
`/schedule/[code]` 264, `/sign-in` 244.

So four kilobytes left the shared baseline and zero kilobytes left any route.
Whatever "First Load JS shared by all" counts, it is not a term that every route
total is built from — a drop in it is consistent with no route shipping a single
byte less. It is a classification of which chunks happen to be common to every
route, and that classification moved without the bytes moving.

I am not going to explain the mechanism further, because the last time I
narrated chunk behaviour I was reading minified output and got it wrong. What is
measured is the pair of numbers above, four builds, and they do not support
using the shared baseline as an optimisation target.

### Checks

`check:deps` 4/4 → **5/5**. All others green: `check:room` 96, `check:chat` 73,
`check:ics` 69, `check:meetings` 68, `check:permissions` 39, `check:contrast`
24, `check:rls` 18, `check:bundle` 10/10, `check:media` 29/29.

---

## Phase 8 — connection states

Nothing fails silently, in both directions: the room says when the connection
goes, and it says when it comes back. The second half is not in §3.11 and is
the reason it is here — someone who hears a drop and never hears a recovery is
left assuming a working meeting is still broken.

### The decision table is a pure module

`lib/room/connection.ts` holds every choice §3.11 asks for as functions over
plain strings, with no import from `livekit-client`. Both LiveKit enums are
*string* enums, so their values are exactly the literals, nothing is lost, and
`check:connection` can compile the module on its own.

Two phases exist that §3.11's four-row table does not name, both of which the
SDK produces anyway:

- **`signal`** is `SignalReconnecting`: media keeps flowing while the data
  channel is down, so video and audio look perfect while chat and reactions
  stop. Rendering nothing here is exactly the failure this phase is named
  after; rendering the critical bar would be a lie, because the meeting works.
- **`lost`** is the server reporting our own quality as lost while the SDK
  still considers itself connected — §3.11's "Lost (local)" before any retry
  has started, so there is no attempt count to show yet.

### A bug this phase would otherwise have copied onto every face

`ParticipantsPanel` shipped in Phase 7 testing quality *negatively*: return
nothing for excellent and good, treat everything else as a problem. That is
wrong at exactly one value, and it is the value everyone starts on. The SDK
seeds `_connectionQuality` to `Unknown` in the `Participant` constructor and
resets to it after a reconnect, so the panel labelled every participant
"Unstable connection" from the moment they joined until the server's first
quality update, and again after every recovery.

`treatmentFor` is the positive form, shared by the panel and the tile so the
two cannot drift, and the `unknown` case is pinned directly — mutating the
function back into its negative form fails that one check and nothing else.

### Three gates on one assumption, and they are not interchangeable

Everything rests on our string literals still equalling LiveKit's enum values,
which would fail *open* — every reading falling through to "none", every
degraded state rendering as healthy, no symptom at all. Measured by mutating
each gate:

1. **`tsc`** catches a one-sided drift: renaming a comparison but not the union
   is TS2367 and the check exits before running.
2. **The phase and treatment cases** catch a consistent rename, which compiles
   cleanly. They feed the SDK's literal strings in and assert a specific
   result.
3. **The enum section** catches the SDK changing underneath us, which neither
   of the others can see, because its expected list is hand-written here.

### What LiveKit already does, and the one thing it will not tell us

The retry loop is the SDK's and stays the SDK's. `DefaultReconnectPolicy` is
public, so `createRetryCounter` wraps it and delegates every delay — supplying
a policy is an act of observation, not of policy, because `retryCount` is the
only place the attempt number is legible: `RTCEngine.reconnectAttempts` is
private, `Room.engine` is `@internal`, and the `reconnecting` event carries no
argument.

The vendored copy of the schedule is checked against the SDK's own, and my
first draft of it was wrong — I wrote the delays from the plan rather than from
the source. They are `[0, 300, 1200, 2700, 4800, 7000 × 5]`: ten attempts,
44 seconds before jitter. The ten-second acceptance window sits five attempts
inside that, which is why recovery works and why the failure modal is not
reachable in a ten-second test.

The attempt count is the one value genuinely held rather than derived, and it
is documented as such in both files so the next reader does not read it as a
rule-3 violation and remove it.

### Rule 4 met a case it could not cover, and the rule changed

Hued text on the scrim does not clear its floor. Composited over white video
the scrim resolves to about `#515355`, where `--state-warning` is 3.79:1 and
`--state-critical` 2.53:1. `check:contrast` cannot see this — `ALL_SURFACES` is
seven opaque tokens and `--scrim` is not among them, so the matrix passes 24/24
today and would still pass with a 2.53:1 label shipped.

Rule 4 now says hued state indicators sit on an opaque `--popover` chip, which
restores 8.11:1 and 5.42:1 by making the background stop depending on what is
on camera. `check:connection` scans for the violation rather than computing the
colour — weaker than the contrast matrix, and named as weaker.

### The failed state stopped being a page

A drop used to unmount the entire room and render a screen with one "Join
again" link, which made §3.11's "Leave" meaningless — you already had. Now the
room stays mounted and dims behind an overlay, and both verbs are true.

It is also **derived rather than mirrored**: `onDisconnected` no longer sets a
failure state at all. `useRoomConnection` reads the room's own connection state
and the phase falls out of it, which is rule 3's reasoning one surface along. A
first connect that never succeeded is still a page, because never getting in
and dropping out are different events with different remedies.

The way out is live throughout the retry rather than revealed after the tenth
attempt — §3.11: "Nobody should be made to watch a countdown they cannot
interrupt." A rejoining guest carries their display name back to pre-join;
their identity does not survive, and that is recorded rather than hidden.

### The webhook that was missing for seven phases

`app/api/livekit/webhook/route.ts` was named in `CLAUDE.md`'s file layout and
§7 and never appeared in a phase task list. Nothing in the product wrote
`status = 'live'` or `'ended'`, so a meeting that ran and emptied stayed
whatever it was created as — the dashboard's past section could not fill, the
"Live" badge could not render, and §3.2's ended page, with all the enum work
that separated ended from cancelled, was unreachable for every meeting that
actually took place.

A `room_finished` update without its `neq` would silently rewrite a
cancellation to "ended", undoing that separation for exactly the meeting
someone cancelled and a straggler had already opened. That guard is pinned, and
proved by mutation.

§3.2's 12h expiry arrives with it, because `started_at` is what makes "never
joined" answerable and nothing wrote it before. It is **derived at read time,
not swept by a job** — a pure function of `created_at` and `started_at`, exact
at every read, with no scheduler to be late or run twice. The first draft got
the 30-day window wrong: filtering on the stored status left an expired meeting
resolving forever while every genuinely ended meeting stopped at thirty days.
The predicate is now computed once and used by both the projection and the
filter.

### One defect I found by reasoning rather than by running it

`resumeNeeded` and `phase === "failed"` are the same underlying
`disconnected` state, distinguished only by cause. Both surfaces would have
rendered at once — and the dialog's copy, "Parley kept trying and the
connection didn't come back", is simply false when the browser closed a hidden
tab. Nothing was tried. The resume prompt now takes precedence, because the
more specific explanation is the true one.

Worth recording because no test would have caught it: iOS backgrounding is the
phase's largest unreachable path, and the two states only collide there.

### What is not honestly tested

- **`ConnectionQuality.Poor` is unreachable by any local means.** Quality is
  the server's verdict, delivered over the signalling socket, so killing the
  network produces *no* quality updates rather than a bad one. The amber pill's
  mapping is exercised in `check:connection` as a pure function and nowhere
  else.
- **`setOffline` is not a blackout.** It reaches Chromium's network service —
  HTTP and the signalling socket — and not an established PeerConnection, whose
  ICE/DTLS/SRTP run through the P2P path. The e2e exercises the signalling half
  of an outage, which is what drives the bar, the count and the recovery. True
  media-path loss, ICE restart and TURN relay need a real network.
- **The once-per-change gate cannot be proved end to end.** Deleting it leaves
  the e2e green: the effect is keyed on `[phase]` so it does not re-run while a
  phase stands, and React bails out of a `setState` with an identical string
  before the DOM is touched. Two layers of accidental protection sit between
  the guard and anything observable. It is pinned in `check:connection`, where
  removing it fails immediately, and the e2e assertion is documented as a
  backstop rather than counted as coverage. The test was renamed to what it
  actually proves.
- **The webhook cannot be exercised from this repo at all.** It needs a public
  URL and a signed request from LiveKit. Its shape is scanned; its behaviour is
  manual.
- **iOS Safari `visibilitychange` and track re-acquisition** are unreachable —
  Chromium under Playwright is not WebKit and does not kill tracks on
  background. This is the phase's largest untested path.
- **The autoplay fallback** is untestable under the current config:
  `--autoplay-policy=no-user-gesture-required` is the flag that makes every
  other media test work and the flag that makes blocked playback unreachable.

### A test that was wrong before the code was

The announcement test first asserted the region's text never changed during an
outage, and failed correctly: the phase really does move from
`signalReconnecting` to a full reconnect, and those are two facts that each
deserve saying. It had conflated "once per change" with "never changes" — a
property that would also have passed if the room had gone silent after the
first line.

Its replacement also caught me scoping by visible text, which matched both the
bar and the live region because they say nearly the same thing on purpose. The
bar carries `data-connection-bar` now.

### The signal-reconnecting copy, measured rather than guessed

§3.11 was updated to require this line be "verified rather than inferred", and
warns that "chat and reactions are unavailable" and "you may not see people
join or leave" are different claims.

Reading the SDK suggested outbound data would survive: `sendDataPacket` goes
through `ensureDataTransportConnected`, which returns early when the channel is
already open, with no signalling involved. So I probed it — two participants,
one taken offline at the network service so only signalling died. Observed:

| | result |
|---|---|
| chat **sent by** the signal-less participant | never arrived |
| chat **sent to** them | arrived |
| a third participant joining | not seen |

Which makes the SDK reading wrong, and my first draft wrong in both
directions: it claimed chat was unavailable when only the outbound half is, and
it missed participant updates entirely. The bar now reads "Messages you send
won't arrive, and you won't see people join or leave", and how that was
confirmed sits in a comment beside it so the next reader is not re-deriving it.

Observation beat inference, which is why §3.11 asked for observation.

### `--scrim` is in the contrast matrix now

The gap was real: `ALL_SURFACES` is seven opaque tokens and the scrim is
`rgba()`, so the matrix passed 24/24 while a 2.53:1 label could ship — under
rule 4, which puts every label on the scrim precisely so contrast is
deterministic.

It is composited from the declared alpha rather than hard-coded, so raising the
scrim's opacity moves the number instead of leaving it stale. Two mutations
prove it: thinning the scrim to 0.30 fails at 1.82:1, and deleting the
declaration halts the run rather than silently skipping the rule.

Scoped to dark, and that scoping is the honest part. Light `--foreground` on
the composited scrim is 2.30:1 and failed on the first run — but that pairing
cannot occur, because rule 8b forces `.dark` on `/j/[code]` and `/room/[code]`
and the scrim exists over video and nowhere else. A false failure is how a
threshold ends up being lowered; scoping the rule to where the surface actually
exists is the fix.

**And the two copies of the rules now have to agree.** `lib/contrast-rules.ts`
says it is "shared between `scripts/contrast.mjs` and `/dev/tokens`, so the two
cannot disagree" — they were not shared at all. The script kept its own copy
and nothing compared them. It compiles the shared module and compares rule sets
now, so the claim is enforced rather than asserted.

Two bugs I introduced doing it, both caught by looking rather than assuming:
`/dev/tokens` resolved surfaces from live CSS and the scrim is not a token, so
it rendered nothing; and two rules on `--foreground` collided on a React key
and again in the snapshot generator, which printed 12.01 against the scrim's
label. The tokens page now carries a `scrim/video` column — greying
`--state-critical` at 2.53 there is the clearest statement of why rule 4 exists.

### Two bugs the full suite found that isolated runs did not

Both were mine, and both came from the revisions above.

**The escape hatch went missing from the state that most needs it.** Making
`lost` amber, I also narrowed the Rejoin/Leave affordance to `reconnecting`
alone — reasoning that `lost` has no countdown to interrupt. True, but it also
removed it from `signal`, and the bar frequently appears in `signal` first and
can stay there. That is the state where messages silently fail to send: exactly
where someone would want a clean rejoin. Both retrying states offer it now;
`lost` still does not, because nothing is retrying there. `check:connection`
pins which phases qualify, because getting this wrong is invisible until
someone is stuck in one of them.

**A test went stale against copy it had hard-coded.** When §3.11's
signal-reconnect line was rewritten from observation, the announcement test
failed on its own regex while the product did exactly the right thing —
announcing the outage and then the recovery. It now derives the expected
strings from `lib/room/connection.ts`, which is the convention this project
already has for meeting codes: fixtures come from the same constants as the
code under test, never retyped. A test that must be hand-edited whenever copy
changes will eventually be hand-edited to match a bug.

Neither showed up in an isolated run of the spec. Both showed up in a full one,
which is the third time this project has been reminded that passing alone is
not evidence.

### A Phase 4 test that raced the spec it was checking

The speaking-ring colour assertion read the computed outline at one instant and
required exactly `--tile-border` or `--foreground`. §3.4 specifies a **120ms
transition** on border-color, so the ring spends real time at interpolated
values — and a full run caught `rgb(182, 187, 195)`, which is 60% of the way
between the two. The test was racing the transition the spec asks for.

It now accepts any point on the line between the two endpoints, which is not a
weakening: what §3.4 forbids is a *hue*, and a third colour is off that line.
Amber, `--state-critical` and `--border` are all still rejected — checked
directly rather than assumed.

Recorded because the alternative reading was tempting and wrong: the failure
looked like Phase 8 had introduced a colour, and the temptation was to widen
the permitted list. What was actually wrong was the sampling.

### `lost` is amber, not critical

§3.11 now places it with the warnings: it is the gap before a retry has
started, and "do not jump to critical for a state that may resolve without a
retry". Its copy is Poor's, verbatim, and the escape hatch is gone from it —
there is no countdown to interrupt yet.

### Checks

`check:connection` **72/72** (new). All others green: `check:room` 96,
`check:chat` 73, `check:ics` 69, `check:meetings` 68, `check:permissions` 39,
`check:contrast` 24, `check:rls` 18, `check:deps` 5/5, `check:bundle` 10/10.
`check:media` **32/32**, up from 29 — green on a full run, which is the only run that counts. Every route inside budget; rule 8 holds
— `livekit-client` is in no route's first load.

---

## Phase 9 — accessibility

Three live bugs, two new checks, and one finding I would not have reasoned my
way to.

### A panel a keyboard user could open and not close

`ParticipantsPanel` had no effect moving focus into itself, and its Escape
handler is `onKeyDown` on its own element — so React never saw the key while
focus sat on the trigger in the control bar. Opened with a mouse it worked;
opened with a keyboard it was a trap with no exit.

`ChatPanel` focuses its composer on open, which is exactly why only one of the
two was broken and why it survived two phases: the panels looked alike and one
of them worked.

Focus restoration was broken in the same direction. `RoomStage` captured
`document.activeElement` when a panel opened, and via ⌘⌥C that is `<body>` —
`body.focus()` is a no-op, so Escape closed the panel and dropped focus to
nowhere. It now falls back to the control that declares `aria-controls` for
that panel. The existing test only ever exercised the click path.

### A dialog that promised a trap it did not have

`ReplaceShareDialog` shipped in Phase 7 as a plain `<div role="dialog"
aria-modal="true">` with one autofocused button. The amended floor names it
exactly: "the ARIA attribute is what promises a trap, so using it without one
is the lie." A screen reader told the rest of the page was inert would let
someone tab straight out into a room it had said was not there.

It is a real Radix dialog now, which is also the right answer on the merits —
it is the task, and the meeting behind it can wait for two words. Escape
cancels, which is what distinguishes it from `ConnectionFailedDialog`, where
there is no safe closed state.

Its accessible name changed as a result, from an `aria-label` only a screen
reader ever heard to §3.7's own visible copy. `aria-labelledby` wins over
`aria-label`, so the title *is* the name; the e2e was updated to match rather
than the component bent to keep a string.

### Every portal in the room was rendering light

Rule 8b forces dark "via a wrapper element in the route-group layout", and
Radix portals render to `document.body` — outside it. So every tooltip,
dialog, popover and select in the room and pre-join resolved against the
**light** palette, since Phase 3.

It hid because it only appears when the viewer's OS is in light mode: otherwise
`next-themes` puts `.dark` on `<html>` and the portal inherits it anyway.
Playwright defaults to light, which is why axe found it and six phases of
looking at the product did not.

Fixing it exposed a second fault underneath. shadcn's tooltip is
`bg-foreground` — near-white in the dark theme — and the shortcut hint inside
it was `--muted-foreground`, which measured 1.72:1. `--muted-foreground`
declares the seven opaque *surfaces* it is permitted on, and a fill is not one
of them; `--background` at 70% over `--foreground` is 6.89:1.

Both are pinned: `check:a11y` fails if a portalled surface in those directories
is added without carrying the palette itself.

### The announcement queue, and a bug the Phase 8 comment did not name

Phase 8 merged two sources into one region with last-writer-wins and documented
that it could drop one on a same-tick collision. The more frequent loss was
undocumented: **the region held a bare string, so writing the value it already
held was a React bail-out — the DOM was never touched and nothing was spoken.**
Two messages in a row from the same sender announced once. Two identical
reactions announced once.

So the queue carries `{ id, text }` and the region renders a keyed child. The
region element itself never remounts, because a live region inserted with
content already in it is not announced at all by most screen readers.

Strict FIFO, no channel priority. §9 does not rank the channels — but the code
did, by accident: the chat effect was declared after the connection effect, so
chat silently won a collision. Choosing FIFO is choosing a rule instead of
keeping a source-order artefact.

### Join and leave, and a hazard no document mentions

§9's amended wording is exact and produces its own example: first event by
name, everything in the next five seconds held, one held event reads as a name
and two or more as a count. The earlier wording asked for a separate collapse
threshold that made "3 people joined" unproducible.

What no document covers is **reconnection**. LiveKit unwinds the room on a
reconnect — `ParticipantDisconnected` for every remote participant, then
`ParticipantConnected` for every one again. In a nine-person room that is
sixteen events from one blip, landing on top of "Connection restored." The
participant threshold does not save it either: the SDK's map drains as the
unwind runs, so the count falls past any threshold mid-burst. Presence
announcements are suppressed while the connection is not healthy and for three
seconds after it returns, because the re-add burst arrives *after* the state
flips back.

### Two regions that narrated on a clock

Not in §9's list, and the same flooding through an unenumerated channel. The
chat cooldown counter carried `aria-live` and its text changes every second —
and on every keystroke past 900 characters. The join-hold countdown announced
"9s", then "8s", then "7s", for the whole hold.

Both keep their text visible; neither is live. The sentence is what is worth
hearing and it does not change.

### `?`, reached the way the people who need it will reach it

An eighth control in the bar was the obvious answer and the wrong one: a
*keyboard* shortcuts dialog is no use to the touch visitor it would have been
added for. The population that needs to discover `?` is the population that
tabs. So it is a skip-link-pattern hint — first focusable thing in the room,
invisible until focused — and each control's tooltip carries its own chord.

The old hook could not have hosted `?` at all: it returned unless a modifier
was held, before inspecting any key. It also had no testable core —
`check:room` tested `isTyping` in isolation while nothing tested that the
handler called it, so deleting the call failed nothing. `matchShortcut` is a
pure function now, and it stopped claiming Cmd+Shift+D, which is
bookmark-all-tabs in several browsers.

`ICONS.settings`, `ICONS.more` and `ICONS.user` are deleted — rule 9 applies to
declarations as much as to packages.

### Two checks, because a claim that is not a script is not a check

`check:a11y` (58) pins the queue's ordering, gap, staleness and cap; every
batching boundary including the ninth participant and the mixed-direction
split; the shortcut matcher across layouts and modifiers; and the source scans
for portalled palettes and live regions.

`check:targets` (5) measures touch targets **from built CSS**, per the floor's
new wording. `size="sm"` means nothing until Tailwind has emitted
`.h-7{height:1.75rem}`, and it is that number the finger meets. The floor is 44
in the room and pre-join and 24 elsewhere — the blanket 44 was above the
project's stated conformance target and would have changed density on every
document surface for no gain. A `size="touch"` variant carries it.

### Two things I fixed in the checkers rather than the code

`check:room` counted `aria-controls` as a substring, so the `querySelector`
in the new focus-restoration helper read as an unpaired attribute — the check
reporting a violation it had invented. It counts JSX attributes now.

That fix then introduced a stateful `/g` regex inside a `.test()` filter, which
silently skipped files. It was caught because the total dropped by one rather
than by the failure I was expecting, which is the only reason I looked.

### And a correction to what I said about Phase 8's flaky runs

Phase 8's full runs failed intermittently in different places each time —
schedule once, then media and grid and chat — and I attributed it to Supabase
rate limiting and machine contention, on the strength of the failures being in
a test's own sign-in helper and of everything passing in isolation.

That was wrong, or at best incomplete. **`connection.spec.ts` never closed the
browser contexts it created.** `joinAs` builds them by hand, so Playwright does
not reap them; every other spec closes them in `afterEach` and that one did
not. A context left open holds its participant in the room long enough for the
next spec's `expectParticipants(1)` to see two — which is exactly the shape of
what I saw: failures that moved between specs, always about something not being
found, always passing alone.

Phase 9's new spec had the same omission and, being alphabetically first, put
the residue in front of `chat.spec` where it had never been. That is what
surfaced it. Both are fixed.

I recorded the earlier diagnosis with the evidence I had and it read as
plausible; it happened to be about the environment rather than the code, which
is the comfortable direction to be wrong in.

### What is still unverified, and it is the part that matters

**No screen reader has heard any of this.** Every announcement rule in this
phase — the queue's ordering, the batching phrasing, the suppression during
reconnect, whether "2 people joined" lands usefully in a real room — is
verified as arithmetic and not as sound. BUILD-PLAN is explicit that the real
deliverable is a keyboard traverse by hand and a VoiceOver-with-Safari session,
and that green axe with an untested screen reader is a claim rather than a
fact. It remains a claim.

axe reaches perhaps a third to a half of WCAG and is blind to everything this
phase is about: it confirms a name exists, not that it means anything; that
elements are focusable, not that the order is sensible; that a live region is
present, not that its output is usable.

Also untested: the mobile pager and panel layouts on a real touch device, and
`prefers-reduced-motion` against the new dialogs.

### Checks

`check:a11y` **58/58** (new), `check:targets` **5/5** (new). All others green:
`check:room` 96, `check:connection` 72, `check:chat` 73, `check:ics` 69,
`check:meetings` 68, `check:permissions` 39, `check:contrast` 25, `check:rls`
18, `check:deps` 5/5, `check:bundle` 10/10, `check:media` **42/42**, up from 32
and green on a full run — which, this phase more than most, is the only run
that counts.

---

## Phase 10 — mobile, error routes, and the last of the polish

The final phase, and half of it was deciding what not to build.

### Four things in the task list contradicted the specification

Each was put to Austine and settled in the documents rather than in code.

**The live favicon is declined and recorded.** Its only described
implementation — fill the fourth cell while in a call — was forbidden by
BRAND.md's own misuse list, CLAUDE.md's rule, and BUILD-PLAN's kickoff prompt,
which made every brand document self-contradictory. It was also unbuildable as
written: `app/icon.svg` is a build-time convention, pre-join reaches the room
through `router.push` with no document load, and iOS Safari renders no tab
favicon at all — so it would have done nothing for the mobile visitor §3.3
calls the highest-traffic flow. A value inversion was raised as a way to signal
the state without touching the cell, and declined too: at 16px an inverted
badge reads as a different logo rather than a state of the same one.

**"Meeting full" is struck.** No capacity limit exists in the schema, the token
contract's six error codes, LiveKit config, or the PRD, so building the screen
would have meant inventing the concept in the final phase. The 429 "This
meeting is busy" copy already in pre-join is what the line was reaching for.
LiveKit's own plan ceiling is a real unhandled failure and goes in the
untested-paths table rather than on a screen.

**The per-meeting OG card carries no meeting data.** The host half reversed
§3.2's decision and was not reachable anyway — `get_meeting_by_code` returns no
host field. The title half was the subtler find, and not mine: **an unfurl
discloses on paste, not on open.** §3.2 reasoned about who holds the link; an
unfurl widens that to everyone who can see the channel, plus the platform's
fetcher and its cache. The counter — that anyone in the channel could click
through anyway — does not survive the accident case, where a link pasted to the
wrong channel broadcasts "1:1 re: performance concerns" passively to everyone
scrolling past.

A consequence worth having: taking no parameters means there is no lookup, so
there is no unknown, ended, cancelled or expired branch to get wrong. An OG
route must return an image rather than a 500, and the surest way is to have
nothing to fail at.

**"Touch targets at 44px minimum" and "dashboard under 180KB" are both stale** —
superseded by CLAUDE.md's 44/24 split shipped in Phase 9, and by §10's ≤ 280 kB
against a route measuring 267.

### A retired colour on the most-seen artefact in the product

`app/opengraph-image.tsx` hardcoded `TILE_BORDER = "#414954"` — the
pre-Phase-0 value, retired in Phase 0 for measuring 2.09:1 when WCAG 1.4.11
wants 3:1. The token has been `#5D6777` since. It survived ten phases because
`scripts/contrast.mjs` reads only `globals.css`, so no gate can see a colour
hardcoded in a card.

Fixed, and the constants extracted to `lib/og.tsx` so the two cards cannot
drift again — which is the same lesson the contrast table learned twice.

### The mobile faults, and the number that made them real

Two, both measured rather than reasoned about:

**The control bar overflowed the phone.** Seven controls at 44–48px plus a
leave pill and six 12px gaps came to roughly 420px against 375, and the stage
clips `overflow-hidden`, so the ends did not wrap or scroll — they were not
there. Reverting the fix puts the mic control at **x = −39.47px**.

**Both panels covered it entirely.** They are `inset-x-0 bottom-0 h-[60dvh]` at
`z-20` on mobile and the control bar had no z-index at all — a positioned
element with a stacking order beats a positioned element without one whatever
the DOM order. So opening chat on a phone hid mic, camera and leave, against
§3.4's requirement that controls stay reachable with both panels open, and mute
is a privacy control.

`toBeVisible` would not have caught the second: the bar was in the layout and
painted, just underneath. Hit-testing the centre point is what asks whether a
finger would reach it.

Also: **no safe-area handling existed anywhere.** `dvh` describes how tall the
viewport is, not which part of it is safe to put a control in, so the bar's
24px bottom padding sat under an iPhone's 34px home indicator. `viewportFit:
"cover"` plus `env(safe-area-inset-bottom)` fixes it, and neither does anything
without the other.

### An unsupported browser could join a room it could never use

The `unsupported` and `insecure` states existed with good copy and were
unreachable in the case that matters: they were only set inside `request()`,
which fires from a click, and `canJoin` was computed from the name field alone.
So a guest in a browser without the media APIs could type a name, press Join,
receive a valid token, and land in a room that would fail — presenting as a
connection problem, blaming the network for a browser fault.

Detection now runs on mount. Feature detection is not a permission request, so
§3.3's rule that the prompt must not fire on page load is untouched.
`RTCPeerConnection` is checked alongside `getUserMedia` because they fail
independently.

### The last framework default page

`app/not-found.tsx` did not exist, so three `notFound()` calls and every
unmatched URL landed on Next's default. No *control* reached it — `MeetingRow`
gates its Details link correctly — so CLAUDE.md's rule was satisfied; the
exposure was URL-borne, which is how anyone actually arrives: a forwarded link,
a stale bookmark, a typo.

It carries its own way back, because it cannot rely on a header being there.
Verified both paths rather than assumed: an unmatched URL renders inside the
root layout alone with no header, while a `notFound()` inside a route group
keeps that group's layouts and does get one. My first comment claimed the first
case for both and was wrong.

### `/` had no interactive element in production

The only button was gated on `NODE_ENV !== "production"`, so §2's flow C —
"Dashboard or home → enter code" — was unimplemented from home, and
`JoinCodeForm` was mounted only on the unknown-code page. Joining by code
worked exclusively *after* failing to join.

§3.10a now specifies the page and it is built to that: two entry points, the
wordmark, the tagline, nothing else.

`check:targets` gained a surface the directory rule could not see —
`JoinCodeForm` renders on `/j/[code]`, a pre-join surface, from
`components/meetings/`. The floor is by surface, and a component can appear on
more than one.

### Checks

`check:media` **44/44**, up from 42 — the two new mobile geometry tests. All
others green: `check:a11y` 58, `check:room` 96, `check:connection` 72,
`check:chat` 73, `check:ics` 69, `check:meetings` 68, `check:permissions` 39,
`check:contrast` 25, `check:rls` 18, `check:deps` 5/5, `check:targets` 5/5,
`check:bundle` 10/10. Every route inside budget; rule 8 holds.

---

## After Phase 10 — reconciling the documents, and one source of truth

Not a phase. The last of the drift, and the arrangement that produced it.

### The stale line, and the two beside it

`BUILD-PLAN`'s Phase 9 task list asked for `aria-pressed` on toggles while
`CLAUDE.md`'s floor forbids it. Following it would have broken two passing
gates — `check:room` asserts the absence, `media.spec` asserts it on the mic
button by name — to undo a decision `CLAUDE.md` explains.

It survived because the Phase 7 ownership split reconciled `CLAUDE.md` and PRD
§9 and never brought the third document into it. **A split between two of three
documents is not a split; it is a smaller contradiction.**

Two more lines in the same list were stale the same way: focus trapping on
non-modal panels, which the floor now explicitly reverses, and a `>=3` collapse
threshold §9 had already removed for being unable to produce its own example
string. None of the three was enforced by anything.

### Austine's fix was better than mine

I struck the one line and flagged the other two. The rewrite that came back
deleted the enumeration entirely and replaced it with a pointer: "Build to
`CLAUDE.md`'s accessibility floor and `PRD.md` §9's announcement policy. Those
are authoritative and are not restated here."

That removes the class rather than three instances of it. Nothing in that
section can drift now, because nothing in it restates anything. The same move
had already been made twice — for the contrast table and for §9's mechanics —
and this is the third and last place it applied.

### The check I added was wrong, and the very next edit proved it

To stop the line coming back I made `check:room` read all three documents and
assert `BUILD-PLAN` contains no `aria-pressed`.

The rewrite above broke it immediately — by adding a paragraph explaining that
`aria-pressed` had been removed and why. **A check that forbids describing a
mistake pushes the next person to delete the explanation rather than the
requirement**, which is the opposite of what this file exists for.

It is scoped to task bullets now: prose about the history passes, a line asking
for it fails. Both directions proved by mutation, because the distinction is
the entire point of the check and I had already got it wrong once.

Adding it also exposed a fault in the checker itself. `check:room`'s total was
an expression summing each section's length by hand, so a new check ran and
passed while the total still read 96 — reporting one fewer than it ran,
silently, in the direction that looks like nothing happened. It self-counts
now, as `check-chat` always has. I noticed only because I expected 97.

### Phase 10 had four of the same kind

Each contradicted a document `BUILD-PLAN`'s own header says takes precedence,
and each was already overruled in the built product — so the document was the
only thing still wrong:

| Line | Overruled by |
|---|---|
| "Touch targets at 44px minimum" | `CLAUDE.md`'s 44/24 split, shipped in Phase 9 with `check:targets` |
| "OG variant showing meeting title and host" | `BRAND.md` — meeting links get no meeting data |
| "Optional: live favicon" | `BRAND.md` §8, considered and declined |
| "dashboard route under 180KB gzipped" | PRD §10's ≤ 280 kB, against a route measuring 267 |

Fixed in the same style: point at the authoritative document, and record what
was removed and why.

### One copy now

The four governing documents lived in two places — the repo and a working copy
outside it — and were kept in step by hand.

**That arrangement is the root cause of nearly every contradiction this session
found.** A decision would land in one copy and not the other, and the gap was
invisible until something built against the stale half: `aria-pressed` for two
phases, `react-day-picker` for six, the OG card's retired `TILE_BORDER` for
ten. Each time the fix was the same shape, and each time the arrangement that
caused it survived.

The outside copy is deleted. The documents live in the repository now,
committed alongside the code they govern, and three checks read them directly —
`check:room` for the accessibility ownership split, `check:connection` for
§3.11's markers, `check:contrast` for the token snapshot.

It is the same lesson as the contrast table and the announcement mechanics,
applied to the documents themselves rather than to a section of one: two copies
drift, and the second copy is a liability rather than a convenience.

### Checks

`check:room` 96 → **97/97**. All others unchanged and green.

---

## v1.2 Track A — correctness

Three items were actionable. A4, A5 and A6 are deferred by the plan itself to
Tracks E, B and F.

### A2 — the pre-join camera preview, and a dependency that described the wrong thing

The worst defect of the three, because §3.3 makes pre-join the screen that
decides whether the product feels competent, and it failed **on every first
load** rather than intermittently.

None of the usual suspects were wrong. `getUserMedia` resolved. The `<video>`
was mounted, and carried `autoPlay`, `playsInline` and `muted` — all three, the
set Safari needs. What was missing was `srcObject`, and the reason is a
sequencing one:

```
setStream(next); setState("granted");   // one batch, one commit
await navigator.mediaDevices.enumerateDevices();   // ← yields
setHasCamera(videoTracks.length > 0);   // a later commit
```

`showPreview` needs `hasCamera`, so the commit that first carries a stream has
**no `<video>` in it**, and the commit that mounts the `<video>` does not change
`stream`. An effect keyed on `[media.stream]` therefore ran exactly once,
against a null ref, and never again.

Toggling the camera off and on failed the same way for a second reason:
`setCamera` flips `track.enabled` and keeps the same `MediaStream` object, so
the remounted element met no change in the dependency either.

Both are the same underlying error — **a dependency list that names the data
when the thing being waited on is the element.** A callback ref names the
element, so it fires whenever the element appears, whatever caused it to
appear. That is the fix.

`e2e/prejoin.spec.ts` measures the frames rather than the markup, through
`videoLiveness`: `spread` separates a real image from a flat fill, `motion`
separates a live feed from one frozen frame. Reading back `srcObject !== null`
would have passed against an element that never painted a pixel — which is
exactly the state that shipped.

### A3 — one panel at a time

Panel state was two independent booleans. On desktop both panels are `absolute
md:right-0 md:w-[360px]` at `z-20`, so they occupy the same column and the later
one in the DOM simply paints over the earlier; the room reserved
`md:pr-[360px]` for one of them either way. Nothing on screen distinguished
"participants open" from "participants open over a chat panel you had
forgotten".

Now `null | "chat" | "participants"`, with `chatOpen` and `participantsOpen` as
derived reads so the rest of the tree is unchanged. The illegal state is
unrepresentable rather than merely unlikely.

Worth recording: **no test in the suite ever opened both panels**, despite
`a11y.spec.ts` quoting §3.4's "Controls remain reachable when both panels are
open" in a comment directly above a test that opens one. The requirement was
being cited, not exercised. `e2e/panels.spec.ts` now covers the swap in both
directions, the control bar surviving a swap, and Escape returning focus.

That phrase in `CLAUDE.md`'s accessibility floor — "the control bar to stay
reachable with both open" — is now unreachable and wants a wording fix. The
*rule* it justifies (non-modal panels are not focus-trapped) is untouched.

### A1 — the reported cause was wrong, and so was the reported symptom

A1 said panel content renders a second time as grey floating text in the main
area, and named the Phase 9 announcement live region as the likely cause.

Measured in the production build, with a message sent and a panel open:

| | |
|---|---|
| `[data-live-region]` computed | `position: absolute`, `1px × 1px`, `overflow: hidden`, `clip-path: inset(50%)` |
| `.sr-only` in the built CSS | present and complete |
| DOM walk for text matching the log | three nodes — two inside the panel, one inside the live region |

So the region is correctly hidden and there is exactly one copy of everything.
Not the live region, and not a duplication bug.

The screenshots settle what was actually seen. A1's list — "Austine joined",
"Hi Austine", "Austine left", "jbsidauke", timestamps — is the chat panel's own
contents, verbatim. Probing what the panel paints:

| | |
|---|---|
| panel background | `rgb(23, 26, 31)` — `--card`, applying |
| room ground | `rgb(14, 16, 19)` — `--background` |
| panel left border | `1px solid rgb(93, 103, 119)` — `--tile-border` |
| header | `rgb(242, 244, 247)` at opacity 1 — `--foreground`, not dim |

Everything renders as specified. **The defect is that `--card` on
`--background` is 1.09:1**, so the panel has no perceptible fill, and its only
boundary is a 1px hairline on one edge. In the sharer's view — where B1 already
records ~85% empty black — a 360px column of text with no container reads as
loose text on the room, next to a share region and tiles that *do* have visible
containers.

The observation was right; the inferred cause was wrong.

This is the same figure `CLAUDE.md` already flags for tiles: "`--card` vs
`--background` is 1.09:1, so they need a boundary `--border` cannot provide at
1.29:1". Tiles got `--tile-border`. The panels got one hairline of it, which is
enough to define an edge and not enough to define a surface.

#### What the fill can and cannot do

I proposed raising the fill to `--popover` and quoted it at 1.24:1 against the
ground. **It is 1.15:1.** Austine caught it, and the correction carries the
argument: no fill in the palette can carry this boundary. The whole surface ramp
lives inside 0.2 of a contrast point — card 1.09:1, popover 1.15:1, muted
1.21:1, and `--secondary`, the lightest surface token, 1.29:1. That is what
happens when every fill sits within 22 hex values of `--background`.

I also offered a shadow behind an elevation token. Wrong for a different reason:
shadows convey elevation on light grounds by darkening what is beneath, and on
`#0E1013` there is nothing meaningfully darker to reach. Dark interfaces carry
elevation with a lighter fill and a visible edge. The token was not added.

So: **fill to `--popover`, boundary from the 1px `--tile-border` edge, landed in
Track A rather than deferred to C.** The fill is not what fixes it — it puts the
panel on the correct plane, matching rule 4's opaque chip. The edge is the fix,
at 3.33:1 against the ground and 2.89:1 against the fill; `--border` there would
be 1.12:1 and invisible.

Landing it now rather than in C is the right call for a reason worth recording:
Track B assesses room layout, and assessing a canvas beside a panel whose
boundary cannot be seen is the same wasted work Track A exists to prevent.

The codebase had already answered this and the panels had missed it. Every other
floating surface in the room — `MuteRequestPrompt`, `ReplacedNotice`,
`ConnectionBar`, `ConnectionPill`, `AudioBlockedPrompt`, `ShortcutsHint` — is
`--popover` with a `--tile-border` edge. The panels were the only chrome still on
`bg-card`, which is the *tile* surface (`Tile`, `ScreenShareStage`). This was not
a new decision; it was an inconsistency.

#### The guard, and which half of it was doing the work

`panels.spec.ts` measures the painted fill and edge, resolving both from the
room's own custom properties so it asserts the relationship rather than a hex
value.

The first version put the token-identity check above the ratio checks. Mutating
the edge to `--border` failed on **the name**, and the ratios never ran — a
defence being reported as tested while something else did the work. That is the
`autolink` allow-list mistake in the testing rules, repeated. Reordered so the
ratios are the gate, re-mutated, and the failure is now "the edge does not read
against the room ground, expected >= 3". The identity check stays as a
documented backstop.

The live-region guard A1 asked for is in `a11y.spec.ts` regardless — it measures
the region's rendered box, and asserts the region is carrying text first, so it
cannot pass against an empty one.

### Checks

`check:media` **46/49** at the point Track A's first two items landed, then
`panels.spec.ts` and `a11y.spec.ts` green at 15/15 after the surface fix — axe
included, which matters because it recomputes contrast against the new fill.
All six new tests pass. Three pre-existing tests fail
in the full run and pass in isolation in 4.3s, 5.6s and 28.0s against 2.6m,
1.7m and 2.0m timeouts — all three at `joinAs`, waiting on the room heading,
before reaching anything either fix touches, and all three earlier in the run
than any spec added here.

That is not a reason to call them environmental and move on. The suite is now
49 serial tests over ~20 minutes, each opening real browser contexts against a
real cloud SFU, and the added load is the plausible trigger even though the
added tests are not the cause. It is at its practical limit, and Track B will
add to it.

All 375 static checks unchanged and green.

---

## v1.2 — parallelising the suite

19.7 minutes to **2.9**, and 51/51 where the serial run had been dropping three
to timeouts.

### The change

Tests no longer share a room. A `meetingCode` fixture inserts a live meeting
per test and tears it down afterwards; `joinAs` takes the code rather than
importing a constant, so a test that does not own a room cannot join one by
accident. Global setup creates one fixture host for the run and global teardown
deletes it — `meetings.host_id` is `on delete cascade`, so that one delete
also collects rows from tests that crashed before their own cleanup.

`fullyParallel: true`, `workers: 4`. The binding constraint is not CPU but
`grid.spec.ts`, whose breakpoint sweep puts seventeen contexts in one room
while every other test uses at most two — so four workers peak around 23.

The old comment said the suite was serial because "these tests share one
meeting room, and participants from a parallel worker would show up in another
worker's grid". True, and the right response at the time. But **the sharing was
the defect and the serialism was the symptom**, which is what BUILD-PLAN v1.2's
capacity section says and what `CLAUDE.md` had already implied: a test owns its
fixtures, and a room is a fixture.

The suite also no longer depends on `npm run seed:dev` having been run — or on
it *not* being run mid-suite, which was the sharper risk, since that script
deletes every meeting belonging to its target before inserting.

### What parallelism found

Five defects, and none of them were caused by running in parallel. Every one was
a test asserting something the product does not promise, or depending on state
it did not own. Serial execution had been supplying the missing state by
accident.

**Reactions are published `reliable: false`, and two tests asserted they always
arrive.** `useRoomMessages.ts` sends them lossy on purpose — §3.6 treats
reactions as the highest-volume, lowest-information channel in the room. A
single send asserted with `toBe(1)` was claiming a guarantee the product
declines to make, and it held only on a quiet local network. One of the two
tests already carried a comment acknowledging lossy delivery; it guarded the
ordering case and not the drop. Both now press again, at a spacing that clears
§3.6's one-per-second limit, which is also what a person does when nothing
happens.

*Whether reactions should be reliable at all is a design question and is not
being decided here — rule 10. The rate limit already bounds volume, so
reliability would be affordable; a dropped reaction is a click that did nothing,
against a spec that spends 200ms on a "pop" to make the click feel registered.*

**`usePresence` discards joins for `PRESENCE_SETTLE_MS` after the connection
goes healthy**, because a LiveKit reconnect unwinds and re-adds every remote
participant and that burst lands after the phase flips back. Correct, and
invisible while the suite shared a room: the second participant always arrived
long after the first had settled. In a room of its own the two joins are seconds
apart, and the announcement the live-region guard measures was being dropped by
design. The test now waits the window out, importing the constant rather than
retyping it.

**The scheduling tests shared one account** and signed in by minting a magic
link for it. Supabase invalidates the previous token when a new one is
generated, so two tests at once raced and the loser never reached the dashboard.
They also defaulted to the developer's own email address, writing test meetings
onto a real dashboard. Each test now gets its own account from a `hostEmail`
fixture.

**"The dashboard prints the zone label too" asserted on rows it did not
create** — really on `seed:dev`'s fixtures, or on whatever another test had left
behind. `CLAUDE.md` names this file by name: "Two scheduling tests were wrong
before the code was, because they leaned on rows other sections deliberately
mutate." This was the third. It now schedules the two rows it reads.

**The live-region guard refused to measure an empty region**, which is what it
was written to do, and that is how the presence-settle behaviour above surfaced
at all. It was also racing a ~1s announcement with a round trip; it now installs
the observer before the join and measures inside the page at the moment text
appears, so there is no window to miss.

### A ceiling that is still there

`/api/livekit/token`'s rate limit is keyed on `ip:${clientIp(request)}`, and
behind `next start` on localhost with no proxy headers `clientIp` resolves to
the literal `"unknown"`. **Every join from every worker therefore shares one
bucket** — 60 requests/min overall, 5/min for unresolvable codes. The suite
performs roughly eighty joins in under three minutes, so it is not close yet,
but the headroom is smaller than the worker count suggests and it would surface
as joins holding on the pre-join screen rather than as an error. This is a
localhost artefact rather than production behaviour, and it is not a reason to
weaken the limit. Recorded because the next person to raise `workers` needs it.

### Checks

`check:media` **51/51** in 2.9 minutes, twice. All 375 static checks green.

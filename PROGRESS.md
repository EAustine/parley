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

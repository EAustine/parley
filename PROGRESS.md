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

5. **`defaultTheme="dark"` with `enableSystem`.** `CLAUDE.md` says set
   `defaultTheme="dark"`; `PRD.md` §4.2 says the dashboard follows system theme.
   Both are satisfied: dark is the default when nothing is stored, and System
   remains selectable. Flagging the tension rather than silently picking.

6. **The server renders `class="dark"` on `<html>`.** next-themes' pre-paint
   script sits at the top of `<body>`, so with streaming there is a window in
   which the browser could paint the `:root` (light) ground before it runs —
   a white flash for the dark default. Rendering `dark` on the server closes
   that window; the script still corrects it for anyone who chose light.
   `suppressHydrationWarning` covers the class the script rewrites.

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

### Two numbers still stale in the documents

Neither changes any code; noting them so they are not rediscovered later.

- `PRD.md` §4.2 and `CLAUDE.md` state `--state-critical` clears "≥5.16:1 on any
  dark surface". On `--secondary` (`#242830`) it is 4.84:1. Still AA, and
  `--secondary` is a control fill rather than a text surface — but "any dark
  surface" overstates it slightly.
- `CLAUDE.md`'s contrast table omits `--tile-border` against surfaces other than
  `--background`. `/dev/tokens` now shows all of them.

---

## Next: Phase 1 — Data and auth

Schema, RLS, `get_meeting_by_code`, Supabase clients, magic link and Google
OAuth. Requires the LiveKit, Supabase, and Google Cloud accounts from
`BUILD-PLAN.md` § Before you start.

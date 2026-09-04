# Parley — project documents

Everything Claude Code needs. Drop these into the repo root; **the repo is the single copy from here on.**

## Read in this order

| File | What it is |
|---|---|
| **`CLAUDE.md`** | Rules, design tokens, testing rules, accessibility floor. Auto-loaded every session. **Authoritative** — where it and any other document disagree, this one wins. |
| **`BUILD-PLAN-v1.3.md`** | Current work: field-test defects and the interface pass. **Start here.** |
| **`PRD.md`** | The specification. Product decisions and the reasoning behind them. |
| **`BRAND.md`** | Name, logomark, wordmark, assets, voice, product vocabulary. |
| `BUILD-PLAN.md` | The original eleven phases. History. |
| `BUILD-PLAN-v1.2.md` | The first interface pass. History. |
| `ACCOUNTS.md` | LiveKit, Supabase, Google Cloud setup. Done, kept for reference. |

## Folders

**`design/`** — the visual specification for v1.3, as working HTML. Open in a browser; each file has a **Phone** toggle and, where the surface is theme-responsive, a **Theme** toggle.

Every colour is a `var()` copied verbatim from `CLAUDE.md`. **Translate the token names, not the computed values** — `var(--popover)` becomes `bg-popover`, `var(--boundary)` becomes `border-boundary`. Delete the `.demo-nav` block and its script.

- `01-signin-prejoin.html` — landing (signed out / signed in), sign in, pre-join (asking / ready / denied)
- `02-room.html` — grid, panel, watching a share, sharing, host ended it
- `03-dashboard-schedule.html` — meetings, empty, schedule, meeting detail

**`brand/`** — generated assets. `favicon.ico` is multi-resolution with the correct mark variant per slice; `icon.svg` is the self-contained badge for `app/icon.svg`, not `mark.svg`. **Strip C2PA metadata when copying into `app/` and `public/`** — it can be 7.7KB around 410 bytes of artwork, on a file served with every page load.

**`scaffold/`** — `.env.example`, `lib/env.ts`, `check-env.mjs`. Already in the repo; kept for reference.

## Two standing rules

**Never read, `cat`, or print `.env.local`.** Verify with `npm run check:env`, which reports names and pass/fail, never values.

**When a document and the build disagree about a dependency, the build is usually right** and the document is describing a plan reality overtook. Fix the document.

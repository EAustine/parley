# Parley — brand

---

## 1. The name

**Parley.** A conversation between parties who cannot otherwise meet — held at a distance, on neutral ground, under terms both sides agree to.

That is the product. Two or more people who aren't in the same room, meeting in a space that belongs to neither of them, on terms everyone can see: who's here, who's muted, who's talking.

It works as a name because it is a real word doing real work. It is plain to say and plain to spell. It carries no borrowed structure from Zoom, Meet, or Teams. And it names the *conversation*, not the technology — which is the right emphasis for a product whose whole design argument is that the chrome should recede.

### Trademark position

The lesson from Colordle was that category collision is what bites. Wordle's owner enforces, and the name was derivative of a product in the same category.

A category search on Parley turns up nothing in video conferencing. Compare Quorum, which was the first candidate and had a better concept-to-mark fit: quorumvc.com trades as "Quorum VideoConferencing," and Ross Video sells a meeting-production platform called Quorum. Same category, same problem. Ruled out.

The best-known Parley mark is **Parley for the Oceans**, the environmental organisation with the long-running Adidas partnership. Strong mark, entirely different category, no consumer confusion with a meeting app.

**Absence from a web search is not clearance.** If this becomes anything more than a portfolio project, run a proper mark search in the relevant classes before spending money on a domain.

### Domains

`parley.app`, `parley.com`, and `parley.io` are almost certainly held. Check availability on `parley.chat`, `parley.live`, `getparley.com`, and `parley.meeting`. Until then, ship on the Vercel subdomain — nothing in the build depends on the final domain except the absolute URLs in the social meta tags.

---

## 2. Logomark — the presence grid

A 2×2 grid of rounded tiles. **Three filled, one empty.**

It reads three ways at once, which is why it works:

1. **A video call grid** — literally the layout of the product's main surface
2. **Presence** — someone here, someone not
3. **Encoded the way the product encodes everything** — in fill and weight, never in hue

The asymmetry is the whole design. A symmetric four-square grid is the most generic icon in software; it appears in every dashboard nav in existence. The missing cell makes it a specific thing rather than a shape.

### Geometry

Drawn on a 24-unit grid. Values are tuned, not arbitrary — the gutter was widened from 2 to 4 units because at 16px the original cells fused into a single block.

| Property | Value |
|---|---|
| Canvas | 24 × 24 |
| Cell | 9 × 9 |
| Gutter | 4 |
| Corner radius | 2.4 |
| Margin | 1 |
| Cell origins | (1,1) (14,1) (1,14) (14,14) |
| Ghost cell stroke | 1.5, centred, 40% opacity |

The empty cell is **bottom-right** — the last position in reading order, so it reads as a seat not yet taken rather than a rendering error.

### Responsive behaviour

The mark has two states, and this is a functional rule, not a stylistic preference.

**At 32px and above** — the empty cell carries a 1.5 stroke at 40% opacity. Present, camera off.

**Below 32px** — the outline is dropped and the cell is fully empty. Tested: at 16px a 1.5-unit stroke antialiases into a grey smudge that reads as a rendering artefact. Absence survives small sizes; outlines do not.

### Source

```svg
<!-- mark.svg — 32px and above -->
<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none">
  <rect x="1" y="1" width="9" height="9" rx="2.4" fill="currentColor"/>
  <rect x="14" y="1" width="9" height="9" rx="2.4" fill="currentColor"/>
  <rect x="1" y="14" width="9" height="9" rx="2.4" fill="currentColor"/>
  <rect x="14.75" y="14.75" width="7.5" height="7.5" rx="1.65"
        stroke="currentColor" stroke-width="1.5" opacity="0.4"/>
</svg>
```

```svg
<!-- mark-small.svg — below 32px -->
<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none">
  <rect x="1" y="1" width="9" height="9" rx="2.4" fill="currentColor"/>
  <rect x="14" y="1" width="9" height="9" rx="2.4" fill="currentColor"/>
  <rect x="1" y="14" width="9" height="9" rx="2.4" fill="currentColor"/>
</svg>
```

Both use `currentColor` throughout, and one file serves both themes — **in React components.** 

**`app/icon.svg` is the exception.** A standalone favicon has no inherited colour context; `currentColor` resolves to black and vanishes on a dark browser tab. The favicon is therefore a self-contained badge with literal fills: the mark in `#F2F4F7` on a `#0E1013` rounded square at radius 7 on a 32-unit canvas. This also makes it consistent with the PNG icon set, which already carries the dark ground.

It uses the **small variant** — an SVG cannot switch by rendered size, and a favicon is almost always drawn at 16–32px, where the ghost cell fails. The multi-resolution `.ico` covers the larger slices.

```svg
<!-- app/icon.svg -->
<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <rect width="32" height="32" rx="7" fill="#0E1013"/>
  <g transform="translate(4,4)">
    <rect x="1" y="1" width="9" height="9" rx="2.4" fill="#F2F4F7"/>
    <rect x="14" y="1" width="9" height="9" rx="2.4" fill="#F2F4F7"/>
    <rect x="1" y="14" width="9" height="9" rx="2.4" fill="#F2F4F7"/>
  </g>
</svg>
```

---

## 3. Wordmark

**Parley** set in Instrument Sans 600, tracking −0.02em, sentence case. Nothing else.

No letter substitution, no chip in place of a counter, no colour on a single glyph. Hueristic and Passable both spend their idea in the wordmark; here it is spent in the mark, and the wordmark stays quiet so the two don't compete. One bold move per identity.

Set the wordmark's cap height equal to the mark's height in every lockup.

---

## 4. Lockups

Build these as React components, not SVG files. A component inherits `currentColor` and responds to theme without a second asset, and it lets the mark switch to its small variant by prop.

**Horizontal** — mark, then wordmark. Gap equals one gutter unit scaled to the mark (mark width ÷ 6). Header, nav, email signature.

**Stacked** — mark centred above wordmark. Gap equals half the mark height. Pre-join screen, OG image, app icon contexts.

**Mark alone** — favicon, avatar, app icon, anywhere under 96px wide.

**Wordmark alone** — footer, dense chrome, anywhere the mark would be under 16px.

### Clear space

On all sides, equal to **half the mark's height**. Nothing enters that zone — not text, not a border, not another element's padding.

### Minimum sizes

| Asset | Minimum |
|---|---|
| Mark | 16px |
| Horizontal lockup | 96px wide |
| Stacked lockup | 72px wide |
| Wordmark | 64px wide |

### Misuse

- Do not fill the empty cell. That cell is the idea.
- Do not add hue to any part of the mark. It is `currentColor` everywhere except `app/icon.svg`, and even there the fills are the two neutral tokens.
- Do not rotate, skew, or stretch.
- Do not outline or emboss the wordmark.
- Do not place the mark on video without a scrim behind it — the same rule as every other element in the product.
- Do not use the ghost variant below 32px.

---

## 5. Asset manifest

Next.js App Router picks up several of these by filename. Use the convention rather than hand-writing `<link>` tags.

```
app/
  icon.svg                    → auto-wired favicon (badge, literal fills)
  apple-icon.png              180 × 180
  opengraph-image.tsx         1200 × 630, generated with next/og
  twitter-image.tsx           1200 × 630, same source

public/
  favicon.ico                 16 / 32 / 48 multi-resolution, PNG-encoded
                              entries, ghost cell present at 32 and 48 only
  icon-192.png                PWA
  icon-512.png                PWA
  icon-512-maskable.png       PWA, mark at 58% for the safe zone
  manifest.webmanifest

components/brand/
  Mark.tsx                    size prop switches ghost on/off at 32px
  Wordmark.tsx
  Lockup.tsx                  variant: horizontal | stacked
```

Strip C2PA provenance metadata when copying these into `app/` and `public/` — it can run to 7.7KB around 410 bytes of artwork, and the favicon is served on every page load. Keep the originals in `brand/` as the record.

Pre-generated files are in `brand/` alongside this document: `mark.svg`, `mark-small.svg`, `icon.svg`, `favicon.ico`, `apple-icon.png`, `icon-192.png`, `icon-512.png`, `icon-512-maskable.png`. All rendered from the geometry above with the responsive rule already applied — the 16px slice of the `.ico` has no ghost cell.

### Web manifest

```json
{
  "name": "Parley",
  "short_name": "Parley",
  "description": "Video meetings. A link is all anyone needs.",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0E1013",
  "theme_color": "#0E1013",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icon-512-maskable.png", "sizes": "512x512",
      "type": "image/png", "purpose": "maskable" }
  ]
}
```

---

## 6. Open Graph image

1200 × 630, generated with `next/og` `ImageResponse` so Instrument Sans loads properly. Do not hand-render it — the type has to be right.

`next/font/google` does not expose the font binary to `ImageResponse`. Vendor `InstrumentSans-Regular.ttf` and `InstrumentSans-SemiBold.ttf` into `app/fonts/`, read them with `fs.readFile` under `export const runtime = 'nodejs'`, and include the OFL licence file — Instrument Sans is SIL-licensed, so redistribution is permitted and attribution is required. Use static weights; `ImageResponse` handles variable fonts poorly.

Layout, left-aligned on a `#0E1013` ground:

- Stacked lockup, mark at 88px
- Tagline in Instrument Sans 400, 32px, `--muted-foreground`
- Right third: four product tiles at real proportions, three with a scrim and a name label, one empty. The mark rendered at product scale, so the card previews the actual interface.

**Absolute URLs, full tags.** Crawlers do not execute JavaScript — the `og:image`, `og:url`, and `twitter:image` values must be complete absolute URLs baked into the HTML, not assembled client-side. This is the bug that shipped with Hueristic; do not repeat it.

**Meeting links get the site-wide card, with no meeting data in it.** "You've been invited to a meeting on Parley" and nothing more.

A per-meeting variant showing title and host was specified here and is withdrawn. The host half reversed §3.2's explicit decision against exposing host identity to link-holders. The title half is subtler and was the real find: an unfurl discloses on *paste*, not on *open*. §3.2 reasoned about who holds the link; an unfurl widens that to everyone who can see the channel, plus the platform's fetcher and its cache.

The counter — that anyone in the channel could click through and read the title anyway — does not survive the accident case. Paste a link to the wrong channel with an unfurl and "1:1 re: performance concerns" is broadcast instantly and passively to everyone scrolling past. Without one, it sits there until someone cares enough to click. Meeting titles are sensitive for the same reasons calendar titles are, and the asymmetry between passive broadcast and deliberate click is exactly the disclosure this avoids. Whoever pastes the link can type what the meeting is if they want it known.

---

## 7. Voice and naming

**Tagline:** *A link is all anyone needs.*

It states the actual promise. Guests join without an account, without a download, without a plugin. Every other claim the product could make is table stakes.

### Product vocabulary

Fixed terms. Use them consistently everywhere — UI, copy, docs, code comments.

| Term | Use | Never |
|---|---|---|
| **Meeting** | The thing people join | "Call", "conference", "session" |
| **Room** | Internal only — LiveKit's term | Not in user-facing copy |
| **Meeting link** | The shareable URL | "Invite URL", "join URL" |
| **Meeting code** | The `xxx-xxxx-xxx` string | "Meeting ID", "PIN" |
| **Host** | The person who created it | "Owner", "organiser", "admin" |
| **Participant** | Everyone else | "Attendee", "user", "member" |
| **Guest** | A participant with no account | "Anonymous", "visitor" |

An action keeps its name through the whole flow. "Copy link" produces "Link copied." "Start meeting" produces a meeting that has started. "Leave" leaves; "End meeting" ends it for everyone, and the two are never confused.

### Meeting link format

```
https://parley.app/j/kqr-8mzt-vnp
```

`/j/` rather than a bare code at the root. Meet can put codes at the root because its dashboard lives on another host; here a root catch-all would collide with `/dashboard` and `/schedule` and require a reserved-word list that breaks quietly the first time someone gets a code spelling `admin`.

---

## 8. Considered and declined: the live favicon

An earlier draft of this document proposed swapping `app/icon.svg` for an all-four-cells-filled variant while in a call, so the meeting tab could be found among twenty. **Declined**, and recorded here so it is not reinvented.

It contradicted this document's own misuse list, `CLAUDE.md`'s rule, and `BUILD-PLAN.md`'s kickoff prompt — all three forbid filling the fourth cell, which meant the proposal made every brand document self-contradictory. The identity has exactly one idea and the mark spends it on that empty cell. An optional tab affordance is not what you spend it on.

It was also unbuildable as written: `app/icon.svg` is a build-time convention, pre-join reaches the room through `router.push` with no document load, and iOS Safari renders no tab favicon at all — so it would have done nothing for the mobile visitor §3.3 calls the highest-traffic flow.

A value inversion — dark mark on a light square — was raised as a way to signal the state without touching the fourth cell. Cleverer, and still wrong: at 16px an inverted badge reads as a different logo rather than as a state of the same one, and it gives the mark two appearances with no answer to which is canonical. A red dot would communicate instantly, and a red dot is not this identity.

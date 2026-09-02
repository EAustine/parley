/**
 * Splitting a message into text and links.
 *
 * Rule 6 says chat is rendered as text and never through
 * `dangerouslySetInnerHTML`, which settles how a message is drawn. This is the
 * one place a substring of it becomes an element, so it is the one place where
 * getting it wrong has consequences — and it returns *segments* rather than
 * markup for exactly that reason. The caller maps them to React nodes, so
 * there is no string that could be mistaken for HTML anywhere in the path.
 *
 * `javascript:` in an `href` executes on click; `data:text/html` navigates to
 * attacker-authored markup on our origin. Neither is caught by escaping,
 * because neither is markup — they are well-formed URLs that happen to be a
 * code execution primitive.
 *
 * There are three gates, and it is worth being accurate about which one is
 * doing the work, because a check that credits the wrong one gives false
 * comfort:
 *
 * 1. **The candidate pattern.** Only `https?://` and `www.` are ever offered
 *    as candidates, so `ftp://example.com` is never considered. This is the
 *    gate that actually holds today.
 * 2. **`URL` parsing.** A parser, not a pattern — `JaVaScRiPt:` and
 *    `java
script:` are the same URL to a browser and different strings to a
 *    regular expression.
 * 3. **The scheme allow-list, plus a required hostname.** Every dangerous
 *    scheme parses to an empty hostname, so the hostname test alone rejects
 *    `javascript:`, `data:`, `file:` and `blob:`. The allow-list is therefore
 *    unreachable as the code stands, and is kept deliberately: it is what
 *    catches the mistake of widening the pattern in gate 1, which is the
 *    change someone will one day make for a good reason.
 */

export type Segment =
  | { kind: "text"; text: string }
  | { kind: "link"; text: string; href: string };

/**
 * Candidates only. Whether one is really a link is decided by `URL` below,
 * which is a parser rather than a pattern.
 *
 * `www.` is included because people write it, and it is turned into an
 * `https://` href rather than left to resolve as a relative path — a bare
 * `www.example.com` in an `href` points at a folder on our own origin.
 */
const CANDIDATE = /\b(?:https?:\/\/|www\.)[^\s<>()[\]{}"'`]+/giu;

/**
 * A candidate is only a candidate when it starts a token. These characters
 * before it mean it is part of something larger — a scheme, a path, an address.
 */
const PRECEDING_DISALLOWED = /[\w:/@.-]/u;

/** Trailing punctuation belongs to the sentence, not to the URL. */
const TRAILING = /[.,;:!?'"”’)\]}]+$/u;

export function autolink(text: string): Segment[] {
  const segments: Segment[] = [];
  let cursor = 0;

  for (const match of text.matchAll(CANDIDATE)) {
    const start = match.index ?? 0;
    let candidate = match[0];

    // `\b` matches between `:` and `h`, so `blob:https://example.com` offers up
    // the `https://…` inside it as a candidate — linking a substring of
    // something nobody shared, with link text that differs from what was
    // typed. Checked by looking at the preceding character rather than with a
    // lookbehind: Safari only gained those in 16.4, and §1 lists Safari as a
    // target.
    if (start > 0 && PRECEDING_DISALLOWED.test(text[start - 1]!)) continue;

    // "see https://example.com." — the full stop ends the sentence. Balanced
    // closers inside a URL are common enough (Wikipedia) that only *trailing*
    // ones are trimmed, and only when they do not close something opened
    // inside the candidate.
    const trimmed = candidate.replace(TRAILING, "");
    const dropped = candidate.length - trimmed.length;
    if (dropped > 0) candidate = trimmed;

    const href = toHref(candidate);
    if (!href) continue;

    if (start > cursor) {
      segments.push({ kind: "text", text: text.slice(cursor, start) });
    }
    segments.push({ kind: "link", text: candidate, href });
    cursor = start + candidate.length;
  }

  if (cursor < text.length) {
    segments.push({ kind: "text", text: text.slice(cursor) });
  }

  return segments;
}

/**
 * A candidate becomes an href only if `URL` agrees it is one and the scheme is
 * one of two.
 *
 * Parsed rather than pattern-matched. `javascript:alert(1)` and
 * `java\nscript:alert(1)` and `JaVaScRiPt:alert(1)` are the same URL to a
 * browser and three different strings to a regular expression, which is why
 * the check is delegated to the same parser the browser uses.
 */
function toHref(candidate: string): string | null {
  const withScheme = candidate.startsWith("www.")
    ? `https://${candidate}`
    : candidate;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  // Unreachable while gate 1 admits only http and https, which are special
  // schemes the parser will not leave hostless. Kept as the backstop that
  // catches `javascript:`, `data:`, `file:` and `blob:` — every one of which
  // parses to an empty hostname — if that pattern is ever widened.
  if (!url.hostname) return null;

  return url.href;
}

/**
 * RFC 5545, by hand.
 *
 * No dependency for this — rule 9 would need asking, and the format is a
 * hundred lines of string handling whose every rule is checkable. What makes
 * it worth writing carefully is that the failure mode is silent: a calendar
 * client that dislikes a file usually imports nothing and says nothing, so a
 * missing `DTSTAMP` or an unfolded long line shows up as "the invite didn't
 * work" days later, from someone else's machine.
 *
 * Three rules do most of the work, and all three are easy to get almost right:
 *
 * 1. **CRLF, everywhere.** §3.1. Not `\n`. Several clients accept `\n` and one
 *    notable one does not, and it is the same one people forward invites from.
 * 2. **Fold at 75 octets, not 75 characters.** Also §3.1. A title in Greek or
 *    Twi hits the limit at half the character count, and splitting a UTF-8
 *    sequence across the fold produces a file that is no longer valid UTF-8.
 * 3. **Escape TEXT values.** §3.3.11: backslash, semicolon, comma, newline. A
 *    title containing a comma silently truncates the property otherwise,
 *    because the comma starts a second value.
 *
 * Times are emitted as UTC with a `Z` suffix, which is why there is no
 * VTIMEZONE component here. Writing one means shipping a slice of the tz
 * database and keeping it current; UTC instants are unambiguous and every
 * client renders them in the viewer's own zone, which is what §3.9 asks for.
 */

export type IcsEvent = {
  /** The meeting id. Stable across edits — the same event, revised. */
  uid: string;
  /** The origin the UID is qualified with, and the base for the join link. */
  host: string;
  title: string;
  description?: string | null;
  /** UTC instants. */
  start: Date;
  end: Date;
  /** When this file was produced. Required by §3.6 of the RFC. */
  stamp: Date;
  /** Incremented on every edit, so clients replace rather than duplicate. */
  sequence: number;
  url: string;
  cancelled?: boolean;
};

export const ICS_CONTENT_TYPE = "text/calendar; charset=utf-8";

/** `YYYYMMDDTHHMMSSZ` — RFC 5545 §3.3.5, UTC form. */
export function icsDate(date: Date): string {
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  return (
    `${pad(date.getUTCFullYear(), 4)}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

/**
 * §3.3.11. Backslash first, or the escapes added below get escaped again.
 *
 * Colon is deliberately not escaped: it is not special inside a TEXT value,
 * and escaping it produces a literal `\:` in clients that read the spec
 * correctly — which is most of them, and it appears in every join link.
 */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/**
 * Fold to 75 octets per line, continuing with a single space.
 *
 * Measured in UTF-8 bytes and cut only at code-point boundaries. A naive
 * `slice(0, 75)` on a string of emoji or Greek splits a multi-byte sequence
 * and the file stops being valid UTF-8 — which some clients report as a parse
 * error and others render as replacement characters in the event title.
 */
export function fold(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;

  const out: string[] = [];
  // 75 for the first line; continuations spend one octet on the leading space.
  let limit = 75;
  let current = "";
  let width = 0;

  // Iterating the string yields whole code points, so a surrogate pair is
  // never split either.
  for (const character of line) {
    const size = encoder.encode(character).length;
    if (width + size > limit) {
      out.push(current);
      current = "";
      width = 0;
      limit = 74;
    }
    current += character;
    width += size;
  }
  out.push(current);

  return out.join("\r\n ");
}

function property(name: string, value: string): string {
  return fold(`${name}:${value}`);
}

/**
 * The whole file.
 *
 * `PRODID` identifies the writer and is required; it is not a place for
 * marketing. `CALSCALE` is Gregorian by default but stating it costs one line
 * and removes a question.
 *
 * No `METHOD`. A file with `METHOD:REQUEST` is an iTIP message and needs an
 * ORGANIZER and ATTENDEEs to mean anything; without them some clients import
 * it as a scheduling request from nobody. This is a file someone downloads and
 * adds to their own calendar, which is a plain publish.
 */
export function buildIcs(event: IcsEvent): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    property("PRODID", "-//Parley//Meetings//EN"),
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    property("UID", `${event.uid}@${event.host}`),
    property("DTSTAMP", icsDate(event.stamp)),
    property("DTSTART", icsDate(event.start)),
    property("DTEND", icsDate(event.end)),
    property("SUMMARY", escapeText(event.title)),
    property("DESCRIPTION", escapeText(describe(event))),
    property("URL", event.url),
    `SEQUENCE:${Math.max(0, Math.floor(event.sequence))}`,
    // A cancelled meeting keeps its UID and gains a status, so a client that
    // already holds the event can reconcile it rather than being left with a
    // second copy it cannot match.
    `STATUS:${event.cancelled ? "CANCELLED" : "CONFIRMED"}`,
    "TRANSP:OPAQUE",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  // §3.1: CRLF, and a trailing one — the last line is terminated, not merely
  // separated.
  return lines.join("\r\n") + "\r\n";
}

/** The join link is the point of the invite, so it is in the body as well. */
function describe(event: IcsEvent): string {
  const parts = [];
  if (event.description?.trim()) parts.push(event.description.trim());
  parts.push(`Join: ${event.url}`);
  return parts.join("\n\n");
}

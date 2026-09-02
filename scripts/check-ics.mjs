#!/usr/bin/env node
/**
 * Scheduling, where it is arithmetic and where it is a file format.
 *
 * §3.9 says timezones are "the one place where a quiet bug produces a missed
 * meeting", and calendar files fail the same way: a client that dislikes a
 * file usually imports nothing and says nothing, so a missing DTSTAMP shows up
 * days later as "the invite didn't work" from someone else's machine.
 *
 * BUILD-PLAN asks for the `.ics` to be imported into three real calendars and
 * for a real timezone change; both still need a human, and both are recorded
 * as such. What is checked here is everything underneath them — the format's
 * own rules, and the conversions that decide which moment the file describes.
 *
 * Run with: npm run check:ics
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = mkdtempSync(join(tmpdir(), "parley-ics-"));
try {
  execFileSync(
    "npx",
    ["tsc", "lib/meetings/ics.ts", "lib/meetings/calendar-links.ts",
     "--outDir", out, "--module", "commonjs",
     "--target", "es2022", "--moduleResolution", "node", "--skipLibCheck"],
    { stdio: "pipe" },
  );
} catch (e) {
  console.error("Could not compile the calendar modules:\n" + e.stdout?.toString());
  process.exit(1);
}
writeFileSync(join(out, "package.json"), '{"type":"commonjs"}');
const require = createRequire(join(out, "index.cjs"));
const { buildIcs, icsDate, escapeText, fold } = require(join(out, "ics.js"));
const { googleCalendarUrl, outlookCalendarUrl } = require(join(out, "calendar-links.js"));
rmSync(out, { recursive: true, force: true });

// date-fns-tz runs from node_modules directly; no compile step needed.
const { fromZonedTime, formatInTimeZone } = await import("date-fns-tz");

let failed = 0;
const check = (pass, label, detail = "") => {
  if (!pass) failed++;
  console.log(`${pass ? "✔" : "✘"} ${label}${pass ? "" : `  — ${detail}`}`);
};
let count = 0;
const t = (pass, label, detail) => { count++; check(pass, label, detail); };

const event = (over = {}) => ({
  uid: "8f1c2d3e-0000-4000-8000-000000000001",
  host: "parley.app",
  title: "Design review",
  description: "Bring the numbers.",
  start: new Date("2026-09-15T14:30:00Z"),
  end: new Date("2026-09-15T15:30:00Z"),
  stamp: new Date("2026-09-02T09:00:00Z"),
  sequence: 0,
  url: "https://parley.app/j/wcz-4npm-hjd",
  ...over,
});

// ---------------------------------------------------------------------------
// RFC 5545
// ---------------------------------------------------------------------------
console.log("The calendar file\n");

const file = buildIcs(event());
const lines = file.split("\r\n");

// §3.1. Not \n — several clients accept it and one notable one does not.
t(!/(^|[^\r])\n/.test(file), "every line ends CRLF, with no bare newline");
t(file.endsWith("\r\n"), "and the last line is terminated, not merely separated");

for (const required of [
  "BEGIN:VCALENDAR", "VERSION:2.0", "CALSCALE:GREGORIAN",
  "BEGIN:VEVENT", "END:VEVENT", "END:VCALENDAR",
]) {
  t(lines.includes(required), `contains ${required}`);
}
t(lines.some((l) => l.startsWith("PRODID:")), "identifies its producer");

// The four properties a VEVENT cannot be valid without.
for (const property of ["UID", "DTSTAMP", "DTSTART", "DTEND"]) {
  t(lines.some((l) => l.startsWith(`${property}:`)), `VEVENT carries ${property}`);
}
t(lines.includes("UID:8f1c2d3e-0000-4000-8000-000000000001@parley.app"),
  "the UID is the meeting id, qualified by host",
  lines.find((l) => l.startsWith("UID:")));

t(lines.includes("DTSTART:20260915T143000Z"), "DTSTART is compact UTC with a Z",
  lines.find((l) => l.startsWith("DTSTART:")));
t(icsDate(new Date("2026-01-05T04:07:09Z")) === "20260105T040709Z",
  "single-digit parts are zero-padded", icsDate(new Date("2026-01-05T04:07:09Z")));

t(lines.includes("URL:https://parley.app/j/wcz-4npm-hjd"),
  "the join link is a URL property, with its colons unescaped",
  lines.find((l) => l.startsWith("URL:")));
t(file.includes("Join: https://parley.app/j/wcz-4npm-hjd"),
  "and appears in the description, which is what most clients show");

// §3.9: "Editing regenerates the .ics with an incremented SEQUENCE."
t(lines.includes("SEQUENCE:0"), "a new meeting is SEQUENCE:0");
t(buildIcs(event({ sequence: 3 })).includes("SEQUENCE:3"), "an edited one carries its revision");
t(buildIcs(event()).includes("STATUS:CONFIRMED"), "a live meeting is CONFIRMED");
t(buildIcs(event({ cancelled: true })).includes("STATUS:CANCELLED"),
  "a cancelled one keeps its UID and changes status, so clients can reconcile");

console.log("\nEscaping and folding\n");

// §3.3.11. A comma starts a second value, so an unescaped one truncates the
// property — silently, and only for titles that happen to contain one.
t(escapeText("Q4, final") === "Q4\\, final", "commas are escaped", escapeText("Q4, final"));
t(escapeText("a;b") === "a\\;b", "semicolons are escaped", escapeText("a;b"));
t(escapeText("a\\b") === "a\\\\b", "backslashes are escaped first, not twice",
  escapeText("a\\b"));
t(escapeText("one\ntwo") === "one\\ntwo", "newlines become \\n");
t(escapeText("14:30") === "14:30",
  "colons are left alone — escaping them puts a literal backslash in every link",
  escapeText("14:30"));
{
  const withComma = buildIcs(event({ title: "Q4 review, final" }));
  t(withComma.includes("SUMMARY:Q4 review\\, final"),
    "and a title with a comma survives into SUMMARY intact");
}

// §3.1: 75 *octets*, not characters.
{
  const long = "x".repeat(200);
  const folded = fold(`SUMMARY:${long}`);
  const parts = folded.split("\r\n");
  t(parts.length > 1, "a long line is folded");
  t(parts.every((p, i) => Buffer.byteLength(i === 0 ? p : p) <= 75),
    "every folded line is within 75 octets",
    parts.map((p) => Buffer.byteLength(p)).join(","));
  t(parts.slice(1).every((p) => p.startsWith(" ")),
    "continuations begin with a single space");
  t(parts.join("").replace(/\r\n /g, "") === `SUMMARY:${long}`.replace(/\r\n /g, "") ||
    parts[0] + parts.slice(1).map((p) => p.slice(1)).join("") === `SUMMARY:${long}`,
    "and unfolding reproduces the original exactly");
}
{
  // Multi-byte text is where a character-counting fold breaks: it splits a
  // UTF-8 sequence and the file stops being valid UTF-8.
  const greek = "Σύσκεψη ".repeat(20);
  const folded = fold(`SUMMARY:${greek}`);
  const parts = folded.split("\r\n");
  t(parts.every((p) => Buffer.byteLength(p) <= 75),
    "a multi-byte title folds by octet, not by character",
    parts.map((p) => Buffer.byteLength(p)).join(","));
  const rejoined = parts[0] + parts.slice(1).map((p) => p.slice(1)).join("");
  t(rejoined === `SUMMARY:${greek}`, "and no code point is split across the fold");
  t(!folded.includes("�"), "no replacement characters appear");
}
{
  const emoji = "🎉".repeat(40);
  const parts = fold(`SUMMARY:${emoji}`).split("\r\n");
  const rejoined = parts[0] + parts.slice(1).map((p) => p.slice(1)).join("");
  t(rejoined === `SUMMARY:${emoji}`, "and a surrogate pair is never split either");
}
t(fold("SUMMARY:short") === "SUMMARY:short", "a short line is left alone");

// The whole file, line by line, after folding.
t(buildIcs(event({ title: "Σύσκεψη ".repeat(20) }))
    .split("\r\n")
    .every((l) => Buffer.byteLength(l) <= 75),
  "no line in a produced file exceeds 75 octets");

// ---------------------------------------------------------------------------
// §3.9's timezone case, which is the one that produces a missed meeting
// ---------------------------------------------------------------------------
console.log("\nAcross timezones\n");

// "A meeting created in Accra shows the correct local time to a viewer in
// Berlin, with CET printed." Accra is UTC+0 year round; Berlin is +1 in
// winter and +2 in summer.
{
  const instant = fromZonedTime("2026-09-15T14:30:00", "Africa/Accra");
  t(instant.toISOString() === "2026-09-15T14:30:00.000Z",
    "14:30 in Accra is 14:30 UTC", instant.toISOString());
  t(formatInTimeZone(instant, "Europe/Berlin", "HH:mm zzz") === "16:30 GMT+2",
    "and 16:30 in Berlin in September — summer time, +2",
    formatInTimeZone(instant, "Europe/Berlin", "HH:mm zzz"));
}
{
  // The same wall clock in December is a different instant *and* a different
  // Berlin time. Using one offset all year is the bug this catches.
  const instant = fromZonedTime("2026-12-15T14:30:00", "Africa/Accra");
  t(formatInTimeZone(instant, "Europe/Berlin", "HH:mm zzz") === "15:30 GMT+1",
    "the same wall clock in December is 15:30 in Berlin — winter time, +1",
    formatInTimeZone(instant, "Europe/Berlin", "HH:mm zzz"));
}
{
  // A zone that observes DST, scheduling across its own transition. Berlin
  // springs forward at 02:00 on 29 March 2026.
  const before = fromZonedTime("2026-03-29T01:30:00", "Europe/Berlin");
  const after = fromZonedTime("2026-03-29T03:30:00", "Europe/Berlin");
  t(before.toISOString() === "2026-03-29T00:30:00.000Z",
    "01:30 Berlin on the spring-forward day is 00:30 UTC", before.toISOString());
  t(after.toISOString() === "2026-03-29T01:30:00.000Z",
    "03:30 the same morning is 01:30 UTC — one hour later, not two",
    after.toISOString());
  t(after.getTime() - before.getTime() === 60 * 60_000,
    "so the two are an hour apart on the clock and an hour apart in fact",
    `${(after.getTime() - before.getTime()) / 60000} minutes`);
}
{
  // 02:30 does not exist that morning. Measured rather than assumed: it
  // resolves *backward*, to 01:30 local — an hour earlier than what was typed,
  // which is the direction nobody checks. Hence `resolveWallClock`.
  const nonexistent = fromZonedTime("2026-03-29T02:30:00", "Europe/Berlin");
  t(nonexistent.toISOString() === "2026-03-29T00:30:00.000Z",
    "a wall-clock time that never happens resolves backward, not forward",
    nonexistent.toISOString());
  t(formatInTimeZone(nonexistent, "Europe/Berlin", "HH:mm") === "01:30",
    "landing an hour earlier than asked for, silently",
    formatInTimeZone(nonexistent, "Europe/Berlin", "HH:mm"));

  const back = formatInTimeZone(nonexistent, "Europe/Berlin", "yyyy-MM-dd HH:mm");
  t(back !== "2026-03-29 02:30",
    "so a round trip through the same zone detects it — which is what the form does");
}
{
  // Autumn needs no warning: when the clocks go back, 02:30 happens twice,
  // both are real, and the round trip is exact.
  const ambiguous = fromZonedTime("2026-10-25T02:30:00", "Europe/Berlin");
  t(formatInTimeZone(ambiguous, "Europe/Berlin", "HH:mm") === "02:30",
    "the ambiguous autumn hour round-trips exactly, so nothing is flagged",
    formatInTimeZone(ambiguous, "Europe/Berlin", "HH:mm"));
}
{
  // A half-hour zone, because a bug that assumes whole hours passes everywhere
  // else. Kolkata is +05:30.
  const instant = fromZonedTime("2026-09-15T14:30:00", "Asia/Kolkata");
  t(instant.toISOString() === "2026-09-15T09:00:00.000Z",
    "14:30 in Kolkata is 09:00 UTC — a half-hour offset", instant.toISOString());
}
{
  // The file describes the instant, not the wall clock, so two people in
  // different zones scheduling "their" 14:30 produce different files.
  const accra = buildIcs(event({ start: fromZonedTime("2026-09-15T14:30:00", "Africa/Accra"),
                                 end: fromZonedTime("2026-09-15T15:30:00", "Africa/Accra") }));
  const berlin = buildIcs(event({ start: fromZonedTime("2026-09-15T14:30:00", "Europe/Berlin"),
                                  end: fromZonedTime("2026-09-15T15:30:00", "Europe/Berlin") }));
  t(accra.includes("DTSTART:20260915T143000Z"), "an Accra 14:30 writes 14:30Z");
  t(berlin.includes("DTSTART:20260915T123000Z"),
    "a Berlin 14:30 in September writes 12:30Z",
    berlin.split("\r\n").find((l) => l.startsWith("DTSTART:")));
  t(accra !== berlin, "so the same wall clock in two zones is two different files");
}

// ---------------------------------------------------------------------------
// The two prefill links — §3.9's alternative to a week of OAuth
// ---------------------------------------------------------------------------
console.log("\nPrefill links\n");

// Both are undocumented query-string conventions rather than APIs, which is
// why they are pinned here: nothing else would notice if one changed.
const sample = {
  title: "Quarterly planning, with numbers",
  description: "Bring the Q3 figures.",
  start: new Date("2026-09-15T12:30:00Z"),
  end: new Date("2026-09-15T13:00:00Z"),
  url: "https://parley.app/j/wcz-4npm-hjd",
};

{
  const google = new URL(googleCalendarUrl(sample));
  t(google.origin + google.pathname === "https://calendar.google.com/calendar/render",
    "Google points at the render endpoint", google.origin + google.pathname);
  t(google.searchParams.get("action") === "TEMPLATE", "with action=TEMPLATE");
  // The compact RFC 5545 form, not ISO. Google accepts an ISO string and
  // silently opens the composer with the time blank, which is the worst
  // possible response to a wrong value.
  t(google.searchParams.get("dates") === "20260915T123000Z/20260915T130000Z",
    "and dates in the compact UTC form, start/end",
    google.searchParams.get("dates"));
  t(google.searchParams.get("text") === sample.title,
    "the title travels unmangled, comma and all",
    google.searchParams.get("text"));
  t((google.searchParams.get("details") ?? "").includes(sample.url),
    "and the join link is in the details");
}

{
  const outlook = new URL(outlookCalendarUrl(sample));
  t(outlook.origin + outlook.pathname ===
      "https://outlook.live.com/calendar/0/deeplink/compose",
    "Outlook points at the compose deep link", outlook.origin + outlook.pathname);
  // Both are required. Without rru=addevent the link opens an empty composer.
  t(outlook.searchParams.get("path") === "/calendar/action/compose", "with its path");
  t(outlook.searchParams.get("rru") === "addevent", "and rru=addevent");
  // ISO here, where Google wants compact — the same moment written two ways,
  // which is exactly the detail that stays wrong until someone in another
  // timezone notices.
  t(outlook.searchParams.get("startdt") === "2026-09-15T12:30:00.000Z",
    "and ISO 8601 timestamps, not the compact form",
    outlook.searchParams.get("startdt"));
  t(outlook.searchParams.get("subject") === sample.title, "the title is the subject");
}

{
  // Encoding, which is what `URL` is doing here rather than string
  // concatenation: a title with an ampersand would otherwise truncate the
  // query and drop every parameter after it.
  const tricky = { ...sample, title: "Q4 & Q1: plans, part 2" };
  const google = new URL(googleCalendarUrl(tricky));
  t(google.searchParams.get("text") === tricky.title,
    "an ampersand in the title survives, rather than truncating the query",
    google.searchParams.get("text"));
  const outlook = new URL(outlookCalendarUrl(tricky));
  t(outlook.searchParams.get("subject") === tricky.title,
    "and the same on the Outlook link");
}

// §3.9: "Always print the zone label next to a time." Checked across zones
// that label themselves differently, because a formatter that drops the label
// produces a number that looks perfectly reasonable and cannot be checked.
console.log("\nZone labels\n");
for (const [zone, expected] of [
  ["Africa/Accra", "GMT"],
  ["Europe/Berlin", "GMT+2"],
  ["America/Los_Angeles", "PDT"],
  ["Asia/Kolkata", "GMT+5:30"],
]) {
  const rendered = formatInTimeZone(
    new Date("2026-09-15T14:30:00Z"), zone, "HH:mm zzz",
  );
  t(rendered.endsWith(expected), `${zone.padEnd(20)} → ${rendered}`, `expected …${expected}`);
}
// Named abbreviations where a zone has one, offsets where it does not. Worth
// pinning: an assertion written against one spelling fails in half the world.
t(formatInTimeZone(new Date("2026-09-15T14:30:00Z"), "America/Los_Angeles", "zzz") === "PDT",
  "a zone with a common abbreviation uses it rather than an offset");

console.log(`\n${count - failed}/${count} calendar checks passed.`);
if (failed) process.exit(1);

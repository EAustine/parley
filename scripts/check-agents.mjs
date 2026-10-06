#!/usr/bin/env node
/**
 * `AGENTS.md` is `CLAUDE.md` with a different title, and nothing else.
 *
 * Two complete copies of the project rules is a hazard, not a convenience: the
 * copy goes stale silently, and a stale rules file does not merely fall quiet —
 * it instructs the next agent to rebuild whatever the original has since
 * corrected. This is not hypothetical. Within one commit of moving the suite's
 * sign-in out of the worker fixture, `AGENTS.md` was still telling readers that
 * `e2e/fixtures.ts` "signs in once per worker" — the exact design that had just
 * caused four workers to mint four magic links for one address.
 *
 * The duplication is deliberate: `AGENTS.md` is the convention other agents
 * look for, and a harness that reads it verbatim would get nothing from a file
 * that merely points at `CLAUDE.md`. So the copy stays and the build owns it.
 *
 * **It fails rather than warning, and does not regenerate on its own.** A
 * warning printed on every run is furniture within a week — this file says so
 * about dependency checks and the point carries. Silent regeneration is worse
 * than either: it would let an edit to `AGENTS.md` be erased without anyone
 * seeing it, and an edit to `AGENTS.md` is a signal that someone believes the
 * rules live there. The failure names both the line and the command.
 *
 * The derivation is one rule in one place — title line replaced, everything
 * after it identical — so there is nothing here for the two files to disagree
 * about except content.
 *
 * Run with: npm run check:agents
 *     fix:  npm run check:agents -- --write
 */
import { readFileSync, writeFileSync } from "node:fs";

const SOURCE = "CLAUDE.md";
const COPY = "AGENTS.md";
const TITLE = "# AGENTS.md";

/** Trailing newline is a terminator, not a line — both messages must agree. */
const countLines = (text) => text.replace(/\n$/, "").split("\n").length;

function read(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    console.error(`${path} is missing. ${SOURCE} is the source of truth; ${COPY}`);
    console.error(`is derived from it. Regenerate: npm run check:agents -- --write`);
    process.exit(2);
  }
}

const source = read(SOURCE);

/** The whole derivation: the title line, then `CLAUDE.md` unchanged. */
const expected = [TITLE, ...source.split("\n").slice(1)].join("\n");

if (process.argv.includes("--write")) {
  writeFileSync(COPY, expected);
  console.log(`✔ ${COPY} regenerated from ${SOURCE}.`);
  process.exit(0);
}

const actual = read(COPY);

if (actual === expected) {
  const lines = countLines(expected);
  console.log(`✔ ${COPY} matches ${SOURCE} — ${lines} lines, title aside.`);
  process.exit(0);
}

/*
 * Name the first divergence rather than printing a diff. The files are six
 * hundred lines and the useful fact is where they parted, not how far.
 */
const a = actual.split("\n");
const b = expected.split("\n");
let i = 0;
while (i < a.length && i < b.length && a[i] === b[i]) i += 1;

const show = (label, line) =>
  `  ${label.padEnd(9)} ${line === undefined ? "(end of file)" : JSON.stringify(line.slice(0, 90))}`;

console.error(`${COPY} has drifted from ${SOURCE}.`);
console.error();
console.error(`First difference at line ${i + 1}:`);
console.error(show(COPY, a[i]));
console.error(show(SOURCE, b[i]));
console.error();
console.error(`  ${COPY}: ${countLines(actual)} lines    ${SOURCE}: ${countLines(expected)} lines`);
console.error();
console.error(`${SOURCE} is the source of truth. If the change belongs in the rules,`);
console.error(`make it there; then regenerate:`);
console.error();
console.error(`  npm run check:agents -- --write`);
process.exit(1);

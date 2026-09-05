#!/usr/bin/env node
/**
 * Is the deployment running this commit?
 *
 * The question that prompted this could not be answered at all. A deployment
 * that states nothing about itself can only be identified by inference, and
 * every avenue failed: the landing page is server-rendered so its strings are
 * not in the client chunks (grepping 688 kB of them found no occurrence of
 * "Parley"), the room's code sits behind a dynamic import that needs a minted
 * token, Vercel's headers carry a request trace and no deployment identity, and
 * that day's changes were all invisible to a signed-out visitor.
 *
 * The lesson is the same one `CLAUDE.md` keeps recording about checks: an
 * answer inferred from something adjacent is not an answer. `/api/version`
 * makes the deployment say which commit it is, and this compares that to the
 * commit in hand.
 *
 * Run with: npm run check:deploy -- https://your-deployment.vercel.app
 * or:       npm run check:deploy:prod
 */
import { execFileSync } from "node:child_process";

const target = (
  process.argv[2] ??
  process.env.PARLEY_PUBLIC_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  ""
).replace(/\/$/, "");

if (!target) {
  console.error(
    "Usage: npm run check:deploy:prod          (reads NEXT_PUBLIC_APP_URL)\n" +
      "   or: npm run check:deploy -- https://…",
  );
  process.exit(2);
}

const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
  encoding: "utf8",
}).trim();

let payload;
const response = await fetch(`${target}/api/version`, {
  headers: { "user-agent": "parley-check-deploy" },
}).catch((error) => ({ ok: false, status: 0, error }));

if (!response.ok) {
  /*
   * A 404 is informative rather than a failure of the check: this route landed
   * in the same commit as the script, so a deployment without it is a
   * deployment from before that commit. Saying so beats reporting "could not
   * determine", which is what every other approach produced.
   */
  console.log(
    response.status === 404
      ? `${target} has no /api/version.\n` +
          "That route shipped with this check, so the deployment predates it —\n" +
          "which answers the question, in the only way it can this once.\n"
      : `Could not reach ${target}/api/version — HTTP ${response.status ?? "?"}.\n`,
  );
  process.exit(1);
}

try {
  payload = await response.json();
} catch {
  console.log(`${target}/api/version did not return JSON.`);
  process.exit(1);
}

console.log(`local  ${head}  (${branch})`);
console.log(
  `remote ${payload.commit ?? "—"}  (${payload.ref ?? "?"}, ${payload.env ?? "?"})`,
);
console.log(`       up since ${payload.startedAt ?? "?"}\n`);

if (!payload.commit) {
  console.log(
    `${target} reports no commit: ${payload.source ?? "unknown"}.\n` +
      "A local `next start` looks like this; a Vercel deployment does not.",
  );
  process.exit(1);
}

if (payload.commit === head) {
  console.log("✔ the deployment is running this commit.");
  process.exit(0);
}

/*
 * Behind or ahead, said specifically. `git merge-base --is-ancestor` answers
 * which, and it needs the remote commit to be present locally — after a fetch it
 * usually is, and when it is not the honest report is that they differ.
 */
let relation = "differs from";
try {
  execFileSync("git", ["cat-file", "-e", `${payload.commit}^{commit}`], { stdio: "pipe" });
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", payload.commit, head], { stdio: "pipe" });
    const behind = execFileSync(
      "git",
      ["rev-list", "--count", `${payload.commit}..${head}`],
      { encoding: "utf8" },
    ).trim();
    relation = `${behind} commit${behind === "1" ? "" : "s"} behind`;
  } catch {
    relation = "ahead of, or diverged from,";
  }
} catch {
  relation = "differs from (and is not in this clone — try `git fetch`)";
}

console.log(`✘ the deployment is ${relation} the local commit.`);
process.exit(1);

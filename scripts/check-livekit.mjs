#!/usr/bin/env node
/**
 * Can a browser actually join a room? — and the answer is not in the suite log.
 *
 * LiveKit refuses a join with `429 connection minutes limit exceeded` when the
 * project's quota is spent. **The refusal never reaches our own logs.** The
 * browser is simply unable to connect and the room renders its "The connection
 * dropped" state, so a full suite reports ninety-odd failures against `joinAs`
 * and every one of them names an innocent assertion.
 *
 * That has now happened twice, and the second time there was a counter in the
 * suite summary named `livekit refusals` that read `0` throughout — because it
 * grepped the suite log for a string that only ever appears in a server-side
 * probe. A check that cannot observe the thing it is named for is worse than no
 * check: it reported "fine" through an outage and was believed.
 *
 * So the probe asks LiveKit directly, which is the only party that knows.
 *
 * **It costs no connection minutes.** `/rtc/validate` checks the token and the
 * project's standing and returns; nothing is joined and no room is created. That
 * is what makes it safe to run before *and* after a suite — before, so an
 * exhausted quota is reported in one line instead of in twenty-nine minutes of
 * timeouts; after, so a run that drained the meter says so rather than leaving
 * the next person to discover it.
 *
 * **The REST API is not a substitute.** `listRooms` kept answering normally
 * through both outages, because reading is not joining. Asking the wrong
 * endpoint is how the first outage was misread as a code fault.
 *
 * Run with: npm run check:livekit
 */
import { AccessToken } from "livekit-server-sdk";

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} is not set. Run through npm, which supplies --env-file.`);
    process.exit(1);
  }
  return value;
}

/*
 * **Probe whichever project the suite will actually use.**
 *
 * `playwright.config.ts` points the server under test at `E2E_LIVEKIT_*` when
 * all three are set, so probing the production project in that case would
 * answer a question nobody asked — and would report healthy while the suite's
 * own project was exhausted, which is the exact failure this script exists to
 * end.
 */
const usingTestProject = Boolean(
  process.env.E2E_LIVEKIT_URL &&
    process.env.E2E_LIVEKIT_API_KEY &&
    process.env.E2E_LIVEKIT_API_SECRET,
);
const which = usingTestProject ? "E2E_" : "";

const url = required(usingTestProject ? "E2E_LIVEKIT_URL" : "NEXT_PUBLIC_LIVEKIT_URL").replace(/\/$/, "");
const host = url.replace(/^wss:/, "https:").replace(/^ws:/, "http:");

const token = new AccessToken(required(`${which}LIVEKIT_API_KEY`), required(`${which}LIVEKIT_API_SECRET`), {
  identity: "quota-probe",
  ttl: 60,
});
// The same grants a real join asks for — a narrower token could be accepted
// where a real one is refused, which would make this probe answer a question
// nobody asked.
token.addGrant({
  roomJoin: true,
  room: "quota-probe",
  canPublish: true,
  canSubscribe: true,
  canPublishData: true,
});

let response;
try {
  response = await fetch(`${host}/rtc/validate?access_token=${await token.toJwt()}`);
} catch (e) {
  console.error(`✘ LiveKit is unreachable — ${e?.message ?? e}`);
  console.error("  Not a quota problem: the host did not answer at all.");
  process.exit(1);
}

const body = (await response.text()).trim();

if (response.ok) {
  console.log(
    `✔ LiveKit accepts a join token — the suite's room tests can run.` +
      (usingTestProject ? " (the suite's own project)" : " (production's project)"),
  );
  process.exit(0);
}

console.error(`✘ LiveKit refuses a join token — HTTP ${response.status}`);
console.error(`  ${body}`);
if (response.status === 429) {
  console.error();
  console.error("  The project's connection minutes are spent. This is not a code");
  console.error("  fault and no change in this repo fixes it: **real meetings cannot");
  console.error("  be joined either**, by anyone, until the quota resets or is raised.");
  console.error();
  console.error("  Running the suite is what spends it. The media project joins real");
  console.error("  rooms with several participants per test, so a handful of full runs");
  console.error("  in one night is enough to exhaust it — twice, so far.");
  if (!usingTestProject) {
    console.error();
    console.error("  This is production's LiveKit project, so **real meetings cannot be");
    console.error("  joined right now either**. Set E2E_LIVEKIT_URL, E2E_LIVEKIT_API_KEY");
    console.error("  and E2E_LIVEKIT_API_SECRET in .env.local to give the suite its own,");
    console.error("  so that testing can no longer take the product down.");
  }
}
process.exit(1);

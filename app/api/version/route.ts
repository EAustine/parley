import { NextResponse } from "next/server";

/**
 * Which commit is this, and when was it built?
 *
 * Added because "does production have the latest deploy?" turned out to be
 * unanswerable from outside. The landing page is server-rendered, so grepping
 * client chunks for a marker finds nothing — not even the word "Parley" — and
 * the room's code lives in a chunk that only loads after a token is minted, so
 * it is unreachable without joining a real meeting. Vercel's response headers
 * carry a request trace and no deployment identity. Every route that changed
 * that day changed in ways a signed-out visitor cannot observe.
 *
 * That is a gap worth closing rather than working around: after every deploy the
 * same question arrives, and the alternatives are all worse — comparing content
 * hashes against a local build, which is not reproducible across machines, or
 * creating a real meeting in production to load the room bundle, which pollutes
 * live data to answer a status question.
 *
 * **Nothing here is a secret.** `VERCEL_GIT_COMMIT_SHA` is a commit in a public
 * repository, and the branch name beside it. Rule 2 is about the LiveKit secret
 * and the service-role key; this is the opposite kind of value — something the
 * deployment should be willing to state about itself.
 *
 * Each variable is read as a literal rather than off a `process.env` object,
 * per rule 8c. That rule is about build-time replacement in the *client*
 * bundle and does not bind a route handler, but the habit is cheap and the
 * exception would have to be explained to the next reader otherwise.
 */

/** Never cached: a stale answer here is worse than no answer. */
export const dynamic = "force-dynamic";

export function GET() {
  const commit = process.env.VERCEL_GIT_COMMIT_SHA ?? null;
  const ref = process.env.VERCEL_GIT_COMMIT_REF ?? null;
  const env = process.env.VERCEL_ENV ?? null;

  return NextResponse.json(
    {
      commit,
      ref,
      env,
      /*
       * Stamped when the module is first evaluated, which on a serverless
       * function is per cold start rather than at build. It is a coarse
       * "this instance has been up since" and is deliberately not called
       * `builtAt` — a field named for something it is not is worse than an
       * absent one.
       */
      startedAt: STARTED_AT,
      /*
       * Says plainly when there is nothing to report, rather than returning
       * three nulls and letting the caller guess whether that means "old
       * deploy" or "not Vercel". A local `next start` hits this branch.
       */
      source: commit ? "vercel" : "unknown — not a Vercel build",
    },
    { headers: { "cache-control": "no-store" } },
  );
}

const STARTED_AT = new Date().toISOString();

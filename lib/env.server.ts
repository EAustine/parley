import "server-only";

import { z } from "zod";

/**
 * Server-only environment. Split out of `lib/env.ts` because that file is
 * imported by client components for `publicEnv`, so `server-only` could not go
 * at the top of it without breaking them.
 *
 * Rule 8d asks for the import, and the split is what makes the import possible.
 * Before this, `serverEnv` was exported from a module client code imports, and
 * only a `typeof window` check stopped it evaluating there — a runtime guard
 * where a structural one belongs. Importing this from a client component is now
 * a build error.
 *
 * The values still cannot reach a bundle either way: Next inlines only
 * `NEXT_PUBLIC_` variables, so these read as `undefined` in the browser. What
 * changes is when you find out.
 */

const serverSchema = z.object({
  LIVEKIT_API_KEY: z.string().min(1),
  LIVEKIT_API_SECRET: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
});

// Named literally rather than handed `process.env` wholesale — rule 8c. These
// are not `NEXT_PUBLIC_` and so are never inlined, but the habit is the rule.
const serverValues = {
  LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY,
  LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

const result = serverSchema.safeParse(serverValues);
if (!result.success) {
  const issues = result.error.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  throw new Error(`Invalid server environment:\n${issues}\n\nSee ACCOUNTS.md.`);
}

export const serverEnv = result.data;

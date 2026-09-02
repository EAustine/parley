import { z } from "zod";

/**
 * Environment parsing and validation. Imported for its side effects at the
 * top of the root layout so a misconfigured deploy fails at boot rather
 * than at the first request.
 *
 * The leak check below is the point of this file. Anything prefixed
 * NEXT_PUBLIC_ is inlined into the client bundle at build time and is
 * readable by anyone who opens devtools. A service-role key there hands
 * over the whole database; a LiveKit secret there lets anyone mint a token
 * for any room. Neither failure is visible at runtime, which is what makes
 * it worth a hard stop.
 */

/** Legacy Supabase keys are JWTs; the payload carries the role claim. */
function jwtRole(value: string): string | null {
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"),
    );
    return typeof payload?.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

function assertNoSecretsInPublicVars() {
  const leaked: string[] = [];

  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith("NEXT_PUBLIC_") || !value) continue;

    // New-format Supabase secret key
    if (value.startsWith("sb_secret_")) {
      leaked.push(`${key} holds a Supabase secret key`);
      continue;
    }
    // Legacy service_role JWT
    if (jwtRole(value) === "service_role") {
      leaked.push(`${key} holds a Supabase service_role JWT`);
      continue;
    }
    // LiveKit secret pasted into a public var
    if (process.env.LIVEKIT_API_SECRET && value === process.env.LIVEKIT_API_SECRET) {
      leaked.push(`${key} holds the LiveKit API secret`);
    }
  }

  if (leaked.length > 0) {
    throw new Error(
      "Refusing to start: a server-only secret is in a public variable.\n" +
        leaked.map((l) => `  - ${l}`).join("\n") +
        "\n\nNEXT_PUBLIC_ variables are compiled into the client bundle.\n" +
        "Move these to unprefixed variables and rotate the exposed keys —\n" +
        "if this ever ran or built, treat them as compromised.",
    );
  }
}

const publicSchema = z.object({
  NEXT_PUBLIC_LIVEKIT_URL: z.string().url().startsWith("wss://"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  NEXT_PUBLIC_APP_URL: z.string().url(),
});

/**
 * Each variable is named as a literal member expression, and that is load
 * bearing rather than stylistic.
 *
 * Next replaces `process.env.NEXT_PUBLIC_X` textually at build time. It cannot
 * replace anything when the whole `process.env` object is handed to a function,
 * so parsing `process.env` directly works on the server — where the real object
 * exists — and fails in the browser, where `process.env` is an empty stub and
 * every variable reads as missing. Writing them out is what makes `publicEnv`
 * safe to import from a client component.
 */
const publicValues = {
  NEXT_PUBLIC_LIVEKIT_URL: process.env.NEXT_PUBLIC_LIVEKIT_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
};

const serverSchema = z.object({
  LIVEKIT_API_KEY: z.string().min(1),
  LIVEKIT_API_SECRET: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
});

function parse<T extends z.ZodTypeAny>(
  schema: T,
  label: string,
  values: unknown = process.env,
): z.infer<T> {
  const result = schema.safeParse(values);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid ${label} environment:\n${issues}\n\nSee ACCOUNTS.md.`);
  }
  return result.data;
}

/**
 * Server only, and deliberately so.
 *
 * `Object.entries(process.env)` returns an empty object in the browser and
 * `Buffer` does not exist there — running this on the client would pull in a
 * polyfill to scan an object that is empty by construction. It could never
 * catch anything either: by the time a client bundle executes, the leak it
 * would be looking for has already been compiled into it.
 *
 * `npm run check:env` is what actually stops a leaked key, because it runs
 * before the build rather than after.
 */
if (typeof window === "undefined") {
  assertNoSecretsInPublicVars();
}

export const publicEnv = parse(publicSchema, "public", publicValues);

/**
 * Server-only. Importing this from a client component is a build error,
 * which is the intended behaviour.
 */
export const serverEnv =
  typeof window === "undefined" ? parse(serverSchema, "server") : (null as never);

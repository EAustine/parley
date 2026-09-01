/**
 * Boot assertion — refuses to start if a service-role secret has leaked into a
 * public variable. Anything prefixed `NEXT_PUBLIC_` is inlined into the client
 * bundle at build time, so a mistake here is not recoverable after a deploy.
 *
 * Imported for its side effect from the root layout, which runs on the server
 * for every request path.
 */

const SERVICE_ROLE_MARKERS = ["service_role", "serviceRole"];

function decodeJwtPayload(value: string): string | null {
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  try {
    return Buffer.from(parts[1], "base64url").toString("utf8");
  } catch {
    return null;
  }
}

export function assertNoPublicSecrets(): void {
  const offenders: string[] = [];

  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith("NEXT_PUBLIC_") || !value) continue;

    // A Supabase service-role key is a JWT whose payload names the role.
    if (value.startsWith("eyJ")) {
      const payload = decodeJwtPayload(value);
      if (payload && SERVICE_ROLE_MARKERS.some((m) => payload.includes(m))) {
        offenders.push(key);
        continue;
      }
    }

    // Belt and braces: catch the marker anywhere in a public value.
    if (SERVICE_ROLE_MARKERS.some((m) => value.includes(m))) {
      offenders.push(key);
    }
  }

  if (offenders.length > 0) {
    throw new Error(
      `Refusing to boot: service-role secret found in public env var(s): ${offenders.join(
        ", ",
      )}. Anything prefixed NEXT_PUBLIC_ ships to the browser. Move these to a server-only name.`,
    );
  }
}

assertNoPublicSecrets();

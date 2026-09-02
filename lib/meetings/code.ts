/**
 * Meeting codes.
 *
 * `xxx-xxxx-xxx`, lowercase, from an alphabet with no `i`, `l`, `o`, `0`, or
 * `1`. Thirty-one characters, ten of them, so 31^10 ≈ 8.2 × 10^14 — but the
 * size of the keyspace is not the requirement. The requirement is that someone
 * can read a code down a phone line and have it arrive intact, which is what
 * dropping the ambiguous glyphs buys.
 */

export const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export const CODE_GROUPS = [3, 4, 3] as const;
export const CODE_LENGTH = CODE_GROUPS.reduce((a, b) => a + b, 0);

/** `xxx-xxxx-xxx` over the alphabet above. Anchored — no partial matches. */
export const CODE_PATTERN = /^[abcdefghjkmnpqrstuvwxyz23456789]{3}-[abcdefghjkmnpqrstuvwxyz23456789]{4}-[abcdefghjkmnpqrstuvwxyz23456789]{3}$/;

/**
 * The alphabet is 31 characters and a byte holds 256 values, so `byte % 31`
 * would make the first eight characters ~3% likelier than the rest. Bytes at or
 * above the largest multiple of 31 are discarded and redrawn instead.
 *
 * 8 values in 256 are rejected, so this loops about 3% of the time. It is not
 * a meaningful cost and the alternative is a biased keyspace, which is the sort
 * of flaw that never announces itself.
 */
const REJECT_AT = 256 - (256 % CODE_ALPHABET.length); // 248

function randomCharacters(count: number): string {
  let out = "";
  const buffer = new Uint8Array(count * 2);

  while (out.length < count) {
    crypto.getRandomValues(buffer);
    for (const byte of buffer) {
      if (byte >= REJECT_AT) continue;
      out += CODE_ALPHABET[byte % CODE_ALPHABET.length];
      if (out.length === count) break;
    }
  }

  return out;
}

export function generateMeetingCode(): string {
  const characters = randomCharacters(CODE_LENGTH);
  let offset = 0;
  return CODE_GROUPS.map((size) =>
    characters.slice(offset, (offset += size)),
  ).join("-");
}

/**
 * Accepts a code typed by a person: trims, lowercases, and re-groups digits
 * entered without hyphens. Returns null if it cannot be read as a code, so the
 * caller decides what to say rather than being handed a wrong-looking string.
 */
export function normaliseMeetingCode(input: string): string | null {
  const bare = input.trim().toLowerCase().replace(/[\s-]/g, "");
  if (bare.length !== CODE_LENGTH) return null;
  if (![...bare].every((c) => CODE_ALPHABET.includes(c))) return null;

  let offset = 0;
  return CODE_GROUPS.map((size) =>
    bare.slice(offset, (offset += size)),
  ).join("-");
}

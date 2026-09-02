/**
 * What crosses the data channel.
 *
 * One topic carrying two kinds of thing, discriminated by `kind` — §3.5 and
 * §3.6 are separate features but they share a transport, and a single envelope
 * means one decoder to get right rather than two.
 *
 * **Nothing identifying travels in the payload.** LiveKit hands the receiver
 * the `Participant` the packet came from, and that is the only sender there
 * is. This is the same rule the token endpoint follows for identity: a name in
 * the body would let anyone in the room type as anyone else, and no amount of
 * validation downstream can undo that.
 *
 * **No timestamp travels either.** A sender's clock can be wrong or hostile,
 * and a relative time is one of the two things §3.5 renders. The receiver
 * stamps arrival, which is both trustworthy and correct: this is an ephemeral
 * chat between people who are all in the meeting right now.
 *
 * §3.5 names the consequence, which is worth stating rather than discovering:
 * two receivers can hold slightly different times for the same message, so
 * display order is *per-receiver arrival order* and no client's ordering is
 * canonical. Nothing here may assume otherwise — there is no sequence number
 * to sort by and adding one would only move the unverifiable claim.
 *
 * **No id travels.** `publishData` does not echo to the sender, so the sender
 * adds its own copy locally and can mint its own key there. An id on the wire
 * would be an attacker-chosen React key and a de-duplication surface, for no
 * benefit.
 *
 * What is left is the smallest thing that works, which is the point.
 */

export const MESSAGE_TOPIC = "parley";

/** §3.5. The counter appears at 900. */
export const CHAT_MAX_LENGTH = 1000;
export const CHAT_COUNTER_AT = 900;

/** §3.6, fixed. Not configurable — six is the design. */
export const REACTIONS = ["👍", "❤️", "😂", "🎉", "👏", "😮"] as const;
export type Reaction = (typeof REACTIONS)[number];

/** For §9's "Ama reacted with applause" — the emoji is not a spoken word. */
export const REACTION_NAMES: Record<Reaction, string> = {
  "👍": "a thumbs up",
  "❤️": "a heart",
  "😂": "laughter",
  "🎉": "a celebration",
  "👏": "applause",
  "😮": "surprise",
};

export type Envelope =
  | { v: 1; kind: "chat"; body: string }
  | { v: 1; kind: "reaction"; emoji: Reaction };

/**
 * A hard cap on bytes, checked before parsing.
 *
 * 1,000 characters is up to 4 kB of UTF-8, and the JSON wrapper adds a little.
 * 8 kB leaves room without inviting `JSON.parse` to chew through whatever
 * someone chooses to send. Every packet on this channel is attacker-controlled
 * by definition — anyone in the meeting can craft one.
 */
const MAX_BYTES = 8 * 1024;

/**
 * Strip what must never reach a rendered line.
 *
 * The same treatment `sanitiseDisplayName` gives a name, with one difference:
 * newlines survive, because Shift+Enter inserts them on purpose. Bidi
 * overrides are the reason this exists — a single U+202E reverses the text
 * after it, so a message can be made to read as something other than what was
 * typed, and it survives being rendered as plain text because it is not
 * markup. Escaping does nothing to it; removing it does.
 */
export function sanitiseChatBody(input: string): string {
  return input
    // C0 controls, DEL and C1 — but \n (U+000A) survives, because Shift+Enter
    // inserts one on purpose. Written as escapes rather than literal bytes:
    // a control character typed into a source file is invisible in every
    // diff, editor and review that will ever look at it.
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/gu, "")
    // Zero-width and bidi formatting characters.
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/gu, "")
    // Collapse runs of blank lines; a message is not a scrolling device.
    .replace(/\n{3,}/gu, "\n\n")
    // Horizontal whitespace only — newlines are content here.
    .replace(/[^\S\n]+/gu, " ")
    .trim()
    .slice(0, CHAT_MAX_LENGTH);
}

export function encode(envelope: Envelope): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(envelope));
}

/**
 * Turn bytes from the wire into an envelope, or null.
 *
 * Null rather than a throw: a malformed packet from one participant must not
 * be able to interrupt the room for everyone else, and there is nothing useful
 * to say about it. It is dropped.
 */
export function decode(payload: Uint8Array): Envelope | null {
  if (payload.byteLength === 0 || payload.byteLength > MAX_BYTES) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(payload));
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const value = parsed as Record<string, unknown>;
  if (value.v !== 1) return null;

  if (value.kind === "chat") {
    if (typeof value.body !== "string") return null;
    const body = sanitiseChatBody(value.body);
    // Sanitising can empty a message that was only control characters. That is
    // not a message.
    return body.length > 0 ? { v: 1, kind: "chat", body } : null;
  }

  if (value.kind === "reaction") {
    // Membership in the fixed set, not "is a string that looks like an emoji".
    // §3.6 fixes six, and anything else is someone probing the renderer.
    const emoji = value.emoji;
    return typeof emoji === "string" && (REACTIONS as readonly string[]).includes(emoji)
      ? { v: 1, kind: "reaction", emoji: emoji as Reaction }
      : null;
  }

  return null;
}

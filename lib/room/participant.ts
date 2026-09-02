import type { Participant } from "livekit-client";

/**
 * Reading a participant's label back out.
 *
 * The token endpoint puts the sanitised display name in participant *metadata*
 * rather than in the identity string, because identity is a key — LiveKit uses
 * it to tell participants apart, so a name there would let two people collide
 * and would be unchangeable afterwards. That means every read has to go
 * through the same parse, and metadata arrives as an untrusted string: it is
 * JSON we wrote, but it crosses the SFU and it can be absent while a
 * participant is still connecting.
 */

export type ParticipantMeta = {
  displayName?: string;
  role?: "host" | "participant";
};

export function metaOf(participant: Participant): ParticipantMeta {
  try {
    const parsed = participant.metadata ? JSON.parse(participant.metadata) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function displayNameOf(participant: Participant): string {
  const meta = metaOf(participant);
  // `name` is LiveKit's own field, set from the token's `name` claim when one
  // is present. Ours travels in metadata, so that is checked first.
  const label = meta.displayName?.trim() || participant.name?.trim();
  // Never the identity as a fallback: a guest identity is a random string, and
  // showing it under someone's face is worse than showing nothing.
  return label || "Guest";
}

export function isHost(participant: Participant): boolean {
  return metaOf(participant).role === "host";
}

/**
 * The avatar fallback's single character.
 *
 * `Intl.Segmenter` rather than `name[0]`: a string index splits a surrogate
 * pair and an emoji or a non-BMP character renders as a replacement glyph.
 * Uppercasing is locale-independent here on purpose — a Turkish locale maps
 * "i" to "İ", and the initial of a name should not change with the reader's
 * device settings.
 */
export function initialOf(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const segmenter =
    typeof Intl !== "undefined" && "Segmenter" in Intl
      ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
      : null;
  const first = segmenter
    ? segmenter.segment(trimmed)[Symbol.iterator]().next().value?.segment
    : [...trimmed][0];
  return (first ?? "?").toUpperCase();
}

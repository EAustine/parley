import { z } from "zod";

/**
 * The shape of a meeting-creation request, shared between the client and the
 * route handler so the two cannot drift. The server parses it again regardless
 * — client validation is a courtesy, never a control.
 */

/** 15 / 30 / 45 / 60 / 90 minutes, or a custom value in the same range. */
export const MIN_DURATION_MINUTES = 5;
export const MAX_DURATION_MINUTES = 12 * 60;

const title = z
  .string()
  .trim()
  .min(1, "Give the meeting a title.")
  .max(120, "Titles are limited to 120 characters.");

const description = z
  .string()
  .trim()
  .max(2000, "Descriptions are limited to 2,000 characters.")
  .optional();

/**
 * An IANA zone name, validated by asking the platform rather than by pattern —
 * `Intl` holds the actual database, and a regex would either reject valid zones
 * or admit invented ones.
 */
const timezone = z.string().refine((value) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}, "That isn't a recognised timezone.");

export const createInstantMeetingSchema = z.object({
  kind: z.literal("instant"),
  title: title.optional(),
});

/**
 * How far into the past a submitted start may fall before it is refused.
 *
 * Not zero. A form submitted at 10:00:00 for 10:00 arrives a few hundred
 * milliseconds later, and a strict comparison would reject somebody for
 * pressing the button at exactly the moment they meant. Two minutes is far
 * below any interval a person would notice and far above any round trip.
 */
export const PAST_GRACE_MS = 2 * 60_000;

export const createScheduledMeetingSchema = z.object({
  kind: z.literal("scheduled"),
  title,
  description,
  /**
   * UTC instant. The form composes this from date + time + zone.
   *
   * **And it may not be in the past** — v1.3 D3, on the server as well as in
   * the form. "Client validation is advisory, and a stale tab can submit a time
   * that was future when the page loaded."
   *
   * `PAST_GRACE_MS` of slack, because the alternative is a race with the
   * request itself: a form submitted at 10:00:00 for 10:00 arrives a few
   * hundred milliseconds later, and rejecting it would fail somebody for
   * pressing the button at the moment they meant.
   */
  scheduledStart: z
    .string()
    .datetime({ offset: true })
    .refine(
      (value) => new Date(value).getTime() > Date.now() - PAST_GRACE_MS,
      "That time has already passed.",
    ),
  durationMinutes: z
    .number()
    .int()
    .min(MIN_DURATION_MINUTES)
    .max(MAX_DURATION_MINUTES),
  timezone,
});

/**
 * Editing a scheduled meeting — §3.9. Every field optional, because a PATCH
 * that changes only the time should not require resending the description.
 *
 * `kind` is absent on purpose: an instant meeting cannot become a scheduled one
 * or the reverse. That is a different meeting, and it should have a different
 * link rather than quietly changing under people who already hold this one.
 */
export const updateMeetingSchema = z
  .object({
    title: title.optional(),
    description: description.nullable().optional(),
    scheduledStart: z
      .string()
      .datetime({ offset: true })
      .refine(
        (value) => new Date(value).getTime() > Date.now() - PAST_GRACE_MS,
        "That time has already passed.",
      )
      .optional(),
    durationMinutes: z
      .number()
      .int()
      .min(MIN_DURATION_MINUTES)
      .max(MAX_DURATION_MINUTES)
      .optional(),
    timezone: timezone.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "Nothing to change.")
  .refine(
    (value) =>
      value.durationMinutes === undefined || value.scheduledStart !== undefined,
    // The end time is derived from both, so a duration without a start would
    // need the stored start read back and re-derived — doable, and a second
    // place for the two to disagree.
    "Changing the duration means sending the start time too.",
  );

export type UpdateMeetingInput = z.infer<typeof updateMeetingSchema>;

export type UpdateMeetingError =
  | "unauthenticated"
  | "invalid_request"
  | "not_found"
  | "not_scheduled"
  | "already_ended"
  | "update_failed";

export const createMeetingSchema = z.discriminatedUnion("kind", [
  createInstantMeetingSchema,
  createScheduledMeetingSchema,
]);

export type CreateMeetingInput = z.infer<typeof createMeetingSchema>;

/** Stable error strings, per the route-handler convention in CLAUDE.md. */
export type CreateMeetingError =
  | "unauthenticated"
  | "invalid_request"
  | "code_generation_failed"
  | "creation_failed";

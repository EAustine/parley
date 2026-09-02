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

export const createScheduledMeetingSchema = z.object({
  kind: z.literal("scheduled"),
  title,
  description,
  /** UTC instant. The form composes this from date + time + zone. */
  scheduledStart: z.string().datetime({ offset: true }),
  durationMinutes: z
    .number()
    .int()
    .min(MIN_DURATION_MINUTES)
    .max(MAX_DURATION_MINUTES),
  timezone,
});

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

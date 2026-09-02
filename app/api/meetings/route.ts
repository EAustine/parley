import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { generateMeetingCode } from "@/lib/meetings/code";
import {
  createMeetingSchema,
  type CreateMeetingError,
} from "@/lib/meetings/schema";
import type { Database } from "@/lib/supabase/types";

type MeetingInsert = Database["public"]["Tables"]["meetings"]["Insert"];

/** Postgres unique_violation. The signal that a code collided. */
const UNIQUE_VIOLATION = "23505";

/**
 * Codes are generated and inserted, never checked-then-inserted: a check
 * followed by an insert has a window between them, and the unique index is the
 * only thing that actually decides. Five attempts is far past the point of
 * plausibility — at 8.2 × 10^14 codes a first collision is already remote — so
 * exhausting them means something else is wrong and should be reported as
 * such rather than retried forever.
 */
const MAX_CODE_ATTEMPTS = 5;

function fail(error: CreateMeetingError, status: number) {
  return NextResponse.json({ error }, { status });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return fail("unauthenticated", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("invalid_request", 400);
  }

  const parsed = createMeetingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "invalid_request" satisfies CreateMeetingError,
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 },
    );
  }

  const input = parsed.data;

  // host_id comes from the session, never from the body. RLS would refuse a
  // forged one anyway — this makes it impossible to send in the first place.
  const base: Omit<MeetingInsert, "code"> =
    input.kind === "instant"
      ? {
          host_id: user.id,
          title: input.title?.trim() || "Meeting",
          scheduled_start: null,
          scheduled_end: null,
          timezone: "UTC",
        }
      : {
          host_id: user.id,
          title: input.title,
          description: input.description ?? null,
          scheduled_start: input.scheduledStart,
          scheduled_end: new Date(
            new Date(input.scheduledStart).getTime() +
              input.durationMinutes * 60_000,
          ).toISOString(),
          timezone: input.timezone,
        };

  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    const { data, error } = await supabase
      .from("meetings")
      .insert({ ...base, code: generateMeetingCode() })
      .select("code, title, scheduled_start, timezone, status")
      .single();

    if (!error) return NextResponse.json(data, { status: 201 });
    if (error.code !== UNIQUE_VIOLATION) return fail("creation_failed", 500);
    // Collided. Fall through and draw another code.
  }

  return fail("code_generation_failed", 500);
}

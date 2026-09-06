import { formatClock, formatShortDay } from "@/lib/meetings/format";

/**
 * Who was in the meeting — BUILD-PLAN v1.5 C1.
 *
 * Shown on an ended meeting's detail page: the name each person entered, who
 * was removed, and who was denied entry.
 *
 * ## Two sources, and why not one
 *
 * C1 reads as though denied people belong in `meeting_participants`: "a denied
 * person never joined, so no `participant_joined` ever fired. They need a row
 * with no join, which means checking the partial unique index still behaves."
 *
 * The index behaves. The **count** does not. `mp_open_session_idx` is partial on
 * `left_at is null`, and the dashboard's live figure counts exactly those rows —
 * so a denied person inserted without a `left_at` is indistinguishable from
 * somebody currently in the meeting, and every gated meeting would report
 * phantom attendees. Giving them one instead means writing a session that never
 * happened, with a join time that is a lie.
 *
 * They already have a row, in `meeting_waiting`, carrying the name they typed
 * and when they were refused. So the record reads both tables and merges them
 * for display — no migration, and no way to corrupt a count.
 *
 * ## Verified and typed, which C1 calls the load-bearing part
 *
 * Signing in buys **accountability, not authorisation**: anyone can sign in with
 * any Google account, so a signed-in person is identifiable rather than invited.
 * A guest can type your name and appear in this list looking like you, and a
 * record that says "Austine Eluro" without saying which implies an attestation
 * the product cannot make.
 *
 * Every name here is rendered as text and was sanitised before it was stored —
 * §3.2's rule that no route puts an email address in front of anyone holds for
 * a name typed by somebody who never got in as much as for anyone else.
 */

export type AttendanceRow = {
  id: string;
  name: string;
  verified: boolean;
  joinedAt: string | null;
  leftAt: string | null;
  outcome: "joined" | "removed" | "denied";
};

export function AttendanceRecord({ rows }: { rows: AttendanceRow[] }) {
  if (rows.length === 0) {
    /*
     * An empty record is a fact, not a gap. A meeting that ended with nobody in
     * it is an ordinary outcome — a link nobody opened, a call that never
     * started — and saying so beats an absent section that reads as "we lost
     * this".
     */
    return (
      <section aria-labelledby="attendance-heading" className="mt-10">
        <h2 id="attendance-heading" className="type-h2 mb-2">
          Who was here
        </h2>
        <p className="type-body text-muted-foreground">
          Nobody joined this meeting.
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="attendance-heading" className="mt-10">
      <h2 id="attendance-heading" className="type-h2 mb-3">
        Who was here
      </h2>

      <ul className="rounded-xl border border-boundary">
        {rows.map((row, index) => (
          <li
            key={row.id}
            className={`flex items-center gap-3 px-4 py-3 ${
              index > 0 ? "border-t border-border" : ""
            }`}
          >
            <div className="min-w-0 flex-1">
              <span className="type-body block truncate">{row.name}</span>
              <span className="type-caption block truncate text-muted-foreground">
                {/*
                  The attestation, said plainly. "Signed in" is a claim the
                  product can stand behind; "name entered" is one it cannot, and
                  the difference has to be visible or the list implies the
                  stronger of the two for everybody.
                */}
                {row.verified ? "Signed in" : "Name entered"}
                {row.joinedAt ? ` · ${when(row.joinedAt)}` : ""}
              </span>
            </div>

            <span className="shrink-0 type-caption text-muted-foreground">
              {row.outcome === "denied"
                ? "Denied entry"
                : row.outcome === "removed"
                  ? "Removed"
                  : row.leftAt
                    ? `Left ${formatClock(row.leftAt)}`
                    : "Joined"}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Day and time, because a record is read long after the day it describes.
 *
 * Both formatters take the ISO string and render in the viewer's zone — §3.9's
 * "store UTC, render local". Passing a `Date` compiles nowhere, which is the
 * type doing the job the convention describes.
 */
function when(iso: string): string {
  return `${formatShortDay(iso)} ${formatClock(iso)}`;
}

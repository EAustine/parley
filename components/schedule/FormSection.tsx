/**
 * A titled group of fields — v1.3 D3's "three questions rather than a flat
 * stack of six fields", and D4's sections on the meeting page.
 *
 * ## The heading is an eyebrow, and it had to be settled once
 *
 * The design's `.section h2` is 13/18 at 600, uppercase, `+0.04em` — not the
 * 20/26 `type-h2` these render at today. It has to be decided in one place
 * because these two screens are one component tree: `MeetingSchedule` renders
 * `ScheduleForm` in edit mode, so the schedule form *is* part of the meeting
 * page. Whichever item landed first would otherwise set the treatment on both,
 * and for a while the page would carry 13px eyebrows beside 20px headings at
 * the same level.
 *
 * Composed from roles that already exist — `type-small` plus `font-semibold`
 * plus tracking — rather than added to CLAUDE.md's table as a fourth heading
 * size. It is the same eyebrow D1's day and month headers use, one step up.
 *
 * A real `<h2>`, not a styled `<p>`: it heads a region, and the outline is how
 * a screen reader user skips between them.
 */
export function FormSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <h2 className="type-small font-semibold tracking-[0.04em] text-muted-foreground uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

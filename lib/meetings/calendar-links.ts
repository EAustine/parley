// Relative, not aliased: this module and `ics.ts` are compiled together and
// run outside Next by `npm run check:ics`, which has no bundler to resolve
// `@/`. Being checkable in isolation is the point of both files.
import { icsDate } from "./ics";

/**
 * Prefilled "add to calendar" URLs, for the two web calendars that accept one.
 *
 * §3.9 chooses these over OAuth deliberately: they cover every calendar client
 * between them and the `.ics`, need no consent screen, and save about a week.
 * The cost is that both are undocumented query-string conventions rather than
 * APIs, so they are pinned by tests and will need revisiting if either changes.
 *
 * Both take UTC instants. Google wants the compact RFC 5545 form, Outlook wants
 * ISO 8601 — the same moment written two ways, which is exactly the sort of
 * detail that is wrong for a year before anyone in another timezone notices.
 */

export type CalendarEvent = {
  title: string;
  description?: string | null;
  start: Date;
  end: Date;
  url: string;
};

function body(event: CalendarEvent): string {
  const parts = [];
  if (event.description?.trim()) parts.push(event.description.trim());
  parts.push(`Join: ${event.url}`);
  return parts.join("\n\n");
}

/**
 * `dates` is `start/end` in the compact UTC form, with no separator between the
 * date and the `Z`. Google rejects an ISO string here silently — it opens the
 * composer with the fields filled and the time blank.
 */
export function googleCalendarUrl(event: CalendarEvent): string {
  const url = new URL("https://calendar.google.com/calendar/render");
  url.searchParams.set("action", "TEMPLATE");
  url.searchParams.set("text", event.title);
  url.searchParams.set("dates", `${icsDate(event.start)}/${icsDate(event.end)}`);
  url.searchParams.set("details", body(event));
  url.searchParams.set("location", event.url);
  return url.toString();
}

/**
 * Outlook Web. `path` and `rru` are both required — without `rru=addevent` the
 * deep link opens an empty composer.
 */
export function outlookCalendarUrl(event: CalendarEvent): string {
  const url = new URL("https://outlook.live.com/calendar/0/deeplink/compose");
  url.searchParams.set("path", "/calendar/action/compose");
  url.searchParams.set("rru", "addevent");
  url.searchParams.set("subject", event.title);
  url.searchParams.set("startdt", event.start.toISOString());
  url.searchParams.set("enddt", event.end.toISOString());
  url.searchParams.set("body", body(event));
  url.searchParams.set("location", event.url);
  return url.toString();
}

/**
 * "Email an invite" — v1.3 D4.
 *
 * A `mailto:` and nothing else. D4 is explicit about why: "No provider, no
 * deliverability, no bounce handling, most of the value. Real email sending is
 * its own project, not a line item."
 *
 * **No recipient**, which is what makes that true. The href is
 * `mailto:?subject=…&body=…` with nothing before the `?`, so the button opens
 * the host's own mail app with everything filled in and the To field waiting —
 * the product never learns who was invited, never queues anything, and never
 * has a message to fail to deliver. It composes an invite rather than sending
 * one, and the hint line beside it says so.
 *
 * **The time is rendered in the meeting's own zone**, and the label is printed.
 * A body reading "10:00" without a zone is §3.9's trap in an email, where it is
 * worse than on a screen: the reader has no form to check it against, and the
 * message outlives the page.
 *
 * `encodeURIComponent`, not `URLSearchParams` — the latter encodes a space as
 * `+`, which mail clients render literally in a subject line. `mailto:` is not
 * a web form.
 */
export function mailtoInviteUrl(
  event: CalendarEvent & { when: string },
): string {
  const lines = [`${event.title}`, event.when, "", `Join: ${event.url}`];
  if (event.description?.trim()) {
    lines.push("", event.description.trim());
  }
  lines.push(
    "",
    "Anyone with the link can join. They don't need an account.",
  );
  return (
    "mailto:?subject=" +
    encodeURIComponent(`Invitation: ${event.title}`) +
    "&body=" +
    encodeURIComponent(lines.join("\n"))
  );
}

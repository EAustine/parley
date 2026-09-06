import Link from "next/link";
import type { Metadata } from "next";

import { accountDisplayName } from "@/lib/auth/display-name";
import { createAnonClient } from "@/lib/supabase/anon";
import { normaliseMeetingCode } from "@/lib/meetings/code";
import { JoinCodeForm } from "@/components/meetings/JoinCodeForm";
import { PreJoin } from "@/components/prejoin/PreJoin";
import { createClient } from "@/lib/supabase/server";
import { Mark } from "@/components/brand/Mark";
import { Button } from "@/components/ui/button";
import type { PublicMeeting } from "@/lib/supabase/types";

type Params = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { code } = await params;
  const meeting = await resolveMeeting(code);
  return {
    title: meeting
      ? meeting.status === "ended"
        ? `${meeting.title} — ended`
        : meeting.status === "cancelled"
          ? `${meeting.title} — cancelled`
          : meeting.title
      : "Meeting not found",
    // A meeting link is not something to index. The per-meeting OG card for
    // sharing arrives in Phase 10.
    robots: { index: false, follow: false },
  };
}

/**
 * The only anonymous read in the product.
 *
 * `get_meeting_by_code` is `security definer` — it runs with the owner's
 * rights and returns six columns for one code: no host identity, no
 * participant list, no settings beyond the guest flag. Calling it through a
 * session-less client means this page exercises the same `anon` path a
 * stranger holding the link does, rather than the `authenticated` one that a
 * signed-in host would otherwise take.
 *
 * A result here is *display* data, not permission. Ended meetings resolve for
 * 30 days so the page can say so; whether a room can actually be entered is
 * decided by the token endpoint, and this page must branch on `status` rather
 * than treat any row as joinable.
 */
async function resolveMeeting(rawCode: string): Promise<PublicMeeting | null> {
  const code = normaliseMeetingCode(rawCode);
  if (!code) return null;

  const supabase = createAnonClient();
  const { data, error } = await supabase.rpc("get_meeting_by_code", {
    p_code: code,
  });

  if (error || !data || data.length === 0) return null;
  return data[0];
}

export default async function JoinPage({ params }: Params) {
  const { code } = await params;
  const meeting = await resolveMeeting(code);

  if (!meeting) return <MeetingNotFound code={code} />;
  if (meeting.status === "ended") return <MeetingEnded meeting={meeting} />;
  // §3.2: a distinct state, never folded into "ended". Someone arriving on
  // time for a meeting called off yesterday must not be told they missed it.
  if (meeting.status === "cancelled") return <MeetingCancelled meeting={meeting} />;

  // The *meeting* is resolved anonymously; the viewer's session is read
  // separately and only to decide whether to ask for a name. Auth is never
  // required to reach this screen — §3.1.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Null for a guest, and null for a signed-in person whose account carries no
  // name — the two cases pre-join treats alike, because both need to be asked.
  // Never the email address: `lib/auth/display-name.ts` has the reasoning, and
  // the token route enforces the same rule on the way in.
  const signedInName = accountDisplayName(user);

  /*
   * Is the person looking at this screen the host? — v1.5 A1's third home.
   *
   * `get_meeting_by_code` is `security definer` and §6 keeps it deliberately
   * narrow: "no host identity, no participant list, no settings beyond the one
   * flag the join page needs". Widening it to answer this would hand every
   * anonymous caller the host's id, which is the disclosure that narrowness
   * exists to prevent.
   *
   * So the question is asked separately, as the viewer, and **RLS is the
   * answer**: a host can select their own meeting row and nobody else can. A
   * guest gets `null` here and is told nothing — not that the query failed, not
   * that a host exists. The same read carries the current setting, so the
   * control renders the truth rather than a default.
   */
  const { data: own } = user
    ? await supabase
        .from("meetings")
        .select("waiting_room")
        .eq("code", meeting.code)
        .maybeSingle()
    : { data: null };

  return (
    <PreJoin
      meeting={meeting}
      signedInName={signedInName}
      host={own ? { waitingRoom: Boolean(own.waiting_room) } : null}
    />
  );
}

/**
 * Ended, and said plainly.
 *
 * Distinct from the unknown-code state, never conflated with it: someone who
 * arrives late to a real meeting should be told the meeting finished, not that
 * their link was wrong.
 *
 * The title, not the host's name. `get_meeting_by_code` deliberately returns no
 * host identity, and the title does the same job — telling someone holding
 * several links which one this was — without handing a person's name to anyone
 * who has the code. The title was already visible to link-holders while the
 * meeting ran, so showing it afterwards discloses nothing new.
 *
 * "Start a new meeting" points at the dashboard. A signed-out visitor is sent
 * to sign-in by the middleware and returned there afterwards, so the link is
 * honest for both: it goes where a new meeting is started.
 */
function MeetingCancelled({ meeting }: { meeting: PublicMeeting }) {
  return (
    <Centred>
      <div className="flex flex-col items-center gap-6 text-center">
        {/*
          The mark alone, without the wordmark.

          These are full-screen status pages whose whole job is one sentence —
          "Waiting for the host to let you in", "The host removed you from the
          meeting" — and a display-size product name above that sentence
          competes with it for the first thing you read. The mark identifies the
          product; the heading is what you came for. The same argument §3.10a
          already makes for the landing page, where the tagline takes the
          display size and the name does not.

          `title` keeps the name for a screen reader: dropping the wordmark is a
          decision about visual weight, not a decision that the page should stop
          saying what it is — and an unlabelled logo is a worse outcome than a
          quiet one.
        */}
        <Mark size={40} title="Parley" />
        <div className="space-y-2">
          <h1 className="type-h1">This meeting was cancelled</h1>
          {/* Not "you missed it". The meeting never happened, and the person
              reading this may well be on time. */}
          <p className="type-body text-muted-foreground">
            <span className="text-foreground">{meeting.title}</span> was called
            off. Whoever sent the link will know more.
          </p>
          <p className="type-data text-muted-foreground">{meeting.code}</p>
        </div>
      </div>

      {/* `touch`: /j/[code] is a pre-join surface, and the floor there is
          44px. The default h-8 is the dashboard’s density. */}
      <Button asChild size="touch" className="w-full">
        <Link href="/dashboard">Start a new meeting</Link>
      </Button>
    </Centred>
  );
}

function MeetingEnded({ meeting }: { meeting: PublicMeeting }) {
  return (
    <Centred>
      <div className="flex flex-col items-center gap-6 text-center">
        <Mark size={40} title="Parley" />
        <div className="space-y-2">
          <h1 className="type-h1">This meeting has ended</h1>
          <p className="type-body text-muted-foreground">
            <span className="text-foreground">{meeting.title}</span> is over.
            The link still works for a while, but there&rsquo;s nothing to join.
          </p>
          <p className="type-data text-muted-foreground">{meeting.code}</p>
        </div>
      </div>

      {/* `touch`: /j/[code] is a pre-join surface, and the floor there is
          44px. The default h-8 is the dashboard’s density. */}
      <Button asChild size="touch" className="w-full">
        <Link href="/dashboard">Start a new meeting</Link>
      </Button>
    </Centred>
  );
}

/**
 * A missing code is a designed state, not a 404. It says what happened and
 * gives the one thing that can fix it — somewhere to type a different code.
 *
 * This is also where a meeting ended more than 30 days ago lands, once its link
 * has gone stale.
 */
function MeetingNotFound({ code }: { code: string }) {
  return (
    <Centred>
      <div className="flex flex-col items-center gap-6 text-center">
        <Mark size={40} title="Parley" />
        <div className="space-y-2">
          <h1 className="type-h1">That meeting isn&rsquo;t here</h1>
          <p className="type-body text-muted-foreground">
            <span className="type-data">{code}</span> doesn&rsquo;t match a
            meeting. It may be long finished, or the link may have been
            mistyped.
          </p>
        </div>
      </div>

      <JoinCodeForm autoFocus />
    </Centred>
  );
}

function Centred({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-6 py-16">
      {children}
    </div>
  );
}

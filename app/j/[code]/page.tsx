import Link from "next/link";
import type { Metadata } from "next";

import { createAnonClient } from "@/lib/supabase/anon";
import { normaliseMeetingCode } from "@/lib/meetings/code";
import { JoinCodeForm } from "@/components/meetings/JoinCodeForm";
import { Lockup } from "@/components/brand/Lockup";
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
  return <MeetingOpen meeting={meeting} />;
}

/** Scheduled or live. Phase 3 replaces the card with the real join screen. */
function MeetingOpen({ meeting }: { meeting: PublicMeeting }) {
  return (
    <Centred>
      <div className="space-y-3">
        <p className="type-caption text-muted-foreground">You&rsquo;re joining</p>
        <h1 className="type-h1">{meeting.title}</h1>
        <p className="type-code select-all text-muted-foreground">
          {meeting.code}
        </p>
      </div>

      <div className="rounded-lg border border-border p-6">
        <p className="type-body">
          The join screen — camera and microphone preview, device selection, and
          your display name — is the next thing being built.
        </p>
        <p className="type-small mt-2 text-muted-foreground">
          This meeting exists and is open. Nothing about it is lost in the
          meantime.
        </p>
      </div>
    </Centred>
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
function MeetingEnded({ meeting }: { meeting: PublicMeeting }) {
  return (
    <Centred>
      <div className="flex flex-col items-center gap-6 text-center">
        <Lockup variant="stacked" markSize={40} />
        <div className="space-y-2">
          <h1 className="type-h1">This meeting has ended</h1>
          <p className="type-body text-muted-foreground">
            <span className="text-foreground">{meeting.title}</span> is over.
            The link still works for a while, but there&rsquo;s nothing to join.
          </p>
          <p className="type-data text-muted-foreground">{meeting.code}</p>
        </div>
      </div>

      <Button asChild className="w-full">
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
        <Lockup variant="stacked" markSize={40} />
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
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center gap-8 px-6 py-16">
      {children}
    </div>
  );
}

import type { Metadata } from "next";

import { createAnonClient } from "@/lib/supabase/anon";
import { normaliseMeetingCode } from "@/lib/meetings/code";
import { JoinCodeForm } from "@/components/meetings/JoinCodeForm";
import { Lockup } from "@/components/brand/Lockup";

type Params = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { code } = await params;
  const meeting = await resolveMeeting(code);
  return {
    title: meeting ? meeting.title : "Meeting not found",
    // A meeting link is not something to index; the per-meeting OG card for
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
 */
async function resolveMeeting(rawCode: string) {
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

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center gap-8 px-6 py-16">
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
    </div>
  );
}

/**
 * A missing code is a designed state, not a 404. It says what happened and
 * gives the one thing that can fix it — somewhere to type a different code.
 *
 * A code that has ended resolves here too: `get_meeting_by_code` filters
 * ended meetings out, so this page cannot yet tell "never existed" from
 * "finished". The distinct "This meeting has ended" state, with the host's
 * name, needs data the function deliberately does not return, and arrives with
 * the rest of the error routes in Phase 3.
 */
function MeetingNotFound({ code }: { code: string }) {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center gap-8 px-6 py-16">
      <div className="flex flex-col items-center gap-6 text-center">
        <Lockup variant="stacked" markSize={40} />
        <div className="space-y-2">
          <h1 className="type-h1">That meeting isn&rsquo;t here</h1>
          <p className="type-body text-muted-foreground">
            <span className="type-data">{code}</span> doesn&rsquo;t match an open
            meeting. It may have ended, or the link may have been mistyped.
          </p>
        </div>
      </div>

      <JoinCodeForm autoFocus />
    </div>
  );
}

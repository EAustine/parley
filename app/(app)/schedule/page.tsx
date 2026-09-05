import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";

import { createClient } from "@/lib/supabase/server";
import { ScheduleForm } from "@/components/schedule/ScheduleForm";

export const metadata: Metadata = { title: "Schedule a meeting" };

export default async function SchedulePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in?next=/schedule");

  return (
    <div className="mx-auto w-full max-w-xl px-6 py-12">
      <div className="mb-8 space-y-1">
        {/* A 28px minimum: WCAG 2.2 AA SC 2.5.8 asks for 24, and at 13/18
            this link rendered 72x16. Its inline exception does not apply — it
            stands alone above the heading rather than sitting in a sentence.
            28 rather than exactly 24 because a control that passes a floor by
            0.00px passes on rounding, and it is the height the small buttons
            on this surface already use. */}
        <Link
          href="/dashboard"
          className="type-small inline-flex min-h-7 items-center text-muted-foreground hover:text-foreground"
        >
          ← Meetings
        </Link>
        <h1 className="type-h1">Schedule a meeting</h1>
      </div>
      <ScheduleForm cancelHref="/dashboard" />
    </div>
  );
}

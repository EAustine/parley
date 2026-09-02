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
        <Link href="/dashboard" className="type-small text-muted-foreground hover:text-foreground">
          ← Meetings
        </Link>
        <h1 className="type-h1">Schedule a meeting</h1>
      </div>
      <ScheduleForm />
    </div>
  );
}

import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/auth/SignOutButton";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The middleware already redirects, but a Server Component must not assume
  // a guard upstream of it held.
  if (!user) redirect("/sign-in?next=/dashboard");

  // Phase 2 fills this in. Reading through RLS now proves the policy is live.
  const { data: meetings } = await supabase
    .from("meetings")
    .select("id, code, title, scheduled_start, status")
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-12">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="type-h1">Meetings</h1>
          <p className="type-small text-muted-foreground">
            Signed in as {user.email}
          </p>
        </div>
        <SignOutButton />
      </div>

      {meetings && meetings.length > 0 ? (
        <ul className="divide-y divide-border">
          {meetings.map((m) => (
            <li key={m.id} className="flex items-baseline gap-4 py-3">
              <span className="type-body flex-1">{m.title}</span>
              <code className="type-data text-muted-foreground">{m.code}</code>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-lg border border-border p-8 text-center">
          <p className="type-body">
            No meetings yet. Start one now, or schedule for later.
          </p>
          <p className="type-small mt-2 text-muted-foreground">
            Creating meetings arrives in Phase 2.
          </p>
        </div>
      )}
    </div>
  );
}

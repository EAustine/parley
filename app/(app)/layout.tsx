import { createClient } from "@/lib/supabase/server";
import { AuthListener } from "@/components/auth/AuthListener";
import { AccountMenu } from "@/components/shared/AccountMenu";
import { Toaster } from "@/components/ui/sonner";
import { SiteShell } from "@/components/shared/SiteShell";

/**
 * Signed-in surfaces only.
 *
 * AuthListener lives here rather than in the root layout because it pulls
 * supabase-js into whatever bundle contains it. In the root layout that cost
 * lands on the marketing page and, later, on /j/[code] — the guest join screen,
 * which is the highest-traffic route in the product and the one route that
 * never needs an auth session at all.
 *
 * Toaster is here for the same measured reason: in the root layout, sonner and
 * its lucide icons cost 10 kB of the shared baseline, paid by every route
 * whether or not it ever raises a toast. Every toast in Phase 2 — "Link
 * copied", meeting-creation failures — fires inside this group. The room route
 * gets its own when it arrives, rather than the marketing page paying for it.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  /*
   * v1.3 D2. The account menu is passed in from here rather than reached from
   * inside `SiteHeader`, because the header is also rendered by marketing and
   * auth — two public cold-load routes — and `AccountMenu` imports supabase-js.
   * Passing the element keeps that import in this group's graph alone.
   *
   * `getUser()` again, after the page has already called it. It is a validated
   * call against the auth server rather than a cookie read, and a layout cannot
   * borrow a page's result — but both are served from the same request-scoped
   * client, and the alternative is a header that cannot say who is signed in.
   */
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <>
      <AuthListener />
      <SiteShell
        actions={user?.email ? <AccountMenu email={user.email} /> : undefined}
      >
        {children}
      </SiteShell>
      <Toaster />
    </>
  );
}

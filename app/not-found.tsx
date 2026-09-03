import Link from "next/link";
import type { Metadata } from "next";

import { Lockup } from "@/components/brand/Lockup";
import { JoinCodeForm } from "@/components/meetings/JoinCodeForm";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Page not found",
};

/**
 * The last framework default page in the product.
 *
 * CLAUDE.md's "Never do" is about controls: "Ship a working control that lands
 * on a framework default error page." No control reaches this — `MeetingRow`
 * correctly gates its Details link on a meeting having a scheduled time — so
 * the rule was satisfied. The exposure is URL-borne instead, which is the more
 * common way anyone actually arrives: a forwarded `/schedule/<code>` for a
 * meeting that was cancelled, a bookmark that has gone stale, a bare code typed
 * at the root, a typo. Three `notFound()` calls landed here too.
 *
 * §3.2 already decided what this should feel like for a meeting code — "not a
 * 404… what happened, and a field to try another code" — and the reasoning
 * carries: the commonest visitor is someone with a real link that has gone
 * wrong, not someone probing. So this offers the same field.
 *
 * **It carries its own way back**, because it cannot rely on a header being
 * there. Verified both paths: an unmatched URL renders inside the root layout
 * alone, with no header at all, while a `notFound()` thrown inside a route
 * group keeps that group's layouts and does get one. A page whose only exit is
 * the browser's back button is the thing this is replacing, so the link is
 * unconditional.
 */
export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-6 py-16">
      <div className="flex flex-col items-center gap-6 text-center">
        <Lockup variant="stacked" markSize={40} />
        <div className="space-y-2">
          <h1 className="type-h1">That page isn&rsquo;t here</h1>
          <p className="type-body text-balance text-muted-foreground">
            The link may be out of date, or the address may have been mistyped.
            If you were joining a meeting, the code below will get you there.
          </p>
        </div>
      </div>

      <JoinCodeForm autoFocus />

      <Button asChild variant="outline" className="w-full">
        <Link href="/">Back to Parley</Link>
      </Button>
    </div>
  );
}

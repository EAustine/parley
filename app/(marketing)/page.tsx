import Link from "next/link";

import { Lockup } from "@/components/brand/Lockup";
import { SITE_TAGLINE } from "@/lib/site";
import { JoinCodeForm } from "@/components/meetings/JoinCodeForm";
import { Button } from "@/components/ui/button";

/**
 * §3.10a: "`/` has two jobs and no third."
 *
 * It rendered no interactive element at all in production — the only button
 * was gated on `NODE_ENV !== "production"`. So §2's flow C, "Dashboard or home
 * → enter code", was unimplemented from home, and `JoinCodeForm` was mounted
 * only on the unknown-code page: joining by code worked exclusively *after*
 * failing to join.
 *
 * Deliberately not a marketing page. §3.10a: "the product is not seeking
 * users, and an unscoped marketing page built in a final phase is a design
 * exercise with nothing to check it against." The tagline and the lockup are
 * already brand assets with their own spec; the two controls are the two
 * entry points §2 names. Nothing else.
 */
export default function Home() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-10 px-6 py-16">
      <div className="flex flex-col items-center gap-6 text-center">
        <Lockup variant="stacked" markSize={64} />
        <p className="type-display text-balance">{SITE_TAGLINE}</p>
        <p className="type-body max-w-sm text-balance text-muted-foreground">
          Video meetings that guests join without an account, a download, or a
          plugin.
        </p>
      </div>

      <div className="space-y-4">
        {/* The entry point that needs no account — §3.3 calls the guest the
            highest-traffic flow in the product, so it goes first. */}
        <JoinCodeForm />

        <div className="flex items-center gap-3" aria-hidden>
          <span className="h-px flex-1" style={{ background: "var(--border)" }} />
          <span className="type-caption text-muted-foreground">or</span>
          <span className="h-px flex-1" style={{ background: "var(--border)" }} />
        </div>

        <Button asChild variant="outline" className="w-full">
          <Link href="/sign-in">Sign in to start a meeting</Link>
        </Button>
      </div>
    </div>
  );
}

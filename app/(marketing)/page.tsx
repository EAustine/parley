import Link from "next/link";

import { Mark } from "@/components/brand/Mark";
import { SITE_TAGLINE } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";
import { JoinCodeForm } from "@/components/meetings/JoinCodeForm";
import { StartMeetingButton } from "@/components/meetings/StartMeetingButton";
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
 * exercise with nothing to check it against."
 *
 * ## v1.3 E3
 *
 * **The tagline is the heading, not the wordmark.** This set "Parley" at
 * display size in the page body under a 64px stacked lockup — repeating what
 * the header already says, and pushing both entry points below the fold. "A
 * link is all anyone needs" is the proposition and earns the size; the product
 * name does not, and `BRAND.md` says as much in its own words.
 *
 * **Signed in is a different page, not the same page with a swapped button.**
 * "Sign in to start a meeting" is meaningless to someone already signed in, and
 * the hierarchy inverts with them: Start a meeting takes primary, joining by
 * code drops to secondary, sign-in disappears entirely.
 *
 * **And a signed-in visitor is not redirected to `/dashboard`.** They typed the
 * domain or followed a bookmark; a redirect they did not ask for is worse than
 * a page that does the two things they came for. That decision is what makes
 * the signed-in state worth building at all — with a redirect, `/` would be
 * unreachable while signed in and the whole state would be dead code.
 *
 * Reading the session makes this route dynamic, which is one cost. The other is
 * measured and worth naming: `StartMeetingButton` is **18 kB** of this route's
 * first load — `/` is 159 kB without it and 177 with — and a signed-out visitor
 * never renders it. That is the waste §10 objects to, on the coldest, most
 * public route in the product.
 *
 * `next/dynamic` does not fix it. In a Server Component `ssr` defaults to true,
 * so the chunk is part of the initial payload either way; the indirection was
 * tried, measured at exactly 177 kB again, and removed.
 *
 * What would fix it is a server action — a `<form>` that creates the meeting on
 * the server and redirects, with no client component at all. That is the same
 * move §10 endorses for `/sign-in`, which went from 249 kB to 166 by taking its
 * auth calls off the client. It is a refactor E3 did not ask for, and 177
 * against a 190 budget leaves room to make it deliberately rather than in
 * passing. Recorded here so the next person meets a decision rather than a
 * number.
 */
export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    /*
        `flex-1` from `SiteShell`, not a hand-counted `calc(100dvh-4rem)`.
        The header is `h-16` **plus** a `border-b`, so it renders 65px and the
        subtraction left the page 1px taller than its space at every viewport —
        a permanent document overflow. `SiteShell` already gives `<main>`
        `flex-1`; measuring the thing rather than restating it is the rule.
      */
      <div className="mx-auto flex h-full w-full max-w-[400px] flex-col justify-center px-6 py-12">
      <div className="text-center">
        <Mark size={40} className="mx-auto mb-5" aria-hidden />
        {/*
          32/38 at −0.02em, from `.land h1` — and deliberately **not**
          `type-display`, which is 32/36 at no tracking. The type table's
          Display step and the design's landing heading are one line-height and
          one tracking value apart, and `PRD.md` §3.10a makes the design file
          authoritative for this page: "Both states are specified in
          design/01-signin-prejoin.html." Arbitrary values rather than a new
          named role, because one heading on one route does not earn a row in a
          table every other surface reads.
        */}
        <h1 className="text-balance text-[2rem] leading-[2.375rem] font-semibold tracking-[-0.02em]">
          {SITE_TAGLINE}
        </h1>
        <p className="mt-2.5 text-balance type-body text-muted-foreground">
          {user ? (
            <>
              {/*
                Naming the account is E3's stated reason for this line:
                "someone with two Google accounts should know which one they
                are in *before* they create a meeting under it."
              */}
              Signed in as{" "}
              <span className="text-foreground">{user.email}</span>
            </>
          ) : (
            "Video meetings that guests join without an account, a download, or a plugin."
          )}
        </p>
      </div>

      <div className="mt-8 space-y-4 rounded-xl border border-boundary bg-popover p-5 text-left">
        {user ? (
          <>
            <StartMeetingButton size="touch" className="w-full" label="Start a meeting" />
            <Divider>or join one</Divider>
            {/* Secondary while signed in — the same control, one fill down. */}
            <JoinCodeForm variant="secondary" />
          </>
        ) : (
          /* The entry point that needs no account — §3.3 calls the guest the
             highest-traffic flow in the product, so it goes first. */
          <JoinCodeForm />
        )}
      </div>

      {user ? (
        <p className="mt-5 text-center type-small text-muted-foreground">
          Looking for something you scheduled?{" "}
          {/*
            Underlined always, not on hover.
            The design leaves this link distinguished from its sentence by
            colour alone, and axe caught it as `link-in-text-block` (serious) on
            the state's first scan. `CLAUDE.md`'s floor is unambiguous —
            "nothing depends on colour alone" — and a link *inside* running text
            is the case WCAG 1.4.1 names. The sign-in page's escape hatch does
            not need this: it is the whole paragraph, not a phrase within one.
          */}
          <Link
            href="/dashboard"
            className="text-foreground underline underline-offset-4"
          >
            Your meetings →
          </Link>
        </p>
      ) : (
        <div className="mt-5">
          <Divider>or</Divider>
          <Button asChild variant="outline" size="touch" className="mt-4 w-full">
            <Link href="/sign-in">Sign in to start a meeting</Link>
          </Button>
        </div>
      )}
    </div>
  );
}

function Divider({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3" aria-hidden>
      <span className="h-px flex-1" style={{ background: "var(--border)" }} />
      {/* Small (13/18/400), which is what the design's `.divider` resolves to —
          not Caption (12/16/500). Two different roles in the type table. */}
      <span className="type-small font-normal text-muted-foreground">{children}</span>
      <span className="h-px flex-1" style={{ background: "var(--border)" }} />
    </div>
  );
}

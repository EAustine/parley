import type { Metadata } from "next";
import Link from "next/link";

import { Mark } from "@/components/brand/Mark";
import { SignInForm } from "@/components/auth/SignInForm";
import { safeNextPath } from "@/lib/auth/redirect";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to host meetings on Parley.",
};

/**
 * The query is read here rather than in the form.
 *
 * `useSearchParams` needed a Suspense boundary to keep this route statically
 * renderable, and the skeleton behind it was a designed state for a wait that
 * only existed because the form was reading the URL on the client. A server
 * component reads `searchParams` directly and hands down two strings.
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const nextPath = safeNextPath(next);

  return (
    <div className="mx-auto flex w-full max-w-[400px] flex-col px-6 py-12 sm:py-16">
      {/*
        v1.3 E1: "The wordmark had more weight than the task. Mark at 36px,
        'Sign in' as the heading."

        This was a stacked `Lockup` — mark over wordmark — so the first thing on
        the page was the product's name, above the name of the thing you came to
        do. `BRAND.md` already says the mark carries the idea and the wordmark
        stays quiet; on a page whose entire job is one task, the wordmark is the
        loudest element saying the least. The mark alone keeps the identity and
        gives the heading back its place.
      */}
      <div className="flex flex-col items-center gap-5 text-center">
        <Mark size={36} aria-hidden />
        <div className="space-y-2">
          <h1 className="type-h1">Sign in</h1>
          <p className="type-body text-muted-foreground">
            You only need an account to host.
            <br />
            Joining a meeting never does.
          </p>
        </div>
      </div>

      {/*
        E1: "form on a `--popover` card with a `--boundary` edge so it is a
        surface rather than floating text."

        `--boundary` rather than `--border`, and the reason is the palette: the
        whole ramp spans 0.2 of a contrast point, so `--popover` against
        `--background` is not a fill difference anyone can see. Any surface that
        must read as a distinct plane needs an edge — 4.32:1 light, 3.05:1 dark.
      */}
      <div className="mt-8 rounded-xl border border-boundary bg-popover p-6">
        <SignInForm next={nextPath} callbackError={error} />
      </div>

      {/*
        E1: "An escape hatch for someone who arrived with a code and needs no
        account."

        The page above says joining never needs an account, and until now said
        it to someone with no way to act on it — `/` carries the code field
        (Phase 10), and this is the only screen where that sentence is
        answering a question somebody is actually holding.
      */}
      <p className="mt-4 text-center">
        {/*
          `inline-flex` with a height, because this is a target rather than a
          line of prose with a link in it.
          `check:targets` measured it at **291×16** and failed sign-in's 24px
          floor — and it was right to: `e2e/targets.ts` exempts inline links
          only when a sibling text node puts them inside a sentence, and this
          one is the whole paragraph. 44px rather than the floor's 24, because
          it is the escape hatch for someone who arrived with a link and does
          not want an account, on a phone.
        */}
        <Link
          href="/"
          className="inline-flex min-h-11 items-center justify-center px-2 type-small text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Have a meeting code? Join without an account →
        </Link>
      </p>
    </div>
  );
}

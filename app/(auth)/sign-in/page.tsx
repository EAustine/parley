import type { Metadata } from "next";

import { Lockup } from "@/components/brand/Lockup";
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
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-10 px-6 py-20">
      <div className="flex flex-col items-center gap-6 text-center">
        <Lockup variant="stacked" markSize={40} />
        <div className="space-y-2">
          <h1 className="type-h1">Sign in</h1>
          <p className="type-body text-muted-foreground">
            You only need an account to host. Joining a meeting never does.
          </p>
        </div>
      </div>

      <SignInForm next={safeNextPath(next)} callbackError={error} />
    </div>
  );
}

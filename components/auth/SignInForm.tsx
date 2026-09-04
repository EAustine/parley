"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { HugeiconsIcon } from "@hugeicons/react";

import {
  requestMagicLink,
  startGoogleSignIn,
  type SignInState,
} from "@/app/(auth)/sign-in/actions";
import { ICONS } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

/**
 * Sign in with a magic link or with Google. No password flow — one less
 * surface, one less set of states.
 *
 * **No `supabase-js` here.** Both calls moved to server actions in
 * `app/(auth)/sign-in/actions.ts`, which took this route's first
 * load from 249 kB to 166 kB — `PRD.md` §10 asked for it because `/sign-in` is public, cold, and the
 * first thing a host sees.
 *
 * The states are still idle, sending, sent, and error; each is designed, and
 * none of them is a spinner with no explanation. What changed is where they
 * come from. `useActionState` renders the action's return value, so the "sent"
 * screen is a server response rather than client state — which is what lets the
 * whole form work with JavaScript turned off. The address is echoed from the
 * POST body rather than round-tripped through the URL, so it never lands in
 * browser history.
 *
 * `next` rides in a hidden field rather than `useSearchParams`, which also
 * removes the Suspense boundary the old version needed to stay static.
 */
export function SignInForm({
  next,
  callbackError,
}: {
  next: string;
  /** An expired or reused link, handed down by the page from the query. */
  callbackError?: string;
}) {
  const initial: SignInState = callbackError
    ? { kind: "error", message: callbackError }
    : { kind: "idle" };
  const [state, submit] = useActionState(requestMagicLink, initial);

  if (state.kind === "sent") {
    return (
      <div className="space-y-4" role="status" aria-live="polite">
        <div className="space-y-2">
          <h2 className="type-h2">Check your email</h2>
          <p className="type-body text-muted-foreground">
            A sign-in link is on its way to{" "}
            <span className="text-foreground">{state.email}</span>. It expires in
            an hour and works once.
          </p>
        </div>
        {/* A link, not a button: it re-renders the idle form from the server,
            which is the same thing the button did and works without script. */}
        <Button variant="outline" asChild className="w-full">
          <a href={`/sign-in?next=${encodeURIComponent(next)}`}>
            Use a different email
          </a>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <form action={startGoogleSignIn}>
        <input type="hidden" name="next" value={next} />
        <GoogleButton />
      </form>

      <div className="flex items-center gap-4">
        <Separator className="flex-1" />
        <span className="type-caption text-muted-foreground">or</span>
        <Separator className="flex-1" />
      </div>

      <form action={submit} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <div className="space-y-2">
          <Label htmlFor="email" className="type-small">
            Email
          </Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@example.com"
            aria-describedby={state.kind === "error" ? "signin-error" : undefined}
            aria-invalid={state.kind === "error" || undefined}
          />
        </div>
        <MagicLinkButton />
      </form>

      {state.kind === "error" && (
        <p
          id="signin-error"
          role="alert"
          className="type-small text-[var(--state-critical)]"
        >
          {state.message}
        </p>
      )}
    </div>
  );
}

/**
 * The pending states, which `useFormStatus` can only read from inside the form
 * it belongs to — hence two small components rather than one flag threaded
 * through both. They cost nothing: `react-dom` is already in every bundle.
 */
function MagicLinkButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Sending link…" : "Email me a sign-in link"}
    </Button>
  );
}

function GoogleButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" className="w-full" disabled={pending}>
      <HugeiconsIcon
        icon={ICONS.google.icon}
        size={20}
        strokeWidth={1.5}
        color="currentColor"
        aria-hidden
      />
      {pending ? "Opening Google…" : "Continue with Google"}
    </Button>
  );
}

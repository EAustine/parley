"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";

import { createClient } from "@/lib/supabase/client";
import { safeNextPath } from "@/lib/auth/redirect";
import { authErrorMessage } from "@/lib/auth/errors";
import { ICONS } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

/**
 * Sign in with a magic link or with Google. No password flow — one less
 * surface, one less set of states.
 *
 * The states are: idle, sending, sent, and error. Each is designed; none of
 * them is a spinner with no explanation.
 */
type Status =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent"; email: string }
  | { kind: "error"; message: string };

export function SignInForm() {
  const params = useSearchParams();
  const next = safeNextPath(params.get("next"));

  // An error from the callback route — an expired or reused link.
  const callbackError = params.get("error");

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>(
    callbackError ? { kind: "error", message: callbackError } : { kind: "idle" },
  );
  const [googleBusy, setGoogleBusy] = useState(false);

  const redirectTo = () =>
    `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  async function sendMagicLink(event: React.FormEvent) {
    event.preventDefault();
    const address = email.trim();
    if (!address) return;

    setStatus({ kind: "sending" });
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: address,
      options: { emailRedirectTo: redirectTo() },
    });

    setStatus(
      error
        ? { kind: "error", message: authErrorMessage(error.message) }
        : { kind: "sent", email: address },
    );
  }

  async function signInWithGoogle() {
    setGoogleBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirectTo() },
    });
    // On success the browser has already left the page.
    if (error) {
      setGoogleBusy(false);
      setStatus({ kind: "error", message: authErrorMessage(error.message) });
    }
  }

  if (status.kind === "sent") {
    return (
      <div className="space-y-4" role="status" aria-live="polite">
        <div className="space-y-2">
          <h2 className="type-h2">Check your email</h2>
          <p className="type-body text-muted-foreground">
            A sign-in link is on its way to{" "}
            <span className="text-foreground">{status.email}</span>. It expires
            in an hour and works once.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => setStatus({ kind: "idle" })}
          className="w-full"
        >
          Use a different email
        </Button>
      </div>
    );
  }

  const sending = status.kind === "sending";

  return (
    <div className="space-y-6">
      <Button
        variant="outline"
        className="w-full"
        onClick={signInWithGoogle}
        disabled={googleBusy || sending}
      >
        <HugeiconsIcon
          icon={ICONS.google.icon}
          size={20}
          strokeWidth={1.5}
          color="currentColor"
          aria-hidden
        />
        {googleBusy ? "Opening Google…" : "Continue with Google"}
      </Button>

      <div className="flex items-center gap-4">
        <Separator className="flex-1" />
        <span className="type-caption text-muted-foreground">or</span>
        <Separator className="flex-1" />
      </div>

      <form onSubmit={sendMagicLink} className="space-y-4">
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
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={sending || googleBusy}
            aria-describedby={status.kind === "error" ? "signin-error" : undefined}
            aria-invalid={status.kind === "error" || undefined}
          />
        </div>

        <Button
          type="submit"
          className="w-full"
          disabled={sending || googleBusy || !email.trim()}
        >
          {sending ? "Sending link…" : "Email me a sign-in link"}
        </Button>
      </form>

      {status.kind === "error" && (
        <p
          id="signin-error"
          role="alert"
          className="type-small text-[var(--state-critical)]"
        >
          {status.message}
        </p>
      )}
    </div>
  );
}

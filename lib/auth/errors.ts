/**
 * Supabase's auth errors in Parley's voice.
 *
 * The provider's strings are accurate but they are its vocabulary, not ours —
 * "Email address … is invalid", "For security purposes, you can only request
 * this after 47 seconds". CLAUDE.md's copy rule is that an error says what
 * happened and what to do next, so the ones people actually hit are rewritten.
 *
 * Anything unrecognised passes through unchanged. A wrong-but-specific message
 * from the provider beats a vague one of our own invention, and swallowing it
 * would make a real fault harder to diagnose.
 */
export function authErrorMessage(raw: string | undefined | null): string {
  if (!raw) return "Something went wrong. Try again.";

  const message = raw.toLowerCase();

  if (message.includes("rate limit") || message.includes("after")) {
    return "Too many requests just now. Wait a minute, then try again.";
  }
  if (message.includes("invalid") && message.includes("email")) {
    return "That email address isn't valid. Check it and try again.";
  }
  if (message.includes("signups not allowed") || message.includes("otp_disabled")) {
    return "Sign-in by email is turned off for this deployment.";
  }
  if (message.includes("expired") || message.includes("already been used")) {
    return "That link has expired or has already been used. Request a new one.";
  }

  return raw;
}

import type { User } from "@supabase/supabase-js";

import { sanitiseDisplayName } from "@/lib/livekit/identity";

/**
 * What an account is called — or nothing, which is the common answer.
 *
 * ## An email address is not a display name
 *
 * The token route used to read
 * `full_name ?? user.email ?? "Host"`, and the join page had the same chain
 * written out a second time. Both were wrong in the same two ways.
 *
 * **The email.** A display name is drawn on a tile, listed in the people
 * panel, attached to every chat line, spoken in join and leave announcements,
 * and read out in "{name} asked you to mute" — to everyone holding the link.
 * §3.2 decided that a link-holder is told a meeting's *title* and never its
 * host's identity, on the grounds that a name is a new class of disclosure. An
 * address someone can write to is a wider one still, and it went out under the
 * host's own face without them ever choosing it.
 *
 * It was not an edge case either. §3.1 offers two ways in and only one of them
 * leaves a name: Google fills `full_name` from the profile, `signInWithOtp` asks
 * for an address and nothing else, and nothing writes the field afterwards. So
 * for **every magic-link account** the branch meant to be rare was the whole
 * answer — and the magic link is the path the sign-in form leads with.
 *
 * **The `"Host"` at the end.** A meeting that disallows guests is joined by
 * signed-in people who are not its host, and they reached that fallback too —
 * so several participants could be labelled "Host", none of whom was.
 *
 * ## What replaces them
 *
 * Nothing. This returns null when the account carries no name, and the two
 * callers do what they already do for a guest with no name: pre-join asks, and
 * the token route refuses until someone answers. Manufacturing a label was the
 * mistake; the fix is to have the person say what they want to be called,
 * which is the thing the join screen has always been for.
 *
 * Sanitised through the same function a guest's typed name goes through.
 * `user_metadata` is writable by the account holder — it is untrusted string
 * data that happens to arrive by a different road, and a bidi override in it
 * reorders a tile label exactly as one typed into the field would.
 */
export function accountDisplayName(user: User | null | undefined): string | null {
  return sanitiseDisplayName(user?.user_metadata?.full_name);
}

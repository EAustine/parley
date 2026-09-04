"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { HugeiconsIcon } from "@hugeicons/react";

import { ICONS } from "@/lib/icons";
import { createClient } from "@/lib/supabase/client";
import { AUTH_CHANNEL } from "@/components/auth/AuthListener";
import { MenuItem, PopupMenu } from "@/components/shared/PopupMenu";

/**
 * v1.3 D2: "'Sign out' was a peer of 'Start meeting', which it is not."
 *
 * It was the third button in the dashboard's page-action row, beside the two
 * things you came to the page to do. It moves here, into a menu carrying the
 * email, the theme and sign out — the account's controls, gathered where an
 * account's controls go.
 *
 * ## Only on signed-in surfaces, and the reason is a budget
 *
 * `SiteHeader` is rendered by four route groups — marketing, auth, dev and
 * (app) — and two of those are public cold-load routes with tight budgets in
 * PRD §10. This component imports `supabase-js`, so it must not be reachable
 * from the header itself. It is passed *in* by `(app)/layout.tsx` as a slot,
 * which keeps the import out of every other group's graph. The standalone
 * `ThemeToggle` stays for those groups: signed-out visitors do not lose theme
 * control because the menu that now carries it is not rendered for them.
 *
 * ## The identity block is not a menu item
 *
 * `role="menu"` restricts its owned children to menuitem, menuitemcheckbox,
 * menuitemradio, group and separator. The design puts a name and an email
 * inside the menu, which is none of those — so it goes through `PopupMenu`'s
 * `header` slot, rendered on the popup surface and outside the menu element.
 *
 * ## Sign out lives here now, not beside it
 *
 * The logic moved rather than being called: `SignOutButton` is deleted in the
 * same change. Leaving it behind would make it unreachable from `app/`, and
 * `check:deps` fails on exactly that — "the fix is deletion, not
 * justification".
 */
export function AccountMenu({ email }: { email: string }) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [busy, setBusy] = useState(false);

  // The server cannot know the resolved theme, so anything naming it is only
  // correct after hydration — the reasoning `ThemeToggle` already carries, kept
  // rather than restated, because the item is now inside a menu and the name is
  // read aloud when the menu opens.
  useEffect(() => setMounted(true), []);
  const isDark = resolvedTheme === "dark";
  const themeLabel = mounted
    ? isDark
      ? "Switch to light theme"
      : "Switch to dark theme"
    : "Switch theme";

  /**
   * Signs out here, then tells the other tabs. Without the broadcast they keep
   * rendering a signed-in shell until something else forces a navigation —
   * which looks like the sign-out silently failed.
   */
  async function signOut() {
    if (busy) return;
    setBusy(true);
    const supabase = createClient();
    await supabase.auth.signOut();

    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel(AUTH_CHANNEL);
      channel.postMessage({ event: "SIGNED_OUT" });
      channel.close();
    }

    router.refresh();
    router.push("/sign-in");
  }

  return (
    <PopupMenu
      id="account-menu"
      menuLabel="Account"
      placement="below"
      // Rule 7: the trigger is an avatar and a chevron, so it needs a name.
      // The design gives it neither, and axe would not have caught that — the
      // avatar's initial is text, so the button has *a* name: the letter "A".
      triggerLabel={`Account, ${email}`}
      triggerClassName="flex h-10 items-center gap-2 rounded-full border border-transparent pr-2 pl-1 hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] data-[open]:bg-secondary"
      trigger={
        <>
          {/* Uniform, never a per-identity hue — the avatar rule, same as the
              room's tiles. */}
          <span
            aria-hidden
            className="type-small flex size-8 items-center justify-center rounded-full bg-secondary font-semibold"
          >
            {email.slice(0, 1).toUpperCase()}
          </span>
          <HugeiconsIcon
            icon={ICONS.chevronDown.icon}
            size={14}
            strokeWidth={1.5}
            color="currentColor"
            aria-hidden
            // Driven off the trigger's `data-open`, and travel is dropped under
            // `prefers-reduced-motion` — the design declares the rotation and
            // no reduced-motion block anywhere in the file.
            className="text-muted-foreground transition-transform duration-[120ms] [[data-open]_&]:rotate-180 motion-reduce:transition-none"
          />
        </>
      }
      header={
        // `max-w` so a long address ellipsises instead of widening the popup
        // past the trigger it hangs from — `truncate` needs something to
        // truncate against, and `min-w-[260px]` is a floor, not a ceiling.
        <div className="mb-1.5 max-w-[240px] border-b border-border px-2.5 pt-2 pb-2.5">
          <p className="type-small truncate text-muted-foreground">Signed in as</p>
          <p className="type-body truncate font-medium">{email}</p>
        </div>
      }
    >
      {(close) => (
        <>
          <MenuItem
            icon={
              <HugeiconsIcon
                icon={mounted && isDark ? ICONS.themeLight.icon : ICONS.themeDark.icon}
                size={16}
                strokeWidth={1.5}
                color="currentColor"
                aria-hidden
              />
            }
            title={themeLabel}
            onSelect={() => {
              setTheme(isDark ? "light" : "dark");
              close();
            }}
          />
          <MenuItem
            icon={
              <HugeiconsIcon
                icon={ICONS.signOut.icon}
                size={16}
                strokeWidth={1.5}
                color="currentColor"
                aria-hidden
              />
            }
            title={busy ? "Signing out…" : "Sign out"}
            onSelect={signOut}
          />
        </>
      )}
    </PopupMenu>
  );
}

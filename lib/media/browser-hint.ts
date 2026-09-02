/**
 * Where the camera permission actually lives, per browser.
 *
 * BUILD-PLAN's permission matrix is blunt about this: in the denied state the
 * copy *is* the deliverable, and "please enable camera access in your browser
 * settings" is the failure the screen exists to avoid. Someone who has blocked
 * the camera cannot be re-prompted by the page — the only thing that helps is
 * being told where the switch is, and it is in a different place in every
 * browser.
 *
 * Extracted from the component so the table can be asserted rather than
 * eyeballed once. User-agent sniffing is the wrong tool for feature detection
 * and the right one here: the question is literally "which browser's menus am
 * I describing", which nothing else can answer.
 *
 * Order matters and is not alphabetical. Chrome's UA contains `Safari/`, and
 * Edge's contains both `Chrome/` and `Safari/`, so the most specific token
 * has to be tested first or every Edge user is sent to a Chrome menu.
 */

export function permissionLocation(userAgent: string | null): string {
  if (!userAgent) return "your browser's site settings";

  if (/Firefox\//.test(userAgent)) {
    return "the padlock in the address bar, then Connection secure → More information → Permissions";
  }
  if (/Edg\//.test(userAgent)) {
    return "the padlock in the address bar → Permissions for this site";
  }
  if (/Chrome\/|CriOS\//.test(userAgent)) {
    return "the icon at the left of the address bar → Site settings";
  }
  // iOS before macOS: iPhones and iPads have no menu bar, so the Safari
  // desktop instructions name a menu that isn't there.
  if (/iPhone|iPad|iPod/.test(userAgent)) {
    return "the ᴀA button in the address bar → Website Settings, or Settings → Safari → Camera";
  }
  if (/Safari\//.test(userAgent)) {
    return "Safari → Settings for This Website, or Safari → Settings → Websites → Camera";
  }
  return "your browser's site settings";
}

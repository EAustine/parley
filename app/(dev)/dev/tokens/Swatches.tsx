"use client";

import { useEffect, useState } from "react";

/**
 * Token name, resolved value, and role. Values are read from computed styles so
 * a swatch cannot drift from what the stylesheet actually declares.
 */

const GROUPS: { title: string; tokens: { name: string; role: string }[] }[] = [
  {
    title: "Surfaces",
    tokens: [
      { name: "--background", role: "Page ground" },
      { name: "--card", role: "Card fill" },
      { name: "--popover", role: "Popover and modal fill" },
      { name: "--muted", role: "Quiet fill" },
      { name: "--secondary", role: "Control fill — mute-off, camera-off" },
      { name: "--accent", role: "Hover fill" },
    ],
  },
  {
    title: "Foregrounds",
    tokens: [
      { name: "--foreground", role: "Body text, speaking ring" },
      { name: "--muted-foreground", role: "Metadata, secondary text" },
      { name: "--primary", role: "Primary action fill" },
      { name: "--primary-foreground", role: "Text on primary" },
      { name: "--secondary-foreground", role: "Text on secondary" },
      { name: "--accent-foreground", role: "Text on accent" },
    ],
  },
  {
    title: "Lines",
    tokens: [
      { name: "--border", role: "Chrome divider" },
      { name: "--input", role: "Field boundary" },
      { name: "--ring", role: "Focus ring, 2px offset" },
      { name: "--tile-border", role: "Room tile hairline — 1px idle" },
    ],
  },
  {
    title: "Hue — spent only here",
    tokens: [
      { name: "--destructive", role: "Leave and end meeting fill" },
      { name: "--destructive-foreground", role: "Text on destructive" },
      { name: "--state-critical", role: "Connection lost" },
      { name: "--state-warning", role: "Connection unstable" },
    ],
  },
  {
    title: "Theme-invariant",
    tokens: [
      { name: "--scrim", role: "Behind every label that sits over video" },
      { name: "--radius", role: "0.5rem — tiles use 0.75rem" },
    ],
  },
];

const ALL = GROUPS.flatMap((g) => g.tokens.map((t) => t.name));

export function Swatches() {
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    const read = () => {
      const styles = getComputedStyle(document.documentElement);
      setValues(
        Object.fromEntries(
          ALL.map((t) => [t, styles.getPropertyValue(t).trim()]),
        ),
      );
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  return (
    <div className="space-y-8">
      {GROUPS.map((group) => (
        <div key={group.title} className="space-y-3">
          <h3 className="type-caption text-muted-foreground">{group.title}</h3>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.tokens.map((token) => (
              <li
                key={token.name}
                className="flex items-center gap-3 rounded-lg border border-border p-3"
              >
                <span
                  aria-hidden
                  className="size-10 shrink-0 rounded-md border border-border"
                  style={{ background: `var(${token.name})` }}
                />
                <div className="min-w-0">
                  <code className="type-data block truncate">{token.name}</code>
                  <span className="type-data block truncate text-muted-foreground">
                    {values[token.name] || "—"}
                  </span>
                  <span className="type-caption block truncate text-muted-foreground">
                    {token.role}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

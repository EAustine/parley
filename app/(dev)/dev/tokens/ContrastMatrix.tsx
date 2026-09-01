"use client";

import { useEffect, useState } from "react";

import { level, ratio } from "@/lib/contrast";
import { cn } from "@/lib/utils";

/**
 * Every foreground token against every surface — the full matrix, not one
 * column. Checking a single pair is how --state-critical shipped at 4.03:1 on
 * --muted while passing on --background.
 *
 * Values are read from the live computed styles, so this reflects whatever
 * globals.css actually declares for the active theme.
 *
 * Three thresholds, because one number does not fit three jobs:
 *
 *   text     4.5:1  WCAG 1.4.3. Must pass.
 *   focus    3.0:1  WCAG 1.4.11. Must pass.
 *   hairline none   --border and --tile-border are deliberately below 3:1.
 *                   They divide, they do not carry meaning. The speaking ring
 *                   is what has to read, and it jumps to --foreground.
 *                   Reported for the record, not graded.
 */

type Kind = "text" | "focus" | "hairline";

const FOREGROUNDS: { token: string; kind: Kind }[] = [
  { token: "--foreground", kind: "text" },
  { token: "--muted-foreground", kind: "text" },
  { token: "--primary", kind: "text" },
  { token: "--secondary-foreground", kind: "text" },
  { token: "--accent-foreground", kind: "text" },
  { token: "--card-foreground", kind: "text" },
  { token: "--popover-foreground", kind: "text" },
  { token: "--state-critical", kind: "text" },
  { token: "--state-warning", kind: "text" },
  { token: "--ring", kind: "focus" },
  { token: "--border", kind: "hairline" },
  { token: "--input", kind: "hairline" },
  { token: "--tile-border", kind: "hairline" },
];

const SURFACES = [
  "--background",
  "--card",
  "--muted",
  "--popover",
  "--secondary",
] as const;

const THRESHOLD: Record<Kind, number | null> = {
  text: 4.5,
  focus: 3,
  hairline: null,
};

function readTokens(): Record<string, string> {
  const styles = getComputedStyle(document.documentElement);
  const all = [
    ...FOREGROUNDS.map((f) => f.token),
    ...SURFACES,
    "--destructive",
    "--destructive-foreground",
  ];
  return Object.fromEntries(
    all.map((t) => [t, styles.getPropertyValue(t).trim()]),
  );
}

function grade(kind: Kind, value: number): { label: string; ok: boolean } {
  const threshold = THRESHOLD[kind];
  if (threshold === null) return { label: "hairline", ok: true };
  const ok = value >= threshold;
  return { label: ok ? level(value) : "fail", ok };
}

export function ContrastMatrix() {
  const [tokens, setTokens] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    const read = () => setTokens(readTokens());
    read();
    // Re-read when next-themes swaps the class on <html>.
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  if (!tokens) {
    return (
      <p className="type-small text-muted-foreground">
        Reading computed styles…
      </p>
    );
  }

  const failures: string[] = [];
  for (const { token, kind } of FOREGROUNDS) {
    for (const surface of SURFACES) {
      const value = ratio(tokens[token], tokens[surface]);
      if (value !== null && !grade(kind, value).ok) {
        failures.push(`${token} on ${surface}`);
      }
    }
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <caption className="sr-only">
            Contrast ratio of every foreground token against every surface
            token, computed from live CSS values.
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="type-caption border-b border-border p-2 text-left text-muted-foreground"
              >
                Foreground
              </th>
              {SURFACES.map((s) => (
                <th
                  key={s}
                  scope="col"
                  className="type-caption border-b border-border p-2 text-left text-muted-foreground"
                >
                  {s.replace("--", "")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {FOREGROUNDS.map(({ token, kind }) => (
              <tr key={token}>
                <th
                  scope="row"
                  className="type-small border-b border-border p-2 text-left font-normal whitespace-nowrap"
                >
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="size-3 shrink-0 rounded-full border border-border"
                      style={{ backgroundColor: `var(${token})` }}
                    />
                    <code className="type-data">{token}</code>
                  </span>
                </th>
                {SURFACES.map((surface) => {
                  const value = ratio(tokens[token], tokens[surface]);
                  const g = value === null ? null : grade(kind, value);
                  return (
                    <td
                      key={surface}
                      className="border-b border-border p-2 align-top"
                      style={{ backgroundColor: `var(${surface})` }}
                    >
                      <div className="flex flex-col">
                        {/* Text and focus tokens print in their own colour, so
                            the number doubles as the demonstration. Hairlines
                            are unreadable that way — by design — so they print
                            in muted-foreground with a swatch alongside. */}
                        <span className="flex items-center gap-1.5">
                          {kind === "hairline" && (
                            <span
                              aria-hidden
                              className="h-3 w-3 shrink-0 rounded-full"
                              style={{ backgroundColor: `var(${token})` }}
                            />
                          )}
                          <span
                            className="type-data tabular"
                            style={{
                              color:
                                kind === "hairline"
                                  ? "var(--muted-foreground)"
                                  : `var(${token})`,
                            }}
                          >
                            {value === null ? "—" : value.toFixed(2)}
                          </span>
                        </span>
                        <span
                          className={cn(
                            "type-caption",
                            g?.ok
                              ? "text-muted-foreground"
                              : "text-[var(--state-critical)]",
                          )}
                        >
                          {g?.label ?? ""}
                        </span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p
        className={cn(
          "type-small",
          failures.length === 0
            ? "text-muted-foreground"
            : "text-[var(--state-critical)]",
        )}
        role="status"
      >
        {failures.length === 0
          ? "Every graded pair clears its threshold — 4.5:1 for text, 3:1 for the focus ring. Hairlines are reported, not graded."
          : `${failures.length} pair(s) below threshold: ${failures.join(", ")}`}
      </p>
    </div>
  );
}

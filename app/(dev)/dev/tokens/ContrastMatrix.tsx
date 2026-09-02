"use client";

import { useEffect, useState } from "react";

import { parseColor, ratio } from "@/lib/contrast";
import {
  ALL_SURFACES,
  PAIR_RULES,
  RULES,
  SCRIM_OVER_WHITE,
  type ContrastRule,
} from "@/lib/contrast-rules";
import { cn } from "@/lib/utils";

/**
 * The same rules `npm run check:contrast` enforces, rendered against the live
 * computed styles. The script is the gate; this is the visual check that the
 * gate is describing the thing you can actually see.
 *
 * Pairs outside a token's permitted surfaces are shown greyed with their ratio,
 * so the exclusion is legible rather than hidden — you can see that
 * --state-critical on --input really is 4.34:1, and why it is excluded rather
 * than chased.
 */

function readTokens(): Record<string, string> {
  const styles = getComputedStyle(document.documentElement);
  const names = new Set<string>([
    ...ALL_SURFACES,
    ...RULES.map((r) => r.token),
    ...RULES.flatMap((r) => r.surfaces),
    ...PAIR_RULES.map((r) => r.token),
    ...PAIR_RULES.flatMap((r) => r.surfaces),
  ]);
  const tokens = Object.fromEntries(
    [...names].map((t) => [t, styles.getPropertyValue(t).trim()]),
  );

  /**
   * The scrim is not a surface the browser can hand back — it is `rgba()`, and
   * what matters is what it resolves to over video. Composited here the same
   * way `scripts/contrast.mjs` does it, over white as the worst case for light
   * text, so this page and the gate are looking at the same colour.
   */
  const scrim = parseColor(styles.getPropertyValue("--scrim").trim());
  const alpha = readAlpha(styles.getPropertyValue("--scrim").trim());
  tokens[SCRIM_OVER_WHITE] = scrim
    ? rgbToHex({
        r: Math.round(alpha * scrim.r + (1 - alpha) * 255),
        g: Math.round(alpha * scrim.g + (1 - alpha) * 255),
        b: Math.round(alpha * scrim.b + (1 - alpha) * 255),
      })
    : "";

  return tokens;
}

/** `parseColor` deliberately ignores alpha; compositing needs it. */
function readAlpha(value: string): number {
  const m = value.match(/rgba?\([^)]*,\s*([\d.]+)\s*\)/);
  return m ? Number(m[1]) : 1;
}

function rgbToHex({ r, g, b }: { r: number; g: number; b: number }): string {
  return "#" + [r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("");
}

function useLiveTokens() {
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

  return tokens;
}

/**
 * The scrim is a column like any other, and showing it is the point: greyed at
 * 2.53:1, `--state-critical` on the scrim is exactly the number rule 4 exists
 * because of. Hiding the excluded pair would hide the reason.
 */
const COLUMNS = [...ALL_SURFACES, SCRIM_OVER_WHITE];

/** Rules are keyed by token *and* surfaces — `--foreground` appears twice. */
const ruleKey = (rule: ContrastRule) =>
  `${rule.token}|${[...rule.surfaces].join(",")}`;

export function ContrastMatrix() {
  const tokens = useLiveTokens();

  if (!tokens) {
    return (
      <p className="type-small text-muted-foreground">
        Reading computed styles…
      </p>
    );
  }

  const failures: string[] = [];
  for (const rule of RULES) {
    for (const surface of rule.surfaces) {
      const value = ratio(tokens[rule.token], tokens[surface]);
      if (value !== null && value < rule.threshold) {
        failures.push(
          `${rule.token} on ${surface} (${value.toFixed(2)}, needs ${rule.threshold})`,
        );
      }
    }
  }

  return (
    <div className="space-y-6">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <caption className="sr-only">
            Contrast ratio of every foreground token against every surface,
            computed from live CSS values. Pairs outside a token&rsquo;s
            permitted surfaces are greyed.
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="type-caption border-b border-border p-2 text-left text-muted-foreground"
              >
                Token
              </th>
              <th
                scope="col"
                className="type-caption border-b border-border p-2 text-left text-muted-foreground"
              >
                Needs
              </th>
              {COLUMNS.map((s) => (
                <th
                  key={s}
                  scope="col"
                  className="type-caption border-b border-border p-2 text-left text-muted-foreground"
                >
                  {s === SCRIM_OVER_WHITE ? "scrim/video" : s.replace("--", "")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {RULES.map((rule) => (
              <Row key={ruleKey(rule)} rule={rule} tokens={tokens} />
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
          ? "Every permitted pair clears its threshold. Greyed cells are outside the token's permitted surfaces and are not required to pass — npm run check:contrast enforces the same rules."
          : `${failures.length} violation(s): ${failures.join(", ")}`}
      </p>

      <div className="space-y-2">
        {RULES.filter((r) => r.note).map((r) => (
          <p key={ruleKey(r)} className="type-small text-muted-foreground">
            <code className="type-data">{r.label ?? r.token}</code> — {r.note}
          </p>
        ))}
      </div>

      <div>
        <h3 className="type-caption mb-3 text-muted-foreground">
          Foreground on fill
        </h3>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PAIR_RULES.map((rule) => {
            const fill = rule.surfaces[0];
            const value = ratio(tokens[rule.token], tokens[fill]);
            const ok = value !== null && value >= rule.threshold;
            return (
              <li
                key={rule.token}
                className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
                style={{
                  backgroundColor: `var(${fill})`,
                  color: `var(${rule.token})`,
                }}
              >
                <code className="type-data truncate">
                  {fill.replace("--", "")}
                </code>
                <span className="type-data tabular">
                  {value === null ? "—" : value.toFixed(2)}
                  {ok ? "" : " ✘"}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function Row({
  rule,
  tokens,
}: {
  rule: ContrastRule;
  tokens: Record<string, string>;
}) {
  const permitted = new Set(rule.surfaces);

  return (
    <tr>
      <th
        scope="row"
        className="type-small border-b border-border p-2 text-left font-normal whitespace-nowrap"
      >
        <span className="flex items-center gap-2">
          <span
            aria-hidden
            className="size-3 shrink-0 rounded-full border border-border"
            style={{ backgroundColor: `var(${rule.token})` }}
          />
          <code className="type-data">{rule.label ?? rule.token}</code>
        </span>
      </th>
      <td className="type-data border-b border-border p-2 text-muted-foreground">
        {rule.threshold.toFixed(1)}
      </td>
      {COLUMNS.map((surface) => {
        const value = ratio(tokens[rule.token], tokens[surface]);
        const allowed = permitted.has(surface);
        const ok = value !== null && value >= rule.threshold;

        return (
          <td
            key={surface}
            className="border-b border-border p-2 align-top"
            style={{ backgroundColor: `var(${surface})` }}
          >
            <div className="flex flex-col">
              <span
                className="type-data tabular"
                style={{
                  color: allowed ? `var(${rule.token})` : undefined,
                  opacity: allowed ? 1 : 0.45,
                }}
              >
                {value === null ? "—" : value.toFixed(2)}
              </span>
              <span
                className={cn(
                  "type-caption",
                  !allowed
                    ? "text-muted-foreground opacity-60"
                    : ok
                      ? "text-muted-foreground"
                      : "text-[var(--state-critical)]",
                )}
              >
                {!allowed ? "n/a" : ok ? "pass" : "fail"}
              </span>
            </div>
          </td>
        );
      })}
    </tr>
  );
}

import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { HugeiconsIcon } from "@hugeicons/react";

import { ICONS } from "@/lib/icons";
import { Mark, MARK_GHOST_THRESHOLD } from "@/components/brand/Mark";
import { Wordmark } from "@/components/brand/Wordmark";
import { Lockup } from "@/components/brand/Lockup";
import { ContrastMatrix } from "./ContrastMatrix";
import { Swatches } from "./Swatches";

export const metadata: Metadata = {
  title: "Tokens",
  robots: { index: false, follow: false },
};

const TYPE_STEPS = [
  { name: "Display", cls: "type-display", spec: "32 / 36 · 600" },
  { name: "H1", cls: "type-h1", spec: "24 / 30 · 600 · −0.01em" },
  { name: "H2", cls: "type-h2", spec: "20 / 26 · 600" },
  { name: "Body", cls: "type-body", spec: "15 / 22 · 400" },
  { name: "Small", cls: "type-small", spec: "13 / 18 · 400" },
  { name: "Caption", cls: "type-caption", spec: "12 / 16 · 500" },
  { name: "Code", cls: "type-code", spec: "20 / 24 · 500 mono · +0.08em" },
  { name: "Data", cls: "type-data", spec: "12 / 16 · 400 mono · tabular" },
];

const MARK_SIZES = [16, 24, 32, 64, 128];

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="type-h2">{title}</h2>
        {note && <p className="type-small text-muted-foreground">{note}</p>}
      </div>
      {children}
    </section>
  );
}

export default function TokensPage() {
  // Never reachable in production, even if the route is somehow linked.
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div className="mx-auto max-w-6xl space-y-16 px-6 py-12">
      <header className="space-y-2">
        <h1 className="type-h1">Design tokens</h1>
        <p className="type-body text-muted-foreground">
          Every ratio on this page is computed from the live CSS custom
          properties, not copied from a table. Toggle the theme in the header to
          check both.
        </p>
      </header>

      <Section
        title="Contrast matrix"
        note="Every foreground token against every surface. Text needs 4.5:1, the focus ring needs 3:1. Hairlines are deliberately below 3:1 and are reported, not graded."
      >
        <ContrastMatrix />
      </Section>

      <Section title="Swatches" note="Token name, hex, and role.">
        <Swatches />
      </Section>

      <Section title="Type scale" note="Instrument Sans and JetBrains Mono.">
        <div className="space-y-6">
          {TYPE_STEPS.map((step) => (
            <div
              key={step.name}
              className="flex flex-col gap-1 border-b border-border pb-4 sm:flex-row sm:items-baseline sm:gap-6"
            >
              <div className="w-28 shrink-0">
                <div className="type-caption text-muted-foreground">
                  {step.name}
                </div>
                <div className="type-data text-muted-foreground">
                  {step.spec}
                </div>
              </div>
              <div className={step.cls}>
                {step.cls === "type-code"
                  ? "kqr-8mzt-vnp"
                  : step.cls === "type-data"
                    ? "0123456789 · 01:24:07"
                    : "A link is all anyone needs"}
              </div>
            </div>
          ))}
        </div>
        <p className="type-small text-muted-foreground">
          Tabular numerals check — these two rows must align exactly:
        </p>
        <div className="type-data">
          <div>11:11:11</div>
          <div>00:00:00</div>
        </div>
      </Section>

      <Section
        title="Logomark"
        note={`The ghost cell is present at ${MARK_GHOST_THRESHOLD}px and above, absent below. The fourth cell is never filled.`}
      >
        <div className="flex flex-wrap items-end gap-10">
          {MARK_SIZES.map((size) => (
            <div key={size} className="flex flex-col items-center gap-3">
              <Mark size={size} title="Parley" />
              <div className="type-data text-muted-foreground">{size}px</div>
              <div className="type-caption text-muted-foreground">
                {size >= MARK_GHOST_THRESHOLD ? "ghost" : "no ghost"}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Lockups"
        note="Minimums: mark 16px, horizontal lockup 96px wide, stacked 72px wide, wordmark 64px wide."
      >
        <div className="flex flex-wrap items-end gap-12">
          <div className="flex flex-col gap-3">
            <Lockup variant="horizontal" markSize={24} />
            <span className="type-caption text-muted-foreground">
              Horizontal · 24px mark
            </span>
          </div>
          <div className="flex flex-col gap-3">
            <Lockup variant="horizontal" markSize={40} />
            <span className="type-caption text-muted-foreground">
              Horizontal · 40px mark
            </span>
          </div>
          <div className="flex flex-col gap-3">
            <Lockup variant="stacked" markSize={48} />
            <span className="type-caption text-muted-foreground">
              Stacked · 48px mark
            </span>
          </div>
          <div className="flex flex-col gap-3">
            <Wordmark size={24} />
            <span className="type-caption text-muted-foreground">
              Wordmark alone
            </span>
          </div>
        </div>
      </Section>

      <Section
        title="Icons"
        note="Resolved against the installed @hugeicons/core-free-icons — export names printed, not guessed. Stroke rounded, 1.5, currentColor."
      >
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Object.entries(ICONS).map(([key, entry]) => (
            <li
              key={key}
              className="flex items-center gap-3 rounded-lg border border-border p-3"
            >
              <HugeiconsIcon
                icon={entry.icon}
                size={24}
                strokeWidth={1.5}
                color="currentColor"
                aria-hidden
              />
              <div className="min-w-0">
                <div className="type-small truncate">{entry.label}</div>
                <code className="type-data block truncate text-muted-foreground">
                  {entry.export}
                </code>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title="Icon sizes"
        note="20px inline, 24px in call controls, 16px in dense lists."
      >
        <div className="flex items-end gap-8">
          {[16, 20, 24].map((size) => (
            <div key={size} className="flex flex-col items-center gap-2">
              <HugeiconsIcon
                icon={ICONS.micOn.icon}
                size={size}
                strokeWidth={1.5}
                color="currentColor"
                aria-hidden
              />
              <span className="type-data text-muted-foreground">{size}px</span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

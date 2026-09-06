"use client";

import { ParticipantRow } from "@/components/room/ParticipantsPanel";
import type { Quality } from "@/lib/room/connection";

/**
 * A name at the length the product actually permits.
 *
 * The sanitiser caps display names, and the row's failure mode was always a
 * squeeze — identity is the flexible zone, so the collision only appears when
 * the name is long enough to fight the chip and the icons for the same pixels.
 * A short name passes whatever the chip does, which is why the original bug
 * survived a green suite.
 */
const LONG_NAME = "Nana Yaa Asantewaa-Boateng Mensah III";

/**
 * Only states the product can actually produce.
 *
 * A first draft paired the `Host` badge with the host's actions and measured a
 * name squeezed to zero — an alarming result from an impossible row.
 * `showActions` is `isLocalHost && !participant.isLocal`, and the badge marks
 * the host's own row, so the badge and the actions control are mutually
 * exclusive by construction. Measuring them together invents a squeeze the
 * layout is never asked to survive, which is its own kind of false positive.
 */
const CASES: {
  label: string;
  quality: Quality;
  isTheHost: boolean;
  showActions: boolean;
}[] = [
  // What a host sees looking at someone they might act on — the row B1 is about.
  { label: "poor, actions", quality: "poor", isTheHost: false, showActions: true },
  { label: "lost, actions", quality: "lost", isTheHost: false, showActions: true },
  // The host's own row: a badge, and no actions.
  { label: "poor, the host's own row", quality: "poor", isTheHost: true, showActions: false },
  // A guest's view: neither.
  { label: "poor, seen by a guest", quality: "poor", isTheHost: false, showActions: false },
  // The control — quality good means no chip at all.
  { label: "good, no chip", quality: "good", isTheHost: false, showActions: true },
];

export function RowGallery() {
  return (
    <div className="py-4">
      <h1 className="type-h1 mb-4">Participant rows</h1>
      {CASES.map((c, i) => (
        <section key={c.label} className="mb-6">
          <h2 className="type-caption mb-1 px-4 text-muted-foreground">{c.label}</h2>
          {/*
            The panel's own container: `bg-popover`, and the width the panel is
            at desktop. The row is measured inside the box it ships in — a row
            measured in an unconstrained div would never squeeze at all.
          */}
          <ul
            data-case={c.label}
            /*
              The panel's own geometry, not an approximation of it: full-bleed
              on a phone and a 360px rail at desktop, matching `RoomPanel`'s
              `inset-x-0 … md:w-[360px]`, with the same `px-2` the roster list
              uses. A row measured in a narrower box reports a squeeze the
              product does not have.
            */
            className="w-full overflow-y-auto bg-popover px-2 py-2 md:w-[360px]"
          >
            <ParticipantRow
              name={LONG_NAME}
              identity={`dev-${i}`}
              isLocal={false}
              isTheHost={c.isTheHost}
              micOn
              cameraOn
              quality={c.quality}
              showActions={c.showActions}
              onRequestMute={() => {}}
              onRemove={() => {}}
            />
          </ul>
        </section>
      ))}
    </div>
  );
}

"use client";

import { useRef } from "react";

/**
 * The mobile sheet's drag handle — v1.2 F1.
 *
 * Mobile only. On desktop these panels are right-hand drawers and there is
 * nothing to drag; the handle would be an affordance for a gesture that does
 * not exist there.
 *
 * **The gesture adds no accessibility obligation**, which is why it can be a
 * gesture at all: dismissing a panel already has three non-gesture paths, all
 * of them tested — Escape (returning focus to the trigger), the header's own
 * "Close chat" / "Close participants" button, and the control-bar toggle that
 * opened it. A swipe is a fourth way to do something already reachable.
 *
 * The drag is bound to the handle rather than the sheet. The message log is a
 * scroll container, and a sheet-wide drag would compete with it for every
 * downward swipe — the gesture would work and reading the conversation would
 * not.
 */
export function SheetHandle({
  onDismiss,
  sheet,
}: {
  onDismiss: () => void;
  /** The sheet itself, so the drag can follow the finger. */
  sheet: React.RefObject<HTMLElement | null>;
}) {
  const start = useRef<number | null>(null);

  const move = (element: HTMLElement, y: number) => {
    // Downward only: dragging a bottom sheet up would uncover nothing.
    element.style.translate = `0 ${Math.max(0, y)}px`;
  };

  const release = (element: HTMLElement, y: number) => {
    element.style.transition = "";
    element.style.translate = "";
    start.current = null;
    // A quarter of the sheet. Far enough not to fire on a stray tap-drag,
    // near enough that the gesture does not feel like work.
    if (y > element.getBoundingClientRect().height * 0.25) onDismiss();
  };

  return (
    <div
      // The row is a comfortable target; the bar inside it is the visible cue.
      className="flex h-6 shrink-0 cursor-grab items-center justify-center md:hidden"
      // Without this the browser claims the vertical drag for scrolling and
      // the pointermove events never arrive.
      style={{ touchAction: "none" }}
      onPointerDown={(event) => {
        const element = sheet.current;
        if (!element) return;
        start.current = event.clientY;
        element.style.transition = "none";
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const element = sheet.current;
        if (!element || start.current === null) return;
        move(element, event.clientY - start.current);
      }}
      onPointerUp={(event) => {
        const element = sheet.current;
        if (!element || start.current === null) return;
        release(element, event.clientY - start.current);
      }}
      onPointerCancel={(event) => {
        const element = sheet.current;
        if (!element || start.current === null) return;
        // Treat a cancelled drag as no drag: snap back, never dismiss.
        release(element, 0);
        void event;
      }}
      // Decorative. The labelled close button beside it is the affordance a
      // screen reader should find, and announcing a second, unlabelled way to
      // do the same thing is noise — §9's whole concern.
      aria-hidden
    >
      <span
        className="h-1 w-10 rounded-full"
        style={{ background: "var(--tile-border)" }}
      />
    </div>
  );
}

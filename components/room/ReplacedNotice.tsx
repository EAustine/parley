"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/**
 * §3.7: "The replaced person gets a non-modal notice."
 *
 * Non-modal is the whole point. Their share has already stopped — there is
 * nothing to decide, and a dialog would demand attention for a fact rather than
 * a question. It dismisses itself, because a notice that has to be cleared is a
 * dialog wearing a different shape.
 */
export function ReplacedNotice({
  by,
  onDismiss,
}: {
  by: string;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 8000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute inset-x-0 top-0 z-[var(--layer-notices)] mx-auto flex w-fit items-center gap-3 rounded-b-xl px-4 py-3"
      style={{ background: "var(--popover)", border: "1px solid var(--boundary)" }}
    >
      <p className="type-small">
        <span className="text-foreground">{by}</span> is now presenting. Your
        share has stopped.
      </p>
      <Button size="touch" variant="ghost" onClick={onDismiss}>
        Dismiss
      </Button>
    </div>
  );
}

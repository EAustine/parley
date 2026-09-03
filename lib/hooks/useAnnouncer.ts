"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { AnnounceQueue, type Announcement } from "@/lib/room/announce";

/**
 * The room's one polite region, fed by a queue rather than by whoever wrote
 * last.
 *
 * Phase 8 merged two sources with last-writer-wins and deferred a FIFO to this
 * phase. Four sources want the region now — chat, reactions, connection and
 * presence — and §9 does not rank them, so nothing here does either.
 *
 * The returned `item` carries an id, and the region renders it as a keyed
 * child. That is the part that fixes the older and quieter bug: the region
 * held a bare string, so writing the value it already held was a React
 * bail-out, the DOM was never touched, and nothing was spoken. Two messages
 * from the same sender announced once.
 *
 * The region element itself must never be keyed or remounted — a live region
 * inserted into the document with content already in it is not announced by
 * most screen readers. Only its child changes.
 */
export function useAnnouncer(): {
  item: Announcement | null;
  announce: (text: string) => void;
} {
  const queue = useRef<AnnounceQueue>(undefined as unknown as AnnounceQueue);
  if (!queue.current) queue.current = new AnnounceQueue();

  const [item, setItem] = useState<Announcement | null>(null);
  // Bumped on every push so the drain effect re-arms; the queue's own depth is
  // outside React and cannot be a dependency.
  const [pending, setPending] = useState(0);

  const announce = useCallback((text: string) => {
    queue.current.push(text, Date.now());
    setPending((n) => n + 1);
  }, []);

  useEffect(() => {
    if (queue.current.depth === 0) return;

    // Polled rather than scheduled to the exact gap: the queue owns the
    // spacing rule, and a poll asks it rather than reimplementing it here.
    // 250ms is well inside the 1s gap, so nothing waits noticeably longer than
    // it should.
    const drain = () => {
      const next = queue.current.drain(Date.now());
      if (next) setItem(next);
      if (queue.current.depth === 0) window.clearInterval(timer);
    };
    const timer = window.setInterval(drain, 250);
    drain();
    return () => window.clearInterval(timer);
  }, [pending]);

  return { item, announce };
}

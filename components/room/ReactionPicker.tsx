"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";

import { ICONS } from "@/lib/icons";
import { REACTIONS, REACTION_NAMES, type Reaction } from "@/lib/room/messages";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * §3.4: a 44px circle opening a popover of six emoji.
 *
 * The popover does not close on a pick. Reactions are rate-limited to one a
 * second and people send several in a row during applause; closing after each
 * one would make the second press reopen the popover instead of reacting.
 */
export function ReactionPicker({ onReact }: { onReact: (emoji: Reaction) => void }) {
  /**
   * v1.2 E1: "The picker button itself gets press feedback: 0.9 → 1.1 → 1.0
   * over 200ms. The absence of that is why the current build feels
   * unresponsive on click."
   *
   * Read as the emoji buttons rather than the bar control that opens the
   * popover. The bar control already has B4's 0.96 press, and giving it a
   * second, louder press treatment would contradict the tier it belongs to —
   * whereas the emoji is the thing you actually press to send a reaction, and
   * §3.6 rate-limits it to one a second, so a press that produces nothing
   * visible is exactly the case this is for.
   *
   * A class toggled on click rather than `:active`: the sequence has to finish
   * after the finger lifts, and `:active` ends with the press.
   */
  const [pressed, setPressed] = useState<Reaction | null>(null);

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Send a reaction"
              // v1.2 B4: secondary tier — ghost at rest, lifting on hover.
              className="flex size-11 items-center justify-center rounded-full border transition-[transform,background-color,border-color] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] hover:scale-[1.04] hover:bg-[var(--secondary)] active:scale-[0.96] active:duration-[80ms] motion-reduce:transform-none motion-reduce:hover:scale-100 motion-reduce:active:scale-100"
              style={{
                borderColor: "transparent",
                color: "var(--foreground)",
              }}
            >
              <HugeiconsIcon
                icon={ICONS.reactions.icon}
                size={20}
                strokeWidth={1.5}
                color="currentColor"
                aria-hidden
              />
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent className="dark">Send a reaction</TooltipContent>
      </Tooltip>

      <PopoverContent side="top" align="center" className="dark w-auto p-2">
        <div className="flex gap-1">
          {REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                setPressed(emoji);
                onReact(emoji);
              }}
              onAnimationEnd={() => setPressed((p) => (p === emoji ? null : p))}
              // The emoji is the label visually; the name is the label a
              // screen reader reads, because "😮" is not a spoken word.
              aria-label={`React with ${REACTION_NAMES[emoji]}`}
              className={`flex size-11 items-center justify-center rounded-lg text-xl transition-colors duration-[120ms] hover:bg-accent${
                pressed === emoji ? " parley-reaction-press" : ""
              }`}
            >
              <span aria-hidden>{emoji}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

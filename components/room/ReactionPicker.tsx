"use client";

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
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Send a reaction"
              className="flex size-11 items-center justify-center rounded-full border transition-colors duration-[120ms]"
              style={{
                borderColor: "var(--tile-border)",
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
        <TooltipContent>Send a reaction</TooltipContent>
      </Tooltip>

      <PopoverContent side="top" align="center" className="w-auto p-2">
        <div className="flex gap-1">
          {REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => onReact(emoji)}
              // The emoji is the label visually; the name is the label a
              // screen reader reads, because "😮" is not a spoken word.
              aria-label={`React with ${REACTION_NAMES[emoji]}`}
              className="flex size-11 items-center justify-center rounded-lg text-xl transition-colors duration-[120ms] hover:bg-accent"
            >
              <span aria-hidden>{emoji}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

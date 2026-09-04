"use client";

import { useState } from "react";
import { toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";

import { ICONS } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * "Copy link" produces "Link copied" — the action keeps its name through the
 * flow, per the copy rule.
 *
 * The URL is built in the browser from `location.origin` rather than passed
 * down from the server, so a link copied from a preview deployment points at
 * that deployment instead of at whatever `NEXT_PUBLIC_APP_URL` happens to say.
 */
export function CopyLinkButton({
  code,
  label = "Copy link",
  withLabel = false,
}: {
  code: string;
  label?: string;
  /**
   * Render the label beside the icon — v1.3 C3's copy row in the room's People
   * tab, where the button sits in a wide row and the design gives it text.
   *
   * A variant rather than a second component: the clipboard path here handles a
   * refusal ("Your browser blocked the clipboard") that a copy of this would
   * either duplicate or, more likely, omit.
   */
  withLabel?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const url = `${window.location.origin}/j/${code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copied");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused outright — insecure origin, or a
      // permission the browser declines. Saying so beats a button that does
      // nothing and looks broken.
      toast.error("Your browser blocked the clipboard. Copy the code instead.");
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          /*
           * `touch` for the labelled variant, not the design's 36px `.copybtn`.
           * It exists only in the room's People tab, which is a 44px surface —
           * the floor beats the design file here as it does for the control bar
           * and the panel's tabs. `check:targets` measured it at 95x28.
           */
          size={withLabel ? "touch" : "icon"}
          onClick={copy}
          // The visible label is a prefix of the accessible name, so SC 2.5.3
          // holds in both variants.
          aria-label={`${label} for meeting ${code}`}
        >
          <HugeiconsIcon
            icon={copied ? ICONS.check.icon : ICONS.copy.icon}
            size={20}
            strokeWidth={1.5}
            color="currentColor"
            aria-hidden
          />
          {withLabel && <span>{copied ? "Link copied" : label}</span>}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{copied ? "Link copied" : label}</TooltipContent>
    </Tooltip>
  );
}

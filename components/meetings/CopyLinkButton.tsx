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
}: {
  code: string;
  label?: string;
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
          size="icon"
          onClick={copy}
          aria-label={`${label} for meeting ${code}`}
        >
          <HugeiconsIcon
            icon={copied ? ICONS.check.icon : ICONS.copy.icon}
            size={20}
            strokeWidth={1.5}
            color="currentColor"
            aria-hidden
          />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{copied ? "Link copied" : label}</TooltipContent>
    </Tooltip>
  );
}

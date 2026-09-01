"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { HugeiconsIcon } from "@hugeicons/react";
import { Moon02Icon, Sun03Icon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // The server cannot know the resolved theme, so the icon is only correct
  // after hydration. Render the frame immediately so layout does not shift.
  useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme === "dark";

  // Before hydration the resolved theme is unknown, so the name has to be one
  // the server can also produce. Naming the action, not the state, keeps it
  // truthful either way.
  const label = mounted
    ? isDark
      ? "Switch to light theme"
      : "Switch to dark theme"
    : "Switch theme";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={label}
          onClick={() => setTheme(isDark ? "light" : "dark")}
        >
          {mounted && (
            <HugeiconsIcon
              icon={isDark ? Sun03Icon : Moon02Icon}
              size={20}
              strokeWidth={1.5}
              color="currentColor"
            />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

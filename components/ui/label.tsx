"use client"

import * as React from "react"
import { Label as LabelPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Label({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        /*
         * No `text-sm leading-none` here — v1.3 E3.
         *
         * Every caller in the product passes `type-small`, and none of them
         * were getting it. `.type-small` is declared in `@layer components`
         * and `.text-sm` / `.leading-none` in `@layer utilities`, so the
         * utilities win on **layer order** regardless of specificity — and
         * twMerge cannot help, because it does not know `type-small` conflicts
         * with `text-sm` and so drops neither. Measured: 14px/14px against the
         * type table's Small step of 13/18.
         *
         * This is the same trap as `Input`'s height, one element up: a base
         * class quietly outranking the caller. Removing it lets the type role
         * through, and a caller wanting `text-sm` can still pass it.
         */
        "flex items-center gap-2 font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Label }

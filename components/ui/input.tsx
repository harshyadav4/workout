import * as React from "react";

import { cn } from "@/lib/utils";

/** A well: pressed into the surface, so it reads as a place to put something. */
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, enterKeyHint, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      // The phone keyboard's return key says what it does — "Done" closes it,
      // "Search" searches — instead of a bare return arrow. Pass "next" on a
      // field in a chain.
      enterKeyHint={enterKeyHint ?? (type === "search" ? "search" : "done")}
      className={cn(
        // text-base, not text-sm: iOS Safari zooms the viewport on focus for any
        // input under 16px and does not zoom back.
        //
        // min-w-0: a grid/flex item's default min-width is its content size, not 0.
        // iOS Safari renders type="date" as full text ("7 Oct 2026"), wide enough
        // that a 2-up grid item (Plan tab's Start/End) blew out past the viewport
        // edge instead of shrinking to its column.
        "well flex h-12 w-full min-w-0 rounded-lg px-4 py-3 text-base text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
      {...props}
    />
  )
);

Input.displayName = "Input";

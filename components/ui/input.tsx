import * as React from "react";

import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        // text-base, not text-sm: iOS Safari zooms the viewport on focus for any
        // input under 16px and does not zoom back. Harmless until the viewport's
        // `maximumScale: 1` was (correctly) deleted; now it is the whole builder.
        //
        // min-w-0: a grid/flex item's default min-width is its content size, not 0.
        // iOS Safari renders type="date" as full text ("7 Oct 2026"), wide enough
        // that a 2-up grid item (Plan tab's Start/End) blew out past the viewport
        // edge instead of shrinking to its column.
        "flex h-12 w-full min-w-0 rounded-2xl border border-white/5 bg-secondary px-4 py-3 text-base outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
      {...props}
    />
  )
);

Input.displayName = "Input";

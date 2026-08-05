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
        "flex h-12 w-full rounded-2xl border border-white/5 bg-secondary px-4 py-3 text-base outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
      {...props}
    />
  )
);

Input.displayName = "Input";

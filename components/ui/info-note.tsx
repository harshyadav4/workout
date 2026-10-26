import { Info } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A heading with its explanation one tap behind an ⓘ. The screen shows the
 * short version; the full one is here for anyone who asks. Used by Progress's
 * panels and by any card whose rule takes more than one sentence to say.
 *
 * `<details>`: a disclosure widget with keyboard support, an accessible
 * open/closed state and no JavaScript. The whole heading is the summary, which
 * is also how it clears the 44px touch minimum without a separate hit area.
 * Keep buttons out of `children` of the heading — a button inside a summary
 * also toggles it.
 */
export function InfoNote({
  heading,
  note,
  label = "About this",
  className
}: {
  /** What stays on screen: a title, and at most one short line. */
  heading: React.ReactNode;
  /** The full explanation. */
  note: React.ReactNode;
  /** What a screen reader hears for the ⓘ. */
  label?: string;
  className?: string;
}) {
  return (
    <details className={cn("group min-w-0 flex-1", className)}>
      <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 flex-1">{heading}</div>
        <Info
          className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-open:text-foreground"
          aria-hidden
        />
        <span className="sr-only">{label}</span>
      </summary>
      <div className="mb-1 mt-1 space-y-1.5 text-xs leading-relaxed text-muted-foreground">{note}</div>
    </details>
  );
}

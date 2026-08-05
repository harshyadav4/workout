"use client";

import { Info } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The page's second material.
 *
 * `Card` — glass, 28px, `shadow-glow` — is now spent on exactly one thing: the
 * hero. Everything else is a Panel: flat, one hairline, 16px, and about 40% less
 * chrome around the same chart. Thirteen identical glass boxes was the reason
 * the screen read as a list of widgets rather than one instrument, and no amount
 * of new charts fixes that while every card still weighs the same.
 *
 * The `note` is the other half of it. Every card used to carry two lines of grey
 * prose explaining its own convention — the engagement floor, the 10–20 band,
 * why not an estimated 1RM — which is a page explaining itself instead of
 * showing you something. The prose is all still here, one tap behind the ⓘ.
 *
 * ponytail: `<details>`. It is a disclosure widget with keyboard support, an
 * accessible open/closed state and zero bytes of JavaScript. The whole header is
 * the summary, which is also how it clears the 44px touch minimum without a
 * separate hit area.
 */
export function Panel({
  title,
  caption,
  note,
  action,
  className,
  children
}: {
  title: string;
  /** One clause, when the chart needs a unit stated. Never a paragraph. */
  caption?: string;
  /** The full explanation, behind the ⓘ. */
  note?: React.ReactNode;
  /** A control that belongs to this panel, shown inline with the title. */
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const heading = (
    <div className="min-w-0 flex-1">
      <h3 className="truncate text-sm font-semibold tracking-tight">{title}</h3>
      {caption ? (
        <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{caption}</p>
      ) : null}
    </div>
  );

  return (
    <section className={cn("rounded-2xl border border-white/5 bg-white/[0.02] p-3", className)}>
      {/* `action` is a sibling of the <details>, never a child of <summary>. A
          button nested inside a summary fires the toggle as well as itself, and
          the workaround is a preventDefault that quietly breaks the keyboard. */}
      <div className="flex items-start gap-3">
        {note ? (
          <details className="group min-w-0 flex-1">
            <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
              {heading}
              <Info
                className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-open:text-foreground"
                aria-hidden
              />
              <span className="sr-only">About this chart</span>
            </summary>
            <p className="mb-1 mt-1 text-xs leading-relaxed text-muted-foreground">{note}</p>
          </details>
        ) : (
          <div className="flex min-h-[44px] min-w-0 flex-1 items-center">{heading}</div>
        )}
        {action}
      </div>

      <div className="mt-2">{children}</div>
    </section>
  );
}

/**
 * Names which slice the panels under it measure. Two zones must never blur, and
 * a rule is cheaper than repeating "in this range" in thirteen captions.
 */
export function SectionRule({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="flex items-baseline gap-3 pt-4">
      <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
        {label}
      </span>
      {hint ? <span className="truncate text-[11px] text-muted-foreground/70">{hint}</span> : null}
      <span className="h-px flex-1 bg-white/10" />
    </div>
  );
}

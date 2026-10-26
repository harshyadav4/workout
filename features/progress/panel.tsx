"use client";

import { InfoNote } from "@/components/ui/info-note";
import { cn } from "@/lib/utils";

/**
 * The page's second material.
 *
 * `Card` is a plaque: lit edge, shadow, the thing that sits *on* the page. It
 * is spent on the hero and the map. Everything else is a Panel: flat, the
 * card colour, one hairline, and nothing else. Thirteen identical boxes of the
 * same weight was the reason the screen read as a list of widgets rather than
 * one instrument, and a hierarchy only exists if something is at the top of it.
 *
 * The `note` is the other half of it. Every card used to carry two lines of grey
 * prose explaining its own convention — the engagement floor, the 10–20 band,
 * why not an estimated 1RM — which is a page explaining itself instead of
 * showing you something. The prose is all still here, one tap behind the ⓘ.
 *
 * The ⓘ itself is `InfoNote` (components/ui/info-note), shared with the
 * other pages.
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
    <div className="min-w-0">
      <h3 className="truncate text-[15px] font-bold tracking-tight">{title}</h3>
      {caption ? (
        <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{caption}</p>
      ) : null}
    </div>
  );

  return (
    <section className={cn("rounded-xl border border-border bg-card p-3.5", className)}>
      {/* `action` is a sibling of the <details>, never a child of <summary>. A
          button nested inside a summary fires the toggle as well as itself, and
          the workaround is a preventDefault that quietly breaks the keyboard. */}
      <div className="flex items-start gap-3">
        {note ? (
          <InfoNote heading={heading} note={note} label="About this chart" />
        ) : (
          <div className="flex min-h-[44px] min-w-0 flex-1 items-center">
            <div className="min-w-0 flex-1">{heading}</div>
          </div>
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
      <span className="shrink-0 text-xs font-semibold text-muted-foreground">
        {label}
      </span>
      {hint ? <span className="truncate text-xs text-muted-foreground">{hint}</span> : null}
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

/**
 * Hold a panel back until its data can say something.
 *
 * Twenty-odd charts is right at month six and a wall of near-empty axes at week
 * one — which is exactly the week a new user decides whether this app is worth
 * opening again. Each card already knew its own threshold internally and
 * rendered a flat line anyway; this states the threshold instead.
 *
 * It deliberately does **not** hide the card. A tab that silently has fewer
 * things on it than it did last week is worse than empty charts: the user
 * cannot tell whether the feature is missing, broken, or waiting on them.
 */
export function Reveal({
  ready,
  title,
  need,
  children
}: {
  ready: boolean;
  title: string;
  /** What is still missing, in the user's terms — "3 more sessions". */
  need: string;
  children: React.ReactNode;
}) {
  if (ready) {
    return <>{children}</>;
  }

  return (
    <Panel title={title}>
      <p className="py-2 text-xs text-muted-foreground">After {need}.</p>
    </Panel>
  );
}

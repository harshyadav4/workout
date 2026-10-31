"use client";

import { startTransition, useLayoutEffect, useRef, useState } from "react";

import { InfoNote } from "@/components/ui/info-note";
import { cn } from "@/lib/utils";

/**
 * One chart or one list: the title outside, one soft surface under it, and
 * nothing boxed inside that surface.
 *
 * The `note` keeps the page from explaining itself. Every card used to carry two
 * lines of grey prose explaining its own convention — the engagement floor, the
 * 10–20 band, why not an estimated 1RM. The prose is all still here, one tap
 * behind the ⓘ.
 *
 * The ⓘ itself is `InfoNote` (components/ui/info-note), shared with the
 * other pages.
 */
export function Panel({
  title,
  caption,
  note,
  action,
  flush,
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
  /** No padding, for rows that run to the surface's edge (`.list-row`). */
  flush?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const heading = <h3 className="truncate text-[13.5px] font-semibold text-muted-foreground">{title}</h3>;

  return (
    <section className={className}>
      {/* `action` is a sibling of the <details>, never a child of <summary>. A
          button nested inside a summary fires the toggle as well as itself, and
          the workaround is a preventDefault that quietly breaks the keyboard. */}
      <div className="flex min-h-[44px] items-center gap-3 px-1">
        {note ? (
          <InfoNote heading={heading} note={note} label="About this chart" />
        ) : (
          <div className="min-w-0 flex-1">{heading}</div>
        )}
        {action}
      </div>

      <div className={cn("plaque rounded-3xl", flush ? "overflow-hidden" : "p-4")}>
        {caption ? (
          <p className={cn("text-[13.5px] leading-snug text-muted-foreground", flush ? "px-4 pb-1 pt-3.5" : "mb-3")}>
            {caption}
          </p>
        ) : null}
        <WhenNear>{children}</WhenNear>
      </div>
    </section>
  );
}

/** How far ahead of the screen a panel starts drawing, so scrolling meets it finished. */
const DRAW_AHEAD_PX = 900;

/**
 * Draws a panel's contents as it comes near the screen. An open card holds twenty-odd
 * charts and a phone shows two at a time; drawing them all froze the tap that
 * opened the card for a second. Only the contents wait: the titles are there from
 * the start, so the page still reads from top to bottom.
 */
function WhenNear({ children }: { children: React.ReactNode }) {
  const [near, setNear] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = anchor.current;
    if (!element) {
      return;
    }
    // On screen already: before the first paint, so nothing flashes empty.
    if (element.getBoundingClientRect().top < window.innerHeight) {
      setNear(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          startTransition(() => setNear(true));
        }
      },
      { rootMargin: `${DRAW_AHEAD_PX}px 0px` }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return near ? <>{children}</> : <div ref={anchor} className="min-h-[150px]" aria-hidden />;
}

/**
 * Names which slice the panels under it measure. Two zones must never blur, and
 * a heading is cheaper than repeating "in this range" in thirteen captions.
 */
export function SectionRule({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="px-1 pt-6">
      <h2 className="font-heading text-[28px] leading-tight">{label}</h2>
      {hint ? <p className="text-[13.5px] text-muted-foreground">{hint}</p> : null}
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
      <p className="text-[13.5px] text-muted-foreground">After {need}.</p>
    </Panel>
  );
}

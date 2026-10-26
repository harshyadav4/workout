"use client";

import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { markTourSeen } from "@/features/tour/autostart-rule";
import { GuideSprite } from "@/features/tour/guide-sprite";
import { placeGuide, SPRITE } from "@/features/tour/placement";
import { TOUR_STEPS } from "@/features/tour/tour-steps";
import { endTour, exploreSample, setTourStep, startTour, useTour } from "@/features/tour/tour-store";
import { useTypewriter } from "@/features/tour/use-typewriter";
import { useWorkoutStoreApi } from "@/features/workout/workout-store";
import { buildDemoState } from "@/lib/demo-data";
import { todayKey } from "@/lib/utils";

/** How long a step waits for its part to render after a page change. */
const FIND_TIMEOUT_MS = 2500;

/** Room above a highlighted part, under the status bar, when it is scrolled into view. */
const TOP_GAP = 72;

/** Breathing room around the spotlight. */
const PAD = 8;

/** How long the guide flies to a tab before the page changes. */
const TRAVEL_MS = 1100;

/** With reduced motion there is no flight, only the lit tab and the words. */
const TRAVEL_STILL_MS = 700;

/** The bubble's width while travelling: one short line. */
const TRAVEL_WIDTH = 240;

/** Page names, as the bottom navigation shows them. */
const PAGE_NAMES: Record<string, string> = { "/": "Today", "/plan": "Plan", "/progress": "Progress", "/profile": "You" };

/** Tabs inside a page, by the step's page and query, as their switch shows them. */
const TAB_NAMES: Record<string, string> = {
  "/plan": "Schedule",
  "/plan?mode=build": "Build",
  "/progress": "Summary",
  "/progress?view=body": "Muscles"
};

/** After the scroll to a part starts, the wait before the bubble pops in beside it. */
const SCROLL_SETTLE_MS = 400;

/** The page and tab a step is on, as a path with its query. */
function stepPlace(step: { route: string; query?: string }) {
  return step.query ? `${step.route}?${step.query}` : step.route;
}

/** The guide never goes above this: room for the status bar. */
const TOP_LIMIT = 16;

/** Space kept between the guide and the bottom navigation. */
const NAV_CLEARANCE = 10;

type Rect = { top: number; left: number; width: number; height: number };

function measure(element: Element): Rect {
  const box = element.getBoundingClientRect();
  return { top: box.top - PAD, left: box.left - PAD, width: box.width + PAD * 2, height: box.height + PAD * 2 };
}

function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Start the tour: the sample swapped in (features/tour/tour-store), Home first.
 * The one entry point, so every way in — the You tab, a first open, a link —
 * starts the same way.
 */
export function useStartTour() {
  const store = useWorkoutStoreApi();
  const router = useRouter();
  return useCallback(() => {
    // Marked at the start, not the end: a reload mid-tour must not start it
    // again by itself. The replay on the You tab is always there.
    markTourSeen();
    startTour(store, buildDemoState(todayKey()));
    router.push("/");
  }, [router, store]);
}

/**
 * The tour on screen: a dimmed page with one part lit, and a card that says
 * what it is. Mounted once for the app, so it lives across page changes.
 *
 * Every step can be skipped — Skip on the card and Escape both end it — and
 * the page under the dim does not take taps, so a stray touch cannot start a
 * session in the sample. The card takes focus at each step, so a screen
 * reader hears the new step and a keyboard can reach its buttons.
 */
export function TourOverlay() {
  const { active, step, exploring } = useTour();
  const store = useWorkoutStoreApi();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const startTourNow = useStartTour();
  const [rect, setRect] = useState<Rect>();
  const [searching, setSearching] = useState(false);
  // Between steps on different pages: the guide flies to the next page's tab,
  // the tab glows, and only then does the page change — so the move is seen.
  // It stays until the new step has arrived (`arrivedFor`): its page and tab
  // on screen and its part found, so the new words never show over the old page.
  // A tab change inside one page has no flight and no lit tab, only the words.
  const [travel, setTravel] = useState<{ to: number; label: string; tab?: Rect }>();
  // The step whose part is found and scrolled to, so its bubble can show.
  const [arrivedFor, setArrivedFor] = useState<number>();
  // The one frame the guide lands: it jumps to its bubble's place, no slide,
  // and the bubble's pop is the motion that is seen.
  const [landing, setLanding] = useState(false);
  // Where the guide last stood: it waits there while a tab inside the page changes.
  const lastLayout = useRef<{ top: number; left: number; width: number; gaze: { x: number; y: number } }>(undefined);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  // The guide's row as rendered, and the room it has: re-measured on resize
  // and whenever the text changes, so the placement uses real sizes.
  const [rowHeight, setRowHeight] = useState(140);
  const [frame, setFrame] = useState({ viewport: { width: 390, height: 844 }, navTop: 760 });

  useLayoutEffect(() => {
    if (!active || exploring) {
      return;
    }
    const measureFrame = () => {
      const nav = document.querySelector('[data-tour="nav"]');
      const height = window.innerHeight;
      setFrame({
        viewport: { width: window.innerWidth, height },
        navTop: nav ? nav.getBoundingClientRect().top : height
      });
      if (rowRef.current) {
        setRowHeight(rowRef.current.getBoundingClientRect().height);
      }
    };
    measureFrame();
    const observer = new ResizeObserver(measureFrame);
    if (rowRef.current) {
      observer.observe(rowRef.current);
    }
    window.addEventListener("resize", measureFrame);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measureFrame);
    };
  }, [active, exploring, step]);

  const current = TOUR_STEPS[step];
  const last = step === TOUR_STEPS.length - 1;
  // The words type out once the guide has arrived, not while it flies or looks.
  const typing = useTypewriter(current?.body ?? "", Boolean(travel) || searching);

  // A link with ?tour=1 opens the tour — for sharing it, and for testing it.
  useEffect(() => {
    if (params.get("tour") === "1" && !active) {
      startTourNow();
    }
  }, [active, params, startTourNow]);

  const goTo = useCallback(
    (next: number) => {
      const from = TOUR_STEPS[step];
      const to = TOUR_STEPS[next];
      if (!from || !to) {
        return;
      }
      if (stepPlace(to) === stepPlace(from)) {
        setTourStep(next);
        return;
      }
      if (to.route === from.route) {
        setTravel({ to: next, label: TAB_NAMES[stepPlace(to)] ?? PAGE_NAMES[to.route] });
        setTourStep(next);
        return;
      }
      const tab = document.querySelector(`[data-tour="nav-${to.route}"]`);
      setTravel({ to: next, label: PAGE_NAMES[to.route], tab: tab ? measure(tab) : undefined });
    },
    [step]
  );

  // The flight takes its time, then the step (and so the page) changes.
  useEffect(() => {
    if (!travel || travel.to === step) {
      return;
    }
    const timer = window.setTimeout(() => setTourStep(travel.to), reducedMotion() ? TRAVEL_STILL_MS : TRAVEL_MS);
    return () => window.clearTimeout(timer);
  }, [step, travel]);

  // Skipped or ended mid-flight: the next tour starts on the ground.
  useEffect(() => {
    if (!active) {
      setTravel(undefined);
    }
  }, [active]);

  // The new step has arrived: the guide leaves the tab for its bubble.
  useEffect(() => {
    if (travel && travel.to === step && arrivedFor === step) {
      setTravel(undefined);
      setLanding(true);
    }
  }, [arrivedFor, step, travel]);

  useEffect(() => {
    if (!landing) {
      return;
    }
    const frame = requestAnimationFrame(() => setLanding(false));
    return () => cancelAnimationFrame(frame);
  }, [landing]);

  const finish = useCallback(() => {
    endTour(store);
  }, [store]);

  // The page and tab on screen, and the ones the step wants — Plan's Build
  // and Schedule are one page, two tabs, told apart by the query.
  const search = params.toString();
  const here = search ? `${pathname}?${search}` : pathname;
  const wanted = current ? (current.query ? `${current.route}?${current.query}` : current.route) : undefined;
  const onStepPage = here === wanted;

  // Go to the step's page and tab.
  useEffect(() => {
    if (!active || exploring || !wanted) {
      return;
    }
    if (!onStepPage) {
      router.push(wanted);
    }
  }, [active, exploring, onStepPage, router, wanted]);

  // Find the step's part, scroll it under the status bar, and follow it.
  useLayoutEffect(() => {
    if (!active || exploring || !current || !onStepPage) {
      setRect(undefined);
      return;
    }
    if (!current.target) {
      setRect(undefined);
      setSearching(false);
      setArrivedFor(step);
      return;
    }

    let element: Element | null = null;
    let frame = 0;
    let settled = 0;
    const started = performance.now();
    setSearching(true);

    const follow = () => {
      if (element) {
        setRect(measure(element));
      }
    };

    const find = () => {
      element = document.querySelector(`[data-tour="${current.target}"]`);
      if (element) {
        setSearching(false);
        const top = element.getBoundingClientRect().top + window.scrollY - TOP_GAP;
        window.scrollTo({ top: Math.max(0, top), behavior: reducedMotion() ? "auto" : "smooth" });
        settled = window.setTimeout(() => setArrivedFor(step), reducedMotion() ? 0 : SCROLL_SETTLE_MS);
        // Follow the scroll for a moment, then on scroll and resize.
        const settle = (time: number) => {
          follow();
          if (time - started < FIND_TIMEOUT_MS) {
            frame = requestAnimationFrame(settle);
          }
        };
        frame = requestAnimationFrame(settle);
        return;
      }
      if (performance.now() - started < FIND_TIMEOUT_MS) {
        frame = requestAnimationFrame(find);
      } else {
        // Not on this screen (an empty state, say): the card still explains it.
        setSearching(false);
        setRect(undefined);
        setArrivedFor(step);
      }
    };
    frame = requestAnimationFrame(find);

    window.addEventListener("scroll", follow, { passive: true });
    window.addEventListener("resize", follow);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(settled);
      window.removeEventListener("scroll", follow);
      window.removeEventListener("resize", follow);
    };
  }, [active, current, exploring, onStepPage, step]);

  // Focus the step's title, so the change is heard and the buttons are near.
  useEffect(() => {
    if (active && !exploring && !searching && !travel) {
      titleRef.current?.focus({ preventScroll: true });
    }
  }, [active, exploring, searching, step, travel]);

  // Escape ends the tour from anywhere.
  useEffect(() => {
    if (!active || exploring) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        finish();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, exploring, finish]);

  if (!active) {
    return null;
  }

  if (exploring) {
    return (
      // Just above the bottom navigation (88px tall, 0.875rem off the edge),
      // not at the top: there it covered page headers like Gym / Cardio.
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+6.25rem)] z-[100] flex justify-center px-4">
        <div
          className="plaque pointer-events-auto flex items-center gap-2 rounded-full py-1 pl-1 pr-1 text-xs shadow-lg"
          role="status"
        >
          <GuideSprite size={28} />
          <span className="font-semibold">Sample data</span>
          <Button size="sm" className="h-8 rounded-full px-3 text-xs" onClick={finish}>
            Exit
          </Button>
        </div>
      </div>
    );
  }

  if (!current) {
    return null;
  }

  const placed = placeGuide({
    target: current.target ? rect : undefined,
    viewport: frame.viewport,
    topLimit: TOP_LIMIT,
    bottomLimit: frame.navTop - NAV_CLEARANCE,
    rowHeight
  });

  // Travelling: the next page's tab is lit, and the guide hovers just above
  // it, sprite over the tab, looking down at it.
  const tab = travel?.tab;
  const lit = travel ? tab : current.target ? rect : undefined;
  const travelWidth = Math.min(TRAVEL_WIDTH, frame.viewport.width - 32);
  const layout = tab
    ? {
        top: Math.max(TOP_LIMIT, tab.top - rowHeight - NAV_CLEARANCE),
        left: Math.round(
          Math.min(
            Math.max(16, tab.left + tab.width / 2 - SPRITE.width / 2),
            frame.viewport.width - travelWidth - 16
          )
        ),
        width: travelWidth,
        gaze: { x: 0, y: 1 }
      }
    : travel
      ? { ...(lastLayout.current ?? placed), width: travelWidth }
      : placed;
  if (!travel) {
    lastLayout.current = placed;
  }
  const motion = "transition-all duration-300 ease-out motion-reduce:transition-none";

  return (
    <div className="fixed inset-0 z-[100]">
      {/* The dim, and the spotlight cut out of it. One element: its giant
          shadow is the dim, so the lit part is never covered twice. */}
      {/* Keyed apart: as one reused element, the swap faded the dim out and in. */}
      {lit ? (
        <div
          key="spotlight"
          className={`pointer-events-none absolute rounded-2xl ring-2 ring-brand ${motion}`}
          style={{
            top: lit.top,
            left: lit.left,
            width: lit.width,
            height: lit.height,
            boxShadow: "0 0 0 9999px rgba(4, 7, 12, 0.72)"
          }}
        />
      ) : (
        <div key="dim" className="absolute inset-0 bg-[rgba(4,7,12,0.72)]" />
      )}

      {/* Catches every tap outside the guide: the sample is to look at here,
          not to press — a stray tap must not start a session behind the dim. */}
      <div className="absolute inset-0" />

      {/* The guide: the sprite and its bubble, one row beside the lit part. */}
      <div
        ref={rowRef}
        className={`absolute flex items-start gap-2 ${
          landing ? "" : travel ? "transition-all duration-700 ease-in-out motion-reduce:transition-none" : motion
        }`}
        style={{ top: layout.top, left: layout.left, width: layout.width }}
      >
        {/* Keyed by step: each new line of text gets one hop. */}
        <GuideSprite
          key={travel ? `travel-${travel.to}` : step}
          mood={travel || searching ? "flying" : typing.done ? "idle" : "talking"}
          gaze={layout.gaze}
          size={SPRITE.width}
          className="shrink-0"
        />

        {travel ? (
          <div
            className="guide-bubble relative min-w-0 flex-1 p-3"
            role="status"
            aria-live="polite"
          >
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-brand">[System]</span>
            <p className="mt-0.5 text-sm">
              Opening <span className="font-semibold text-brand">{travel.label}</span>
            </p>
          </div>
        ) : (
        // Keyed by step: each new step pops in. A tap anywhere on it shows
        // the rest of the words at once.
        <div
          key={`bubble-${step}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="tour-title"
          aria-describedby="tour-body"
          className="guide-bubble guide-pop relative min-w-0 flex-1 p-3.5"
          onClick={typing.finish}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-brand">
              [System] · {step + 1}/{TOUR_STEPS.length}
            </span>
            {last ? null : (
              <button
                type="button"
                onClick={finish}
                className="-mr-1.5 flex h-8 items-center gap-1 rounded-full px-2 text-xs font-semibold text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Skip
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
          </div>

          <h2
            id="tour-title"
            ref={titleRef}
            tabIndex={-1}
            className="mt-1 font-display text-base font-extrabold leading-snug tracking-tight focus-visible:outline-none"
          >
            {current.title}
          </h2>
          <p id="tour-body" className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            {/* Read whole by screen readers; drawn letter by letter on top of
                an invisible copy, which holds the bubble at its full size. */}
            <span className="sr-only">{current.body}</span>
            <span className="relative block" aria-hidden>
              <span className="invisible">{current.body}</span>
              <span className="absolute inset-0">{typing.shown}</span>
            </span>
          </p>

          {last ? (
            <div className="mt-3 space-y-2">
              <Button className="h-11 w-full" onClick={finish}>
                Use my data
              </Button>
              <Button variant="secondary" className="h-11 w-full" onClick={exploreSample}>
                Explore sample data
              </Button>
            </div>
          ) : (
            <div className="mt-3 flex items-center justify-between gap-2">
              <Button
                variant="secondary"
                size="icon"
                className="h-11 w-11 shrink-0"
                aria-label="Back"
                disabled={step === 0}
                onClick={() => goTo(step - 1)}
              >
                <ArrowLeft className="h-4 w-4" aria-hidden />
              </Button>
              {/* One thin bar, not a dot per step: sixteen dots wrapped onto
                  two rows in a bubble this narrow. The count is in the header. */}
              <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted-foreground/20" aria-hidden>
                <div
                  className={`h-full rounded-full bg-brand ${motion}`}
                  style={{ width: `${((step + 1) / TOUR_STEPS.length) * 100}%` }}
                />
              </div>
              <Button className="h-11 shrink-0 px-4" onClick={() => goTo(step + 1)}>
                Next
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  );
}

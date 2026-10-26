"use client";

import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { markTourSeen } from "@/features/tour/autostart-rule";
import { TOUR_STEPS } from "@/features/tour/tour-steps";
import { endTour, exploreSample, setTourStep, startTour, useTour } from "@/features/tour/tour-store";
import { useWorkoutStoreApi } from "@/features/workout/workout-store";
import { buildDemoState } from "@/lib/demo-data";
import { todayKey } from "@/lib/utils";

/** How long a step waits for its part to render after a page change. */
const FIND_TIMEOUT_MS = 2500;

/** Room above a highlighted part, under the status bar, when it is scrolled into view. */
const TOP_GAP = 72;

/** Breathing room around the spotlight. */
const PAD = 8;

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
  const titleRef = useRef<HTMLHeadingElement>(null);

  const current = TOUR_STEPS[step];
  const last = step === TOUR_STEPS.length - 1;

  // A link with ?tour=1 opens the tour — for sharing it, and for testing it.
  useEffect(() => {
    if (params.get("tour") === "1" && !active) {
      startTourNow();
    }
  }, [active, params, startTourNow]);

  const finish = useCallback(() => {
    endTour(store);
  }, [store]);

  // Go to the step's page.
  useEffect(() => {
    if (!active || exploring || !current) {
      return;
    }
    if (pathname !== current.route) {
      router.push(current.route);
    }
  }, [active, current, exploring, pathname, router]);

  // Find the step's part, scroll it under the status bar, and follow it.
  useLayoutEffect(() => {
    if (!active || exploring || !current || pathname !== current.route) {
      setRect(undefined);
      return;
    }
    if (!current.target) {
      setRect(undefined);
      setSearching(false);
      return;
    }

    let element: Element | null = null;
    let frame = 0;
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
      }
    };
    frame = requestAnimationFrame(find);

    window.addEventListener("scroll", follow, { passive: true });
    window.addEventListener("resize", follow);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", follow);
      window.removeEventListener("resize", follow);
    };
  }, [active, current, exploring, pathname]);

  // Focus the step's title, so the change is heard and the buttons are near.
  useEffect(() => {
    if (active && !exploring && !searching) {
      titleRef.current?.focus({ preventScroll: true });
    }
  }, [active, exploring, searching, step]);

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
      <div className="fixed inset-x-0 top-[calc(env(safe-area-inset-top)+0.5rem)] z-[100] flex justify-center px-4">
        <div className="plaque flex items-center gap-3 rounded-full py-1.5 pl-4 pr-1.5 text-sm shadow-lg" role="status">
          <span className="font-semibold">Sample data</span>
          <span className="text-muted-foreground">Nothing here is saved.</span>
          <Button size="sm" className="h-9 rounded-full" onClick={finish}>
            Exit sample
          </Button>
        </div>
      </div>
    );
  }

  if (!current) {
    return null;
  }

  const centred = !current.target || !rect;
  const motion = "transition-all duration-300 ease-out motion-reduce:transition-none";

  return (
    <div className="fixed inset-0 z-[100]" aria-hidden={false}>
      {/* The dim, and the spotlight cut out of it. One element: its giant
          shadow is the dim, so the lit part is never covered twice. */}
      {rect && !centred ? (
        <div
          className={`pointer-events-none absolute rounded-2xl ring-2 ring-brand ${motion}`}
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            boxShadow: "0 0 0 9999px rgba(4, 7, 12, 0.72)"
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-[rgba(4,7,12,0.72)]" />
      )}

      {/* Catches every tap outside the card: the sample is to look at here,
          not to press — a stray tap must not start a session behind the dim. */}
      <div className="absolute inset-0" />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        className={`plaque absolute inset-x-4 mx-auto max-w-md rounded-3xl p-5 shadow-2xl ${motion} ${
          centred ? "top-1/2 -translate-y-1/2" : "bottom-[calc(env(safe-area-inset-bottom)+1rem)]"
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="rounded-full bg-brand/15 px-2.5 py-1 text-xs font-semibold text-brand">
            Sample data · {step + 1} of {TOUR_STEPS.length}
          </span>
          {last ? null : (
            <button
              type="button"
              onClick={finish}
              className="flex h-10 items-center gap-1 rounded-full px-3 text-sm font-semibold text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Skip
              <X className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>

        <h2
          id="tour-title"
          ref={titleRef}
          tabIndex={-1}
          className="mt-3 font-display text-xl font-extrabold tracking-tight focus-visible:outline-none"
        >
          {current.title}
        </h2>
        <p id="tour-body" className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          {current.body}
        </p>

        {/* Step dots: where you are, at a glance. */}
        <div className="mt-4 flex gap-1.5" aria-hidden>
          {TOUR_STEPS.map((_, index) => (
            <span
              key={index}
              className={`h-1.5 rounded-full ${motion} ${index === step ? "w-5 bg-brand" : "w-1.5 bg-muted-foreground/30"}`}
            />
          ))}
        </div>

        {last ? (
          <div className="mt-5 space-y-2">
            <Button className="w-full" onClick={finish}>
              Start with my own data
            </Button>
            <Button variant="secondary" className="w-full" onClick={exploreSample}>
              Keep looking around the sample
            </Button>
          </div>
        ) : (
          <div className="mt-5 flex gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              disabled={step === 0}
              onClick={() => setTourStep(step - 1)}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Back
            </Button>
            <Button className="flex-1" onClick={() => setTourStep(step + 1)}>
              Next
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

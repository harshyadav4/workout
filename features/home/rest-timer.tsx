"use client";

import { Minus, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

import { RecoveryPotion } from "@/features/home/recovery-potion";
import { scheduleRestAlert, subscribeRestAlerts } from "@/features/pwa/rest-alerts";
import { isTouring, subscribeTour } from "@/features/tour/tour-store";
import { REST_KEY, extendRest, readStorage, restoreRest, writeStorage } from "@/lib/timer";
import { cn } from "@/lib/utils";

/**
 * The rest countdown.
 *
 * `restSeconds` has been on every exercise since the first commit and had
 * exactly one reader in the whole app — a static `· 90s rest` label. The number
 * was stored, shown, and never counted.
 */

const STEP_SECONDS = 15;

export function formatRest(seconds: number): string {
  const safe = Math.max(0, seconds);
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

/**
 * The rest as a deadline. An absolute moment rather than a decrementing
 * count: mobile browsers throttle `setInterval` in a backgrounded tab — which
 * is every tab, the moment the phone locks — and a counter would lose exactly
 * the time you spent not looking at it. It changes only on start, extend and
 * skip; the counting happens in the dial (`useCountdown`), the one thing on
 * screen that needs a new number twice a second.
 *
 * One store for the whole app, not state inside Home. The end-of-rest buzz
 * and the "Rest alerts" notification are armed from here, so they fire
 * whichever tab is open: held by Home, they were cancelled by the very tab
 * change (to Progress, to lock the phone) the notification exists for.
 */
interface RestStore {
  endsAt?: number;
  /** The whole rest, so the dial can show how far the mana has refilled. */
  total: number;
}

const rest = createStore<RestStore>(() => ({ endsAt: undefined, total: 0 }));

/** True once the saved rest has been read. The server has no storage to render from. */
let restored = false;

function restoreOnce() {
  if (restored || typeof window === "undefined") {
    return;
  }
  restored = true;
  const saved = restoreRest(readStorage(REST_KEY), Date.now());
  if (saved) {
    rest.setState(saved);
  }
}

export function startRest(seconds?: number) {
  if (!seconds || seconds <= 0) {
    rest.setState({ endsAt: undefined });
    return;
  }
  rest.setState({ endsAt: Date.now() + seconds * 1000, total: seconds });
}

export function extendRestBy(deltaSeconds: number) {
  const { endsAt, total } = rest.getState();
  if (endsAt === undefined) {
    return;
  }
  rest.setState(extendRest({ endsAt, total }, deltaSeconds, Date.now()));
}

export function skipRest() {
  rest.setState({ endsAt: undefined });
}

if (typeof window !== "undefined") {
  // Saved on every change — not while the tour's sample is on screen, so the
  // real session never finds Alex's rest counting down. A rest that has run
  // out is dropped, so it is not restored.
  rest.subscribe((state) => {
    if (!isTouring()) {
      writeStorage(
        REST_KEY,
        state.endsAt !== undefined && state.endsAt > Date.now() && state.total > 0
          ? { endsAt: state.endsAt, total: state.total }
          : undefined
      );
    }
    arm(state.endsAt);
  });

  // The switch on the You page flipped mid-rest: arm (or drop) the alert now,
  // not at the next rest.
  subscribeRestAlerts(() => arm(rest.getState().endsAt));

  // The tour swaps the sample in and out of the workout store; the rest it
  // started must go with it, and the real rest must come back untouched.
  let keptRest: RestStore | undefined;
  subscribeTour((state, previous) => {
    if (state.active && !previous.active) {
      keptRest = rest.getState();
      rest.setState({ endsAt: undefined, total: 0 });
    } else if (!state.active && previous.active) {
      rest.setState(keptRest ?? { endsAt: undefined, total: 0 });
      keptRest = undefined;
    }
  });
}

/**
 * One buzz at the end, and — with "Rest alerts" on — a notification if the app
 * is hidden then. Re-armed whenever the end moves; cancelled on skip. Only a
 * deadline still ahead arms: "−15s" on four seconds left lands on now, and that
 * is "done", not a second alarm. The phone may freeze these timers in the
 * background — see features/pwa/rest-alerts.
 */
let disarm: () => void = () => undefined;

function arm(endsAt?: number) {
  disarm();
  disarm = () => undefined;
  if (endsAt === undefined || endsAt <= Date.now()) {
    return;
  }
  const cancelAlert = scheduleRestAlert(endsAt);
  const buzz = window.setTimeout(() => {
    // On screen the dial says done and the phone buzzes; hidden, the alert
    // above speaks instead. Feature-detected: absent on iOS Safari, which is
    // most of this app's traffic. There is no fallback — a sound in a gym is
    // worse than nothing.
    if (document.visibilityState !== "hidden" && "vibrate" in navigator) {
      navigator.vibrate([120, 60, 120]);
    }
  }, endsAt - Date.now());
  disarm = () => {
    cancelAlert();
    window.clearTimeout(buzz);
  };
}

/** The rest for the page: the deadline and the bar, and the three things that move them. */
export function useRestTimer() {
  const { endsAt, total } = useStore(rest);
  useEffect(restoreOnce, []);
  return { endsAt, total, start: startRest, extend: extendRestBy, skip: skipRest };
}

/** Seconds left to a deadline, refreshed twice a second so the number never sits a beat behind. */
function useCountdown(endsAt: number): number {
  const [remaining, setRemaining] = useState(() => secondsLeft(endsAt));

  useEffect(() => {
    const tick = () => setRemaining(secondsLeft(endsAt));
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [endsAt]);

  return remaining;
}


function secondsLeft(endsAt: number): number {
  return Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
}

interface RestDialProps {
  /** The rest's deadline (ms since the epoch). */
  endsAt: number;
  /** The whole rest in seconds; the mana bar is how much of it has passed. */
  total: number;
  onExtend: (deltaSeconds: number) => void;
  onSkip: () => void;
}

/**
 * The countdown as a small dial on the session strip, with a recovery potion
 * beside the number that refills as the rest runs out — full means go. Tap it and the
 * controls unfold under the strip: fifteen off, fifteen on, skip. It does not
 * dismiss itself at zero — a phone in a pocket misses the buzz, and the dial
 * is the only other signal.
 */
export function RestDial({ endsAt, total, onExtend, onSkip }: RestDialProps) {
  const [open, setOpen] = useState(false);
  const remaining = useCountdown(endsAt);
  const done = remaining <= 0;
  const refilled = done || total <= 0 ? 1 : Math.min(1, Math.max(0, 1 - remaining / total));

  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-label={done ? "Rest is done. Show rest controls" : `${formatRest(remaining)} of rest left. Show rest controls`}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "well flex h-14 min-w-[5.75rem] shrink-0 items-center justify-center gap-2 rounded-lg px-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          done ? "ring-1 ring-brand" : ""
        )}
      >
        <RecoveryPotion level={refilled} className="h-9 w-[27px]" />
        <span className="flex flex-col items-start">
          <span
            className={cn(
              "font-display text-xl font-bold leading-none tabular-nums tracking-tight",
              done ? "text-foreground" : "text-brand"
            )}
            role="status"
            aria-live="polite"
          >
            {formatRest(remaining)}
          </span>
          <span className="mt-1 text-[10px] font-semibold text-muted-foreground">
            {done ? "done" : "resting"}
          </span>
        </span>
      </button>
      {open ? (
        <div className="col-span-full mt-1 flex gap-2">
          <button
            type="button"
            aria-label={`Take ${STEP_SECONDS} seconds off the rest`}
            onClick={() => onExtend(-STEP_SECONDS)}
            className="key-quiet flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold"
          >
            <Minus className="h-4 w-4" /> 15s
          </button>
          <button
            type="button"
            aria-label={`Add ${STEP_SECONDS} seconds to the rest`}
            onClick={() => onExtend(STEP_SECONDS)}
            className="key-quiet flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold"
          >
            <Plus className="h-4 w-4" /> 15s
          </button>
          <button
            type="button"
            aria-label="Skip the rest"
            onClick={() => {
              setOpen(false);
              onSkip();
            }}
            className="key-quiet flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold"
          >
            <X className="h-4 w-4" /> Skip
          </button>
        </div>
      ) : null}
    </>
  );
}

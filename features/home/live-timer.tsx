"use client";

import { Play, Square, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

import { SessionRing } from "@/features/home/session-ring";
import { isTouring, subscribeTour } from "@/features/tour/tour-store";
import {
  LIVE_KEY,
  type LiveState,
  elapsedSeconds,
  formatClock,
  readStorage,
  restoreLive,
  writeStorage
} from "@/lib/timer";
import { cn } from "@/lib/utils";

/**
 * The one running clock of a session: a plank, a hang, a run. Start it, do the
 * thing, tap Finish, and the seconds are the set's. It keeps only when it
 * started (lib/timer), on the device — lock the phone through a two-minute
 * plank, or close the app on a run, and it is still right when you come back.
 */
// Only when it started. The seconds are counted where they are shown
// (`LiveTimerControl`), four times a second; the page renders only on start,
// finish and cancel. A module store, like the rest: the tour swaps it out and
// back with the sample, so a timer started on Alex's plank never shows under a
// real set — and never points at a set id that does not exist.
const live = createStore<{ current?: LiveState }>(() => ({ current: undefined }));

let restored = false;

function restoreOnce() {
  if (restored || typeof window === "undefined") {
    return;
  }
  restored = true;
  const saved = restoreLive(readStorage(LIVE_KEY), Date.now());
  if (saved) {
    live.setState({ current: saved });
  } else {
    writeStorage(LIVE_KEY, undefined);
  }
}

function startLive(setId: string) {
  live.setState({ current: { setId, startedAt: Date.now() } });
}

/** Stops the clock and hands back the seconds it ran. */
function stopLive(): number {
  const current = live.getState().current;
  const seconds = current ? elapsedSeconds(current.startedAt, Date.now()) : 0;
  live.setState({ current: undefined });
  return seconds;
}

function cancelLive() {
  live.setState({ current: undefined });
}

if (typeof window !== "undefined") {
  live.subscribe((state) => {
    if (!isTouring()) {
      writeStorage(LIVE_KEY, state.current);
    }
  });

  let kept: LiveState | undefined;
  subscribeTour((state, previous) => {
    if (state.active && !previous.active) {
      kept = live.getState().current;
      live.setState({ current: undefined });
    } else if (!state.active && previous.active) {
      live.setState({ current: kept });
      kept = undefined;
    }
  });
}

export function useLiveTimer() {
  const current = useStore(live, (state) => state.current);
  useEffect(restoreOnce, []);

  return {
    setId: current?.setId,
    startedAt: current?.startedAt,
    start: startLive,
    stop: stopLive,
    cancel: cancelLive
  };
}

export type LiveTimer = ReturnType<typeof useLiveTimer>;

/** Whole seconds since `startedAt`, refreshed four times a second; 0 with no start. */
function useElapsed(startedAt?: number): number {
  const read = () => (startedAt === undefined ? 0 : elapsedSeconds(startedAt, Date.now()));
  const [elapsed, setElapsed] = useState(read);

  useEffect(() => {
    if (startedAt === undefined) {
      setElapsed(0);
      return;
    }
    const tick = () => setElapsed(elapsedSeconds(startedAt, Date.now()));
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [startedAt]);

  return elapsed;
}

/**
 * The control under a timed set. Idle, it is one Start key. Running, it counts
 * up in a ring that fills toward the target; at the target the phone buzzes —
 * and the clock keeps going, so a 52-second plank is logged as 52, not cut off
 * at the 45 you aimed for. No target (a run): the ring stays full.
 */
export function LiveTimerControl({
  running,
  startedAt,
  targetSeconds,
  onStart,
  onFinish,
  onCancel
}: {
  running: boolean;
  /** When the clock started (ms since the epoch); read only while running. */
  startedAt?: number;
  /** The set's planned seconds. Absent or 0 on an open-ended effort. */
  targetSeconds?: number;
  onStart: () => void;
  onFinish: () => void;
  onCancel: () => void;
}) {
  const elapsed = useElapsed(running ? startedAt : undefined);
  const hasTarget = Boolean(targetSeconds && targetSeconds > 0);
  const reached = hasTarget && elapsed >= (targetSeconds ?? 0);

  // One buzz per run, the moment the target is hit.
  const buzzed = useRef(false);
  useEffect(() => {
    if (!running) {
      buzzed.current = false;
      return;
    }
    if (reached && !buzzed.current) {
      buzzed.current = true;
      if ("vibrate" in navigator) {
        navigator.vibrate([160, 80, 160]);
      }
    }
  }, [reached, running]);

  if (!running) {
    return (
      <button
        type="button"
        onClick={onStart}
        className="key-quiet mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-full text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Play className="h-4 w-4" />
        Start timer
      </button>
    );
  }

  return (
    <div className="mt-3 flex items-center gap-4">
      <SessionRing
        value={hasTarget ? elapsed / (targetSeconds ?? 1) : 1}
        size={84}
        stroke={3}
        label={hasTarget ? `${elapsed} of ${targetSeconds} seconds` : `${elapsed} seconds`}
      >
        <span className="text-xl font-medium tabular-nums tracking-[-0.02em]" role="timer">
          {formatClock(elapsed)}
        </span>
      </SessionRing>
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm font-semibold", reached && "text-brand")}>
          {reached ? "Target done" : hasTarget ? `Target ${formatClock(targetSeconds ?? 0)}` : "Timing"}
        </p>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={onFinish}
            className="key flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Square className="h-4 w-4" />
            Finish
          </button>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel the timer"
            className="key-quiet flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

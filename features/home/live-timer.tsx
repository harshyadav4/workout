"use client";

import { Play, Square, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { SessionRing } from "@/features/home/session-ring";
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
export function useLiveTimer() {
  const [live, setLive] = useState<LiveState>();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const saved = restoreLive(readStorage(LIVE_KEY), Date.now());
    if (saved) {
      setLive(saved);
    } else {
      writeStorage(LIVE_KEY, undefined);
    }
  }, []);

  useEffect(() => {
    if (!live) {
      return;
    }
    const tick = () => setNow(Date.now());
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [live]);

  const start = useCallback((setId: string) => {
    const next = { setId, startedAt: Date.now() };
    setLive(next);
    setNow(next.startedAt);
    writeStorage(LIVE_KEY, next);
  }, []);

  /** Stops the clock and hands back the seconds it ran. */
  const stop = useCallback((): number => {
    const seconds = live ? elapsedSeconds(live.startedAt, Date.now()) : 0;
    setLive(undefined);
    writeStorage(LIVE_KEY, undefined);
    return seconds;
  }, [live]);

  const cancel = useCallback(() => {
    setLive(undefined);
    writeStorage(LIVE_KEY, undefined);
  }, []);

  return {
    setId: live?.setId,
    elapsed: live ? elapsedSeconds(live.startedAt, now) : 0,
    start,
    stop,
    cancel
  };
}

export type LiveTimer = ReturnType<typeof useLiveTimer>;

/**
 * The control under a timed set. Idle, it is one Start key. Running, it counts
 * up in a mana ring that fills toward the target; at the target the phone
 * buzzes and the ring flares — and the clock keeps going, so a 52-second plank
 * is logged as 52, not cut off at the 45 you aimed for. No target (a run): the
 * ring breathes instead of filling.
 */
export function LiveTimerControl({
  running,
  elapsed,
  targetSeconds,
  onStart,
  onFinish,
  onCancel
}: {
  running: boolean;
  elapsed: number;
  /** The set's planned seconds. Absent or 0 on an open-ended effort. */
  targetSeconds?: number;
  onStart: () => void;
  onFinish: () => void;
  onCancel: () => void;
}) {
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
        className="key-quiet mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Play className="h-4 w-4" />
        Start timer
      </button>
    );
  }

  return (
    <div className="mt-3 flex items-center gap-4 rounded-xl bg-brand/[0.06] p-3 ring-1 ring-brand/30">
      <div className={cn("rounded-full", (reached || !hasTarget) && "mana-vial-open")}>
        <SessionRing
          value={hasTarget ? elapsed / (targetSeconds ?? 1) : 1}
          size={84}
          stroke={8}
          label={hasTarget ? `${elapsed} of ${targetSeconds} seconds` : `${elapsed} seconds`}
        >
          <span className="font-display text-xl font-extrabold tabular-nums tracking-tight" role="timer">
            {formatClock(elapsed)}
          </span>
        </SessionRing>
      </div>
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm font-semibold", reached && "text-brand")}>
          {reached ? "Target done" : hasTarget ? `Target ${formatClock(targetSeconds ?? 0)}` : "Timing"}
        </p>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={onFinish}
            className="key flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Square className="h-4 w-4" />
            Finish
          </button>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel the timer"
            className="key-quiet flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

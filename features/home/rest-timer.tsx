"use client";

import { Minus, Plus, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

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

export function useRestTimer() {
  // An absolute deadline rather than a decrementing count. Mobile browsers
  // throttle `setInterval` in a backgrounded tab — which is every tab, the
  // moment the phone locks — and a counter would lose exactly the time you
  // spent not looking at it.
  const [endsAt, setEndsAt] = useState<number | undefined>(undefined);
  const [remaining, setRemaining] = useState(0);
  const buzzedRef = useRef(false);

  useEffect(() => {
    if (endsAt === undefined) {
      return;
    }

    const tick = () => {
      const left = Math.ceil((endsAt - Date.now()) / 1000);
      setRemaining(Math.max(0, left));

      if (left > 0 || buzzedRef.current) {
        return;
      }
      buzzedRef.current = true;
      // Feature-detected: absent on iOS Safari, which is most of this app's
      // traffic. There is no fallback — a sound in a gym is worse than nothing.
      if ("vibrate" in navigator) {
        navigator.vibrate([120, 60, 120]);
      }
    };

    tick();
    // Twice a second so the displayed number never sits a beat behind.
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [endsAt]);

  const start = useCallback((seconds?: number) => {
    if (!seconds || seconds <= 0) {
      setEndsAt(undefined);
      return;
    }
    buzzedRef.current = false;
    setEndsAt(Date.now() + seconds * 1000);
  }, []);

  const extend = useCallback((deltaSeconds: number) => {
    setEndsAt((current) => {
      if (current === undefined) {
        return current;
      }
      // Never below now: a −15 on four seconds left means "done", not a clock
      // that owes you eleven seconds the next time you extend it.
      const next = Math.max(Date.now(), current + deltaSeconds * 1000);
      if (next > Date.now()) {
        buzzedRef.current = false;
      }
      return next;
    });
  }, []);

  const skip = useCallback(() => setEndsAt(undefined), []);

  return { active: endsAt !== undefined, remaining, start, extend, skip };
}

interface RestDialProps {
  remaining: number;
  onExtend: (deltaSeconds: number) => void;
  onSkip: () => void;
}

/**
 * The countdown as a small dial on the session strip. Tap it and the controls
 * unfold under the strip: fifteen off, fifteen on, skip. It does not dismiss
 * itself at zero — a phone in a pocket misses the buzz, and the dial is the
 * only other signal.
 */
export function RestDial({ remaining, onExtend, onSkip }: RestDialProps) {
  const [open, setOpen] = useState(false);
  const done = remaining <= 0;

  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-label={done ? "Rest done. Rest controls" : `${formatRest(remaining)} of rest left. Rest controls`}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "well flex h-14 min-w-[4.5rem] shrink-0 flex-col items-center justify-center rounded-lg px-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          done ? "ring-1 ring-brand" : ""
        )}
      >
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
          {done ? "go" : "rest"}
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

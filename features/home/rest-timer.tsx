"use client";

import { Minus, Plus, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { RecoveryPotion } from "@/features/home/recovery-potion";
import { REST_KEY, readStorage, restoreRest, writeStorage } from "@/lib/timer";
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
  // The whole rest, so the dial can show how far the mana has refilled.
  const [total, setTotal] = useState(0);
  const buzzedRef = useRef(false);

  // The deadline is also kept on the device (lib/timer), so closing the app
  // mid-rest and opening it again brings the potion back where it really is.
  // Read once, after mount: the server has no storage to render from.
  useEffect(() => {
    const saved = restoreRest(readStorage(REST_KEY), Date.now());
    if (saved) {
      setTotal(saved.total);
      setEndsAt(saved.endsAt);
    }
  }, []);

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
      writeStorage(REST_KEY, undefined);
      return;
    }
    buzzedRef.current = false;
    const next = Date.now() + seconds * 1000;
    setTotal(seconds);
    setEndsAt(next);
    writeStorage(REST_KEY, { endsAt: next, total: seconds });
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
    // A longer rest is a longer bar, not a bar that jumps backwards.
    setTotal((current) => Math.max(1, current + deltaSeconds));
  }, []);

  // Saved after the fact rather than inside the setters above, which React may
  // run twice. A rest that has run out is dropped, so it is not restored.
  useEffect(() => {
    if (endsAt !== undefined && total > 0) {
      writeStorage(REST_KEY, endsAt > Date.now() ? { endsAt, total } : undefined);
    }
  }, [endsAt, total]);

  const skip = useCallback(() => {
    setEndsAt(undefined);
    writeStorage(REST_KEY, undefined);
  }, []);

  return { active: endsAt !== undefined, remaining, total, start, extend, skip };
}

interface RestDialProps {
  remaining: number;
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
export function RestDial({ remaining, total, onExtend, onSkip }: RestDialProps) {
  const [open, setOpen] = useState(false);
  const done = remaining <= 0;
  const refilled = done || total <= 0 ? 1 : Math.min(1, Math.max(0, 1 - remaining / total));

  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-label={done ? "Rest done. Rest controls" : `${formatRest(remaining)} of rest left. Rest controls`}
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
            {done ? "go" : "recovering"}
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

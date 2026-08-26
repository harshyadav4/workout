"use client";

import { Minus, Plus, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

/**
 * The rest countdown.
 *
 * `restSeconds` has been on every exercise since the first commit and had
 * exactly one reader in the whole app — a static `· 90s rest` label. The number
 * was stored, shown, and never counted.
 */

const STEP_SECONDS = 15;

function formatRest(seconds: number): string {
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

interface RestTimerBarProps {
  remaining: number;
  onExtend: (deltaSeconds: number) => void;
  onSkip: () => void;
}

export function RestTimerBar({ remaining, onExtend, onSkip }: RestTimerBarProps) {
  const done = remaining <= 0;

  return (
    <div
      // Sticky: the whole point is that it stays readable while you scroll to
      // the next exercise. It does not auto-dismiss at zero — a phone in a
      // pocket misses the buzz, and the bar is the only other signal.
      className="sticky top-2 z-30 flex items-center gap-2 rounded-3xl border border-white/10 bg-card/95 p-2 backdrop-blur-xl"
      role="status"
      aria-live="polite"
    >
      <Button
        variant="secondary"
        size="icon"
        aria-label={`Take ${STEP_SECONDS} seconds off the rest`}
        onClick={() => onExtend(-STEP_SECONDS)}
      >
        <Minus className="h-5 w-5" />
      </Button>

      <div className="flex-1 text-center">
        <p className="font-mono text-2xl font-bold tabular-nums">{formatRest(remaining)}</p>
        <p className="text-xs text-muted-foreground">{done ? "Rest done" : "Rest"}</p>
      </div>

      <Button
        variant="secondary"
        size="icon"
        aria-label={`Add ${STEP_SECONDS} seconds to the rest`}
        onClick={() => onExtend(STEP_SECONDS)}
      >
        <Plus className="h-5 w-5" />
      </Button>
      <Button variant="ghost" size="icon" aria-label="Skip the rest" onClick={onSkip}>
        <X className="h-5 w-5" />
      </Button>
    </div>
  );
}

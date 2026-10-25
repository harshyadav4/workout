import { useId } from "react";

import { cn } from "@/lib/utils";

/** The flask: a cork-necked round bottle, in a 24 × 32 box. */
const FLASK = "M9.5 5 V11.83 A9.5 9.5 0 1 0 14.5 11.83 V5 Z";
/** Where the liquid sits empty (the bottom of the bowl) and full (the shoulder). */
const EMPTY_Y = 30.5;
const FULL_Y = 13;

/**
 * The recovery potion: the rest timer drawn as a flask that refills. The blue
 * is the key's own gradient, so it is the same mana as the ring; its surface
 * rolls and a few bubbles rise while it fills, and it glows once it is full —
 * rest done. Drawn here rather than shipped as a picture, so it is sharp at
 * any size, follows the theme, costs nothing to download, and nobody else
 * owns it. Decorative: the dial around it says the time in words.
 */
export function RecoveryPotion({ level, className }: { /** 0 empty to 1 full. */ level: number; className?: string }) {
  const id = useId().replace(/:/g, "");
  const full = level >= 1;
  const clamped = Math.max(0, Math.min(1, level));
  const surface = EMPTY_Y - clamped * (EMPTY_Y - FULL_Y);

  return (
    <svg viewBox="0 0 24 32" className={cn("shrink-0", className)} aria-hidden>
      <defs>
        <linearGradient id={`${id}-mana`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: "hsl(var(--key-top))" }} />
          <stop offset="100%" style={{ stopColor: "hsl(var(--key-bottom))" }} />
        </linearGradient>
        <clipPath id={`${id}-glass`}>
          <path d={FLASK} />
        </clipPath>
      </defs>

      {/* The glass, empty. */}
      <path d={FLASK} style={{ fill: "hsl(var(--background) / 0.6)" }} />

      {/* The liquid: one wave-topped block that slides up as the rest runs. */}
      <g clipPath={`url(#${id}-glass)`} className={full ? "mana-glow" : undefined}>
        <g className="potion-level" style={{ transform: `translateY(${surface}px)` }}>
          <path
            className={full ? undefined : "potion-wave"}
            d="M-12 0 q3 -1.6 6 0 t6 0 t6 0 t6 0 t6 0 t6 0 t6 0 V24 H-12 Z"
            fill={`url(#${id}-mana)`}
          />
        </g>
        {full ? null : (
          <>
            <circle className="potion-bubble" cx="10" cy="28" r="0.9" style={{ fill: "rgba(255,255,255,0.7)" }} />
            <circle className="potion-bubble potion-bubble-late" cx="14" cy="29" r="0.7" style={{ fill: "rgba(255,255,255,0.6)" }} />
          </>
        )}
      </g>

      {/* Glass edge, a highlight on the bowl, and the cork. */}
      <path d={FLASK} fill="none" strokeWidth="1.3" strokeLinejoin="round" style={{ stroke: "hsl(var(--foreground) / 0.55)" }} />
      <path d="M6.6 18.5 A6.5 6.5 0 0 1 9 14.6" fill="none" strokeWidth="1.2" strokeLinecap="round" style={{ stroke: "rgba(255,255,255,0.35)" }} />
      <rect x="8.6" y="1.4" width="6.8" height="4" rx="1.2" style={{ fill: "hsl(var(--muted-foreground))" }} />
    </svg>
  );
}

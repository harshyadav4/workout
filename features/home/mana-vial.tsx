import { useId } from "react";

import { cn } from "@/lib/utils";

/** The pill's own box: 26 × 12, the size the chips have always been. */
const W = 26;
const H = 12;
/** How full each state stands. Done is drawn as the solid key, not as liquid. */
const LEVEL = { pending: 0.35, open: 0.6 } as const;

/**
 * A set that is not logged yet, as a vial of mana instead of a black slot.
 *
 * The same liquid as the recovery potion (features/home/recovery-potion.tsx):
 * the key's gradient under a rolling wave. A pending set holds a low, dim
 * charge that rolls slowly — waiting, not dead. The open set stands higher,
 * rolls faster and glows: this is the one you are on. Each vial's wave starts
 * at a different point (`phase`), so a row of them shimmers rather than
 * marches in step. Decorative; the chip's button carries the words.
 */
export function ManaVial({ state, phase = 0 }: { state: "pending" | "open"; /** 0–1, offsets the wave. */ phase?: number }) {
  const id = useId().replace(/:/g, "");
  const surface = H * (1 - LEVEL[state]);

  return (
    <span
      className={cn(
        "well relative block h-3 w-[26px] overflow-hidden rounded-full",
        state === "open" && "mana-vial-open"
      )}
      aria-hidden
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id={`${id}-mana`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: "hsl(var(--key-top))" }} />
            <stop offset="100%" style={{ stopColor: "hsl(var(--key-bottom))" }} />
          </linearGradient>
        </defs>
        <g className="mana-vial-level" style={{ transform: `translateY(${surface}px)` }}>
          <path
            className={state === "open" ? "mana-vial-wave mana-vial-wave-fast" : "mana-vial-wave"}
            style={{ animationDelay: `${-phase * 2.6}s`, opacity: state === "open" ? 1 : 0.75 }}
            d="M-12 0 q3 -1.4 6 0 t6 0 t6 0 t6 0 t6 0 t6 0 t6 0 t6 0 t6 0 V12 H-12 Z"
            fill={`url(#${id}-mana)`}
          />
        </g>
      </svg>
      {/* The glass: a highlight along the top, so it reads as a vial. */}
      <span className="pointer-events-none absolute inset-x-1 top-px h-px rounded-full bg-white/25" />
    </span>
  );
}

/*
 * The effects sit in a box 12px wider and 8px taller than the pill on each
 * side, in a 50 × 28 drawing where the pill is the middle 26 × 12. Outside the
 * vial itself, which clips its liquid.
 */
const FX_BOX = "pointer-events-none absolute -inset-x-3 -inset-y-2";

/** Two arcs off the open vial's corners; they crackle in turn (globals.css). */
export function ManaCharge() {
  return (
    <>
      <span className={cn(FX_BOX, "mana-aura rounded-full")} aria-hidden />
      <svg viewBox="0 0 50 28" className={cn(FX_BOX, "overflow-visible")} aria-hidden>
        <path className="mana-bolt" d="M9 9 L13 5 L16 8 L21 3" />
        <path className="mana-bolt mana-bolt-late" d="M29 25 L33 22 L36 26 L41 21" />
      </svg>
    </>
  );
}

/**
 * The strike when a set is logged: the aura flashes and four bolts fly out,
 * once. Mounted only on the chip just stamped, so it plays on the tap and
 * never on load — the same rule as the stamp itself.
 */
export function ManaBurst() {
  return (
    <>
      <span className={cn(FX_BOX, "mana-burst-aura rounded-full")} aria-hidden />
      <svg viewBox="0 0 50 28" className={cn(FX_BOX, "mana-burst-bolts overflow-visible")} aria-hidden>
        <path className="mana-bolt" d="M12 14 L8 12 L5 15 L1 13" />
        <path className="mana-bolt" d="M38 14 L42 16 L45 13 L49 15" />
        <path className="mana-bolt" d="M22 8 L20 5 L23 4 L21 0" />
        <path className="mana-bolt" d="M28 20 L30 23 L27 24 L29 28" />
      </svg>
    </>
  );
}

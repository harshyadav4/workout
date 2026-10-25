import { useId } from "react";

import type { Rank } from "@/lib/hunter";
import { cn } from "@/lib/utils";

/**
 * The small artifacts on Home, drawn rather than shipped as pictures — the
 * same set as the recovery potion: a glass-and-metal edge, the key's mana
 * gradient, a glow. Sharp at any size, themed, free to download, and nobody
 * else owns them. Each moves once, on arrival, and holds still with reduced
 * motion (see the `.artifact-*` rules in globals.css). All decorative: the
 * words beside them carry the meaning.
 */

const EDGE = { stroke: "hsl(var(--foreground) / 0.55)" };
const GLASS = { fill: "hsl(var(--background) / 0.6)" };

function Mana({ id }: { id: string }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" style={{ stopColor: "hsl(var(--key-top))" }} />
      <stop offset="100%" style={{ stopColor: "hsl(var(--key-bottom))" }} />
    </linearGradient>
  );
}

const RANK_ORDER: Rank[] = ["E", "D", "C", "B", "A", "S"];

/** A shield with a crystal at its heart. The crystal burns brighter rank by rank; S gets a gold rim. */
export function RankCrest({ rank, className }: { rank: Rank; className?: string }) {
  const id = useId().replace(/:/g, "");
  const step = RANK_ORDER.indexOf(rank);
  const top = rank === "S";
  return (
    <svg viewBox="0 0 24 24" className={cn("shrink-0", className)} aria-hidden>
      <defs>
        <Mana id={`${id}-mana`} />
      </defs>
      <path
        d="M12 2 L20 5 V11 C20 16.5 16.5 20.5 12 22 C7.5 20.5 4 16.5 4 11 V5 Z"
        strokeWidth={top ? 1.6 : 1.3}
        strokeLinejoin="round"
        style={{ ...GLASS, stroke: top ? "hsl(var(--rank-gold))" : EDGE.stroke }}
      />
      <path d="M12 4.6 L17.6 6.8 V11" fill="none" strokeWidth="1" strokeLinecap="round" style={{ stroke: "rgba(255,255,255,0.22)" }} />
      <path
        d="M12 7 L15.5 12 L12 17 L8.5 12 Z"
        fill={`url(#${id}-mana)`}
        style={{
          opacity: 0.55 + step * 0.09,
          filter: `drop-shadow(0 0 ${1 + step}px hsl(var(--primary) / ${0.3 + step * 0.1}))`
        }}
      />
      <path d="M12 7 L12 17 M8.5 12 L15.5 12" strokeWidth="0.6" style={{ stroke: "rgba(255,255,255,0.35)" }} />
    </svg>
  );
}

/** A rolled scroll with a seal. It unrolls once, when the quest is cleared. */
export function QuestScroll({ className }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 28 24" className={cn("shrink-0", className)} aria-hidden>
      <defs>
        <Mana id={`${id}-mana`} />
      </defs>
      <g className="artifact-unroll">
        <rect x="5" y="4" width="18" height="15" rx="1.5" strokeWidth="1.2" style={{ ...GLASS, ...EDGE }} />
        <path d="M8.5 8.5 H19.5 M8.5 11.5 H17 M8.5 14.5 H15" strokeWidth="1" strokeLinecap="round" style={{ stroke: "hsl(var(--muted-foreground) / 0.8)" }} />
      </g>
      <rect x="2.5" y="2.5" width="4" height="18" rx="2" strokeWidth="1.2" style={{ fill: "hsl(var(--secondary))", ...EDGE }} />
      <rect x="21.5" y="2.5" width="4" height="18" rx="2" strokeWidth="1.2" style={{ fill: "hsl(var(--secondary))", ...EDGE }} />
      <circle cx="19" cy="17" r="4" fill={`url(#${id}-mana)`} className="mana-glow" />
      <path d="M17.2 17 L18.5 18.3 L20.9 15.8" fill="none" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "hsl(var(--primary-foreground))" }} />
    </svg>
  );
}

/** A cut crystal with two arrows rising off it, once. */
export function LevelUpGem({ className }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 24 24" className={cn("shrink-0 overflow-visible", className)} aria-hidden>
      <defs>
        <Mana id={`${id}-mana`} />
      </defs>
      <g className="artifact-rise">
        <path d="M8 6.5 L12 3 L16 6.5" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "hsl(var(--brand))" }} />
        <path d="M9.5 9 L12 6.8 L14.5 9" fill="none" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "hsl(var(--brand) / 0.6)" }} />
      </g>
      <path d="M12 10 L18 14 L12 22 L6 14 Z" fill={`url(#${id}-mana)`} strokeWidth="1" strokeLinejoin="round" className="mana-glow" style={EDGE} />
      <path d="M6 14 H18 M12 10 L10 14 L12 22 M12 10 L14 14 L12 22" fill="none" strokeWidth="0.6" style={{ stroke: "rgba(255,255,255,0.45)" }} />
    </svg>
  );
}

/** A chest, iron-bound, that opens once with mana spilling out. For a new rank. */
export function TreasureChest({ className }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 32 28" className={cn("shrink-0 overflow-visible", className)} aria-hidden>
      <defs>
        <Mana id={`${id}-mana`} />
        <linearGradient id={`${id}-beam`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" style={{ stopColor: "hsl(var(--key-top))", stopOpacity: 0.8 }} />
          <stop offset="100%" style={{ stopColor: "hsl(var(--key-top))", stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      <path className="artifact-beam" d="M9 14 L4 0 H28 L23 14 Z" fill={`url(#${id}-beam)`} />
      <rect x="4" y="14" width="24" height="12" rx="1.5" strokeWidth="1.3" style={{ fill: "hsl(var(--secondary))", ...EDGE }} />
      <path d="M4 18 H28 M10 14 V26 M22 14 V26" strokeWidth="1" style={EDGE} />
      <rect x="14" y="16.5" width="4" height="4.5" rx="0.8" fill={`url(#${id}-mana)`} className="mana-glow" />
      <g className="artifact-lid">
        <path d="M4 14 V11 C4 7.5 8 6 16 6 C24 6 28 7.5 28 11 V14 Z" strokeWidth="1.3" strokeLinejoin="round" style={{ fill: "hsl(var(--secondary))", ...EDGE }} />
        <path d="M10 6.6 V14 M22 6.6 V14" strokeWidth="1" style={EDGE} />
      </g>
    </svg>
  );
}

/**
 * The measuring orb: a crystal on a stand with the rank burning inside it,
 * the way a hunter's rank is read. Brighter rank by rank; it wakes once.
 */
export function MeasurementOrb({ rank, className }: { rank: Rank; className?: string }) {
  const id = useId().replace(/:/g, "");
  const step = RANK_ORDER.indexOf(rank);
  return (
    <svg viewBox="0 0 64 72" className={cn("shrink-0 overflow-visible", className)} aria-hidden>
      <defs>
        <radialGradient id={`${id}-orb`} cx="40%" cy="35%" r="70%">
          <stop offset="0%" style={{ stopColor: "rgba(255,255,255,0.9)" }} />
          <stop offset="30%" style={{ stopColor: "hsl(var(--key-top))" }} />
          <stop offset="100%" style={{ stopColor: "hsl(var(--key-bottom))" }} />
        </radialGradient>
      </defs>
      <ellipse cx="32" cy="66" rx="20" ry="3.5" style={{ fill: "hsl(var(--primary) / 0.25)" }} className="artifact-beam" />
      <path d="M20 60 L24 52 H40 L44 60 Z" strokeWidth="1.3" strokeLinejoin="round" style={{ fill: "hsl(var(--secondary))", ...EDGE }} />
      <path d="M17 64 H47 L44 60 H20 Z" strokeWidth="1.3" strokeLinejoin="round" style={{ fill: "hsl(var(--secondary))", ...EDGE }} />
      <g className="artifact-wake">
        <circle
          cx="32"
          cy="28"
          r="23"
          fill={`url(#${id}-orb)`}
          style={{ opacity: 0.6 + step * 0.08, filter: `drop-shadow(0 0 ${4 + step * 2}px hsl(var(--primary) / 0.6))` }}
        />
        <circle cx="32" cy="28" r="23" fill="none" strokeWidth="1.2" style={EDGE} />
        <path d="M17 20 A17 17 0 0 1 27 10" fill="none" strokeWidth="2" strokeLinecap="round" style={{ stroke: "rgba(255,255,255,0.45)" }} />
        <text
          x="32"
          y="37"
          textAnchor="middle"
          className="font-display"
          style={{ fontSize: 26, fontWeight: 800, fill: "#fff", filter: "drop-shadow(0 0 4px hsl(var(--primary)))" }}
        >
          {rank}
        </text>
      </g>
    </svg>
  );
}

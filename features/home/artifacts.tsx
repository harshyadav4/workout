import { useId } from "react";

import type { Rank } from "@/lib/hunter";
import { cn } from "@/lib/utils";

const RANK_ORDER: Rank[] = ["E", "D", "C", "B", "A", "S"];

/**
 * A shield with a crystal at its heart. The crystal burns brighter rank by rank;
 * S gets a gold rim. Drawn rather than shipped as a picture, so it is sharp at
 * any size and follows the theme. Decorative: the words beside it say the rank.
 */
export function RankCrest({ rank, className }: { rank: Rank; className?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const step = RANK_ORDER.indexOf(rank);
  const top = rank === "S";
  return (
    <svg viewBox="0 0 24 24" className={cn("shrink-0", className)} aria-hidden>
      <defs>
        <linearGradient id={`${id}-light`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: "hsl(var(--key-top))" }} />
          <stop offset="100%" style={{ stopColor: "hsl(var(--key-bottom))" }} />
        </linearGradient>
      </defs>
      <path
        d="M12 2 L20 5 V11 C20 16.5 16.5 20.5 12 22 C7.5 20.5 4 16.5 4 11 V5 Z"
        fill="none"
        strokeWidth={top ? 1.6 : 1.3}
        strokeLinejoin="round"
        style={{ stroke: top ? "hsl(var(--rank-gold))" : "hsl(var(--foreground) / 0.45)" }}
      />
      <path d="M12 7 L15.5 12 L12 17 L8.5 12 Z" fill={`url(#${id}-light)`} style={{ opacity: 0.55 + step * 0.09 }} />
    </svg>
  );
}

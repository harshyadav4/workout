"use client";

import { Flame, Scale, TrendingUp, Trophy } from "lucide-react";

import { SECTION_THEMES } from "@/features/progress/chart-theme";
import { Panel } from "@/features/progress/panel";
import type { Win, WinKind } from "@/lib/progress-scores";

/** Each win in the colour of the card it comes from. */
const KINDS: Record<WinKind, { icon: typeof Trophy; color: string }> = {
  record: { icon: Trophy, color: SECTION_THEMES.strength.accent },
  strength: { icon: TrendingUp, color: SECTION_THEMES.strength.accent },
  body: { icon: Scale, color: SECTION_THEMES.body.accent },
  streak: { icon: Flame, color: SECTION_THEMES.consistency.accent }
};

/**
 * The good news, before any chart. Only wins — the problems are already named
 * in the summary's "Try next" line and in the cards behind the rings.
 */
export function WinsCard({ wins, rangeLabel }: { wins: Win[]; rangeLabel: string }) {
  return (
    <Panel title="Your wins" caption={rangeLabel} flush>
      {wins.length === 0 ? (
        <p className="px-4 pb-4 pt-1 text-sm text-muted-foreground">
          Records, gains, and streaks show here as you train.
        </p>
      ) : (
        <ul className="pt-1">
          {wins.map((win) => {
            const { icon: Icon, color } = KINDS[win.kind];
            return (
              <li
                key={`${win.kind}-${win.title}`}
                data-icon=""
                className="list-row flex items-start gap-3 py-2.5 pl-4 pr-3.5"
              >
                <Icon className="mt-0.5 h-[18px] w-[18px] shrink-0" style={{ color }} strokeWidth={1.8} aria-hidden />
                <span className="min-w-0">
                  <span className="block text-[15px] font-medium leading-snug">{win.title}</span>
                  <span className="mt-px block text-[13px] text-muted-foreground">{win.detail}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

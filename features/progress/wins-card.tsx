"use client";

import { Flame, Scale, TrendingUp, Trophy } from "lucide-react";

import { Panel } from "@/features/progress/panel";
import type { Win, WinKind } from "@/lib/progress-scores";

const ICONS: Record<WinKind, typeof Trophy> = {
  record: Trophy,
  strength: TrendingUp,
  body: Scale,
  streak: Flame
};

/**
 * The good news, before any chart. Only wins — the problems are already named
 * in the summary's "Try next" line and in the cards behind the rings.
 */
export function WinsCard({ wins, rangeLabel }: { wins: Win[]; rangeLabel: string }) {
  return (
    <Panel title="Your wins" caption={rangeLabel}>
      {wins.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">
          Your wins show here: new records, lifts that went up, and weeks in a row. Keep logging
          your sessions.
        </p>
      ) : (
        <ul className="space-y-2">
          {wins.map((win) => {
            const Icon = ICONS[win.kind];
            return (
              <li key={`${win.kind}-${win.title}`} className="well flex items-start gap-3 rounded-lg p-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success/15">
                  <Icon className="h-4 w-4 text-success" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold leading-snug">{win.title}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{win.detail}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

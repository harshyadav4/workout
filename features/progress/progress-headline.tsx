"use client";

import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";

import { Card } from "@/components/ui/card";
import { formatSigned } from "@/features/progress/chart-theme";
import {
  WEEKLY_SET_TARGET,
  percentChange,
  windowDays,
  type DateWindow,
  type GroupSets,
  type ProgressRange,
  type ProgressSummary
} from "@/lib/progress-metrics";
import type { Streaks } from "@/lib/progress-trends";
import { formatVolume } from "@/lib/utils";

const RANGE_LABELS: Record<ProgressRange, string> = {
  "4w": "last 4 weeks",
  "12w": "last 12 weeks",
  "1y": "last year",
  all: "all time",
  custom: "picked dates"
};

/**
 * The hero, and the only `Card` left on the page.
 *
 * Everything else is a `Panel` now. Thirteen boxes of identical weight was the
 * reason the screen read as a list of widgets, and a hierarchy only exists if
 * something is at the top of it.
 */
export function ProgressHeadline({
  range,
  summary,
  previous,
  window,
  streaks,
  weeklySets,
  daysSincePR
}: {
  range: ProgressRange;
  summary: ProgressSummary;
  previous?: ProgressSummary;
  window: DateWindow;
  streaks: Streaks;
  weeklySets: GroupSets[];
  daysSincePR?: number;
}) {
  const change = previous ? percentChange(summary.volume, previous.volume) : undefined;

  return (
    <Card>
      <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
        Volume · {RANGE_LABELS[range]}
      </p>
      <p className="mt-2 text-[3.25rem] font-bold leading-none tracking-tight">
        {formatVolume(summary.volume)}
        <span className="ml-1.5 align-baseline text-lg font-medium text-muted-foreground">kg</span>
      </p>
      <Delta change={change} days={windowDays(window)} />

      {/* The page measured thirteen things and concluded nothing. One sentence,
          chosen by whichever finding is most worth acting on. */}
      <p className="mt-3 border-l-2 border-primary/40 pl-3 text-sm leading-relaxed">
        {verdict({ summary, change, streaks, weeklySets, daysSincePR })}
      </p>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Tile label="Sessions" value={String(summary.sessions)} />
        <Tile label="Sets" value={formatVolume(summary.sets)} />
        <Tile
          label="Heaviest"
          value={summary.best ? `${summary.best.weight}` : "—"}
          unit={summary.best ? "kg" : undefined}
          detail={summary.best?.name}
        />
      </div>
    </Card>
  );
}

/** Six weeks with no lift beating itself is a plateau, not a bad month. */
const PLATEAU_DAYS = 42;

/** A swing this big is a decision — a deload, or a block that got away. */
const NOTABLE_CHANGE = 15;

/**
 * One sentence, and only one.
 *
 * Ordered by what is worth doing something about rather than by what is easiest
 * to compute: a stalled bar outranks a healthy tonnage number, and an
 * undertrained group outranks a streak. Same shape as `readOf()` in
 * `volume-detail-card.tsx` — one place decides what the numbers mean, so the
 * page never says two different things about the same range.
 */
function verdict({
  summary,
  change,
  streaks,
  weeklySets,
  daysSincePR
}: {
  summary: ProgressSummary;
  change?: number;
  streaks: Streaks;
  weeklySets: GroupSets[];
  daysSincePR?: number;
}) {
  if (summary.sessions === 0) {
    return "Nothing logged in this range — widen it, or go and train.";
  }

  if (daysSincePR !== undefined && daysSincePR >= PLATEAU_DAYS) {
    return `No lift has beaten itself in ${Math.floor(daysSincePR / 7)} weeks. The work is going in; the bar is not moving.`;
  }

  // Only groups you actually train: a group at zero is a programme choice, and
  // telling someone their untrained calves are under the band is noise.
  const lagging = weeklySets.filter(
    (group) => group.setsPerWeek > 0 && group.setsPerWeek < WEEKLY_SET_TARGET.low
  );

  if (lagging.length > 0) {
    const worst = lagging[lagging.length - 1];
    return `${worst.label} is getting ${worst.setsPerWeek.toFixed(1)} hard sets a week, under the 10–20 band — the cheapest thing to fix next week.`;
  }

  if (change !== undefined && change <= -NOTABLE_CHANGE) {
    return `Tonnage is down ${Math.abs(Math.round(change))}% on the window before. A deload if you meant it, a drift if you did not.`;
  }

  if (change !== undefined && change >= NOTABLE_CHANGE) {
    return `Tonnage is up ${Math.round(change)}% on the window before, across ${summary.sessions} sessions. Watch recovery before adding more.`;
  }

  if (streaks.currentWeeks >= 4) {
    return `${streaks.currentWeeks} weeks in a row without missing one, at ${summary.setsPerSession.toFixed(0)} sets a session. The habit is the win here.`;
  }

  return `${summary.sessions} sessions at ${formatVolume(summary.sessionVolume)} kg each, holding steady against the window before.`;
}

/** Direction is an arrow first and a colour second — never colour alone. */
function Delta({ change, days }: { change?: number; days: number }) {
  if (change === undefined) {
    return (
      <p className="mt-2 text-sm text-muted-foreground">
        No earlier window to compare against yet.
      </p>
    );
  }

  const flat = Math.abs(change) < 1;
  const Icon = flat ? ArrowRight : change > 0 ? ArrowUpRight : ArrowDownRight;
  const tone = flat ? "text-muted-foreground" : change > 0 ? "text-[#3fbf6f]" : "text-[#e8785a]";

  return (
    <p className={`mt-2 flex items-center gap-1.5 text-sm ${tone}`}>
      <Icon className="h-4 w-4" aria-hidden />
      <span className="font-mono tabular-nums">{formatSigned(change)}%</span>
      <span className="text-muted-foreground">vs the previous {days} days</span>
    </p>
  );
}

function Tile({
  label,
  value,
  unit,
  detail
}: {
  label: string;
  value: string;
  unit?: string;
  detail?: string;
}) {
  return (
    <div className="rounded-2xl bg-secondary/40 p-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1.5 text-xl font-semibold leading-none">
        {value}
        {unit ? <span className="ml-1 text-xs font-medium text-muted-foreground">{unit}</span> : null}
      </p>
      {detail ? (
        <p className="mt-1 truncate text-[11px] text-muted-foreground" title={detail}>
          {detail}
        </p>
      ) : null}
    </div>
  );
}

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
  type ProgressSummary,
  type StrengthGrowth
} from "@/lib/progress-metrics";
import type { Streaks } from "@/lib/progress-trends";
import { formatVolume } from "@/lib/utils";

export const RANGE_LABELS: Record<ProgressRange, string> = {
  "4w": "last 4 weeks",
  "12w": "last 12 weeks",
  "1y": "last year",
  all: "all time",
  custom: "picked dates"
};

/**
 * The summary: one total made relatable, then one thing going well and one
 * thing to try next.
 *
 * The total used to be the hero, at 52px. Nobody can tell whether 1.9 million
 * kg is good, so it is a supporting line now and the rings above carry the
 * verdict. What stays here is the reading: a win first, because the page is
 * opened to see progress, and then one fix, because a page that only praises
 * gets ignored.
 */
export function ProgressHeadline({
  range,
  summary,
  previous,
  window,
  streaks,
  weeklySets,
  daysSincePR,
  topGain
}: {
  range: ProgressRange;
  summary: ProgressSummary;
  previous?: ProgressSummary;
  window: DateWindow;
  streaks: Streaks;
  weeklySets: GroupSets[];
  daysSincePR?: number;
  /** The lift that went up most in the range, if any did. */
  topGain?: StrengthGrowth;
}) {
  const change = previous ? percentChange(summary.volume, previous.volume) : undefined;
  const reading = verdict({ summary, change, streaks, weeklySets, daysSincePR, topGain });
  const cars = Math.round(summary.volume / CAR_KG);

  return (
    <Card>
      <p className="text-xs font-semibold text-muted-foreground">
        Total weight lifted · {RANGE_LABELS[range]}
      </p>
      <p className="mt-1.5 font-display text-3xl font-extrabold leading-none tracking-tight tabular-nums">
        {formatBig(summary.volume)}
        <span className="ml-1.5 align-baseline text-base font-medium text-muted-foreground">kg</span>
      </p>
      {cars >= MIN_CARS ? (
        <p className="mt-1.5 text-sm text-muted-foreground">
          About the weight of {formatVolume(cars)} cars.
        </p>
      ) : null}
      <Delta change={change} days={windowDays(window)} />

      <div className="mt-4 space-y-2">
        {reading.good ? <Reading label="Going well" tone="good" text={reading.good} /> : null}
        <Reading label="Try next" tone="next" text={reading.next} />
      </div>
    </Card>
  );
}

/** A small family car, near enough — the comparison only needs to be roughly right. */
const CAR_KG = 1500;

/** Under ten cars the comparison is more odd than impressive. */
const MIN_CARS = 10;

/** "1.9 million" reads at a glance; "1,919,048" has to be counted. */
function formatBig(value: number) {
  return value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)} million` : formatVolume(value);
}

function Reading({ label, tone, text }: { label: string; tone: "good" | "next"; text: string }) {
  return (
    <div
      className={`rounded-lg border-l-2 py-1 pl-3 ${tone === "good" ? "border-success" : "border-brand"}`}
    >
      <p className={`text-xs font-semibold ${tone === "good" ? "text-success" : "text-brand"}`}>
        {label}
      </p>
      <p className="mt-0.5 text-sm leading-snug">{text}</p>
    </div>
  );
}

/** Six weeks with no lift beating itself is a plateau, not a bad month. */
const PLATEAU_DAYS = 42;

/** A swing this big is a decision — a deload, or a block that got away. */
const NOTABLE_CHANGE = 15;

/**
 * Two lines: one thing going well, one thing to try next.
 *
 * "Try next" is ordered by what is worth doing something about rather than by
 * what is easiest to compute: a stalled bar outranks a muscle under its goal,
 * and that outranks a drop in total. Same shape as `readOf()` in
 * `volume-detail-card.tsx` — one place decides what the numbers mean, so the
 * page never says two different things about the same range.
 */
function verdict({
  summary,
  change,
  streaks,
  weeklySets,
  daysSincePR,
  topGain
}: {
  summary: ProgressSummary;
  change?: number;
  streaks: Streaks;
  weeklySets: GroupSets[];
  daysSincePR?: number;
  topGain?: StrengthGrowth;
}): { good?: string; next: string } {
  if (summary.sessions === 0) {
    return { next: "No sessions in this time range. Pick a longer range, or go train." };
  }

  return { good: goingWell(summary, change, streaks, topGain), next: tryNext(change, weeklySets, daysSincePR) };
}

function goingWell(
  summary: ProgressSummary,
  change: number | undefined,
  streaks: Streaks,
  topGain?: StrengthGrowth
) {
  if (topGain && topGain.changePercent >= 2) {
    return `${topGain.name} went up from ${topGain.first} kg to ${topGain.last} kg (+${Math.round(topGain.changePercent)}%).`;
  }

  if (change !== undefined && change >= NOTABLE_CHANGE) {
    return `You lifted ${Math.round(change)}% more than in the period before.`;
  }

  if (streaks.currentWeeks >= 2) {
    return `${streaks.currentWeeks} weeks in a row with at least one session.`;
  }

  return `${summary.sessions} ${summary.sessions === 1 ? "session" : "sessions"} done in this range. Every one counts.`;
}

function tryNext(change: number | undefined, weeklySets: GroupSets[], daysSincePR?: number) {
  if (daysSincePR !== undefined && daysSincePR >= PLATEAU_DAYS) {
    return `No new personal record in ${Math.floor(daysSincePR / 7)} weeks. Try to add a little weight, or one more rep, to one main lift.`;
  }

  // Only groups you actually train: a group at zero is a programme choice, and
  // telling someone their untrained calves are under the goal is noise.
  const lagging = weeklySets.filter(
    (group) => group.setsPerWeek > 0 && group.setsPerWeek < WEEKLY_SET_TARGET.low
  );

  if (lagging.length > 0) {
    const worst = lagging[lagging.length - 1];
    return `${worst.label} gets only ${worst.setsPerWeek.toFixed(1)} sets a week (goal ${WEEKLY_SET_TARGET.low}–${WEEKLY_SET_TARGET.high}). Add a few ${worst.label.toLowerCase()} sets next week.`;
  }

  if (change !== undefined && change <= -NOTABLE_CHANGE) {
    return `You lifted ${Math.abs(Math.round(change))}% less than in the period before. Fine if you planned an easy phase; if not, get back to your usual week.`;
  }

  if (change !== undefined && change >= NOTABLE_CHANGE) {
    return "You are doing a lot more than before. Sleep and eat well so your body can recover.";
  }

  return "Keep going. Try to add a little weight, or one more rep, to your main lifts.";
}

/** Direction is an arrow first and a colour second — never colour alone. */
function Delta({ change, days }: { change?: number; days: number }) {
  // "No earlier period" on the default range told the user nothing; say nothing.
  if (change === undefined) {
    return null;
  }

  const flat = Math.abs(change) < 1;
  const Icon = flat ? ArrowRight : change > 0 ? ArrowUpRight : ArrowDownRight;
  const tone = flat ? "text-muted-foreground" : change > 0 ? "text-success" : "text-danger";

  return (
    <p className={`mt-2 flex items-center gap-1.5 text-sm ${tone}`}>
      <Icon className="h-4 w-4" aria-hidden />
      <span className="tabular-nums">{formatSigned(change)}%</span>
      <span className="text-muted-foreground">vs the previous {days} days</span>
    </p>
  );
}

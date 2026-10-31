"use client";

import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";

import { formatSigned } from "@/features/progress/chart-theme";
import { Panel } from "@/features/progress/panel";
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
    <Panel title={`Weight lifted · ${RANGE_LABELS[range]}`} flush>
      <div className="list-row px-4 pb-3 pt-3.5">
        <p className="plot-n">
          {formatBig(summary.volume)}
          <span className="ml-1.5 text-[15px] font-normal text-muted-foreground">kg</span>
        </p>
        {cars >= MIN_CARS ? (
          <p className="mt-0.5 text-[13.5px] text-muted-foreground">
            About the weight of {formatVolume(cars)} cars.
          </p>
        ) : null}
        <Delta change={change} days={windowDays(window)} />
      </div>

      {reading.good ? <Reading label="Going well" tone="good" text={reading.good} /> : null}
      <Reading label="Try next" tone="next" text={reading.next} />
    </Panel>
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
    <div className="list-row px-4 py-2.5">
      <p className={`text-[13px] font-medium ${tone === "good" ? "text-success" : "text-brand"}`}>
        {label}
      </p>
      <p className="mt-px text-[15px] leading-snug">{text}</p>
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
    return { next: "No workouts in this range. Try a longer range." };
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
    return `${topGain.name}: ${topGain.first} → ${topGain.last} kg (+${Math.round(topGain.changePercent)}%).`;
  }

  if (change !== undefined && change >= NOTABLE_CHANGE) {
    return `${Math.round(change)}% more weight lifted than the period before.`;
  }

  if (streaks.currentWeeks >= 2) {
    return `${streaks.currentWeeks} weeks in a row with a workout.`;
  }

  return `${summary.sessions} ${summary.sessions === 1 ? "workout" : "workouts"} in this range.`;
}

function tryNext(change: number | undefined, weeklySets: GroupSets[], daysSincePR?: number) {
  if (daysSincePR !== undefined && daysSincePR >= PLATEAU_DAYS) {
    return `No record in ${Math.floor(daysSincePR / 7)} weeks — add a little weight or 1 rep.`;
  }

  // Only groups you actually train: a group at zero is a programme choice, and
  // telling someone their untrained calves are under the goal is noise.
  const lagging = weeklySets.filter(
    (group) => group.setsPerWeek > 0 && group.setsPerWeek < WEEKLY_SET_TARGET.low
  );

  if (lagging.length > 0) {
    const worst = lagging[lagging.length - 1];
    return `${worst.label} gets ${worst.setsPerWeek.toFixed(1)} sets a week — aim for ${WEEKLY_SET_TARGET.low}–${WEEKLY_SET_TARGET.high}.`;
  }

  if (change !== undefined && change <= -NOTABLE_CHANGE) {
    return `${Math.abs(Math.round(change))}% less weight than before — fine if you planned an easy period.`;
  }

  if (change !== undefined && change >= NOTABLE_CHANGE) {
    return "Much more weight than before — sleep and eat well.";
  }

  return "Add a little weight or 1 rep to a main exercise.";
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
    <p className={`mt-1 flex items-center gap-1.5 text-[13.5px] ${tone}`}>
      <Icon className="h-4 w-4" aria-hidden />
      <span className="tabular-nums">{formatSigned(change)}%</span>
      <span className="text-muted-foreground">vs the previous {days} days</span>
    </p>
  );
}

import { latestFor, seriesFor, withMovingAverage } from "@/lib/body-metrics";
import {
  DIRECT_ENGAGEMENT,
  GROUP_ORDER,
  buildMuscleGroupVolume,
  buildMuscleVolume,
  buildStrengthGrowth,
  buildWeeklySetsByGroup,
  resolvedTargets,
  daysBetween,
  shiftKey,
  weekStartKey
} from "@/lib/progress-metrics";
import { mainLifts } from "@/lib/progress-scores";
import { buildPRLedger, buildStreaks } from "@/lib/progress-trends";
import { muscles } from "@/lib/seed-data";
import type { BodyMeasurement, MuscleGroup, MuscleId, WorkoutLog } from "@/lib/types";

/**
 * The second layer of Progress: the numbers that make the work feel like
 * something — badges, this month against last, how strong you are for your
 * size, and when the goal weight arrives. Every builder takes `today` rather
 * than reading the clock, so the tests pin the date.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];

function monthKey(date: string) {
  return date.slice(0, 7);
}

function monthLabel(key: string) {
  return MONTHS[Number(key.slice(5, 7)) - 1];
}

function longMonthLabel(key: string) {
  return `${LONG_MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
}

/** The month before a "YYYY-MM" key. */
function previousMonth(key: string) {
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`;
}

function daysInMonth(key: string) {
  return new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0)).getUTCDate();
}

function sessionDays(logs: WorkoutLog[]) {
  return new Set(logs.map((log) => log.date));
}

function totalVolume(logs: WorkoutLog[]) {
  return logs.reduce((sum, log) => sum + log.totalVolume, 0);
}

// -- milestones ---------------------------------------------------------------

export type BadgeKind = "sessions" | "weight" | "streak";

export interface Badge {
  kind: BadgeKind;
  title: string;
  detail: string;
  /** 0–1 toward the next step; 1 on a badge already earned. */
  progress: number;
}

const STEPS: Record<BadgeKind, number[]> = {
  sessions: [10, 25, 50, 100, 250, 500, 1000],
  weight: [10_000, 100_000, 500_000, 1_000_000, 5_000_000, 10_000_000],
  streak: [4, 12, 26, 52, 104]
};

function formatTonnage(kg: number) {
  return kg >= 1_000_000 ? `${kg / 1_000_000}M kg` : `${(kg / 1000).toLocaleString("en-US")}k kg`;
}

/** "3.7 million kg", "70 thousand kg": a distance to a badge is read, not audited. */
function roughKg(kg: number) {
  if (kg >= 1_000_000) {
    return `${(kg / 1_000_000).toFixed(1)} million kg`;
  }
  if (kg >= 10_000) {
    return `${Math.round(kg / 1000)} thousand kg`;
  }
  return `${Math.ceil(kg).toLocaleString("en-US")} kg`;
}

function stepTitle(kind: BadgeKind, step: number) {
  if (kind === "sessions") {
    return `${step} workouts`;
  }
  if (kind === "weight") {
    return `${formatTonnage(step)} lifted`;
  }
  return `${step}-week streak`;
}

/**
 * The badges you have, and the next one of each kind.
 *
 * One earned badge per kind — the highest — rather than a shelf of every
 * step: "10 sessions" next to "250 sessions" is clutter, not pride.
 */
export function buildMilestones(logs: WorkoutLog[], today: string) {
  if (logs.length === 0) {
    return { earned: [] as Badge[], next: [] as Badge[] };
  }

  const first = [...sessionDays(logs)].sort()[0];
  const values: Record<BadgeKind, number> = {
    sessions: sessionDays(logs).size,
    weight: totalVolume(logs),
    streak: buildStreaks(logs, { start: first, end: today }).longestWeeks
  };

  const earned: Badge[] = [];
  const next: Badge[] = [];

  (Object.keys(STEPS) as BadgeKind[]).forEach((kind) => {
    const value = values[kind];
    const reached = STEPS[kind].filter((step) => value >= step);
    const upcoming = STEPS[kind].find((step) => value < step);

    if (reached.length > 0) {
      earned.push({
        kind,
        title: stepTitle(kind, reached[reached.length - 1]),
        detail: kind === "streak" ? "Best streak" : "Earned",
        progress: 1
      });
    }

    if (upcoming !== undefined) {
      const left = upcoming - value;
      next.push({
        kind,
        title: stepTitle(kind, upcoming),
        detail:
          kind === "sessions"
            ? `${left} more ${left === 1 ? "workout" : "workouts"}`
            : kind === "weight"
              ? `${roughKg(left)} to go`
              : `${left} more ${left === 1 ? "week" : "weeks"}`,
        progress: value / upcoming
      });
    }
  });

  return { earned, next };
}

// -- this month vs last month --------------------------------------------------

export interface MonthCompareRow {
  label: string;
  now: number;
  before: number;
  /** Percent change, or undefined when last month had nothing to compare with. */
  change?: number;
}

/**
 * This month so far against the same days of last month — the 1st to the
 * 12th against the 1st to the 12th — so the comparison is fair on any day of
 * the month, not just the last one.
 */
export function buildMonthCompare(logs: WorkoutLog[], today: string): MonthCompareRow[] {
  const thisMonth = monthKey(today);
  const lastMonth = previousMonth(thisMonth);
  const day = Number(today.slice(8, 10));
  const lastEnd = `${lastMonth}-${String(Math.min(day, daysInMonth(lastMonth))).padStart(2, "0")}`;

  const inThis = logs.filter((log) => log.date >= `${thisMonth}-01` && log.date <= today);
  const inLast = logs.filter((log) => log.date >= `${lastMonth}-01` && log.date <= lastEnd);
  const records = buildPRLedger(logs);
  const recordsIn = (start: string, end: string) =>
    records.filter((entry) => entry.date >= start && entry.date <= end).length;

  const row = (label: string, now: number, before: number): MonthCompareRow => ({
    label,
    now,
    before,
    change: before > 0 ? ((now - before) / before) * 100 : undefined
  });

  return [
    row("Workouts", sessionDays(inThis).size, sessionDays(inLast).size),
    row("Weight lifted", totalVolume(inThis), totalVolume(inLast)),
    row("Records", recordsIn(`${thisMonth}-01`, today), recordsIn(`${lastMonth}-01`, lastEnd))
  ];
}

// -- strength vs bodyweight ------------------------------------------------------

export interface StrengthRatio {
  workoutId: string;
  name: string;
  best: number;
  /** Best set divided by bodyweight. */
  ratio: number;
}

/**
 * The lifts a bodyweight ratio means something for. "0.45× bodyweight" on a
 * triceps pushdown is a true number and a useless one.
 */
const BIG_LIFTS = /squat|bench|deadlift|overhead press|shoulder press|military press|row|pull-?up|chin-?up|dip/i;

const RATIO_LIFTS = 5;

/**
 * Your best set on each big lift, as a multiple of your bodyweight —
 * "you squat 1.4× your bodyweight" is a number anyone can feel.
 */
export function buildStrengthRatios(
  logs: WorkoutLog[],
  measurements: BodyMeasurement[],
  fallbackWeightKg?: number
): StrengthRatio[] {
  const bodyweight = latestFor(measurements, "weight")?.value ?? fallbackWeightKg;

  if (!bodyweight || bodyweight <= 0) {
    return [];
  }

  // The big lifts you have done twice or more; your most-done lifts when none
  // of them match, so the card is never empty for an unusual programme.
  const growth = buildStrengthGrowth(logs);
  const big = growth.filter((lift) => BIG_LIFTS.test(lift.name));
  const lifts = big.length > 0 ? big : mainLifts(logs);

  return lifts
    .map((lift) => {
      const best = Math.max(
        ...logs.filter((log) => log.workoutId === lift.workoutId).map((log) => log.peakWeight ?? 0)
      );
      return { workoutId: lift.workoutId, name: lift.name, best, ratio: best / bodyweight };
    })
    .filter((row) => row.best > 0)
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, RATIO_LIFTS);
}

// -- records per month -----------------------------------------------------------

export type RecordsMonth = { key: string; label: string; total: number } & Record<MuscleGroup, number>;

/**
 * Records set in each of the last `months` months, split by the group of the
 * lift — so a run of leg records reads as a leg phase, not just a busy month.
 */
export function buildRecordsPerMonth(
  logs: WorkoutLog[],
  today: string,
  groupOf: Map<string, MuscleGroup>,
  months = 12
): RecordsMonth[] {
  const keys: string[] = [];
  for (let key = monthKey(today); keys.length < months; key = previousMonth(key)) {
    keys.unshift(key);
  }

  const rows = new Map<string, RecordsMonth>(
    keys.map((key) => [
      key,
      {
        key,
        label: monthLabel(key),
        total: 0,
        ...(Object.fromEntries(GROUP_ORDER.map((group) => [group, 0])) as Record<MuscleGroup, number>)
      }
    ])
  );

  buildPRLedger(logs).forEach((entry) => {
    const row = rows.get(monthKey(entry.date));
    const group = groupOf.get(entry.workoutId);
    if (row && group) {
      row[group] += 1;
      row.total += 1;
    }
  });

  return keys.map((key) => rows.get(key)!);
}

// -- sessions per week -------------------------------------------------------------

export interface WeekSessions {
  start: string;
  sessions: number;
  /** Reached the weekly goal. */
  hit: boolean;
  /** The current week, still running. */
  partial: boolean;
}

/** Sessions in each of the last `weeks` weeks, this one included, against the goal. */
export function buildWeeklySessions(
  logs: WorkoutLog[],
  today: string,
  target: number,
  weeks = 12
): WeekSessions[] {
  const days = sessionDays(logs);
  const thisWeek = weekStartKey(today);

  return Array.from({ length: weeks }, (_, index) => {
    const start = shiftKey(thisWeek, -7 * (weeks - 1 - index));
    const sessions = Array.from({ length: 7 }, (__, offset) => shiftKey(start, offset)).filter(
      (date) => date <= today && days.has(date)
    ).length;
    return { start, sessions, hit: sessions >= target, partial: start === thisWeek };
  });
}

/** The month with the most sessions — the one to beat. */
export function buildBestMonth(logs: WorkoutLog[]) {
  const counts = new Map<string, number>();
  sessionDays(logs).forEach((date) => {
    counts.set(monthKey(date), (counts.get(monthKey(date)) ?? 0) + 1);
  });

  let best: { key: string; label: string; sessions: number } | undefined;
  counts.forEach((sessions, key) => {
    // Ties go to the more recent month: matching your best is news.
    if (!best || sessions > best.sessions || (sessions === best.sessions && key > best.key)) {
      best = { key, label: longMonthLabel(key), sessions };
    }
  });
  return best;
}

// -- goal date ----------------------------------------------------------------------

/** The trend is read from this much recent history. */
const TREND_DAYS = 56;

/** Past this, a straight line is a guess, not an estimate. */
const MAX_ETA_DAYS = 730;

export interface GoalEta {
  date: string;
  /** kg per week, signed. */
  perWeek: number;
}

/**
 * When the goal weight arrives at your recent pace — a straight line through
 * the last eight weeks of weigh-ins. Undefined when there is no goal, too few
 * weigh-ins, or the trend points away from the goal: then there is no date to
 * promise, and the card says so rather than inventing one.
 */
export function buildGoalEta(
  measurements: BodyMeasurement[],
  goalWeightKg: number | undefined,
  today: string
): GoalEta | undefined {
  if (!goalWeightKg || goalWeightKg <= 0) {
    return undefined;
  }

  const recent = seriesFor(measurements, "weight").filter(
    (point) => daysBetween(point.date, today) <= TREND_DAYS
  );
  if (recent.length < 3) {
    return undefined;
  }

  const xs = recent.map((point) => daysBetween(recent[0].date, point.date));
  const ys = recent.map((point) => point.value);
  const meanX = xs.reduce((a, b) => a + b, 0) / xs.length;
  const meanY = ys.reduce((a, b) => a + b, 0) / ys.length;
  const spread = xs.reduce((sum, x) => sum + (x - meanX) ** 2, 0);
  if (spread === 0) {
    return undefined;
  }
  const slope = xs.reduce((sum, x, index) => sum + (x - meanX) * (ys[index] - meanY), 0) / spread;

  const now = meanY + slope * (daysBetween(recent[0].date, today) - meanX);
  const days = (goalWeightKg - now) / slope;

  if (!Number.isFinite(days) || days <= 0 || days > MAX_ETA_DAYS) {
    return undefined;
  }

  return { date: shiftKey(today, Math.round(days)), perWeek: slope * 7 };
}

// -- monthly weight change ------------------------------------------------------------

export interface WeightChangeMonth {
  key: string;
  label: string;
  /** This month's average against last month's, kg, signed. */
  change: number;
}

/** Month-on-month change of your average weight, over the last `months` months. */
export function buildMonthlyWeightChange(
  measurements: BodyMeasurement[],
  months = 12
): WeightChangeMonth[] {
  const sums = new Map<string, { total: number; count: number }>();
  withMovingAverage(seriesFor(measurements, "weight")).forEach((point) => {
    const key = monthKey(point.date);
    const current = sums.get(key) ?? { total: 0, count: 0 };
    sums.set(key, { total: current.total + point.value, count: current.count + 1 });
  });

  const average = (key: string) => {
    const entry = sums.get(key);
    return entry ? entry.total / entry.count : undefined;
  };

  return [...sums.keys()]
    .sort()
    .map((key) => {
      const now = average(key);
      const before = average(previousMonth(key));
      return now !== undefined && before !== undefined
        ? { key, label: monthLabel(key), change: Math.round((now - before) * 10) / 10 }
        : undefined;
    })
    .filter((row): row is WeightChangeMonth => row !== undefined)
    .slice(-months);
}

// -- muscle recovery ----------------------------------------------------------------

export type RecoveryState = "recovering" | "ready" | "due" | "never";

/** A muscle trained this recently is still recovering. */
const RECOVERING_DAYS = 1;

/** Past this, a muscle is due — a week without work is where it starts to slip. */
const DUE_DAYS = 7;

export interface MuscleRecovery {
  muscleId: MuscleId;
  name: string;
  group: MuscleGroup;
  /** Days since a lift worked it directly; undefined when never. */
  days?: number;
  state: RecoveryState;
}

/**
 * Days since each muscle was last worked *directly* (50+ engagement), and what
 * that means today. A muscle that only helped — triceps on a bench day —
 * does not count as trained: it was not the one being worked.
 *
 * Always about today on the whole history; "what can I train now" does not
 * change with the range chip.
 */
export function buildMuscleRecovery(logs: WorkoutLog[], today: string): MuscleRecovery[] {
  const last = new Map<MuscleId, string>();

  logs.forEach((log) => {
    if (log.date > today) {
      return;
    }
    resolvedTargets(log)
      .filter((target) => target.engagement >= DIRECT_ENGAGEMENT)
      .forEach((target) => {
        const previous = last.get(target.muscleId);
        if (!previous || log.date > previous) {
          last.set(target.muscleId, log.date);
        }
      });
  });

  return muscles.map((muscle) => {
    const date = last.get(muscle.id);
    const days = date ? daysBetween(date, today) : undefined;
    const state: RecoveryState =
      days === undefined ? "never" : days <= RECOVERING_DAYS ? "recovering" : days <= DUE_DAYS ? "ready" : "due";
    return { muscleId: muscle.id, name: muscle.name, group: muscle.group, days, state };
  });
}

// -- growth timeline -------------------------------------------------------------------

export type GroupWeek = { start: string } & Record<MuscleGroup, number>;

/**
 * Sets per week for each muscle group, over the last `weeks` *complete* weeks —
 * counted the same way as the weekly-sets card, one week at a time, so a line
 * here and a bar there never disagree.
 *
 * The running week is left out: on a Tuesday it holds one session, and every
 * line would end in a cliff that reads as "your training is falling".
 */
export function buildGroupSetsTimeline(logs: WorkoutLog[], today: string, weeks = 12): GroupWeek[] {
  const lastFull = shiftKey(weekStartKey(today), -7);

  return Array.from({ length: weeks }, (_, index) => {
    const start = shiftKey(lastFull, -7 * (weeks - 1 - index));
    const window = { start, end: shiftKey(start, 6) };
    const inWeek = logs.filter((log) => log.date >= window.start && log.date <= window.end);
    const sets = buildWeeklySetsByGroup(inWeek, window);
    const row = { start } as GroupWeek;
    GROUP_ORDER.forEach((group) => {
      row[group] = Math.round((sets.find((item) => item.group === group)?.setsPerWeek ?? 0) * 10) / 10;
    });
    return row;
  });
}

// -- balance ------------------------------------------------------------------------------

const PUSH: MuscleId[] = ["pecUpper", "pecLower", "deltFront", "deltSide", "tricepsLong", "tricepsLateral"];
const PULL: MuscleId[] = ["lats", "rhomboids", "traps", "deltRear", "biceps", "brachialis"];

/** Inside 45–55% a split is balanced; a few sets either way is noise. */
const BALANCED_LOW = 45;
const BALANCED_HIGH = 55;

export interface BalancePair {
  /** e.g. "Push" and "Pull". */
  left: string;
  right: string;
  /** Percent of the pair on the left side. */
  leftShare: number;
  sentence: string;
}

function pair(left: string, right: string, leftVolume: number, rightVolume: number, fix: string): BalancePair | undefined {
  const total = leftVolume + rightVolume;
  if (total <= 0) {
    return undefined;
  }

  const leftShare = (leftVolume / total) * 100;
  let sentence: string;

  if (leftShare >= BALANCED_LOW && leftShare <= BALANCED_HIGH) {
    sentence = `${left} and ${right.toLowerCase()} are well balanced.`;
  } else {
    const more = leftShare > 50 ? left : right;
    const less = leftShare > 50 ? right : left;
    const ratio = Math.round((Math.max(leftVolume, rightVolume) / Math.max(Math.min(leftVolume, rightVolume), 1) - 1) * 100);
    sentence =
      Math.min(leftVolume, rightVolume) === 0
        ? `No ${less.toLowerCase()} exercises yet. ${fix}`
        : `${ratio}% more weight on ${more.toLowerCase()} than ${less.toLowerCase()}. ${fix}`;
  }

  return { left, right, leftShare, sentence };
}

/**
 * Push against pull, and upper body against lower, by the weight that reached
 * each side. Lopsided pushing is a classic cause of rounded shoulders, and a
 * plain sentence with a fix beats a radar nobody can read.
 */
export function buildBalance(logs: WorkoutLog[]): { pushPull?: BalancePair; upperLower?: BalancePair } {
  const volume = new Map(buildMuscleVolume(logs).map((muscle) => [muscle.muscleId, muscle.volume]));
  const sum = (ids: MuscleId[]) => ids.reduce((total, id) => total + (volume.get(id) ?? 0), 0);

  const groups = new Map(buildMuscleGroupVolume(logs).map((group) => [group.group, group.volume]));
  const upper = (["chest", "back", "shoulders", "arms"] as MuscleGroup[]).reduce(
    (total, group) => total + (groups.get(group) ?? 0),
    0
  );
  const lower = groups.get("legs") ?? 0;

  const push = sum(PUSH);
  const pull = sum(PULL);

  return {
    pushPull: pair(
      "Push",
      "Pull",
      push,
      pull,
      push > pull ? "Add a row or a pulldown." : "Add a press."
    ),
    upperLower: pair(
      "Upper body",
      "Lower body",
      upper,
      lower,
      upper > lower ? "Add a squat or a lunge." : "Add an upper body exercise."
    )
  };
}

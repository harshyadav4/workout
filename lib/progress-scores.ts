import { hasGoal, seriesFor, withMovingAverage } from "@/lib/body-metrics";
import {
  type GroupSets,
  type ProgressSummary,
  WEEKLY_SET_TARGET,
  buildStrengthGrowth,
  daysBetween,
  filterByWindow,
  shiftKey,
  weekStartKey,
  type DateWindow
} from "@/lib/progress-metrics";
import { buildPRLedger, buildStreaks } from "@/lib/progress-trends";
import type { BodyMeasurement, ScheduledSession, SetLog, WorkoutLog } from "@/lib/types";

/**
 * The three rings at the top of Progress, and the wins under them.
 *
 * Every ring compares against something the user already understands — their
 * own lifts, their own week, their own goal — never an invented 0–100 score.
 * A score has to be explained before it means anything, and the point of the
 * rings is that they need no explanation.
 */

export type RingTone = "good" | "steady" | "low";

export interface Ring {
  /** How full the ring is, 0–1. */
  fill: number;
  /** The figure in the middle of the ring, already formatted. */
  value: string;
  /** One plain sentence under the ring. */
  sentence: string;
  tone: RingTone;
  /** False while there is not enough data; the ring then shows the sentence only. */
  ready: boolean;
}

// -- comparison -------------------------------------------------------------

const MIN_COMPARE_SESSIONS = 3;

/**
 * Whether the period before is worth comparing with. A year of history makes
 * "the year before" a few days long, and +32,000% against a few days is
 * arithmetic, not progress — so a thin earlier period compares as nothing.
 */
export function comparablePrevious(
  current: ProgressSummary,
  previous?: ProgressSummary
): ProgressSummary | undefined {
  return previous &&
    previous.sessions >= MIN_COMPARE_SESSIONS &&
    previous.sessions * 2 >= current.sessions
    ? previous
    : undefined;
}

// -- strength ---------------------------------------------------------------

/** The lifts you do most are the ones the ring speaks for. */
export const MAIN_LIFTS = 5;

/** Under ±2% a lift has held, not moved — a plate's rounding, not a gain. */
const STEADY_PERCENT = 2;

/**
 * Strength: how many of your main lifts went up across the window, and by how
 * much on average.
 *
 * The fill is the share that went up, not the size of the gain. "+12%" over four
 * weeks and over a year are different achievements, but "4 of 5 lifts went up"
 * reads the same at any range, so it is the part that fills the ring.
 */
export function mainLifts(logs: WorkoutLog[]) {
  return buildStrengthGrowth(logs)
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, MAIN_LIFTS);
}

export function strengthRing(logs: WorkoutLog[]): Ring {
  const main = mainLifts(logs);

  if (main.length === 0) {
    return {
      fill: 0,
      value: "—",
      sentence: "Do the same lift in two sessions, and this ring shows if you got stronger.",
      tone: "steady",
      ready: false
    };
  }

  const up = main.filter((lift) => lift.changePercent >= STEADY_PERCENT).length;
  const average = main.reduce((sum, lift) => sum + lift.changePercent, 0) / main.length;
  const rounded = Math.round(average);
  const tone: RingTone =
    average >= STEADY_PERCENT ? "good" : average > -STEADY_PERCENT ? "steady" : "low";

  const subject = main.length === 1 ? main[0].name : `your ${main.length} main lifts`;
  const sentence =
    tone === "good"
      ? main.length === 1
        ? `${main[0].name} went up ${rounded}%.`
        : up === main.length
          ? `All ${main.length} of your main lifts went up. Average gain ${rounded}%.`
          : `${up} of ${subject} went up. Average gain ${rounded}%.`
      : tone === "steady"
        ? `${capitalize(subject)} held about the same weight.`
        : `${capitalize(subject)} went down ${Math.abs(rounded)}% on average. Rest, eat well, and build back up.`;

  return {
    fill: up / main.length,
    value: `${rounded > 0 ? "+" : ""}${rounded}%`,
    sentence,
    tone,
    ready: true
  };
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// -- consistency ------------------------------------------------------------

/** Complete weeks looked at to find your usual week. */
const HABIT_WEEKS = 8;

/** The target before there is a habit to read — a common starting split. */
const DEFAULT_WEEKLY_TARGET = 3;

function sessionDays(logs: WorkoutLog[]) {
  return new Set(logs.map((log) => log.date));
}

function sessionsInWeek(days: Set<string>, weekStart: string) {
  return Array.from({ length: 7 }, (_, offset) => shiftKey(weekStart, offset)).filter((date) =>
    days.has(date)
  ).length;
}

/**
 * Your usual sessions per week, from the last eight complete weeks you have
 * history for. A plan, when there is one, should be passed instead — this is
 * only the fallback for someone who trains without one.
 */
export function usualWeeklySessions(logs: WorkoutLog[], today: string) {
  if (logs.length === 0) {
    return DEFAULT_WEEKLY_TARGET;
  }

  const days = sessionDays(logs);
  const first = [...days].sort()[0];
  const thisWeek = weekStartKey(today);
  const counts: number[] = [];

  for (
    let week = shiftKey(thisWeek, -7);
    counts.length < HABIT_WEEKS && week >= weekStartKey(first);
    week = shiftKey(week, -7)
  ) {
    counts.push(sessionsInWeek(days, week));
  }

  // Two weeks is the least that is a habit rather than a single week.
  if (counts.length < 2) {
    return DEFAULT_WEEKLY_TARGET;
  }

  const average = counts.reduce((sum, count) => sum + count, 0) / counts.length;
  return Math.min(7, Math.max(1, Math.round(average)));
}

/**
 * The sessions your Plan has for this week — the goal you set yourself, which
 * beats any habit read from history. Undefined when the week has none planned.
 */
export function plannedThisWeek(scheduled: ScheduledSession[], today: string) {
  const start = weekStartKey(today);
  const end = shiftKey(start, 6);
  const days = new Set(
    scheduled
      .filter((item) => item.type === "workout" && item.date >= start && item.date <= end)
      .map((item) => item.date)
  );
  return days.size > 0 ? days.size : undefined;
}

/**
 * Consistency: sessions this week against your weekly target, plus the streak
 * of weeks with at least one session.
 *
 * Always about the current week on the whole history — "did I show up this
 * week" does not change meaning when the range chip does.
 */
export function consistencyRing(logs: WorkoutLog[], today: string, weeklyTarget?: number): Ring {
  const target = Math.max(1, weeklyTarget ?? usualWeeklySessions(logs, today));

  if (logs.length === 0) {
    return {
      fill: 0,
      value: `0/${target}`,
      sentence: "Log your first session, and this ring starts to fill.",
      tone: "steady",
      ready: false
    };
  }

  const days = sessionDays(logs);
  const done = sessionsInWeek(days, weekStartKey(today));
  const first = [...days].sort()[0];
  const streak = buildStreaks(logs, { start: first, end: today }).currentWeeks;
  const left = target - done;

  let sentence: string;
  if (done >= target) {
    sentence =
      streak >= 2
        ? `Weekly goal done. ${streak} weeks in a row with training.`
        : "Weekly goal done. Great week.";
  } else if (done === 0 && streak >= 1) {
    sentence = `No session yet this week. One session keeps your ${streak}-week streak.`;
  } else {
    sentence = `${left} more ${left === 1 ? "session" : "sessions"} this week to reach your goal of ${target}.`;
    if (done > 0 && streak >= 2) {
      sentence += ` Your streak: ${streak} weeks in a row.`;
    }
  }

  return {
    fill: Math.min(1, done / target),
    value: `${done}/${target}`,
    sentence,
    tone: done >= target ? "good" : done === 0 && streak === 0 ? "low" : "steady",
    ready: true
  };
}

// -- muscles ----------------------------------------------------------------

const ALL_GROUPS = 6;

/**
 * Muscles: how many of the six groups get the 10–20 hard sets a week that
 * muscle-growth research points to.
 *
 * Built from training alone, so it works from the first session — the ring
 * this replaced needed a goal weight and a weigh-in before it said anything,
 * which hid the whole story of what the training does to each muscle.
 */
export function musclesRing(weeklySets: GroupSets[]): Ring {
  const trained = weeklySets.filter((group) => group.setsPerWeek > 0);

  if (trained.length === 0) {
    return {
      fill: 0,
      value: `0/${ALL_GROUPS}`,
      sentence: "Log a session, and this ring shows which muscles get enough work.",
      tone: "steady",
      ready: false
    };
  }

  const { low, high } = WEEKLY_SET_TARGET;
  const onGoal = weeklySets.filter((group) => group.setsPerWeek >= low && group.setsPerWeek <= high);
  const under = [...weeklySets]
    .filter((group) => group.setsPerWeek < low)
    .sort((a, b) => a.setsPerWeek - b.setsPerWeek);
  const over = weeklySets.filter((group) => group.setsPerWeek > high);

  let sentence: string;
  if (onGoal.length === ALL_GROUPS) {
    sentence = `All ${ALL_GROUPS} muscle groups get ${low}–${high} sets a week. Well balanced.`;
  } else if (under.length > 0) {
    const worst = under[0];
    sentence =
      worst.setsPerWeek === 0
        ? `${onGoal.length} of ${ALL_GROUPS} muscle groups are on goal. ${worst.label} gets no sets at all.`
        : `${onGoal.length} of ${ALL_GROUPS} muscle groups are on goal. ${worst.label} needs more sets (${worst.setsPerWeek.toFixed(1)} a week).`;
  } else {
    sentence = `${onGoal.length} of ${ALL_GROUPS} muscle groups are on goal. ${over[0].label} gets more than ${high} sets a week.`;
  }

  return {
    fill: onGoal.length / ALL_GROUPS,
    value: `${onGoal.length}/${ALL_GROUPS}`,
    sentence,
    tone: onGoal.length >= 5 ? "good" : onGoal.length >= 3 ? "steady" : "low",
    ready: true
  };
}

// -- body -------------------------------------------------------------------

/** Within this of the goal, the goal is reached — a day of water moves more. */
const GOAL_REACHED_KG = 0.5;

function formatKg(value: number) {
  return `${value.toFixed(1)} kg`;
}

/**
 * Body: how much of the way from your first weigh-in to your goal weight you
 * have come.
 *
 * Reads the 7-day average, not the last reading — one salty dinner should not
 * empty the ring. Works for losing and for gaining, by the sign of the goal.
 */
export function bodyRing(measurements: BodyMeasurement[], goalWeightKg?: number): Ring {
  const points = withMovingAverage(seriesFor(measurements, "weight"));

  if (points.length === 0) {
    return {
      fill: 0,
      value: "—",
      sentence: "Add a weigh-in on Profile to start this ring.",
      tone: "steady",
      ready: false
    };
  }

  const current = points[points.length - 1].average ?? points[points.length - 1].value;

  if (!hasGoal(goalWeightKg)) {
    return {
      fill: 0,
      value: formatKg(current),
      sentence: "Set a goal weight on Profile, and this ring shows how close you are.",
      tone: "steady",
      ready: false
    };
  }

  const start = points[0].value;
  const toGo = Math.abs(goalWeightKg - current);

  if (toGo <= GOAL_REACHED_KG) {
    return {
      fill: 1,
      value: formatKg(current),
      sentence: `Goal reached. You are at ${formatKg(current)}.`,
      tone: "good",
      ready: true
    };
  }

  const total = Math.abs(goalWeightKg - start);
  const direction = Math.sign(goalWeightKg - start);
  // Positive is toward the goal, whichever way the goal lies.
  const moved = (current - start) * direction;

  if (total <= GOAL_REACHED_KG || moved < 0) {
    // Started at the goal and drifted off, or moving the wrong way.
    return {
      fill: 0,
      value: `${formatKg(toGo)}`,
      sentence: `You are ${formatKg(toGo)} from your goal of ${formatKg(goalWeightKg)}.`,
      tone: "low",
      ready: true
    };
  }

  return {
    fill: Math.min(1, moved / total),
    value: `${formatKg(moved)}`,
    sentence: `${formatKg(moved)} of ${formatKg(total)} done. ${formatKg(toGo)} to go.`,
    tone: moved > GOAL_REACHED_KG ? "good" : "steady",
    ready: true
  };
}

// -- wins -------------------------------------------------------------------

export type WinKind = "record" | "strength" | "body" | "streak";

export interface Win {
  kind: WinKind;
  /** The short line, e.g. "Leg Press: 100 → 157.5 kg". */
  title: string;
  /** The supporting line, e.g. "+57% since your first session". */
  detail: string;
}

export const MAX_WINS = 4;

/**
 * The good news, most recent and most personal first: a new record, the lifts
 * that grew most, the bodyweight change, the streak.
 *
 * Only wins. A list that also carries bad news is a report, and the report
 * already lives in the cards below.
 */
export function buildWins({
  logs,
  window,
  measurements,
  goalWeightKg,
  today
}: {
  logs: WorkoutLog[];
  window: DateWindow;
  measurements: BodyMeasurement[];
  goalWeightKg?: number;
  today: string;
}): Win[] {
  const wins: Win[] = [];
  const scoped = filterByWindow(logs, window);

  // Records come off the whole history, then keep the ones inside the window:
  // a record counted on the window alone is only "heaviest since the range began".
  const records = buildPRLedger(logs).filter(
    (entry) => entry.date >= window.start && entry.date <= window.end
  );
  if (records.length > 0) {
    const latest = records[0];
    const ago = daysBetween(latest.date, today);
    wins.push({
      kind: "record",
      title: `New record: ${latest.name} ${latest.to} kg`,
      detail:
        records.length > 1
          ? `${records.length} records in this range · latest ${agoCopy(ago)}`
          : `Up from ${latest.from} kg · ${agoCopy(ago)}`
    });
  }

  const recordLift = records[0]?.workoutId;
  buildStrengthGrowth(scoped)
    .filter((lift) => lift.changePercent >= STEADY_PERCENT && lift.workoutId !== recordLift)
    .slice(0, 2)
    .forEach((lift) => {
      wins.push({
        kind: "strength",
        title: `${lift.name}: ${lift.first} → ${lift.last} kg`,
        detail: `+${Math.round(lift.changePercent)}% in this range`
      });
    });

  // The ring already says how far along you are; the win says what changed.
  const body = bodyRing(measurements, goalWeightKg);
  if (body.ready && body.tone === "good" && hasGoal(goalWeightKg)) {
    const points = withMovingAverage(seriesFor(measurements, "weight"));
    const start = points[0].value;
    const current = points[points.length - 1].average ?? points[points.length - 1].value;
    const toGo = Math.abs(goalWeightKg - current);
    wins.push({
      kind: "body",
      title: `Bodyweight: ${start.toFixed(1)} → ${current.toFixed(1)} kg`,
      detail:
        toGo <= GOAL_REACHED_KG
          ? "Goal reached"
          : `${formatKg(toGo)} to your goal of ${formatKg(goalWeightKg)}`
    });
  }

  if (logs.length > 0) {
    const first = [...logs].map((log) => log.date).sort()[0];
    const streak = buildStreaks(logs, { start: first, end: today }).currentWeeks;
    if (streak >= 2) {
      wins.push({
        kind: "streak",
        title: `${streak} weeks in a row`,
        detail: "At least one session every week"
      });
    }
  }

  return wins.slice(0, MAX_WINS);
}

function agoCopy(days: number) {
  if (days <= 0) {
    return "today";
  }
  if (days === 1) {
    return "yesterday";
  }
  return `${days} days ago`;
}

// -- weight and reps --------------------------------------------------------

export interface WeightRepsPoint {
  date: string;
  /** The heaviest set of the session. */
  weight: number;
  /** Reps in that set. */
  reps: number;
}

/**
 * One lift's best set per session, as weight and reps together — the graph a
 * lifter reads as "60 × 8, then 60 × 10, then 65 × 8".
 *
 * The best set is the heaviest; on a tie in weight, the one with more reps.
 * Time and distance sets carry no reps and are left out, as are empty sets.
 */
export function buildWeightRepsSeries(setLogs: SetLog[], workoutId: string): WeightRepsPoint[] {
  const best = new Map<string, WeightRepsPoint>();

  setLogs
    .filter(
      (row) =>
        row.workoutId === workoutId &&
        row.reps > 0 &&
        row.weight > 0 &&
        row.durationSeconds === undefined &&
        row.distanceKm === undefined
    )
    .forEach((row) => {
      const current = best.get(row.date);
      if (
        !current ||
        row.weight > current.weight ||
        (row.weight === current.weight && row.reps > current.reps)
      ) {
        best.set(row.date, { date: row.date, weight: row.weight, reps: row.reps });
      }
    });

  return [...best.values()].sort((a, b) => a.date.localeCompare(b.date));
}

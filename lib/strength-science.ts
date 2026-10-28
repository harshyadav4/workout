import { bestEstimate, oneRepMaxSeries, type OneRepMaxEstimate } from "@/lib/one-rep-max";
import { GROUP_LABELS, GROUP_ORDER, daysBetween, filterByWindow, shiftKey, type DateWindow } from "@/lib/progress-metrics";
import { leastSquares, predict } from "@/lib/regression";
import type { MuscleGroup, Sex, SetLog, WorkoutLog } from "@/lib/types";

/**
 * Strength, measured the way the strength literature measures it: relative to
 * bodyweight (allometrically), against published standards, as a DOTS score,
 * and as a trend with a slope rather than a pair of before/after bars.
 *
 * Everything here reads `set_logs` through `lib/one-rep-max`, which already
 * refuses sets over 12 reps and treats a single as the measurement. A
 * bodyweight lift logs its *added* load (lib/workout-helpers `setVolume`), so a
 * pull-up at 0 kg estimates to 0 and drops out of every card below — standards
 * and DOTS are barbell numbers and a bodyweight pull-up is not one.
 */

// -- which lift is which ----------------------------------------------------

export type BigLift = "squat" | "bench" | "deadlift" | "press";

export const BIG_LIFT_LABELS: Record<BigLift, string> = {
  squat: "Squat",
  bench: "Bench press",
  deadlift: "Deadlift",
  press: "Overhead press"
};

/**
 * The standards are for the barbell versions: a goblet squat and a Romanian
 * deadlift are real lifts with no table of their own, so they are not matched.
 */
const LIFT_PATTERNS: { lift: BigLift; match: RegExp; exclude: RegExp }[] = [
  { lift: "squat", match: /\bsquat\b/i, exclude: /goblet|split|bulgarian|pistol|hack|sissy|jump|box|belt|zercher|overhead|single/i },
  { lift: "bench", match: /\bbench\b/i, exclude: /incline|decline|dumbbell|\bdb\b|close|floor|machine|smith|single/i },
  { lift: "deadlift", match: /\bdeadlift\b/i, exclude: /romanian|\brdl\b|stiff|straight|single|trap|hex|deficit|rack|snatch/i },
  { lift: "press", match: /overhead press|shoulder press|military press|\bohp\b|strict press/i, exclude: /dumbbell|\bdb\b|machine|smith|single|arnold|landmine/i }
];

export function classifyLift(name: string): BigLift | undefined {
  return LIFT_PATTERNS.find((pattern) => pattern.match.test(name) && !pattern.exclude.test(name))?.lift;
}

/** Latest name logged under each lift id — `SetLog` carries no name of its own. */
function namesOf(logs: WorkoutLog[]): Map<string, string> {
  const names = new Map<string, string>();
  [...logs].sort((a, b) => a.date.localeCompare(b.date)).forEach((log) => names.set(log.workoutId, log.name));
  return names;
}

// -- allometric relative strength -------------------------------------------------

/**
 * Jaric (2002): strength scales with bodyweight to the power ⅔, not linearly —
 * a cross-section grows with the square of a length and mass with the cube.
 * Dividing by plain bodyweight flatters light lifters; this does not.
 */
export const ALLOMETRIC_EXPONENT = 2 / 3;

export function allometric(e1rmKg: number, bodyweightKg: number): number {
  return bodyweightKg > 0 ? e1rmKg / bodyweightKg ** ALLOMETRIC_EXPONENT : 0;
}

export interface AllometricRow {
  workoutId: string;
  name: string;
  lift?: BigLift;
  estimate: OneRepMaxEstimate;
  /** e1RM ÷ bodyweight^⅔. */
  score: number;
  /** Plain e1RM ÷ bodyweight, for the reader who knows that one. */
  ratio: number;
}

const ALLOMETRIC_ROWS = 8;

/** Best-ever estimate per lift, big lifts first, then whatever else scores highest. */
export function buildAllometric(setLogs: SetLog[], logs: WorkoutLog[], bodyweightKg: number): AllometricRow[] {
  if (bodyweightKg <= 0) {
    return [];
  }
  const names = namesOf(logs);
  const ids = [...new Set(setLogs.map((row) => row.workoutId))];
  const rows = ids.flatMap((workoutId) => {
    const estimate = bestEstimate(setLogs, workoutId);
    if (!estimate) {
      return [];
    }
    const name = names.get(workoutId) ?? workoutId;
    return [
      {
        workoutId,
        name,
        lift: classifyLift(name),
        estimate,
        score: allometric(estimate.value, bodyweightKg),
        ratio: estimate.value / bodyweightKg
      }
    ];
  });
  const big = rows.filter((row) => row.lift).sort((a, b) => b.score - a.score);
  const rest = rows.filter((row) => !row.lift).sort((a, b) => b.score - a.score);
  return [...big, ...rest].slice(0, ALLOMETRIC_ROWS);
}

// -- strength standards ----------------------------------------------------------------

export type Level = "beginner" | "novice" | "intermediate" | "advanced" | "elite";
export const LEVELS: Level[] = ["beginner", "novice", "intermediate", "advanced", "elite"];

/**
 * One-rep max as a multiple of bodyweight at which each level starts, for a
 * lifter of average size. The usual community tables (strengthlevel and the
 * like) agree to within a tenth; this is the knob if they drift. Beginner is
 * everything below the first number.
 */
export const STRENGTH_STANDARDS: Record<"male" | "female", Record<BigLift, [number, number, number, number]>> = {
  male: {
    squat: [1.25, 1.5, 2.0, 2.5],
    bench: [0.75, 1.0, 1.5, 2.0],
    deadlift: [1.5, 2.0, 2.5, 3.0],
    press: [0.55, 0.8, 1.05, 1.35]
  },
  female: {
    squat: [0.75, 1.0, 1.5, 2.0],
    bench: [0.5, 0.75, 1.0, 1.25],
    deadlift: [1.0, 1.25, 1.75, 2.25],
    press: [0.35, 0.5, 0.75, 1.0]
  }
};

export interface Standard {
  level: Level;
  /** e1RM ÷ bodyweight. */
  ratio: number;
  /** The next level and the max that reaches it; absent at elite. */
  next?: { level: Level; kg: number };
}

export function standardLevel(e1rmKg: number, bodyweightKg: number, sex: "male" | "female", lift: BigLift): Standard {
  const thresholds = STRENGTH_STANDARDS[sex][lift];
  const ratio = e1rmKg / bodyweightKg;
  const reached = thresholds.filter((threshold) => ratio >= threshold).length;
  const level = LEVELS[reached];
  const next = reached < thresholds.length ? { level: LEVELS[reached + 1], kg: Math.ceil((thresholds[reached] * bodyweightKg) / 2.5) * 2.5 } : undefined;
  return { level, ratio, next };
}

export interface StandardRow extends Standard {
  lift: BigLift;
  workoutId: string;
  name: string;
  estimate: OneRepMaxEstimate;
}

/** The best estimate under each big lift, judged against the tables. Empty without a sex the tables cover. */
export function buildStandards(setLogs: SetLog[], logs: WorkoutLog[], bodyweightKg: number, sex: Sex | undefined): StandardRow[] {
  if (bodyweightKg <= 0 || (sex !== "male" && sex !== "female")) {
    return [];
  }
  const names = namesOf(logs);
  const best = new Map<BigLift, { workoutId: string; name: string; estimate: OneRepMaxEstimate }>();
  [...new Set(setLogs.map((row) => row.workoutId))].forEach((workoutId) => {
    const name = names.get(workoutId) ?? workoutId;
    const lift = classifyLift(name);
    const estimate = lift ? bestEstimate(setLogs, workoutId) : undefined;
    if (lift && estimate && estimate.value > (best.get(lift)?.estimate.value ?? 0)) {
      best.set(lift, { workoutId, name, estimate });
    }
  });
  return (Object.keys(BIG_LIFT_LABELS) as BigLift[]).flatMap((lift) => {
    const row = best.get(lift);
    return row ? [{ lift, ...row, ...standardLevel(row.estimate.value, bodyweightKg, sex, lift) }] : [];
  });
}

// -- DOTS ------------------------------------------------------------------------------------

/** IPF DOTS (2019) polynomial coefficients. */
const DOTS_COEFFICIENTS: Record<"male" | "female", [number, number, number, number, number]> = {
  male: [-307.75076, 24.0900756, -0.1918759221, 0.0007391293, -0.000001093],
  female: [-57.96288, 13.6175032, -0.1126655495, 0.0005158568, -0.0000010706]
};

/** Where the score is usually read as landing. 500+ is world class. */
export const DOTS_MARKS: { score: number; label: string }[] = [
  { score: 300, label: "intermediate" },
  { score: 400, label: "advanced" },
  { score: 500, label: "elite" }
];

/**
 * The squat + bench + deadlift total, scaled so lifters of different bodyweight
 * compare. The formula powerlifting federations replaced Wilks with.
 */
export function dots(totalKg: number, bodyweightKg: number, sex: "male" | "female"): number {
  const [a, b, c, d, e] = DOTS_COEFFICIENTS[sex];
  const bw = Math.min(Math.max(bodyweightKg, 40), 200);
  const denominator = a + b * bw + c * bw ** 2 + d * bw ** 3 + e * bw ** 4;
  return (totalKg * 500) / denominator;
}

export interface Dots {
  squat: number;
  bench: number;
  deadlift: number;
  total: number;
  score: number;
}

/** Undefined until all three lifts have an estimate: a two-lift DOTS is not a DOTS. */
export function buildDots(setLogs: SetLog[], logs: WorkoutLog[], bodyweightKg: number, sex: Sex | undefined): Dots | undefined {
  if (sex !== "male" && sex !== "female") {
    return undefined;
  }
  const rows = buildStandards(setLogs, logs, bodyweightKg, sex);
  const of = (lift: BigLift) => rows.find((row) => row.lift === lift)?.estimate.value;
  const squat = of("squat");
  const bench = of("bench");
  const deadlift = of("deadlift");
  if (!squat || !bench || !deadlift) {
    return undefined;
  }
  const total = squat + bench + deadlift;
  return { squat, bench, deadlift, total, score: dots(total, bodyweightKg, sex) };
}

// -- e1RM trend, plateau, projection -----------------------------------------------------

/**
 * Under this share of the lift's best per week, over the span below, the line
 * is flat for any practical purpose. A share, not kilograms: 0.25 kg a week is
 * a stall on a 150 kg squat and a sprint on a 15 kg curl.
 */
export const PLATEAU_PERCENT_PER_WEEK = 0.2;
export const PLATEAU_MIN_WEEKS = 6;
export const TREND_MIN_POINTS = 4;
/** Past this a projection is a wish. */
const MAX_PROJECTION_DAYS = 365;

export interface E1rmTrend {
  workoutId: string;
  points: { date: string; value: number }[];
  slopePerWeek: number;
  spanWeeks: number;
  /** The best point in the span. */
  best: number;
  /** The line's value today, which is what a projection starts from. */
  fitted: number;
  plateau: boolean;
}

/**
 * A least-squares line through the per-session estimates inside the window.
 * Four sessions is the floor; a plateau needs six weeks of them, so one slow
 * month is never called a stall.
 */
export function buildE1rmTrend(setLogs: SetLog[], workoutId: string, window: DateWindow, today: string): E1rmTrend | undefined {
  const points = filterByWindow(oneRepMaxSeries(setLogs, workoutId), window);
  if (points.length < TREND_MIN_POINTS) {
    return undefined;
  }
  const first = points[0].date;
  const fit = leastSquares(
    points.map((point) => daysBetween(first, point.date)),
    points.map((point) => point.value)
  );
  if (!fit) {
    return undefined;
  }
  const spanWeeks = daysBetween(first, points[points.length - 1].date) / 7;
  const slopePerWeek = fit.slope * 7;
  const best = Math.max(...points.map((point) => point.value));
  return {
    workoutId,
    points,
    slopePerWeek,
    spanWeeks,
    best,
    fitted: predict(fit, daysBetween(first, today)),
    plateau: spanWeeks >= PLATEAU_MIN_WEEKS && Math.abs(slopePerWeek) < (PLATEAU_PERCENT_PER_WEEK / 100) * best
  };
}

/** The day the line reaches `targetKg`, or undefined when it is not heading there within a year. */
export function projectDate(trend: E1rmTrend, targetKg: number, today: string): string | undefined {
  if (trend.slopePerWeek <= 0 || targetKg <= trend.fitted) {
    return undefined;
  }
  const days = ((targetKg - trend.fitted) / trend.slopePerWeek) * 7;
  return days <= MAX_PROJECTION_DAYS ? shiftKey(today, Math.ceil(days)) : undefined;
}

// -- intensity distribution ---------------------------------------------------------------

export interface IntensityBucket {
  id: string;
  label: string;
  /** Lower bound, % of e1RM, inclusive. */
  low: number;
  sets: number;
  share: number;
}

/** Zourdos / Helms style zones: under 60 is warm-up territory, 90+ is near-max work. */
export const INTENSITY_BUCKETS: { id: string; label: string; low: number }[] = [
  { id: "under60", label: "<60 %", low: 0 },
  { id: "60s", label: "60–70 %", low: 60 },
  { id: "70s", label: "70–80 %", low: 70 },
  { id: "80s", label: "80–90 %", low: 80 },
  { id: "90plus", label: "90 %+", low: 90 }
];

export interface IntensityReport {
  buckets: IntensityBucket[];
  /** Sets with weight and an estimate to compare against. */
  rated: number;
  /** Sets left out: bodyweight, or a lift with no eligible estimate. */
  unrated: number;
}

/**
 * Every working set in the window as a share of that lift's best-ever
 * estimate — best ever, not best in the window, so a light month reads light.
 */
export function buildIntensityDistribution(setLogs: SetLog[], window: DateWindow): IntensityReport {
  const bestOf = new Map<string, number>();
  const counts = INTENSITY_BUCKETS.map(() => 0);
  let rated = 0;
  let unrated = 0;
  filterByWindow(setLogs, window)
    .filter((row) => row.reps > 0)
    .forEach((row) => {
      if (!bestOf.has(row.workoutId)) {
        bestOf.set(row.workoutId, bestEstimate(setLogs, row.workoutId)?.value ?? 0);
      }
      const best = bestOf.get(row.workoutId) ?? 0;
      if (row.weight <= 0 || best <= 0) {
        unrated += 1;
        return;
      }
      const percent = (row.weight / best) * 100;
      const index = INTENSITY_BUCKETS.filter((bucket) => percent >= bucket.low).length - 1;
      counts[Math.max(0, index)] += 1;
      rated += 1;
    });
  return {
    buckets: INTENSITY_BUCKETS.map((bucket, index) => ({
      ...bucket,
      sets: counts[index],
      share: rated > 0 ? counts[index] / rated : 0
    })),
    rated,
    unrated
  };
}

// -- rep-range zones ------------------------------------------------------------------------

export const REP_ZONES = { lowMax: 5, midMax: 12 };

export interface RepZoneRow {
  group: MuscleGroup;
  label: string;
  /** 1–5: strength. */
  low: number;
  /** 6–12: the hypertrophy range. */
  mid: number;
  /** 13+: endurance. */
  high: number;
  total: number;
}

/** Working sets per group by rep range, in the group order every other card uses. */
export function buildRepZones(setLogs: SetLog[], window: DateWindow, groupOf: Map<string, MuscleGroup>): RepZoneRow[] {
  const rows = new Map<MuscleGroup, RepZoneRow>();
  filterByWindow(setLogs, window)
    .filter((row) => row.reps > 0)
    .forEach((row) => {
      const group = groupOf.get(row.workoutId);
      if (!group) {
        return;
      }
      const zone = rows.get(group) ?? { group, label: GROUP_LABELS[group], low: 0, mid: 0, high: 0, total: 0 };
      if (row.reps <= REP_ZONES.lowMax) zone.low += 1;
      else if (row.reps <= REP_ZONES.midMax) zone.mid += 1;
      else zone.high += 1;
      zone.total += 1;
      rows.set(group, zone);
    });
  return GROUP_ORDER.flatMap((group) => {
    const row = rows.get(group);
    return row ? [row] : [];
  });
}

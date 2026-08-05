import { muscles } from "@/lib/seed-data";
import {
  daysBetween,
  resolvedTargets,
  shiftKey,
  weekStartKey,
  windowDays,
  type DateWindow
} from "@/lib/progress-metrics";
import type { MuscleGroup, MuscleId, WorkoutLog } from "@/lib/types";

/**
 * The year-scale half of /progress.
 *
 * Split from `progress-metrics.ts` along the line that actually matters on this
 * page: **everything in there is scoped to the selected window; everything in
 * here is not.** A ratio against a 28-day baseline, an all-time personal best, a
 * running total from the first log — none of them are definable over a slice,
 * and computing them on filtered logs produces numbers that are wrong rather
 * than merely narrow. Keeping them in a different file means the mistake has to
 * be made deliberately.
 *
 * The window still arrives, but its only job is to say which points fall inside
 * it so a card can shade that region. It never filters.
 *
 * Date handling follows the same rule as the rest of the page: keys are plain
 * `YYYY-MM-DD`, every parse goes through `${key}T00:00:00Z`, every weekday read
 * is `getUTCDay()`.
 */

/** ponytail: ~10 years of weekly points. Any loop over dates needs a ceiling. */
const MAX_POINTS = 520;

function parseKey(key: string) {
  return new Date(`${key}T00:00:00Z`);
}

/** The first of the month a day falls in — the matrix and the drift chart's columns. */
export function monthStartKey(key: string) {
  return `${key.slice(0, 7)}-01`;
}

function sortedDates(logs: WorkoutLog[]) {
  return [...new Set(logs.map((log) => log.date))].sort();
}

/** Tonnage per day, the base every builder here rolls up from. */
function dailyVolume(logs: WorkoutLog[]) {
  const totals = new Map<string, number>();
  logs.forEach((log) => totals.set(log.date, (totals.get(log.date) ?? 0) + log.totalVolume));
  return totals;
}

function inWindow(key: string, window: DateWindow) {
  return key >= window.start && key <= window.end;
}

// -- 1. acute vs chronic load ----------------------------------------------

/** Weeks of history a chronic baseline is averaged over. */
export const CHRONIC_WEEKS = 4;

/**
 * The band a week's load sits in relative to your own recent baseline.
 *
 * Deliberately *not* labelled as injury risk anywhere in the UI: the 0.8–1.3
 * figure comes from team-sport monitoring, the literature on it is contested,
 * and a lifting log is not the population it was derived from. It is a spike
 * detector against your own four-week average, and that is all it claims.
 */
export const LOAD_BAND = { low: 0.8, high: 1.3 };

export interface LoadPoint {
  /** Monday of the week this point measures. */
  key: string;
  /** This week's tonnage. */
  acute: number;
  /** Mean weekly tonnage over the four weeks ending with this one. */
  chronic: number;
  /** `acute / chronic`, or undefined before the baseline exists. */
  ratio?: number;
  /** False until four weeks of history sit behind the point. */
  warm: boolean;
  inWindow: boolean;
}

/**
 * Weekly, not daily. Rolling a daily ratio over a log with five sessions a week
 * produces a sawtooth that tracks which weekday you are standing on rather than
 * how hard the week was — the reading a lifter wants is "was this week heavy for
 * me", and the week is the unit that answers it.
 */
export function buildRollingLoad(logs: WorkoutLog[], window: DateWindow): LoadPoint[] {
  const dates = sortedDates(logs);

  if (dates.length === 0) {
    return [];
  }

  const daily = dailyVolume(logs);
  const weekTotal = (start: string) =>
    Array.from({ length: 7 }, (_, offset) => daily.get(shiftKey(start, offset)) ?? 0).reduce(
      (sum, value) => sum + value,
      0
    );

  const first = weekStartKey(dates[0]);
  const last = weekStartKey(dates[dates.length - 1]);
  const points: LoadPoint[] = [];

  for (let cursor = first; cursor <= last && points.length < MAX_POINTS; cursor = shiftKey(cursor, 7)) {
    const acute = weekTotal(cursor);
    const baselineStart = shiftKey(cursor, -7 * (CHRONIC_WEEKS - 1));
    const warm = baselineStart >= first;
    const chronic =
      Array.from({ length: CHRONIC_WEEKS }, (_, index) =>
        weekTotal(shiftKey(baselineStart, index * 7))
      ).reduce((sum, value) => sum + value, 0) / CHRONIC_WEEKS;

    points.push({
      key: cursor,
      acute,
      chronic,
      // A hollow first month is honest; a ratio of 1.0 because the baseline is
      // the same week as the numerator is not.
      ratio: warm && chronic > 0 ? acute / chronic : undefined,
      warm,
      inWindow: inWindow(cursor, window)
    });
  }

  return points;
}

// -- 2. the personal-best ledger -------------------------------------------

export interface PREntry {
  date: string;
  workoutId: string;
  name: string;
  /** The top set this beat. Never 0 — a first appearance is a baseline, not a PR. */
  from: number;
  to: number;
}

/**
 * Every day a lift beat its own heaviest set, newest first.
 *
 * All-time by construction, which is why this cannot take scoped logs: computed
 * on a window, "PR" quietly means "heaviest since the range started", and the
 * first time a user drags the date picker they catch it.
 *
 * A lift's first appearance is not a PR, matching `buildStrengthGrowth`'s rule
 * that one session is a starting point rather than a trend. Without that, every
 * new exercise in the library would announce itself as a record.
 */
export function buildPRLedger(logs: WorkoutLog[]): PREntry[] {
  const ordered = [...logs].sort((a, b) => a.date.localeCompare(b.date));
  const best = new Map<string, number>();
  const entries: PREntry[] = [];

  ordered.forEach((log) => {
    const weight = log.peakWeight ?? 0;

    if (weight <= 0) {
      return;
    }

    const previous = best.get(log.workoutId);

    if (previous === undefined) {
      best.set(log.workoutId, weight);
      return;
    }

    if (weight > previous) {
      entries.push({
        date: log.date,
        workoutId: log.workoutId,
        name: log.name,
        from: previous,
        to: weight
      });
      best.set(log.workoutId, weight);
    }
  });

  return entries.reverse();
}

/**
 * Days since the last PR on any lift — the plateau reading, and the reason the
 * ledger earns its place over a plain list of bests.
 */
export function daysSincePR(entries: PREntry[], today: string) {
  return entries.length > 0 ? daysBetween(entries[0].date, today) : undefined;
}

// -- 3. muscle × time matrix -----------------------------------------------

export type MatrixBucket = "month" | "week";

/** Below this the columns are weeks; a month grain needs months to show. */
const MONTH_GRAIN_DAYS = 120;

/** Under this many columns the matrix is the focus order with extra steps. */
export const MATRIX_MIN_COLUMNS = 6;

export function matrixBucketFor(window: DateWindow): MatrixBucket {
  return windowDays(window) > MONTH_GRAIN_DAYS ? "month" : "week";
}

export interface MatrixCell {
  key: string;
  volume: number;
  /** Percent of that column's total volume that reached this muscle. */
  share: number;
  /** 0 = untouched, 1–4 the ordinal heat steps. */
  level: number;
}

export interface MatrixRow {
  muscleId: MuscleId;
  name: string;
  total: number;
  cells: MatrixCell[];
}

export interface MuscleMatrix {
  bucket: MatrixBucket;
  columns: string[];
  rows: MatrixRow[];
}

function quantile(sorted: number[], fraction: number) {
  if (sorted.length === 0) {
    return 0;
  }

  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

/**
 * Thirty muscles down, time across — the view a year of logs unlocks and twelve
 * weeks cannot, because the finding is *drift*: a row that ran hot until March
 * and has been empty since. No other card on the page can say that.
 *
 * Cells are shaded by **share of that column**, not by raw volume, so a light
 * month and a heavy month are read on the same scale and the row's colour means
 * "how much of my training went here" in both. Levels come off the quartiles of
 * the non-zero cells, the same convention `buildCalendar` uses — off the maximum
 * instead, one heavy month would flatten the whole grid to its palest step.
 *
 * Untouched rows are kept, never filtered out. An empty row is the finding.
 */
export function buildMuscleMatrix(logs: WorkoutLog[], window: DateWindow): MuscleMatrix {
  const bucket = matrixBucketFor(window);
  const keyFor = (date: string) => (bucket === "month" ? monthStartKey(date) : weekStartKey(date));
  const step = (key: string) =>
    bucket === "month" ? monthStartKey(shiftKey(key, 32)) : shiftKey(key, 7);

  const columns: string[] = [];
  for (
    let cursor = keyFor(window.start);
    cursor <= window.end && columns.length < MAX_POINTS;
    cursor = step(cursor)
  ) {
    columns.push(cursor);
  }

  // muscleId -> column -> volume, plus a per-column total to take shares against.
  const grid = new Map<MuscleId, Map<string, number>>();
  const columnTotals = new Map<string, number>();

  logs.forEach((log) => {
    const column = keyFor(log.date);
    const targets = resolvedTargets(log);
    const engaged = targets.reduce((sum, target) => sum + target.engagement, 0);

    if (engaged <= 0) {
      return;
    }

    targets.forEach((target) => {
      const share = (log.totalVolume * target.engagement) / engaged;
      const row = grid.get(target.muscleId) ?? new Map<string, number>();
      row.set(column, (row.get(column) ?? 0) + share);
      grid.set(target.muscleId, row);
      columnTotals.set(column, (columnTotals.get(column) ?? 0) + share);
    });
  });

  const shares: number[] = [];
  muscles.forEach((muscle) => {
    columns.forEach((column) => {
      const volume = grid.get(muscle.id)?.get(column) ?? 0;
      const total = columnTotals.get(column) ?? 0;
      if (volume > 0 && total > 0) {
        shares.push((volume / total) * 100);
      }
    });
  });

  shares.sort((a, b) => a - b);
  const thresholds = [quantile(shares, 0.25), quantile(shares, 0.5), quantile(shares, 0.75)];
  const levelFor = (share: number) =>
    share <= 0 ? 0 : thresholds.filter((threshold) => share > threshold).length + 1;

  const rows = muscles
    .map((muscle) => {
      const cells = columns.map((column) => {
        const volume = grid.get(muscle.id)?.get(column) ?? 0;
        const total = columnTotals.get(column) ?? 0;
        const share = total > 0 ? (volume / total) * 100 : 0;

        return { key: column, volume: Math.round(volume), share, level: levelFor(share) };
      });

      return {
        muscleId: muscle.id,
        name: muscle.name,
        total: cells.reduce((sum, cell) => sum + cell.volume, 0),
        cells
      };
    })
    .sort((a, b) => b.total - a.total);

  return { bucket, columns, rows };
}

// -- 4. cumulative tonnage -------------------------------------------------

export interface CumulativePoint {
  key: string;
  total: number;
  inWindow: boolean;
}

export interface Milestone {
  value: number;
  label: string;
  date: string;
}

/** The numbers worth stopping at. Anything finer would annotate every week. */
const MILESTONES = [
  { value: 100_000, label: "100k" },
  { value: 250_000, label: "250k" },
  { value: 500_000, label: "500k" },
  { value: 1_000_000, label: "1M" },
  { value: 2_500_000, label: "2.5M" },
  { value: 5_000_000, label: "5M" }
];

/**
 * Kilos moved since the first log, week by week.
 *
 * The one figure on this page with any weight to it — "you have moved 1.2
 * million kilograms" is a sentence, where "42,300 kg this month" is a
 * measurement. Running totals only go up, so the shape is never the point; the
 * milestones and the current total are.
 *
 * No prior-year ghost: there is one year of logs, so a comparison line would be
 * invented rather than measured.
 */
export function buildCumulativeVolume(logs: WorkoutLog[], window: DateWindow) {
  const dates = sortedDates(logs);

  if (dates.length === 0) {
    return { points: [] as CumulativePoint[], milestones: [] as Milestone[], total: 0 };
  }

  const daily = dailyVolume(logs);
  const first = weekStartKey(dates[0]);
  const last = weekStartKey(dates[dates.length - 1]);

  const points: CumulativePoint[] = [];
  const milestones: Milestone[] = [];
  let running = 0;
  let reached = 0;

  for (let cursor = first; cursor <= last && points.length < MAX_POINTS; cursor = shiftKey(cursor, 7)) {
    for (let offset = 0; offset < 7; offset += 1) {
      const date = shiftKey(cursor, offset);
      running += daily.get(date) ?? 0;

      while (reached < MILESTONES.length && running >= MILESTONES[reached].value) {
        milestones.push({ ...MILESTONES[reached], date });
        reached += 1;
      }
    }

    points.push({ key: cursor, total: Math.round(running), inWindow: inWindow(cursor, window) });
  }

  return { points, milestones, total: Math.round(running) };
}

// -- 5. how the split drifted ----------------------------------------------

const GROUP_ORDER: MuscleGroup[] = ["chest", "back", "shoulders", "arms", "core", "legs"];

const GROUP_LABELS: Record<MuscleGroup, string> = {
  chest: "Chest",
  back: "Back",
  shoulders: "Shoulders",
  arms: "Arms",
  core: "Core",
  legs: "Legs"
};

const GROUP_BY_MUSCLE = new Map(muscles.map((muscle) => [muscle.id, muscle.group]));

export type DriftRow = { key: string } & Record<MuscleGroup, number>;

export interface SplitDrift {
  bucket: MatrixBucket;
  rows: DriftRow[];
  groups: { group: MuscleGroup; label: string }[];
}

/**
 * Share of volume per group, per month — how the split *got* to where it is.
 *
 * `MuscleSplitCard` answers "what is my split now". This answers "what was it
 * doing all year", which is a different question and the one that catches a
 * programme quietly becoming bench-and-curls. Shares, not raw volume: stacked
 * raw tonnage makes a heavy month look like a change of emphasis when the mix
 * never moved.
 */
export function buildSplitDrift(logs: WorkoutLog[], window: DateWindow): SplitDrift {
  const bucket = matrixBucketFor(window);
  const keyFor = (date: string) => (bucket === "month" ? monthStartKey(date) : weekStartKey(date));
  const step = (key: string) =>
    bucket === "month" ? monthStartKey(shiftKey(key, 32)) : shiftKey(key, 7);

  const totals = new Map<string, Map<MuscleGroup, number>>();

  logs.forEach((log) => {
    const column = keyFor(log.date);
    const targets = resolvedTargets(log);
    const engaged = targets.reduce((sum, target) => sum + target.engagement, 0);

    if (engaged <= 0) {
      return;
    }

    const row = totals.get(column) ?? new Map<MuscleGroup, number>();

    targets.forEach((target) => {
      const group = GROUP_BY_MUSCLE.get(target.muscleId);
      if (!group) {
        return;
      }

      row.set(group, (row.get(group) ?? 0) + (log.totalVolume * target.engagement) / engaged);
    });

    totals.set(column, row);
  });

  const rows: DriftRow[] = [];

  for (
    let cursor = keyFor(window.start);
    cursor <= window.end && rows.length < MAX_POINTS;
    cursor = step(cursor)
  ) {
    const entry = totals.get(cursor);
    const sum = GROUP_ORDER.reduce((total, group) => total + (entry?.get(group) ?? 0), 0);

    rows.push(
      GROUP_ORDER.reduce(
        (row, group) => ({
          ...row,
          // A month you did not train stays on the axis at zero rather than
          // being dropped — a gap in a stack is data, same as in the trend.
          [group]: sum > 0 ? ((entry?.get(group) ?? 0) / sum) * 100 : 0
        }),
        { key: cursor } as DriftRow
      )
    );
  }

  return {
    bucket,
    rows,
    groups: GROUP_ORDER.map((group) => ({ group, label: GROUP_LABELS[group] }))
  };
}

// -- 6. monotony and strain ------------------------------------------------

export interface WeekLoad {
  key: string;
  load: number;
  /** Foster's monotony: mean daily load ÷ its standard deviation across the week. */
  monotony?: number;
  strain?: number;
  inWindow: boolean;
}

/**
 * Foster's monotony and strain, per week.
 *
 * Monotony is mean daily load over its standard deviation — a week where every
 * session looked the same scores high, a week with a heavy day and light days
 * scores low. Strain is the week's load multiplied by it: a lot of work, all of
 * it identical.
 *
 * Rest days count as zeros, which is the whole point of the measure: taking a
 * day off is what creates the variation.
 *
 * A week with a single session has no spread to speak of and returns undefined
 * rather than a division that happens to produce a number.
 *
 * ponytail: no card ships for this yet, deliberately. Measured against a year of
 * the seeded split, monotony lands between 0.96 and 1.20 for half the weeks and
 * never leaves 0.63–1.24 — a blob well below the ~1.5 where the measure starts
 * saying anything, because a fixed weekly split *is* monotonous by construction
 * and the only variation comes from skipped sessions. It earns a card on real
 * training that actually varies; draw it before then and it is a chart of noise
 * with a scientific-sounding label. The builder and its tests stay ready.
 */
export function buildWeeklyLoadStats(logs: WorkoutLog[], window: DateWindow): WeekLoad[] {
  const dates = sortedDates(logs);

  if (dates.length === 0) {
    return [];
  }

  const daily = dailyVolume(logs);
  const first = weekStartKey(dates[0]);
  const last = weekStartKey(dates[dates.length - 1]);
  const weeks: WeekLoad[] = [];

  for (let cursor = first; cursor <= last && weeks.length < MAX_POINTS; cursor = shiftKey(cursor, 7)) {
    const days = Array.from({ length: 7 }, (_, offset) => daily.get(shiftKey(cursor, offset)) ?? 0);
    const load = days.reduce((sum, value) => sum + value, 0);
    const mean = load / 7;
    const variance = days.reduce((sum, value) => sum + (value - mean) ** 2, 0) / 7;
    const deviation = Math.sqrt(variance);
    const monotony = deviation > 0 ? mean / deviation : undefined;

    weeks.push({
      key: cursor,
      load,
      monotony,
      strain: monotony === undefined ? undefined : load * monotony,
      inWindow: inWindow(cursor, window)
    });
  }

  return weeks;
}

// -- 7. streaks ------------------------------------------------------------

export interface Streaks {
  trainedDays: number;
  totalDays: number;
  /** Consecutive weeks, ending at the window's last week, with at least one session. */
  currentWeeks: number;
  longestWeeks: number;
}

/**
 * Weeks, not days. A day streak is the wrong unit for training — it rewards
 * never resting, which is bad advice dressed as a number. "Weeks in a row you
 * showed up at least once" is the habit actually worth keeping.
 */
export function buildStreaks(logs: WorkoutLog[], window: DateWindow): Streaks {
  const trained = new Set(logs.map((log) => log.date));
  const weeks: boolean[] = [];

  for (
    let cursor = weekStartKey(window.start);
    cursor <= window.end && weeks.length < MAX_POINTS;
    cursor = shiftKey(cursor, 7)
  ) {
    weeks.push(
      Array.from({ length: 7 }, (_, offset) => shiftKey(cursor, offset)).some(
        (date) => date >= window.start && date <= window.end && trained.has(date)
      )
    );
  }

  let longest = 0;
  let running = 0;
  weeks.forEach((worked) => {
    running = worked ? running + 1 : 0;
    longest = Math.max(longest, running);
  });

  // Counted backwards from the last week, so a streak in progress reads as
  // current. The final week is usually partial — the window ends today, not on a
  // Sunday — and a partial week with no session yet is not a broken streak. On a
  // Monday morning after eight straight weeks the honest answer is eight, not
  // zero, so an empty trailing partial week is skipped rather than counted false.
  const lastComplete = shiftKey(weekStartKey(window.end), 6) <= window.end;
  let index = weeks.length - 1;

  if (index >= 0 && !weeks[index] && !lastComplete) {
    index -= 1;
  }

  let current = 0;
  for (; index >= 0 && weeks[index]; index -= 1) {
    current += 1;
  }

  return {
    trainedDays: [...trained].filter((date) => inWindow(date, window)).length,
    totalDays: windowDays(window),
    currentWeeks: current,
    longestWeeks: longest
  };
}

/**
 * Column labels for the matrix and the drift chart.
 *
 * `month: "narrow"` renders Jan, Jun and Jul all as "J", which is three of
 * twelve columns unreadable. "short" costs a few pixels of column width and is
 * the only version a reader can actually use.
 */
const MONTH_SHORT = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });

export function formatColumnKey(key: string, bucket: MatrixBucket) {
  return bucket === "month" ? MONTH_SHORT.format(parseKey(key)) : key.slice(8, 10);
}

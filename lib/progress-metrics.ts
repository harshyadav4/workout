import { resolveMuscleIds } from "@/features/body/body-map-shared";
import { muscles } from "@/lib/seed-data";
import type { MuscleGroup, MuscleId, WorkoutLog } from "@/lib/types";

/**
 * Everything /progress plots, derived from `WorkoutLog[]` and nothing else.
 *
 * Log dates are plain `YYYY-MM-DD` days. Every parse here goes through
 * `${key}T00:00:00Z` and every weekday read is `getUTCDay()` — the same rule
 * Home follows. Read a day key in local time and the calendar's weekday columns
 * shift by one for anyone west of UTC, which an assert never catches and a
 * screenshot always does.
 */

export type ProgressRange = "4w" | "12w" | "1y" | "all" | "custom";

export const RANGE_OPTIONS: { id: ProgressRange; label: string }[] = [
  { id: "4w", label: "4W" },
  { id: "12w", label: "12W" },
  { id: "1y", label: "1Y" },
  { id: "all", label: "All" },
  { id: "custom", label: "Dates" }
];

const RANGE_DAYS: Record<Exclude<ProgressRange, "all" | "custom">, number> = {
  "4w": 28,
  "12w": 84,
  "1y": 365
};

/** What the Dates chip opens on before the picker is touched. */
export const CUSTOM_DEFAULT_DAYS = 56;

/** ponytail: ~7 years of weekly buckets. A loop over dates needs a ceiling. */
const MAX_BUCKETS = 400;

export interface DateWindow {
  start: string;
  end: string;
}

function parseKey(key: string) {
  return new Date(`${key}T00:00:00Z`);
}

function toKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function shiftKey(key: string, days: number) {
  const date = parseKey(key);
  date.setUTCDate(date.getUTCDate() + days);
  return toKey(date);
}

const DAY_MONTH = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
  timeZone: "UTC"
});
const MONTH = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });

/** Axis ticks and row labels. UTC, like every other read of a day key here. */
export function formatDayKey(key: string) {
  return DAY_MONTH.format(parseKey(key));
}

export function formatMonthKey(key: string) {
  return MONTH.format(parseKey(key));
}

export function daysBetween(from: string, to: string) {
  return Math.round((parseKey(to).getTime() - parseKey(from).getTime()) / 86_400_000);
}

/** Inclusive length of a window, in days — both ends are days you could have trained. */
export function windowDays(window: DateWindow) {
  return daysBetween(window.start, window.end) + 1;
}

/** Monday-first, so a week column reads the way a training week does. */
export function weekStartKey(key: string) {
  const date = parseKey(key);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return toKey(date);
}

export function earliestLogDate(logs: WorkoutLog[]) {
  return logs.reduce<string | undefined>(
    (earliest, log) => (!earliest || log.date < earliest ? log.date : earliest),
    undefined
  );
}

/**
 * The window a range chip means, ending today. "All" needs the first logged day
 * to have a left edge at all — with no logs it collapses to today, which is the
 * honest answer for an empty history.
 */
export function rangeWindow(
  range: ProgressRange,
  today: string,
  earliest?: string,
  custom?: DateWindow
): DateWindow {
  if (range === "custom") {
    return custom
      ? normalizeWindow(custom)
      : { start: shiftKey(today, -(CUSTOM_DEFAULT_DAYS - 1)), end: today };
  }

  if (range === "all") {
    return { start: earliest && earliest < today ? earliest : today, end: today };
  }

  return { start: shiftKey(today, -(RANGE_DAYS[range] - 1)), end: today };
}

/** Two dates off a picker arrive in whatever order they were typed. */
export function normalizeWindow(window: DateWindow): DateWindow {
  return window.start <= window.end ? window : { start: window.end, end: window.start };
}

/**
 * The equal-length window before this one — what the deltas compare against.
 * Measured off the window itself, so a hand-picked range gets a fair comparison
 * without the chip needing a fixed length.
 */
export function previousWindow(range: ProgressRange, window: DateWindow): DateWindow | undefined {
  if (range === "all") {
    return undefined;
  }

  return {
    start: shiftKey(window.start, -windowDays(window)),
    end: shiftKey(window.start, -1)
  };
}

export function filterByWindow(logs: WorkoutLog[], window: DateWindow) {
  return logs.filter((log) => log.date >= window.start && log.date <= window.end);
}

export type Bucket = "day" | "week";

/** 28 daily bars read fine; a year of them does not. */
const DAILY_LIMIT = 35;

/**
 * Off the window rather than the chip, so a hand-picked fortnight gets daily
 * bars and a hand-picked decade does not.
 */
export function bucketFor(window: DateWindow): Bucket {
  return windowDays(window) <= DAILY_LIMIT ? "day" : "week";
}

function bucketKey(key: string, bucket: Bucket) {
  return bucket === "week" ? weekStartKey(key) : key;
}

export interface TrendPoint {
  key: string;
  volume: number;
  sets: number;
  reps: number;
  sessions: number;
}

/**
 * Volume, sets, reps and sessions per bucket across the whole window — empty
 * buckets included. A chart that only plots the days you trained spaces a
 * three-week gap the same as a rest day and turns a lapse into a straight line.
 */
export function buildTrend(logs: WorkoutLog[], bucket: Bucket, window: DateWindow): TrendPoint[] {
  const totals = new Map<string, TrendPoint & { dates: Set<string> }>();

  logs.forEach((log) => {
    const key = bucketKey(log.date, bucket);
    const current = totals.get(key);

    totals.set(key, {
      key,
      volume: (current?.volume ?? 0) + log.totalVolume,
      sets: (current?.sets ?? 0) + (log.totalSets ?? 0),
      reps: (current?.reps ?? 0) + (log.totalReps ?? 0),
      sessions: 0,
      dates: new Set([...(current?.dates ?? []), log.date])
    });
  });

  const step = bucket === "week" ? 7 : 1;
  const points: TrendPoint[] = [];
  let cursor = bucketKey(window.start, bucket);

  while (cursor <= window.end && points.length < MAX_BUCKETS) {
    const entry = totals.get(cursor);
    points.push({
      key: cursor,
      volume: entry?.volume ?? 0,
      sets: entry?.sets ?? 0,
      reps: entry?.reps ?? 0,
      sessions: entry?.dates.size ?? 0
    });
    cursor = shiftKey(cursor, step);
  }

  return points;
}

export interface CalendarDay {
  date: string;
  volume: number;
  /** 0 = rest, 1–4 = the ordinal heat steps. */
  level: number;
}

export interface CalendarWeek {
  start: string;
  /** Seven slots, Monday first. `undefined` where the day falls outside the window. */
  days: (CalendarDay | undefined)[];
}

function quantile(sorted: number[], fraction: number) {
  if (sorted.length === 0) {
    return 0;
  }

  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

/**
 * Calendar cells, a column per week.
 *
 * Levels come off the quartiles of the days you actually trained, not off the
 * heaviest day — one outlier session would otherwise flatten every other day to
 * the palest step and the year would read as a year off.
 */
export function buildCalendar(logs: WorkoutLog[], window: DateWindow): CalendarWeek[] {
  const volumes = new Map<string, number>();

  logs.forEach((log) => {
    volumes.set(log.date, (volumes.get(log.date) ?? 0) + log.totalVolume);
  });

  const trained = [...volumes.values()].filter((volume) => volume > 0).sort((a, b) => a - b);
  const thresholds = [quantile(trained, 0.25), quantile(trained, 0.5), quantile(trained, 0.75)];
  const levelFor = (volume: number) =>
    volume <= 0 ? 0 : thresholds.filter((threshold) => volume > threshold).length + 1;

  const weeks: CalendarWeek[] = [];
  let cursor = weekStartKey(window.start);

  while (cursor <= window.end && weeks.length < MAX_BUCKETS) {
    const start = cursor;
    weeks.push({
      start,
      days: Array.from({ length: 7 }, (_, offset) => {
        const date = shiftKey(start, offset);
        if (date < window.start || date > window.end) {
          return undefined;
        }

        const volume = volumes.get(date) ?? 0;
        return { date, volume, level: levelFor(volume) };
      })
    });
    cursor = shiftKey(cursor, 7);
  }

  return weeks;
}

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

/**
 * A log's muscle targets, with the legacy coarse ids expanded.
 *
 * Stored logs still carry the old ten ids — a log tagged `chest` matches no
 * muscle in the current taxonomy and would drop its volume on the floor
 * silently. Expanding one coarse id into several heads inflates its engagement,
 * which is why every caller normalises against the expanded total.
 */
export function resolvedTargets(log: WorkoutLog) {
  return log.muscles.flatMap((target) =>
    resolveMuscleIds(target.muscleId).map((muscleId) => ({
      muscleId,
      engagement: target.engagement
    }))
  );
}

export interface MuscleVolume {
  muscleId: MuscleId;
  name: string;
  volume: number;
  /** Percent of the range's volume that landed on this muscle. */
  share: number;
}

/** Volume split across the thirty muscles, weighted by engagement, heaviest first. */
export function buildMuscleVolume(logs: WorkoutLog[]): MuscleVolume[] {
  const totals = new Map<MuscleId, number>();

  logs.forEach((log) => {
    const targets = resolvedTargets(log);
    const engaged = targets.reduce((sum, target) => sum + target.engagement, 0);

    if (engaged <= 0) {
      return;
    }

    targets.forEach((target) => {
      totals.set(
        target.muscleId,
        (totals.get(target.muscleId) ?? 0) + (log.totalVolume * target.engagement) / engaged
      );
    });
  });

  const grand = [...totals.values()].reduce((sum, value) => sum + value, 0);

  return muscles
    .map((muscle) => {
      const volume = totals.get(muscle.id) ?? 0;
      return {
        muscleId: muscle.id,
        name: muscle.name,
        volume: Math.round(volume),
        share: grand > 0 ? (volume / grand) * 100 : 0
      };
    })
    .sort((a, b) => b.volume - a.volume);
}

export interface MuscleGroupVolume {
  group: MuscleGroup;
  label: string;
  volume: number;
}

/** The same split rolled up to the six groups — the radar's six spokes. */
export function buildMuscleGroupVolume(logs: WorkoutLog[]): MuscleGroupVolume[] {
  const totals = new Map<MuscleGroup, number>();

  buildMuscleVolume(logs).forEach((muscle) => {
    const group = GROUP_BY_MUSCLE.get(muscle.muscleId);
    if (group) {
      totals.set(group, (totals.get(group) ?? 0) + muscle.volume);
    }
  });

  return GROUP_ORDER.map((group) => ({
    group,
    label: GROUP_LABELS[group],
    volume: totals.get(group) ?? 0
  }));
}

/**
 * A set counts fully for a muscle the exercise engages at 50+, half at 25+, and
 * not at all below — the usual direct/indirect convention. A lateral raise is
 * not triceps work just because the triceps are along for the ride.
 */
export const DIRECT_ENGAGEMENT = 50;
const INDIRECT_ENGAGEMENT = 25;

/** The weekly range most hypertrophy reviews converge on. Drawn as a band. */
export const WEEKLY_SET_TARGET = { low: 10, high: 20 };

export interface GroupSets {
  group: MuscleGroup;
  label: string;
  setsPerWeek: number;
}

/**
 * Hard sets per muscle group per week — the unit training volume is actually
 * prescribed in, and the one number here you can act on next week.
 *
 * Credit is the max across a group's muscles, never the sum: a bench press
 * engages both pec heads, and summing them would report a 4-set press as 8 sets
 * of chest.
 */
export function buildWeeklySetsByGroup(logs: WorkoutLog[], window: DateWindow): GroupSets[] {
  const totals = new Map<MuscleGroup, number>();

  logs.forEach((log) => {
    const credits = new Map<MuscleGroup, number>();

    resolvedTargets(log).forEach((target) => {
      const group = GROUP_BY_MUSCLE.get(target.muscleId);
      if (!group) {
        return;
      }

      const credit =
        target.engagement >= DIRECT_ENGAGEMENT
          ? 1
          : target.engagement >= INDIRECT_ENGAGEMENT
            ? 0.5
            : 0;
      credits.set(group, Math.max(credits.get(group) ?? 0, credit));
    });

    credits.forEach((credit, group) => {
      totals.set(group, (totals.get(group) ?? 0) + (log.totalSets ?? 0) * credit);
    });
  });

  const weeks = Math.max(windowDays(window) / 7, 1);

  return GROUP_ORDER.map((group) => ({
    group,
    label: GROUP_LABELS[group],
    setsPerWeek: (totals.get(group) ?? 0) / weeks
  })).sort((a, b) => b.setsPerWeek - a.setsPerWeek);
}

/**
 * The floor an exercise has to engage a muscle at before it counts as work on
 * it. Without one, nearly every compound touches nearly every muscle and
 * "filter to my lats" returns the whole log.
 */
export const MUSCLE_FLOOR = INDIRECT_ENGAGEMENT;

/** How hard one log works one muscle, 0 when it misses it entirely. */
export function muscleEngagement(log: WorkoutLog, muscleId: MuscleId) {
  return resolvedTargets(log).reduce(
    (peak, target) => (target.muscleId === muscleId ? Math.max(peak, target.engagement) : peak),
    0
  );
}

export function filterByMuscle(logs: WorkoutLog[], muscleId: MuscleId, floor = MUSCLE_FLOOR) {
  return logs.filter((log) => muscleEngagement(log, muscleId) >= floor);
}

/**
 * The muscle's logs with `totalVolume` cut to the share that actually landed on
 * it — the same engagement-weighted split `buildMuscleVolume` uses.
 *
 * Deliberately *not* floored at `MUSCLE_FLOOR`: this feeds the volume charts,
 * and they have to add up to the share `buildMuscleVolume` reports next to them.
 * Dropping sub-floor rows here would draw a load curve strictly smaller than the
 * percentage printed above it. The floor belongs on set counts and the lift
 * roster, where "did this work the muscle" is the actual question.
 *
 * ponytail: returning logs rather than a new shape means every builder below —
 * trend, calendar, rest stats, table — drills into a muscle unchanged.
 */
export function attributeToMuscle(logs: WorkoutLog[], muscleId: MuscleId): WorkoutLog[] {
  return logs.flatMap((log) => {
    const targets = resolvedTargets(log);
    const engaged = targets.reduce((sum, target) => sum + target.engagement, 0);
    const mine = targets.reduce(
      (sum, target) => (target.muscleId === muscleId ? sum + target.engagement : sum),
      0
    );

    if (mine <= 0 || engaged <= 0) {
      return [];
    }

    return [{ ...log, totalVolume: (log.totalVolume * mine) / engaged }];
  });
}

/**
 * Hard sets a week landing on one muscle — the group card's number, one muscle
 * deep, and the only figure here you can act on next week.
 */
export function muscleWeeklySets(logs: WorkoutLog[], muscleId: MuscleId, window: DateWindow) {
  const sets = logs.reduce((sum, log) => {
    const engagement = muscleEngagement(log, muscleId);
    const credit =
      engagement >= DIRECT_ENGAGEMENT ? 1 : engagement >= INDIRECT_ENGAGEMENT ? 0.5 : 0;

    return sum + (log.totalSets ?? 0) * credit;
  }, 0);

  return sets / Math.max(windowDays(window) / 7, 1);
}

export interface ExerciseTotal {
  workoutId: string;
  name: string;
  volume: number;
  sets: number;
  reps: number;
  sessions: number;
  /** Heaviest set of this lift anywhere in the slice. */
  topSet: number;
}

export function buildExerciseTotals(logs: WorkoutLog[]): ExerciseTotal[] {
  const totals = new Map<string, ExerciseTotal & { dates: Set<string> }>();

  logs.forEach((log) => {
    const current = totals.get(log.workoutId);
    const dates = new Set([...(current?.dates ?? []), log.date]);

    totals.set(log.workoutId, {
      workoutId: log.workoutId,
      name: log.name,
      volume: (current?.volume ?? 0) + log.totalVolume,
      sets: (current?.sets ?? 0) + (log.totalSets ?? 0),
      reps: (current?.reps ?? 0) + (log.totalReps ?? 0),
      topSet: Math.max(current?.topSet ?? 0, log.peakWeight ?? 0),
      sessions: dates.size,
      dates
    });
  });

  return [...totals.values()]
    .map(({ dates: _dates, ...total }) => total)
    .sort((a, b) => b.volume - a.volume);
}

export interface TopSetPoint {
  date: string;
  weight: number;
}

/**
 * The heaviest set of one exercise, per session.
 *
 * Deliberately not an estimated 1RM: a log stores `totalReps` for the whole
 * exercise, not reps per set, so Epley here would be a guess wearing a formula.
 */
export function buildTopSetSeries(logs: WorkoutLog[], workoutId: string): TopSetPoint[] {
  const peaks = new Map<string, number>();

  logs
    .filter((log) => log.workoutId === workoutId)
    .forEach((log) => {
      peaks.set(log.date, Math.max(peaks.get(log.date) ?? 0, log.peakWeight ?? 0));
    });

  return [...peaks.entries()]
    .filter(([, weight]) => weight > 0)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, weight]) => ({ date, weight }));
}

export interface StrengthGrowth {
  workoutId: string;
  name: string;
  first: number;
  last: number;
  changePercent: number;
  sessions: number;
}

/**
 * First top set → latest top set, per exercise, steepest gain first.
 *
 * Two sessions minimum: one session is a starting point, not a trend, and a
 * lift you did once would otherwise show up at the top of the list at 0%.
 */
export function buildStrengthGrowth(logs: WorkoutLog[], minSessions = 2): StrengthGrowth[] {
  const byExercise = new Map<string, WorkoutLog[]>();

  logs.forEach((log) => {
    byExercise.set(log.workoutId, [...(byExercise.get(log.workoutId) ?? []), log]);
  });

  return [...byExercise.values()]
    .map((entries) => {
      const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
      const first = sorted[0].peakWeight ?? 0;
      const last = sorted[sorted.length - 1].peakWeight ?? 0;

      return {
        workoutId: sorted[0].workoutId,
        name: sorted[0].name,
        first,
        last,
        changePercent: first > 0 ? ((last - first) / first) * 100 : 0,
        sessions: sorted.length
      };
    })
    .filter((item) => item.sessions >= minSessions && item.first > 0)
    .sort((a, b) => b.changePercent - a.changePercent);
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Monday first, matching `weekStartKey`. */
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export interface WeekdayStat {
  dayIndex: number;
  label: string;
  sessions: number;
  volume: number;
}

/** Sessions per weekday. The thin columns are the days you take off. */
export function buildWeekdayRhythm(logs: WorkoutLog[]): WeekdayStat[] {
  const volumes = new Map<string, number>();

  logs.forEach((log) => {
    volumes.set(log.date, (volumes.get(log.date) ?? 0) + log.totalVolume);
  });

  const days = [...volumes.entries()].map(([date, volume]) => ({
    dayIndex: parseKey(date).getUTCDay(),
    volume
  }));

  return WEEKDAY_ORDER.map((dayIndex) => {
    const matching = days.filter((day) => day.dayIndex === dayIndex);

    return {
      dayIndex,
      label: WEEKDAY_LABELS[dayIndex],
      sessions: matching.length,
      volume: matching.reduce((sum, day) => sum + day.volume, 0)
    };
  });
}

export interface RestStats {
  sessionsPerWeek: number;
  restDays: number;
  averageGap: number;
  longestGap: number;
  daysSinceLast?: number;
}

/**
 * The gaps between sessions. A gap is the days *off* between two sessions, so
 * back-to-back days read as 0 — "days off between sessions", not a stride
 * length, which is the number you actually feel.
 */
export function buildRestStats(logs: WorkoutLog[], window: DateWindow): RestStats {
  const dates = [...new Set(logs.map((log) => log.date))].sort();
  const gaps = dates.slice(1).map((date, index) => daysBetween(dates[index], date) - 1);
  const days = windowDays(window);

  return {
    sessionsPerWeek: dates.length / Math.max(days / 7, 1),
    restDays: Math.max(days - dates.length, 0),
    averageGap:
      gaps.length > 0 ? gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length : 0,
    longestGap: gaps.reduce((longest, gap) => Math.max(longest, gap), 0),
    daysSinceLast:
      dates.length > 0 ? daysBetween(dates[dates.length - 1], window.end) : undefined
  };
}

export interface ProgressSummary {
  volume: number;
  sessions: number;
  sets: number;
  reps: number;
  best?: { name: string; weight: number };
  /**
   * Volume is a product, so these are its factors — the numbers that say *why*
   * the total moved. Tonnage up with weight-per-rep flat is more work; tonnage
   * flat with weight-per-rep up is better work.
   */
  volumePerWeek: number;
  sessionVolume: number;
  weightPerRep: number;
  repsPerSet: number;
  setsPerSession: number;
}

function ratio(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : 0;
}

export function summarize(logs: WorkoutLog[], window: DateWindow): ProgressSummary {
  const sessions = new Set(logs.map((log) => log.date)).size;
  const volume = logs.reduce((sum, log) => sum + log.totalVolume, 0);
  const sets = logs.reduce((sum, log) => sum + (log.totalSets ?? 0), 0);
  const reps = logs.reduce((sum, log) => sum + (log.totalReps ?? 0), 0);
  const best = logs.reduce<ProgressSummary["best"]>((heaviest, log) => {
    const weight = log.peakWeight ?? 0;
    return weight > (heaviest?.weight ?? 0) ? { name: log.name, weight } : heaviest;
  }, undefined);

  return {
    volume,
    sessions,
    sets,
    reps,
    best,
    volumePerWeek: ratio(volume, windowDays(window) / 7),
    sessionVolume: ratio(volume, sessions),
    weightPerRep: ratio(volume, reps),
    repsPerSet: ratio(reps, sets),
    setsPerSession: ratio(sets, sessions)
  };
}

export interface TableRow {
  /** The day, or the week's Monday. The view formats it. */
  key: string;
  detail: string;
  sessions: number;
  sets: number;
  reps: number;
  volume: number;
  topSet: number;
}

/**
 * Every chart above, as rows. Nothing on this page is reachable only by
 * hovering a chart — and once the shapes have said where to look, this is the
 * view you actually read.
 */
export function buildTableRows(logs: WorkoutLog[], grain: "session" | "week"): TableRow[] {
  const weekly = grain === "week";
  const groups = new Map<string, WorkoutLog[]>();

  logs.forEach((log) => {
    const key = weekly ? weekStartKey(log.date) : log.date;
    groups.set(key, [...(groups.get(key) ?? []), log]);
  });

  return [...groups.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, entries]) => {
      const sessions = new Set(entries.map((log) => log.date)).size;
      const lead = [...entries].sort((a, b) => b.totalVolume - a.totalVolume)[0];
      const extra = entries.length - 1;

      return {
        key,
        detail: weekly
          ? `${sessions} session${sessions === 1 ? "" : "s"} · ${entries.length} exercises`
          : extra > 0
            ? `${lead.name} +${extra}`
            : lead.name,
        sessions,
        sets: entries.reduce((sum, log) => sum + (log.totalSets ?? 0), 0),
        reps: entries.reduce((sum, log) => sum + (log.totalReps ?? 0), 0),
        volume: entries.reduce((sum, log) => sum + log.totalVolume, 0),
        topSet: entries.reduce((peak, log) => Math.max(peak, log.peakWeight ?? 0), 0)
      };
    });
}

/** Undefined when there is nothing to compare against — not 0%, not +100%. */
export function percentChange(current: number, previous: number) {
  if (previous <= 0) {
    return undefined;
  }

  return ((current - previous) / previous) * 100;
}

import { daysBetween } from "@/lib/progress-metrics";
import { todayKey } from "@/lib/utils";
import type {
  BodyMeasurement,
  BodyMetric,
  MeasurementCadence,
  MuscleId,
  ProfileInfo
} from "@/lib/types";

/**
 * Bodyweight and tape measurements.
 *
 * One series type covers both: a number, on a date, for a site. Two parallel
 * systems would drift, and the chart, the entry form and the sync mapping are
 * identical either way.
 */

export const BODY_METRICS: { id: BodyMetric; label: string }[] = [
  { id: "weight", label: "Bodyweight" },
  { id: "shoulders", label: "Shoulders" },
  { id: "chest", label: "Chest" },
  { id: "waist", label: "Waist" },
  { id: "hips", label: "Hips" },
  { id: "armL", label: "Left arm" },
  { id: "armR", label: "Right arm" },
  { id: "thighL", label: "Left thigh" },
  { id: "thighR", label: "Right thigh" },
  { id: "calfL", label: "Left calf" },
  { id: "calfR", label: "Right calf" }
];

const LABELS = new Map(BODY_METRICS.map((item) => [item.id, item.label]));

export function labelFor(metric: BodyMetric): string {
  return LABELS.get(metric) ?? metric;
}

export function unitFor(metric: BodyMetric): "kg" | "cm" {
  return metric === "weight" ? "kg" : "cm";
}

/**
 * The tape sites that cover a muscle, for the Progress drill-down.
 *
 * Muscles with no measurable site — traps, rhomboids, lats, erectors, forearms,
 * serratus, tibialis — are absent on purpose and render no card. A tape around
 * a lat is not a measurement anyone takes.
 */
const MUSCLE_SITES: Partial<Record<MuscleId, BodyMetric[]>> = {
  pecUpper: ["chest"],
  pecLower: ["chest"],
  deltFront: ["shoulders"],
  deltSide: ["shoulders"],
  deltRear: ["shoulders"],
  biceps: ["armL", "armR"],
  brachialis: ["armL", "armR"],
  tricepsLong: ["armL", "armR"],
  tricepsLateral: ["armL", "armR"],
  abs: ["waist"],
  obliques: ["waist"],
  gluteMax: ["hips"],
  gluteMed: ["hips"],
  rectusFemoris: ["thighL", "thighR"],
  vastusLateralis: ["thighL", "thighR"],
  vastusMedialis: ["thighL", "thighR"],
  sartorius: ["thighL", "thighR"],
  adductors: ["thighL", "thighR"],
  hamsOuter: ["thighL", "thighR"],
  hamsInner: ["thighL", "thighR"],
  gastrocnemius: ["calfL", "calfR"],
  soleus: ["calfL", "calfR"]
};

export function sitesForMuscle(muscleId: MuscleId): BodyMetric[] {
  return MUSCLE_SITES[muscleId] ?? [];
}

/**
 * One reading per (date, metric). Measuring your chest twice on a Tuesday
 * replaces Tuesday rather than adding a second point — two readings a day apart
 * on the same tape is noise, not a trend.
 */
export function upsertMeasurement(
  list: BodyMeasurement[],
  entry: BodyMeasurement
): BodyMeasurement[] {
  const without = list.filter(
    (item) => !(item.date === entry.date && item.metric === entry.metric)
  );
  return [...without, entry].sort((a, b) => a.date.localeCompare(b.date));
}

export interface MetricPoint {
  date: string;
  value: number;
  /** Trailing mean, when the series was built with one. */
  average?: number;
}

/** A metric's readings, oldest first. */
export function seriesFor(
  measurements: BodyMeasurement[],
  metric: BodyMetric
): MetricPoint[] {
  return measurements
    .filter((item) => item.metric === metric)
    .map((item) => ({ date: item.date, value: item.value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Trailing mean over a window of calendar days, not of readings — a gap in
 * weighing should widen the window in time, not quietly average across a month.
 *
 * ponytail: O(n²) over one person's readings. A decade of daily weigh-ins is
 * ~3600 points; switch to a two-pointer window if that ever stops being instant.
 */
export function withMovingAverage(points: MetricPoint[], days = 7): MetricPoint[] {
  return points.map((point, index) => {
    const window = points
      .slice(0, index + 1)
      .filter((other) => daysBetween(other.date, point.date) < days);

    return {
      ...point,
      average: window.reduce((sum, item) => sum + item.value, 0) / window.length
    };
  });
}

export function latestFor(
  measurements: BodyMeasurement[],
  metric: BodyMetric
): BodyMeasurement | undefined {
  return seriesFor(measurements, metric).length > 0
    ? measurements
        .filter((item) => item.metric === metric)
        .reduce((latest, item) => (item.date > latest.date ? item : latest))
    : undefined;
}

export type MergedRow = { date: string } & Partial<Record<BodyMetric, number>>;

/**
 * Several sites on one date axis, for charting a left/right pair together.
 * A date only carries the sites actually measured that day; recharts draws a
 * gap rather than inventing a value, which is the honest reading.
 */
export function mergeSeries(
  measurements: BodyMeasurement[],
  metrics: BodyMetric[]
): MergedRow[] {
  const byDate = new Map<string, MergedRow>();

  for (const metric of metrics) {
    for (const point of seriesFor(measurements, metric)) {
      const row = byDate.get(point.date) ?? { date: point.date };
      row[metric] = point.value;
      byDate.set(point.date, row);
    }
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function hasAny(measurements: BodyMeasurement[], metrics: BodyMetric[]): boolean {
  return measurements.some((item) => metrics.includes(item.metric));
}

export const CADENCES: { id: MeasurementCadence; label: string }[] = [
  { id: "weekly", label: "Weekly" },
  { id: "biweekly", label: "2 weeks" },
  { id: "monthly", label: "Monthly" },
  { id: "off", label: "Off" }
];

const CADENCE_DAYS: Record<Exclude<MeasurementCadence, "off">, number> = {
  weekly: 7,
  biweekly: 14,
  monthly: 30
};

export interface DueState {
  /** Null when the cadence is off — nothing is ever overdue then. */
  due: boolean | null;
  /** Days until the next one is due; negative once it is overdue. */
  daysUntil?: number;
  lastDate?: string;
}

/**
 * Whether a reading is owed. In-app only: no notification permission is asked
 * for and nothing is scheduled, so this can never nag someone who closed the
 * app — it answers "am I due?" the moment they look.
 */
export function dueState(
  measurements: BodyMeasurement[],
  metrics: BodyMetric[],
  cadence: MeasurementCadence | undefined,
  today = todayKey()
): DueState {
  const lastDate = metrics
    .map((metric) => latestFor(measurements, metric)?.date)
    .filter((date): date is string => Boolean(date))
    .sort()
    .at(-1);

  if (!cadence || cadence === "off") {
    return { due: null, lastDate };
  }

  // Never recorded: due now, so the card has something to ask for.
  if (!lastDate) {
    return { due: true, daysUntil: 0, lastDate };
  }

  const daysUntil = CADENCE_DAYS[cadence] - daysBetween(lastDate, today);
  return { due: daysUntil <= 0, daysUntil, lastDate };
}

/** Every site except the scale — the things you need a tape for. */
export const TAPE_METRICS = BODY_METRICS.filter((item) => item.id !== "weight").map(
  (item) => item.id
);

/**
 * Is anything owed right now? Drives the dot on the Profile tab, so the
 * reminder reaches someone who is on Home rather than waiting on the one screen
 * they visit least.
 *
 * Any single tape reading clears the tape cadence — recording only your chest
 * counts as having measured. Per-site cadences would be more correct and would
 * also mean eleven separate nags.
 */
export function isRecordingDue(
  measurements: BodyMeasurement[],
  profile: Pick<ProfileInfo, "weightCadence" | "measurementCadence">
): boolean {
  return Boolean(
    dueState(measurements, ["weight"], profile.weightCadence).due ||
      dueState(measurements, TAPE_METRICS, profile.measurementCadence).due
  );
}

/** Change from the previous reading to the latest. Undefined until there are two. */
export function changeFor(
  measurements: BodyMeasurement[],
  metric: BodyMetric
): number | undefined {
  const series = seriesFor(measurements, metric);
  if (series.length < 2) {
    return undefined;
  }
  return series[series.length - 1].value - series[series.length - 2].value;
}

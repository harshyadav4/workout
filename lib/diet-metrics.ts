/**
 * What the diet charts read, as pure functions. Everything comes off the days:
 * eaten meals count, at the numbers they were eaten at. Skipped and pending
 * meals never count. Bodyweight is only ever read, never written.
 *
 * Intake is typed by hand or estimated, so nothing here claims more than that:
 * it reports direction and size and never a cause, the rule the volume and tape
 * callout set in lib/progress-trends.ts, gated at the same eight weeks.
 */
import { withMovingAverage, type MetricPoint } from "@/lib/body-metrics";
import type { MealTotals, ScheduledMealDay } from "@/lib/diet-types";
import { summarizeItems } from "@/lib/meal-schedule";
import { weekStartKey, type DateWindow } from "@/lib/progress-metrics";
import type { BodyMeasurement } from "@/lib/types";

/** Under this span a line through intake and weight is noise, and it stays hidden. */
export const FUEL_CALLOUT_WEEKS = 8;
const DAY_MS = 86_400_000;

export type MeterTone = "none" | "low" | "mid" | "good" | "over";

/** Past the target by more than this, and a bar with a limit turns red. A little over is still on target. */
const OVER_BY = 1.1;

/**
 * The colour of a progress bar: red early on, amber past a third, green from two
 * thirds. Protein sets `noLimit`, because more protein than planned is not a
 * problem. For calories, carbs and fat, well past the target goes red again.
 */
export function meterTone(value: number, target: number | undefined, { noLimit = false } = {}): MeterTone {
  if (!target || target <= 0) {
    return "none";
  }
  const share = value / target;
  if (share > OVER_BY && !noLimit) {
    return "over";
  }
  if (share >= 2 / 3) {
    return "good";
  }
  return share >= 1 / 3 ? "mid" : "low";
}

export interface DayIntake extends MealTotals {
  date: string;
  eaten: number;
}

function daysInWindow(days: readonly ScheduledMealDay[], window: DateWindow) {
  return days.filter((day) => day.date >= window.start && day.date <= window.end);
}

/**
 * One row per day something was eaten, oldest first. A day with nothing ticked
 * is left out, not drawn as zero: forgetting to tick is not fasting, and a run
 * of zeros would drag every average down.
 */
export function dailyIntake(days: readonly ScheduledMealDay[], window: DateWindow): DayIntake[] {
  return daysInWindow(days, window)
    .map((day) => {
      const eaten = day.items.filter((item) => item.status === "eaten");
      return { date: day.date, eaten: eaten.length, ...summarizeItems(eaten) };
    })
    .filter((row) => row.eaten > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Per tracked day, not per calendar day, for the reason above. */
export function averageIntake(intake: readonly DayIntake[]): MealTotals {
  if (intake.length === 0) {
    return summarizeItems([]);
  }
  const total = summarizeItems(intake);
  return {
    kcal: Math.round(total.kcal / intake.length),
    proteinG: Math.round((total.proteinG / intake.length) * 10) / 10,
    carbsG: Math.round((total.carbsG / intake.length) * 10) / 10,
    fatG: Math.round((total.fatG / intake.length) * 10) / 10,
    costInr: Math.round((total.costInr / intake.length) * 100) / 100
  };
}

export function intakeSeries(intake: readonly DayIntake[], key: "kcal" | "proteinG"): MetricPoint[] {
  return withMovingAverage(intake.map((row) => ({ date: row.date, value: row[key] })));
}

/** The newest weigh-in on or before a date, or the first one ever when none came before. */
export function weightOn(weighIns: readonly MetricPoint[], date: string): number | undefined {
  let found: number | undefined;
  for (const point of weighIns) {
    if (point.date > date) {
      break;
    }
    found = point.value;
  }
  return found ?? weighIns[0]?.value;
}

export function weighInsOf(measurements: readonly BodyMeasurement[]): MetricPoint[] {
  return measurements
    .filter((item) => item.metric === "weight")
    .map((item) => ({ date: item.date, value: item.value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Average grams of protein per kg of bodyweight, each day against that day's weight. Undefined with no weigh-in. */
export function proteinPerKg(intake: readonly DayIntake[], measurements: readonly BodyMeasurement[]): number | undefined {
  const weighIns = weighInsOf(measurements);
  const ratios = intake.flatMap((row) => {
    const weight = weightOn(weighIns, row.date);
    return weight && weight > 0 ? [row.proteinG / weight] : [];
  });
  if (ratios.length === 0) {
    return undefined;
  }
  return Math.round((ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length) * 100) / 100;
}

export interface Adherence {
  planned: number;
  eaten: number;
  skipped: number;
  /** Past-day meals never ticked or skipped. Today's are not missed yet. */
  missed: number;
  extras: number;
  /** Share of planned meals eaten, 0–1. Undefined with nothing planned yet. */
  rate?: number;
}

/** Planned against eaten, counting only what has come due. Extras are not on the plan, so they sit apart. */
export function adherence(days: readonly ScheduledMealDay[], window: DateWindow, today: string): Adherence {
  const result: Adherence = { planned: 0, eaten: 0, skipped: 0, missed: 0, extras: 0 };
  daysInWindow(days, window).forEach((day) => {
    if (day.date > today) {
      return;
    }
    day.items.forEach((item) => {
      if (item.extra) {
        result.extras += item.status === "eaten" ? 1 : 0;
        return;
      }
      if (item.status === "eaten") {
        result.planned += 1;
        result.eaten += 1;
      } else if (item.status === "skipped") {
        result.planned += 1;
        result.skipped += 1;
      } else if (day.date < today) {
        result.planned += 1;
        result.missed += 1;
      }
    });
  });
  return result.planned > 0 ? { ...result, rate: result.eaten / result.planned } : result;
}

export interface Spend {
  total: number;
  perDay: number;
  /** The calendar month `today` is in. */
  thisMonth: number;
  weeks: { week: string; costInr: number }[];
}

/** `thisMonth` needs the whole history, because the range on screen may be shorter than a month. */
export function spend(
  days: readonly ScheduledMealDay[],
  window: DateWindow,
  today: string
): Spend {
  const intake = dailyIntake(days, window);
  const byWeek = new Map<string, number>();
  intake.forEach((row) => {
    const week = weekStartKey(row.date);
    byWeek.set(week, (byWeek.get(week) ?? 0) + row.costInr);
  });
  const month = today.slice(0, 7);
  const monthDays = days.filter((day) => day.date.startsWith(month));
  return {
    total: summarizeItems(intake).costInr,
    perDay: averageIntake(intake).costInr,
    thisMonth: summarizeItems(dailyIntake(monthDays, { start: `${month}-01`, end: today })).costInr,
    weeks: [...byWeek.entries()]
      .map(([week, costInr]) => ({ week, costInr: Math.round(costInr * 100) / 100 }))
      .sort((a, b) => a.week.localeCompare(b.week))
  };
}

/** Each macro's share of the energy it carries (4, 4 and 9 kcal per gram), as whole percents. */
export function macroShare(totals: Pick<MealTotals, "proteinG" | "carbsG" | "fatG">) {
  const protein = totals.proteinG * 4;
  const carbs = totals.carbsG * 4;
  const fat = totals.fatG * 9;
  const all = protein + carbs + fat;
  if (all <= 0) {
    return { protein: 0, carbs: 0, fat: 0 };
  }
  return {
    protein: Math.round((protein / all) * 100),
    carbs: Math.round((carbs / all) * 100),
    fat: Math.round((fat / all) * 100)
  };
}

export interface FuelVsWeight {
  rows: { date: string; kcal: number; weight?: number }[];
  weeks: number;
  averageKcal: number;
  weightChange: number;
}

/**
 * Intake and bodyweight on one line, or undefined until there are eight weeks
 * of tracked eating and a weigh-in at each end. An observation, and the card
 * says so: the scale also moves with water, training and salt.
 */
export function fuelVsWeight(
  intake: readonly DayIntake[],
  measurements: readonly BodyMeasurement[]
): FuelVsWeight | undefined {
  if (intake.length < 2) {
    return undefined;
  }
  const first = intake[0].date;
  const last = intake[intake.length - 1].date;
  const weeks = (Date.parse(`${last}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / (DAY_MS * 7);
  const weighIns = weighInsOf(measurements).filter((point) => point.date >= first && point.date <= last);
  if (weeks < FUEL_CALLOUT_WEEKS || weighIns.length < 2) {
    return undefined;
  }
  const kcal = intakeSeries(intake, "kcal");
  const weight = new Map(withMovingAverage(weighIns).map((point) => [point.date, point.average ?? point.value]));
  return {
    rows: kcal.map((point) => ({
      date: point.date,
      kcal: Math.round(point.average ?? point.value),
      weight: weight.get(point.date)
    })),
    weeks: Math.floor(weeks),
    averageKcal: averageIntake(intake).kcal,
    weightChange: Math.round((weighIns[weighIns.length - 1].value - weighIns[0].value) * 10) / 10
  };
}

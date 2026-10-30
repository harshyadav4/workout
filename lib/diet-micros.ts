/**
 * Micronutrients against their daily targets: what was eaten, and what eating
 * every planned meal would reach. Pure, so every rule is tested.
 *
 * The rule that shapes it: unknown is not zero. A meal typed by hand has no
 * micronutrient data, so a day with such a meal would read falsely low. Averages
 * only read days where every counted meal is known, and the card says how many.
 *
 * Targets: ICMR-NIN 2020 RDA tables (nin.res.in/rdabook/brief_note.pdf, tables 3
 * and 4), vitamin D converted from 600 IU. Potassium and sodium: WHO 2012. Fibre:
 * Institute of Medicine 2005. Vitamin B12 has a target but no food data, so it
 * is left out rather than shown as empty.
 */
import type { MeterTone } from "@/lib/diet-metrics";
import type { Micros, PlannedMeal, ScheduledMealDay } from "@/lib/diet-types";
import { shiftKey, type DateWindow } from "@/lib/progress-metrics";
import type { Sex } from "@/lib/types";

/** Fewer complete days than this is a day or two, not an average. */
export const MIN_COMPLETE_DAYS = 3;
/** The fibre target scales with what is eaten. */
export const FIBER_G_PER_1000_KCAL = 14;
/** How far ahead "your plan" reads, so a brand-new plan has something to show. */
const PLAN_AHEAD_DAYS = 6;
const GOOD_SHARE = 2 / 3;
const MID_SHARE = 1 / 3;

export interface Micronutrient {
  key: keyof Micros;
  label: string;
  unit: string;
  male: number;
  female: number;
  /** A ceiling to stay under, not a floor to reach. */
  limit?: boolean;
}

export const MICRONUTRIENTS: Micronutrient[] = [
  { key: "ironMg", label: "Iron", unit: "mg", male: 19, female: 29 },
  { key: "calciumMg", label: "Calcium", unit: "mg", male: 1000, female: 1000 },
  { key: "magnesiumMg", label: "Magnesium", unit: "mg", male: 440, female: 370 },
  { key: "zincMg", label: "Zinc", unit: "mg", male: 17, female: 13 },
  { key: "vitaminDUg", label: "Vitamin D", unit: "µg", male: 15, female: 15 },
  { key: "vitaminCMg", label: "Vitamin C", unit: "mg", male: 80, female: 65 },
  { key: "vitaminAUg", label: "Vitamin A", unit: "µg", male: 1000, female: 840 },
  { key: "folateUg", label: "Folate", unit: "µg", male: 300, female: 220 },
  { key: "thiamineMg", label: "Vitamin B1", unit: "mg", male: 1.8, female: 1.7 },
  { key: "riboflavinMg", label: "Vitamin B2", unit: "mg", male: 2.5, female: 2.4 },
  { key: "potassiumMg", label: "Potassium", unit: "mg", male: 3510, female: 3510 },
  { key: "sodiumMg", label: "Sodium", unit: "mg", male: 2000, female: 2000, limit: true },
  { key: "fiberG", label: "Fibre", unit: "g", male: 0, female: 0 }
];

/** Red, amber, green toward a floor. A limit is green until it is passed, and being low on one is good. */
export function microTone(value: number, target: number, limit = false): MeterTone {
  if (!(target > 0)) {
    return "none";
  }
  const share = value / target;
  if (limit) {
    return share > 1 ? "over" : "good";
  }
  return share >= GOOD_SHARE ? "good" : share >= MID_SHARE ? "mid" : "low";
}

/** A backup file can carry anything: only a full set of real numbers counts as known. */
function knownMicros(item: PlannedMeal): Micros | undefined {
  const { micros } = item;
  if (!micros || typeof micros !== "object") {
    return undefined;
  }
  return MICRONUTRIENTS.every(({ key }) => Number.isFinite(micros[key]) && micros[key] >= 0) ? micros : undefined;
}

interface DayTotal {
  values: Record<string, number>;
  kcal: number;
}

/** A day's sum, or undefined when any meal in it is unknown. */
function totalOf(items: readonly PlannedMeal[]): DayTotal | undefined {
  if (items.length === 0) {
    return undefined;
  }
  const values: Record<string, number> = {};
  let kcal = 0;
  for (const item of items) {
    const micros = knownMicros(item);
    if (!micros) {
      return undefined;
    }
    kcal += item.kcal;
    MICRONUTRIENTS.forEach(({ key }) => {
      values[key] = (values[key] ?? 0) + micros[key];
    });
  }
  return { values, kcal };
}

function averageOf(totals: readonly DayTotal[]) {
  const values: Record<string, number> = {};
  MICRONUTRIENTS.forEach(({ key }) => {
    values[key] = totals.reduce((sum, total) => sum + total.values[key], 0) / totals.length;
  });
  return { values, kcal: totals.reduce((sum, total) => sum + total.kcal, 0) / totals.length };
}

export interface MicroRow {
  key: keyof Micros;
  label: string;
  unit: string;
  target: number;
  limit: boolean;
  /** Average per complete day. Absent until there are enough of them. */
  eaten?: number;
  /** Average if every planned meal were eaten. Absent if no plan day is fully known. */
  planned?: number;
  tone: MeterTone;
  /** The meal that gave the most of it. */
  topMeal?: string;
}

export interface MicroReport {
  rows: MicroRow[];
  haveEaten: boolean;
  havePlanned: boolean;
  completeDays: number;
  knownMeals: number;
  eatenMeals: number;
  good: MicroRow[];
  low: MicroRow[];
  /** Low from what was eaten, reached by the full plan. */
  fixedByPlan: MicroRow[];
  /** Low even if every planned meal were eaten. */
  shortInPlan: MicroRow[];
  /** Past a limit if every planned meal were eaten. */
  overInPlan: MicroRow[];
}

export function buildMicroReport(
  days: readonly ScheduledMealDay[],
  window: DateWindow,
  sex: Sex | undefined,
  today: string
): MicroReport | undefined {
  if (sex !== "male" && sex !== "female") {
    return undefined;
  }
  let knownMeals = 0;
  let eatenMeals = 0;
  const eatenTotals: DayTotal[] = [];
  const planTotals: DayTotal[] = [];
  const topMeals = new Map<string, Map<string, number>>();
  const planEnd = shiftKey(today, PLAN_AHEAD_DAYS);

  days.forEach((day) => {
    if (day.date >= window.start && day.date <= window.end) {
      const eaten = day.items.filter((item) => item.status === "eaten");
      eatenMeals += eaten.length;
      eaten.forEach((item) => {
        const micros = knownMicros(item);
        if (!micros) {
          return;
        }
        knownMeals += 1;
        MICRONUTRIENTS.forEach(({ key }) => {
          const byMeal = topMeals.get(key) ?? new Map<string, number>();
          byMeal.set(item.name, (byMeal.get(item.name) ?? 0) + micros[key]);
          topMeals.set(key, byMeal);
        });
      });
      const total = totalOf(eaten);
      if (total) {
        eatenTotals.push(total);
      }
    }
    if (day.date >= window.start && day.date <= planEnd) {
      const total = totalOf(day.items.filter((item) => !item.extra));
      if (total) {
        planTotals.push(total);
      }
    }
  });

  const haveEaten = eatenTotals.length >= MIN_COMPLETE_DAYS;
  const havePlanned = planTotals.length > 0;
  const eaten = haveEaten ? averageOf(eatenTotals) : undefined;
  const planned = havePlanned ? averageOf(planTotals) : undefined;

  const rows: MicroRow[] = MICRONUTRIENTS.map((nutrient) => {
    const kcalBase = eaten?.kcal ?? planned?.kcal ?? 0;
    const target =
      nutrient.key === "fiberG" ? Math.round((FIBER_G_PER_1000_KCAL * kcalBase) / 1000) : sex === "male" ? nutrient.male : nutrient.female;
    const eatenValue = eaten?.values[nutrient.key];
    const best = [...(topMeals.get(nutrient.key)?.entries() ?? [])].sort((a, b) => b[1] - a[1])[0];
    return {
      key: nutrient.key,
      label: nutrient.label,
      unit: nutrient.unit,
      target,
      limit: Boolean(nutrient.limit),
      eaten: eatenValue,
      planned: planned?.values[nutrient.key],
      tone: eatenValue !== undefined ? microTone(eatenValue, target, nutrient.limit) : "none",
      topMeal: best && best[1] > 0 ? best[0] : undefined
    };
  });

  const planTone = (row: MicroRow) => (row.planned !== undefined ? microTone(row.planned, row.target, row.limit) : "none");
  const low = haveEaten ? rows.filter((row) => row.tone === "low" || row.tone === "mid" || row.tone === "over") : [];
  return {
    rows,
    haveEaten,
    havePlanned,
    completeDays: eatenTotals.length,
    knownMeals,
    eatenMeals,
    good: haveEaten ? rows.filter((row) => row.tone === "good") : [],
    low,
    fixedByPlan: low.filter((row) => planTone(row) === "good"),
    shortInPlan: rows.filter((row) => !row.limit && (planTone(row) === "low" || planTone(row) === "mid")),
    overInPlan: rows.filter((row) => row.limit && planTone(row) === "over")
  };
}

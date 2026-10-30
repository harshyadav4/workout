/**
 * Diet's part of the backup file. It sits under one `diet` key beside the
 * workout data, so a backup stays one file and neither side reads the other's
 * rows. An older file with no `diet` key restores workouts and leaves diet alone.
 *
 * The file is hostile input, as in lib/import-backup.ts: rows that do not
 * typecheck are dropped, never carried. Pure, with no Supabase import.
 */
import type {
  DietData,
  DietIncoming,
  DietSettings,
  Meal,
  MealPlan,
  MealScheduleConfig,
  ScheduledMealDay
} from "@/lib/diet-types";

export function buildDietExport(state: DietData): DietData {
  return {
    meals: state.meals,
    mealPlans: state.mealPlans,
    scheduledMealDays: state.scheduledMealDays,
    mealScheduleConfig: state.mealScheduleConfig,
    settings: state.settings
  };
}

type Row = Record<string, unknown>;

const isObject = (value: unknown): value is Row =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const isAmount = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

const hasNumbers = (row: Row) =>
  isAmount(row.kcal) && isAmount(row.proteinG) && isAmount(row.carbsG) && isAmount(row.fatG) && isAmount(row.costInr);
const isItem = (row: unknown) =>
  isObject(row) && isText(row.id) && isText(row.name) && isText(row.time) && hasNumbers(row);

function keepValid<T>(value: unknown, valid: (row: Row) => boolean): T[] {
  return Array.isArray(value) ? (value.filter((row) => isObject(row) && valid(row)) as T[]) : [];
}

function validConfig(value: unknown): MealScheduleConfig | undefined {
  return isObject(value) && isText(value.startDate) && isText(value.endDate) && isObject(value.weekly)
    ? (value as unknown as MealScheduleConfig)
    : undefined;
}

function validSettings(value: unknown): DietSettings | undefined {
  if (!isObject(value)) {
    return undefined;
  }
  const settings: DietSettings = {};
  if (isAmount(value.kcalTarget)) {
    settings.kcalTarget = value.kcalTarget;
  }
  if (isAmount(value.proteinTargetG)) {
    settings.proteinTargetG = value.proteinTargetG;
  }
  if (isAmount(value.carbsTargetG)) {
    settings.carbsTargetG = value.carbsTargetG;
  }
  if (isAmount(value.fatTargetG)) {
    settings.fatTargetG = value.fatTargetG;
  }
  if (isAmount(value.leanGoalKg)) {
    settings.leanGoalKg = value.leanGoalKg;
  }
  if (isAmount(value.bodyFatGoalPercent)) {
    settings.bodyFatGoalPercent = value.bodyFatGoalPercent;
  }
  return settings;
}

export interface ParsedDietBackup {
  state: DietIncoming;
  counts: Record<string, number>;
}

/** Undefined when the value holds no diet data, which is a normal file, not an error. */
export function parseDietBackup(raw: unknown): ParsedDietBackup | undefined {
  if (!isObject(raw)) {
    return undefined;
  }
  const state: DietIncoming = {
    meals: keepValid<Meal>(raw.meals, (row) => isText(row.id) && isText(row.name) && hasNumbers(row)),
    mealPlans: keepValid<MealPlan>(
      raw.mealPlans,
      (row) => isText(row.id) && isText(row.name) && Array.isArray(row.items) && row.items.every(isItem)
    ),
    scheduledMealDays: keepValid<ScheduledMealDay>(
      raw.scheduledMealDays,
      (row) => isText(row.id) && isText(row.date) && Array.isArray(row.items) && row.items.every(isItem)
    ),
    mealScheduleConfig: validConfig(raw.mealScheduleConfig),
    settings: validSettings(raw.settings)
  };
  const counts = {
    meals: state.meals.length,
    "meal plans": state.mealPlans.length,
    "meal days": state.scheduledMealDays.length
  };
  return Object.values(counts).some((count) => count > 0) || state.settings ? { state, counts } : undefined;
}

/** The `diet` part of a whole backup file's text. A file that is not JSON has no diet part. */
export function parseDietBackupText(text: string): ParsedDietBackup | undefined {
  try {
    const decoded: unknown = JSON.parse(text);
    return isObject(decoded) ? parseDietBackup(decoded.diet) : undefined;
  } catch {
    return undefined;
  }
}

/** "3 meals and 1 meal plan" for the guest question. */
export function describeDietCounts(state: DietIncoming): string {
  const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
  const parts = [
    state.meals.length ? plural(state.meals.length, "meal") : "",
    state.mealPlans.length ? plural(state.mealPlans.length, "meal plan") : ""
  ].filter(Boolean);
  return parts.join(" and ");
}

export function hasDietData(state: Pick<DietData, "meals" | "mealPlans" | "scheduledMealDays">): boolean {
  return state.meals.length + state.mealPlans.length + state.scheduledMealDays.length > 0;
}

/**
 * Supabase read and write for the diet store — the twin of lib/sync.ts, with
 * its own tables (migration 0014). It borrows only generic helpers from there.
 *
 * A project that has not run 0014 keeps working: diet stays on the device and
 * every workout table syncs as before, because nothing here shares a write
 * with them. The next save after the migration sends it all.
 */
import { parseDietBackup } from "@/lib/diet-backup";
import type {
  DietData,
  DietIncoming,
  DietSettings,
  Meal,
  MealPlan,
  MealScheduleConfig,
  ScheduledMealDay
} from "@/lib/diet-types";
import { supabase } from "@/lib/supabase";
import { diffRows, isMissingTable } from "@/lib/sync";

type Row = Record<string, unknown>;

const DIET_TABLES = ["scheduled_meal_days", "meal_plans", "meals", "diet_settings"] as const;

// -- mappers ----------------------------------------------------------------

export function mealToRow(meal: Meal, userId: string): Row {
  return {
    id: meal.id,
    user_id: userId,
    name: meal.name,
    kcal: meal.kcal,
    protein_g: meal.proteinG,
    carbs_g: meal.carbsG,
    fat_g: meal.fatG,
    cost_inr: meal.costInr,
    food_id: meal.foodId ?? null,
    grams: meal.grams ?? null,
    ingredients: meal.ingredients ?? null,
    micros: meal.micros ?? null
  };
}

export function rowToMeal(row: Row): Meal {
  return {
    id: row.id as string,
    name: row.name as string,
    kcal: Number(row.kcal ?? 0),
    proteinG: Number(row.protein_g ?? 0),
    carbsG: Number(row.carbs_g ?? 0),
    fatG: Number(row.fat_g ?? 0),
    costInr: Number(row.cost_inr ?? 0),
    foodId: (row.food_id as string) ?? undefined,
    grams: row.grams === null || row.grams === undefined ? undefined : Number(row.grams),
    ...(row.ingredients ? { ingredients: row.ingredients as Meal["ingredients"] } : {}),
    ...(row.micros ? { micros: row.micros as Meal["micros"] } : {})
  };
}

export function mealPlanToRow(plan: MealPlan, userId: string): Row {
  return { id: plan.id, user_id: userId, name: plan.name, items: plan.items, summary: plan.summary };
}

export function rowToMealPlan(row: Row): MealPlan {
  return {
    id: row.id as string,
    name: row.name as string,
    items: (row.items as MealPlan["items"]) ?? [],
    summary: row.summary as MealPlan["summary"]
  };
}

export function mealDayToRow(day: ScheduledMealDay, userId: string): Row {
  return {
    id: day.id,
    user_id: userId,
    date: day.date,
    meal_plan_id: day.mealPlanId ?? null,
    plan_name: day.planName,
    items: day.items,
    source: day.source
  };
}

export function rowToMealDay(row: Row): ScheduledMealDay {
  return {
    id: row.id as string,
    date: row.date as string,
    mealPlanId: (row.meal_plan_id as string) ?? undefined,
    planName: (row.plan_name as string) ?? "",
    items: (row.items as ScheduledMealDay["items"]) ?? [],
    source: row.source === "manual" ? "manual" : "repeat"
  };
}

export function settingsFromRow(row: Row): DietSettings {
  const settings: DietSettings = {};
  const read = (value: unknown) => (value === null || value === undefined ? undefined : Number(value));
  const entries: [keyof DietSettings, unknown][] = [
    ["kcalTarget", row.kcal_target],
    ["proteinTargetG", row.protein_target_g],
    ["carbsTargetG", row.carbs_target_g],
    ["fatTargetG", row.fat_target_g],
    ["leanGoalKg", row.lean_goal_kg],
    ["bodyFatGoalPercent", row.body_fat_goal_percent]
  ];
  entries.forEach(([key, value]) => {
    const number = read(value);
    if (number !== undefined) {
      settings[key] = number;
    }
  });
  return settings;
}

// -- read -------------------------------------------------------------------

export interface RemoteDiet extends DietIncoming {
  /** The account's "delete all my data" stamp, so another device's request is seen. */
  deletionRequestedAt?: string;
}

export const EMPTY_DIET: DietData = { meals: [], mealPlans: [], scheduledMealDays: [], settings: {} };

/** A missing table reads as empty: the migration has not run yet. Anything else throws. */
export async function loadDietState(userId: string): Promise<RemoteDiet> {
  if (!supabase) {
    return { ...EMPTY_DIET };
  }
  const [meals, plans, days, settings, profile] = await Promise.all([
    supabase.from("meals").select("*"),
    supabase.from("meal_plans").select("*"),
    supabase.from("scheduled_meal_days").select("*").order("date"),
    supabase.from("diet_settings").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("profiles").select("deletion_requested_at").eq("id", userId).maybeSingle()
  ]);
  for (const result of [meals, plans, days, settings]) {
    if (result.error && !isMissingTable(result.error)) {
      throw result.error;
    }
  }
  const settingsRow = settings.error ? null : (settings.data as Row | null);
  return {
    meals: ((meals.data as Row[] | null) ?? []).map(rowToMeal),
    mealPlans: ((plans.data as Row[] | null) ?? []).map(rowToMealPlan),
    scheduledMealDays: ((days.data as Row[] | null) ?? []).map(rowToMealDay),
    mealScheduleConfig: (settingsRow?.schedule_config as MealScheduleConfig | null) ?? undefined,
    settings: settingsRow ? settingsFromRow(settingsRow) : undefined,
    // A project before 0008 has no such column, which simply means no request.
    deletionRequestedAt: profile.error
      ? undefined
      : ((profile.data as Row | null)?.deletion_requested_at as string | null) ?? undefined
  };
}

/** What the account is known to hold, as the diff base. */
export function dietBaseline(remote: DietIncoming): DietData {
  return { ...remote, settings: remote.settings ?? EMPTY_DIET.settings };
}

/** Just the data, same objects, so the diff can compare by reference. */
export function dietSnapshot(state: DietData): DietData {
  return {
    meals: state.meals,
    mealPlans: state.mealPlans,
    scheduledMealDays: state.scheduledMealDays,
    mealScheduleConfig: state.mealScheduleConfig,
    settings: state.settings
  };
}

// -- write ------------------------------------------------------------------

async function writeTable<T extends { id: string }>(
  table: "meals" | "meal_plans" | "scheduled_meal_days",
  previous: T[],
  next: T[],
  toRow: (item: T) => Row,
  onConflict: string
) {
  if (!supabase) {
    return;
  }
  const { upserts, deletedIds } = diffRows(previous, next);
  if (deletedIds.length > 0) {
    const { error } = await supabase.from(table).delete().in("id", deletedIds);
    if (error) {
      throw error;
    }
  }
  if (upserts.length > 0) {
    const rows = upserts.map(toRow);
    const { error } = await supabase.from(table).upsert(rows, { onConflict });
    if (error && (error.code === "42703" || error.code === "PGRST204") && /ingredients|micros/.test(error.message ?? "")) {
      // A project before 0015. The meal still syncs; its foods wait on the device.
      const { error: retry } = await supabase
        .from(table)
        .upsert(rows.map(({ ingredients: _ingredients, micros: _micros, ...row }) => row), { onConflict });
      if (retry) {
        throw retry;
      }
    } else if (error) {
      throw error;
    }
  }
}

/** Throws on the first failed write, including a missing table: the caller decides what that means. */
export async function pushDietChanges(userId: string, previous: DietData, next: DietData): Promise<void> {
  if (!supabase) {
    return;
  }
  await writeTable("meals", previous.meals, next.meals, (item) => mealToRow(item, userId), "user_id,id");
  await writeTable("meal_plans", previous.mealPlans, next.mealPlans, (item) => mealPlanToRow(item, userId), "user_id,id");
  // One day per date: on the date, so two offline devices cannot break the push.
  await writeTable(
    "scheduled_meal_days",
    previous.scheduledMealDays,
    next.scheduledMealDays,
    (item) => mealDayToRow(item, userId),
    "user_id,date"
  );
  if (previous.settings !== next.settings || previous.mealScheduleConfig !== next.mealScheduleConfig) {
    const row = {
      user_id: userId,
      kcal_target: next.settings.kcalTarget ?? null,
      protein_target_g: next.settings.proteinTargetG ?? null,
      carbs_target_g: next.settings.carbsTargetG ?? null,
      fat_target_g: next.settings.fatTargetG ?? null,
      schedule_config: next.mealScheduleConfig ?? null
    };
    const body = { lean_goal_kg: next.settings.leanGoalKg ?? null, body_fat_goal_percent: next.settings.bodyFatGoalPercent ?? null };
    const { error } = await supabase.from("diet_settings").upsert({ ...row, ...body });
    if (error && (error.code === "42703" || error.code === "PGRST204") && /lean_goal_kg|body_fat_goal_percent/.test(error.message ?? "")) {
      // A project before 0015. The targets still sync; the body goal waits on the device.
      const { error: retry } = await supabase.from("diet_settings").upsert(row);
      if (retry) {
        throw retry;
      }
    } else if (error) {
      throw error;
    }
  }
}

// -- delete all my data -----------------------------------------------------

/** Every diet row this user owns. A project before 0014 has nothing to delete. */
export async function clearDietRows(userId: string): Promise<void> {
  if (!supabase) {
    return;
  }
  for (const table of DIET_TABLES) {
    const { error } = await supabase.from(table).delete().eq("user_id", userId);
    if (error && !isMissingTable(error)) {
      throw error;
    }
  }
}

/** The diet part of the archive, or nothing when it holds none. */
export async function loadDietArchive(userId: string): Promise<DietIncoming | undefined> {
  if (!supabase) {
    return undefined;
  }
  const { data, error } = await supabase.from("data_archives").select("payload").eq("user_id", userId).maybeSingle();
  if (error) {
    throw error;
  }
  const payload = data?.payload as { diet?: unknown } | undefined;
  return parseDietBackup(payload?.diet)?.state;
}

/** Make the account's diet match this phone exactly. Runs before the archive is let go. */
export async function restoreDietToAccount(userId: string, restored: DietData): Promise<void> {
  try {
    await clearDietRows(userId);
    await pushDietChanges(userId, { ...EMPTY_DIET, settings: {} }, restored);
  } catch (error) {
    if (!isMissingTable(error as { code?: string })) {
      throw error;
    }
  }
}

/**
 * The diet model. Deliberately its own file, store and tables: a meal is not
 * training and must never reach the volume, strength or muscle aggregations.
 * Every shape below is the twin of a workout shape, so the screens can copy
 * their workout counterparts one for one.
 */

/** Micronutrients, for one meal or food. Absent on a whole meal means unknown, never zero. */
export interface Micros {
  ironMg: number;
  calciumMg: number;
  magnesiumMg: number;
  zincMg: number;
  potassiumMg: number;
  sodiumMg: number;
  vitaminCMg: number;
  vitaminDUg: number;
  vitaminAUg: number;
  folateUg: number;
  thiamineMg: number;
  riboflavinMg: number;
  fiberG: number;
}

/** One food in a meal, at a weight, with its numbers worked out at that weight. */
export interface MealIngredient {
  foodId: string;
  name: string;
  grams: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  micros: Micros;
}

/** A reusable meal — the twin of WorkoutTemplate. Values are for one serving. */
export interface Meal {
  id: string;
  name: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** Rupees for one serving. Always typed by hand: no library knows prices. */
  costInr: number;
  /** The library food this was made from (public/foods.json), if any. */
  foodId?: string;
  /** The weight picked when it came from the library. */
  grams?: number;
  /** The foods it was built from. Absent on a meal typed by hand. */
  ingredients?: MealIngredient[];
  /** Summed from the ingredients. Absent means unknown. */
  micros?: Micros;
}

export interface MealTotals {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  costInr: number;
}

/**
 * One meal inside a plan — the twin of SessionTemplateExercise. The numbers
 * are copied at build time, so editing a meal later never rewrites a plan
 * (or a day already eaten) behind the user's back.
 */
export interface MealPlanItem extends MealTotals {
  id: string;
  mealId: string;
  name: string;
  /** "HH:MM", 24-hour. The order on Today. */
  time: string;
  /** Copied with the other numbers. Absent means unknown. */
  micros?: Micros;
}

/** A day of eating — the twin of SessionTemplate. */
export interface MealPlan {
  id: string;
  name: string;
  items: MealPlanItem[];
  summary: MealTotals;
}

export type MealStatus = "pending" | "eaten" | "skipped";

/** One meal on one day — the twin of a PlannedSet with its `completed` flag. */
export interface PlannedMeal extends Omit<MealPlanItem, "mealId"> {
  /** Absent on an extra typed on the day. */
  mealId?: string;
  status: MealStatus;
  /** When it was first ticked (ISO). Kept on later corrections. */
  eatenAt?: string;
  /** Added on the day, not from the plan. */
  extra?: boolean;
}

/**
 * A day on the diet calendar — the twin of ScheduledSession. There is no
 * separate log: the items carry their status, and Progress reads eaten items
 * straight off the days.
 */
export interface ScheduledMealDay {
  id: string;
  date: string; // YYYY-MM-DD
  mealPlanId?: string;
  planName: string;
  items: PlannedMeal[];
  source: "manual" | "repeat";
}

/** The twin of ScheduleConfig, weekly only. "Same every day" fills all seven. */
export interface MealScheduleConfig {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  /** weekday 0-6 → mealPlanId. A weekday with no entry gets no day. */
  weekly: Record<number, string>;
}

/** Typed on the You tab; not part of ProfileInfo on purpose. */
export interface DietSettings {
  kcalTarget?: number;
  proteinTargetG?: number;
  carbsTargetG?: number;
  fatTargetG?: number;
  /** The lean mass being aimed at, kg. Lean mass is everything except fat. */
  leanGoalKg?: number;
  bodyFatGoalPercent?: number;
}

/** Everything a person owns in diet: one saved copy, one backup, one merge. */
export interface DietData {
  meals: Meal[];
  mealPlans: MealPlan[];
  scheduledMealDays: ScheduledMealDay[];
  mealScheduleConfig?: MealScheduleConfig;
  settings: DietSettings;
}

/**
 * What arrives from the account, a backup or the guest copy. `settings` is
 * optional because absent means "leave the device's alone", not "clear them".
 */
export type DietIncoming = Omit<DietData, "settings"> & { settings?: DietSettings };

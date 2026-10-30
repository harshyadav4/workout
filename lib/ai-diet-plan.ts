/**
 * The reply an outside assistant sends for "Build with AI" on the Diet side:
 * meal plans as JSON, checked and turned into store data. The twin of
 * lib/ai-plan.ts, sharing only its forgiving JSON finder. Pure, so it is tested.
 *
 * The pasted text is untrusted: every field is checked, and a bad one is an
 * error naming the field, so the user can send it back to the AI to fix.
 */
import { AiPlanError, extractJson } from "@/lib/ai-plan";
import type { Meal, MealPlan, MealPlanItem, MealScheduleConfig, Micros } from "@/lib/diet-types";
import { ingredientFromFood, sumMicros, type Food } from "@/lib/foods";
import { normalizePlan } from "@/lib/meal-schedule";

export const AI_DIET_VERSION = "meals/v1";

const MAX_PLANS = 7;
const MAX_ITEMS = 12;
const MAX_NAME = 80;
const SCHEDULE_WEEKS = 8;
const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export interface AiDietItem {
  name: string;
  time: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  cost: number;
  /** Foods by their exact library name, which is what gives a meal its micronutrients. */
  ingredients?: { food: string; grams: number }[];
}

export interface AiDietPlan {
  plans: { name: string; items: AiDietItem[] }[];
  schedule?: { everyDay?: string; days?: Record<string, string> };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function amount(value: unknown, path: string, fallback?: number): number {
  if (value === undefined && fallback !== undefined) {
    return fallback;
  }
  const number = typeof value === "string" ? Number(value) : value;
  if (typeof number !== "number" || !Number.isFinite(number) || number < 0) {
    throw new AiPlanError(`${path} must be a number, 0 or more.`);
  }
  return number;
}

function text(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new AiPlanError(`${path} needs a name.`);
  }
  if (value.length > MAX_NAME) {
    throw new AiPlanError(`${path} is too long. Keep it under ${MAX_NAME} characters.`);
  }
  return value.trim();
}

/** "9:00" and "09:00" are both fine; the store keeps the padded form, which is what sorts. */
function clockTime(value: unknown, path: string): string {
  const match = typeof value === "string" ? /^(\d{1,2}):(\d{2})$/.exec(value.trim()) : null;
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) {
    throw new AiPlanError(`${path} must be a 24-hour time like "09:00".`);
  }
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

export function parseAiDietPlan(input: string): AiDietPlan {
  const raw = extractJson(input);
  if (!isRecord(raw)) {
    throw new AiPlanError("The answer must be one JSON object.");
  }
  if (!Array.isArray(raw.plans) || raw.plans.length === 0) {
    throw new AiPlanError("The answer has no meal plans. It needs a \"plans\" list.");
  }
  if (raw.plans.length > MAX_PLANS) {
    throw new AiPlanError(`The answer has ${raw.plans.length} plans. Keep it to ${MAX_PLANS}.`);
  }

  const seen = new Set<string>();
  const plans = raw.plans.map((plan: unknown, planIndex: number) => {
    const path = `Plan ${planIndex + 1}`;
    if (!isRecord(plan)) {
      throw new AiPlanError(`${path} is not an object.`);
    }
    const name = text(plan.name, path);
    if (seen.has(name.toLowerCase())) {
      throw new AiPlanError(`Two plans are called "${name}". Each plan needs its own name.`);
    }
    seen.add(name.toLowerCase());
    if (!Array.isArray(plan.items) || plan.items.length === 0) {
      throw new AiPlanError(`"${name}" has no meals.`);
    }
    if (plan.items.length > MAX_ITEMS) {
      throw new AiPlanError(`"${name}" has ${plan.items.length} meals. Keep it to ${MAX_ITEMS}.`);
    }
    return {
      name,
      items: plan.items.map((item: unknown, itemIndex: number) => {
        const itemPath = `"${name}" meal ${itemIndex + 1}`;
        if (!isRecord(item)) {
          throw new AiPlanError(`${itemPath} is not an object.`);
        }
        return {
          name: text(item.name, itemPath),
          time: clockTime(item.time, `${itemPath} time`),
          kcal: amount(item.kcal, `${itemPath} kcal`),
          protein: amount(item.protein, `${itemPath} protein`),
          carbs: amount(item.carbs, `${itemPath} carbs`),
          fat: amount(item.fat, `${itemPath} fat`),
          // The one number an AI cannot know: it may be left out.
          cost: amount(item.cost, `${itemPath} cost`, 0),
          ingredients: Array.isArray(item.ingredients)
            ? item.ingredients.flatMap((entry: unknown) =>
                isRecord(entry) && typeof entry.food === "string" && Number(entry.grams) > 0
                  ? [{ food: entry.food, grams: Number(entry.grams) }]
                  : []
              )
            : undefined
        };
      })
    };
  });

  const known = (name: unknown, path: string) => {
    if (typeof name !== "string" || !seen.has(name.trim().toLowerCase())) {
      throw new AiPlanError(`${path} names a plan that is not in the answer: "${String(name)}".`);
    }
    return name.trim();
  };
  let schedule: AiDietPlan["schedule"];
  if (isRecord(raw.schedule)) {
    const days = isRecord(raw.schedule.days)
      ? Object.fromEntries(
          Object.entries(raw.schedule.days).map(([day, name]) => {
            const key = day.trim().toLowerCase().slice(0, 3);
            if (!WEEKDAYS.includes(key)) {
              throw new AiPlanError(`"${day}" is not a weekday. Use mon, tue, wed, thu, fri, sat, sun.`);
            }
            return [key, known(name, `The schedule for ${day}`)];
          })
        )
      : undefined;
    const everyDay = raw.schedule.everyDay === undefined ? undefined : known(raw.schedule.everyDay, "The schedule");
    if (everyDay || (days && Object.keys(days).length > 0)) {
      schedule = { everyDay, days };
    }
  }
  return { plans, schedule };
}

function addDays(key: string, days: number): string {
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export interface DietImport {
  meals: Meal[];
  mealPlans: MealPlan[];
  mealScheduleConfig?: MealScheduleConfig;
}

/**
 * Micronutrients only when every food matches the library exactly. A meal with
 * one food the library does not know stays unknown: part of a meal's iron would
 * read as a low number, which is worse than no number.
 */
function microsFrom(item: AiDietItem, foods: ReadonlyMap<string, Food>): Micros | undefined {
  if (!item.ingredients || item.ingredients.length === 0) {
    return undefined;
  }
  const matched = item.ingredients.map((entry) => {
    const food = foods.get(entry.food.trim().toLowerCase());
    return food ? ingredientFromFood(food, entry.grams).micros : undefined;
  });
  return matched.every((micros): micros is Micros => micros !== undefined) ? sumMicros(matched) : undefined;
}

/** Store data from a checked plan. One meal per name, however many plans use it. */
export function buildDietImport(plan: AiDietPlan, today: string, library: readonly Food[] = []): DietImport {
  const foods = new Map(library.map((food) => [food.name.toLowerCase(), food]));
  const meals = new Map<string, Meal>();
  const planIds = new Map<string, string>();
  const mealPlans = plan.plans.map((source) => {
    const items: MealPlanItem[] = source.items.map((item) => {
      const key = item.name.toLowerCase();
      const micros = microsFrom(item, foods);
      const meal = meals.get(key) ?? {
        id: crypto.randomUUID(),
        name: item.name,
        kcal: item.kcal,
        proteinG: item.protein,
        carbsG: item.carbs,
        fatG: item.fat,
        costInr: item.cost,
        ...(micros ? { micros } : {})
      };
      meals.set(key, meal);
      return {
        id: crypto.randomUUID(),
        mealId: meal.id,
        name: item.name,
        time: item.time,
        kcal: item.kcal,
        proteinG: item.protein,
        carbsG: item.carbs,
        fatG: item.fat,
        costInr: item.cost,
        ...(micros ? { micros } : {})
      };
    });
    const id = crypto.randomUUID();
    planIds.set(source.name.toLowerCase(), id);
    return normalizePlan({ id, name: source.name, items, summary: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, costInr: 0 } });
  });

  let mealScheduleConfig: MealScheduleConfig | undefined;
  if (plan.schedule) {
    const weekly: Record<number, string> = {};
    const idOf = (name: string) => planIds.get(name.toLowerCase()) as string;
    if (plan.schedule.everyDay) {
      WEEKDAYS.forEach((_, day) => {
        weekly[day] = idOf(plan.schedule?.everyDay as string);
      });
    }
    Object.entries(plan.schedule.days ?? {}).forEach(([day, name]) => {
      weekly[WEEKDAYS.indexOf(day)] = idOf(name);
    });
    mealScheduleConfig = { startDate: today, endDate: addDays(today, SCHEDULE_WEEKS * 7 - 1), weekly };
  }
  return { meals: [...meals.values()], mealPlans, mealScheduleConfig };
}

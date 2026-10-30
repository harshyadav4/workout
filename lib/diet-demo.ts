/**
 * The tour's sample diet: Alex's meals, two plans and 26 weeks of real-looking
 * ticks, the same span as the sample's training (DEMO_WEEKS in lib/demo-data), so the Diet screens have something to show. Fixed, not random: the same
 * tour every time, built from `today` so it always ends on the day it is opened.
 */
import { DEMO_FOODS } from "@/lib/diet-demo-foods";
import type { DietData, Meal, MealPlan, MealStatus, PlannedMeal, ScheduledMealDay } from "@/lib/diet-types";
import { ingredientFromFood, totalsFromIngredients } from "@/lib/foods";
import { itemFromMeal, normalizePlan } from "@/lib/meal-schedule";

const PAST_DAYS = 26 * 7;
const FUTURE_DAYS = 14;

/** A sample meal, built the way a real one is: foods at a weight, added up by the same code. */
function meal(id: string, name: string, costInr: number, foods: [keyof typeof DEMO_FOODS, number][]): Meal {
  const ingredients = foods.map(([foodId, grams]) => ingredientFromFood(DEMO_FOODS[foodId], grams));
  return { id, name, costInr, ingredients, ...totalsFromIngredients(ingredients) };
}

// Sized for the sample's Alex: about 79 kg, training hard, and burning about 2,700 kcal.
const MEALS: Meal[] = [
  meal("demo-poha", "Poha, 2 eggs and milk", 75, [["A011", 80], ["M001", 100], ["L002", 250], ["T006", 5]]),
  meal("demo-eggs", "4 eggs, 2 roti and guava", 75, [["M001", 200], ["A019", 60], ["E028", 150], ["T006", 5]]),
  meal("demo-dal", "Dal, rice and spinach", 90, [["B021", 90], ["A015", 110], ["C033", 150], ["D076", 100], ["T006", 10]]),
  meal("demo-chicken", "Chicken curry and 3 roti", 150, [["N003", 280], ["A019", 90], ["G017", 100], ["D076", 100], ["T006", 10]]),
  meal("demo-snack", "Milk, banana and roasted chana", 60, [["L002", 300], ["E012", 120], ["B001", 50]]),
  meal("demo-paneer", "Paneer, moong and 2 roti", 120, [["L003", 140], ["B010", 50], ["A019", 60], ["C033", 100], ["T006", 5]])
];

const byId = (id: string) => MEALS.find((item) => item.id === id) as Meal;

function plan(id: string, name: string, items: [string, string][]): MealPlan {
  return normalizePlan({
    id,
    name,
    // Fixed ids: the same plan item is the same meal on every day of the sample.
    items: items.map(([mealId, time]) => ({ ...itemFromMeal(byId(mealId), time), id: `${id}-${mealId}` })),
    summary: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, costInr: 0 }
  });
}

const TRAINING = plan("demo-plan-training", "Training day", [
  ["demo-eggs", "08:30"],
  ["demo-dal", "13:30"],
  ["demo-snack", "17:30"],
  ["demo-chicken", "20:30"]
]);
const REST = plan("demo-plan-rest", "Rest day", [
  ["demo-poha", "09:00"],
  ["demo-dal", "13:30"],
  ["demo-snack", "17:30"],
  ["demo-paneer", "20:30"]
]);

function addDays(key: string, days: number): string {
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dayOf(date: string, index: number, today: string): ScheduledMealDay {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const source = weekday === 0 || weekday === 3 || weekday === 6 ? REST : TRAINING;
  const items: PlannedMeal[] = source.items.map((item, position) => {
    let status: MealStatus = "eaten";
    if (date > today) {
      status = "pending";
    } else if (date === today) {
      status = position === 0 ? "eaten" : "pending";
    } else if ((index + position) % 11 === 0) {
      status = "skipped";
    } else if ((index * 3 + position) % 17 === 0) {
      status = "pending"; // forgot to tick
    }
    return {
      id: item.id,
      mealId: item.mealId,
      name: item.name,
      time: item.time,
      kcal: item.kcal,
      proteinG: item.proteinG,
      carbsG: item.carbsG,
      fatG: item.fatG,
      costInr: item.costInr,
      micros: item.micros,
      status,
      ...(status === "eaten" ? { eatenAt: `${date}T${item.time}:00.000Z` } : {})
    };
  });
  if (date < today && index % 9 === 4) {
    items.push({
      id: `demo-extra-${date}`,
      name: "Samosa and chai",
      time: "17:00",
      kcal: 320,
      proteinG: 6,
      carbsG: 38,
      fatG: 16,
      costInr: 35,
      status: "eaten",
      eatenAt: `${date}T17:00:00.000Z`,
      extra: true
    });
  }
  return { id: `demo-day-${date}`, date, mealPlanId: source.id, planName: source.name, items, source: "repeat" };
}

export function buildDemoDiet(today: string): DietData {
  const scheduledMealDays: ScheduledMealDay[] = [];
  for (let index = -PAST_DAYS; index <= FUTURE_DAYS; index += 1) {
    scheduledMealDays.push(dayOf(addDays(today, index), index + PAST_DAYS, today));
  }
  return {
    meals: MEALS,
    mealPlans: [TRAINING, REST],
    scheduledMealDays,
    mealScheduleConfig: {
      startDate: today,
      endDate: addDays(today, FUTURE_DAYS),
      weekly: {
        0: REST.id,
        1: TRAINING.id,
        2: TRAINING.id,
        3: REST.id,
        4: TRAINING.id,
        5: TRAINING.id,
        6: REST.id
      }
    },
    settings: { kcalTarget: 2450, proteinTargetG: 135, carbsTargetG: 300, fatTargetG: 75, leanGoalKg: 70, bodyFatGoalPercent: 12 }
  };
}

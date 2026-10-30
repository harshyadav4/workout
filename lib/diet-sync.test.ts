// Run with: npm run check
import assert from "node:assert/strict";

import { dietBaseline, mealDayToRow, mealPlanToRow, mealToRow, rowToMeal, rowToMealDay, rowToMealPlan, settingsFromRow } from "@/lib/diet-sync";
import type { Meal, MealPlan, ScheduledMealDay } from "@/lib/diet-types";

const nums = { kcal: 100, proteinG: 1.5, carbsG: 2, fatG: 3, costInr: 4.5 };
const meal: Meal = { id: "m", name: "Oats", ...nums, foodId: "A001", grams: 80 };
assert.deepEqual(rowToMeal(mealToRow(meal, "u")), meal, "a meal round-trips");
assert.equal(mealToRow(meal, "u").user_id, "u");
assert.deepEqual(rowToMeal({ ...mealToRow({ id: "t", name: "Typed", ...nums }, "u"), kcal: "100" }).kcal, 100, "numeric columns arrive as text and leave as numbers");
const built: Meal = { ...meal, micros: { ironMg: 1 } as Meal["micros"], ingredients: [] };
assert.deepEqual(rowToMeal(mealToRow(built, "u")).micros, built.micros, "micronutrients round-trip");
assert.deepEqual(rowToMeal(mealToRow(built, "u")).ingredients, [], "and so do the foods");
assert.equal(mealToRow(meal, "u").micros, null, "a typed meal writes null, which reads back as unknown");
const typed = rowToMeal(mealToRow({ id: "t", name: "Typed", ...nums }, "u"));
assert.equal(typed.foodId, undefined, "null reads as absent");
assert.equal(typed.grams, undefined);

const plan: MealPlan = { id: "p", name: "P", items: [{ id: "i", mealId: "m", name: "Oats", time: "09:00", ...nums }], summary: nums };
assert.deepEqual(rowToMealPlan(mealPlanToRow(plan, "u")), plan);

const day: ScheduledMealDay = { id: "d", date: "2026-11-02", mealPlanId: "p", planName: "P", items: [{ id: "i", name: "Oats", time: "09:00", ...nums, status: "eaten", eatenAt: "x" }], source: "manual" };
assert.deepEqual(rowToMealDay(mealDayToRow(day, "u")), day);
const unlinked = rowToMealDay(mealDayToRow({ ...day, mealPlanId: undefined }, "u"));
assert.equal(unlinked.mealPlanId, undefined, "a day with no plan writes null and reads as absent");

const remote = { meals: [meal], mealPlans: [], scheduledMealDays: [] };
assert.equal(dietBaseline(remote).meals[0], meal, "the base keeps identity, so an unchanged row is not pushed again");
assert.deepEqual(dietBaseline(remote).settings, {}, "no settings row reads as empty");

assert.deepEqual(
  settingsFromRow({ kcal_target: "2100", protein_target_g: 125, carbs_target_g: "240", fat_target_g: 60 }),
  { kcalTarget: 2100, proteinTargetG: 125, carbsTargetG: 240, fatTargetG: 60 },
  "all four targets read back as numbers"
);
assert.deepEqual(settingsFromRow({ kcal_target: null, fat_target_g: null }), {}, "null is no target, not zero");
assert.deepEqual(settingsFromRow({ lean_goal_kg: "70", body_fat_goal_percent: 12 }), { leanGoalKg: 70, bodyFatGoalPercent: 12 }, "the body goal reads back");

console.log("diet sync checks passed");

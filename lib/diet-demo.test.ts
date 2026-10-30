// Run with: npm run check
import assert from "node:assert/strict";

import { readFileSync } from "node:fs";

import { parseDietBackup } from "@/lib/diet-backup";
import { DEMO_FOODS } from "@/lib/diet-demo-foods";
import { totalsFromIngredients, type Food } from "@/lib/foods";
import { buildDemoDiet } from "@/lib/diet-demo";
import { averageIntake, dailyIntake, fuelVsWeight } from "@/lib/diet-metrics";

const today = "2026-11-02";
const demo = buildDemoDiet(today);

assert.equal(demo.meals.length, 6);
assert.equal(demo.mealPlans.length, 2);
assert.ok(demo.mealPlans.every((plan) => plan.summary.kcal > 0), "plans carry their sums");
assert.equal(new Set(demo.scheduledMealDays.map((day) => day.date)).size, demo.scheduledMealDays.length, "one day per date");

const planned = (day: (typeof demo.scheduledMealDays)[number]) => day.items.filter((item) => !item.extra);
assert.ok(
  demo.scheduledMealDays.every((day) => {
    const plan = demo.mealPlans.find((item) => item.id === day.mealPlanId);
    return plan && planned(day).length === plan.items.length && planned(day).every((item) => plan.items.some((source) => source.id === item.id));
  }),
  "every day's meals are its plan's"
);

const todayDay = demo.scheduledMealDays.find((day) => day.date === today);
assert.equal(todayDay?.items[0].status, "eaten", "today is under way");
assert.equal(todayDay?.items[1].status, "pending");
assert.ok(demo.scheduledMealDays.filter((day) => day.date > today).every((day) => day.items.every((item) => item.status === "pending")), "the future is untouched");
assert.ok(demo.scheduledMealDays.flatMap((day) => day.items).some((item) => item.status === "skipped"), "a skip to show");

const intake = dailyIntake(demo.scheduledMealDays, { start: "2026-01-01", end: today });
const eatsPerDay = averageIntake(intake);
assert.ok(eatsPerDay.kcal > 2200 && eatsPerDay.kcal < 2700, `a hard-training lifter's calories, not a crash diet: ${eatsPerDay.kcal}`);
assert.ok(eatsPerDay.proteinG / 79 >= 1.6, `protein in the range the Science tab recommends: ${eatsPerDay.proteinG} g`);
assert.ok(intake.length > 150, "as long as the sample's training");
assert.ok(fuelVsWeight(intake, [{ id: "a", date: intake[0].date, metric: "weight", value: 80 }, { id: "b", date: today, metric: "weight", value: 78 }]), "enough for the eight-week card");
assert.deepEqual(parseDietBackup(demo)?.state.mealPlans.length, 2, "the sample is valid data");
assert.equal(buildDemoDiet(today).scheduledMealDays[5].items[0].status, demo.scheduledMealDays[5].items[0].status, "the same sample every time");

// built the way a real meal is, from real rows of the library
{
  const shipped = JSON.parse(readFileSync("public/foods.json", "utf8")) as Food[];
  Object.entries(DEMO_FOODS).forEach(([id, food]) => {
    assert.deepEqual(food, shipped.find((row) => row.id === id), `the sample's copy of ${food.name} matches the library`);
  });
  assert.ok(demo.meals.every((meal) => meal.ingredients && meal.ingredients.length >= 2), "every sample meal has its foods");
  demo.meals.forEach((meal) => {
    const totals = totalsFromIngredients(meal.ingredients ?? []);
    assert.equal(meal.kcal, totals.kcal, `${meal.name}: the numbers come from its foods`);
    assert.deepEqual(meal.micros, totals.micros);
    assert.ok(meal.costInr > 0);
  });
  assert.ok(demo.mealPlans.every((plan) => plan.items.every((item) => item.micros)), "plans carry micronutrients");
  assert.ok(demo.scheduledMealDays.flatMap((day) => day.items).some((item) => item.extra && !item.micros), "and an unknown meal, to show what that looks like");
  for (const key of ["kcalTarget", "proteinTargetG", "carbsTargetG", "fatTargetG", "leanGoalKg", "bodyFatGoalPercent"] as const) {
    assert.ok(demo.settings[key], `the sample sets ${key}`);
  }
}

console.log("diet demo checks passed");

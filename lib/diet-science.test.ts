// Run with: npm run check
import assert from "node:assert/strict";

import { dailyIntake } from "@/lib/diet-metrics";
import {
  buildCarbSplit,
  buildCoverage,
  buildEnergyAvailability,
  buildFatFloor,
  buildGoalPath,
  buildProteinDays,
  buildProteinMeals,
  buildProteinValue,
  buildRealMaintenance,
  buildWeekendGap,
  looksUnderLogged
} from "@/lib/diet-science";
import type { PlannedMeal, ScheduledMealDay } from "@/lib/diet-types";
import { KCAL_PER_KG, type SessionEnergy } from "@/lib/energy";
import { shiftKey } from "@/lib/progress-metrics";
import type { BodyMeasurement } from "@/lib/types";

const TODAY = "2026-11-30"; // a Monday
const ALL = { start: "2026-01-01", end: TODAY };

const meal = (patch: Partial<PlannedMeal> = {}): PlannedMeal => ({
  id: crypto.randomUUID(), name: "Dal", time: "13:00", kcal: 2000, proteinG: 120, carbsG: 250, fatG: 60, costInr: 200, status: "eaten", ...patch
});
const day = (date: string, items: PlannedMeal[] = [meal()]): ScheduledMealDay => ({ id: date, date, planName: "P", items, source: "repeat" });
/** A day for each of the last `count` days. */
const lastDays = (count: number, items?: () => PlannedMeal[]) =>
  Array.from({ length: count }, (_, index) => day(shiftKey(TODAY, -index), items?.()));
const weigh = (date: string, value: number): BodyMeasurement => ({ id: `w${date}`, date, metric: "weight", value });
/** Weekly weigh-ins ending today, moving by `perWeek`, ending at `end`. */
const trend = (weeks: number, end: number, perWeek: number) =>
  Array.from({ length: weeks + 1 }, (_, index) => weigh(shiftKey(TODAY, -index * 7), end - perWeek * index));

// -- coverage
assert.deepEqual(buildCoverage(lastDays(14), TODAY), { logged: 14, of: 28, share: 0.5 });
assert.equal(buildCoverage([day(shiftKey(TODAY, -60))], TODAY).logged, 0, "old days are not recent");

// -- maintenance from food and scale
{
  // Eating 2000, losing 0.5 kg a week: burning 2000 + 0.5 * 7700 / 7 = 2550.
  const real = buildRealMaintenance(lastDays(28), trend(4, 80, -0.5), TODAY);
  assert.equal(real?.kcal, 2550);
  assert.equal(real?.kgPerWeek, -0.5);
  assert.equal(buildRealMaintenance(lastDays(13), trend(4, 80, -0.5), TODAY), undefined, "too few logged days");
  assert.equal(buildRealMaintenance(lastDays(28), [weigh(TODAY, 80)], TODAY), undefined, "no trend");
  assert.equal(looksUnderLogged(1800, 2500), true);
  assert.equal(looksUnderLogged(2300, 2500), false);
  assert.equal(looksUnderLogged(1800, undefined), false, "nothing to compare with");
}

// -- the path to the target weight
{
  // Measured maintenance 2550, eating 2000, losing 0.5 kg a week, at 80 going to 76.
  const path = buildGoalPath({ days: lastDays(28), measurements: trend(8, 80, -0.5), goalKg: 76, today: TODAY });
  assert.ok(path);
  assert.equal(path.fromRoadmap, false);
  assert.equal(path.direction, "lose");
  assert.equal(path.maintenanceSource, "measured");
  assert.equal(path.foodKgPerWeek, -0.5, "the pace comes from what was eaten");
  assert.equal(path.status, "onPace");
  assert.equal(path.finishDate, shiftKey(TODAY, 56), "4 kg at 0.5 kg a week is 8 weeks");
  assert.equal(path.planFinishDate, shiftKey(TODAY, 70), "4 kg at the standard 0.4 kg a week is 10 weeks");
  assert.equal(path.neededKcal, 2550 - Math.round((0.4 * KCAL_PER_KG) / 7), "the standard pace is 0.5 % of 80 kg");
  assert.equal(path.gapKcal, 2000 - path.neededKcal);
  assert.equal(path.againstPlanKg, -0.6, "4 kg down against 3.36 planned (0.5 % of 84 kg, for 8 weeks): ahead");
  const first = path.rows[0];
  const last = path.rows[path.rows.length - 1];
  assert.equal(first.actual, 84, "history is on the chart");
  assert.equal(first.plan, 84, "the plan starts where the history starts");
  assert.ok(path.rows.some((row) => row.date === TODAY && row.actual === 80 && row.fromFood === 80), "the food line starts at today's weight");
  assert.ok(last.date >= shiftKey(TODAY, 56), "the chart reaches the goal");
  assert.ok(path.rows.every((row, index) => index === 0 || row.t > path.rows[index - 1].t), "time only moves forward");
  assert.ok(path.rows.every((row) => row.plan === undefined || row.plan >= 76), "the plan stops at the goal");
}
{
  const base = { goalKg: 76, today: TODAY };
  // No trend yet: the formula stands in, and says so.
  const formula = buildGoalPath({ ...base, days: lastDays(10), measurements: [weigh(TODAY, 80)], formulaMaintenance: 2500 });
  assert.equal(formula?.maintenanceSource, "formula");
  assert.equal(formula?.foodKgPerWeek, -0.45);
  assert.equal(formula?.againstPlanKg, undefined, "one weigh-in has no history to compare");

  const eating = (kcal: number) => lastDays(10, () => [meal({ kcal })]);
  const statusAt = (kcal: number, goalKg = 76) =>
    buildGoalPath({ ...base, goalKg, days: eating(kcal), measurements: [weigh(TODAY, 80)], formulaMaintenance: 2500 });
  assert.equal(statusAt(2500)?.status, "stalled", "eating maintenance goes nowhere");
  assert.equal(statusAt(2500)?.finishDate, undefined, "and never arrives");
  assert.equal(statusAt(2530)?.status, "stalled", "a small gain is holding, not moving away");
  assert.equal(statusAt(2800)?.status, "wrongWay", "eating well above maintenance on a cut");
  assert.equal(statusAt(2800)?.finishDate, undefined);
  assert.equal(statusAt(2300)?.status, "slow");
  assert.equal(statusAt(1500)?.status, "fast");
  assert.equal(statusAt(2100)?.status, "onPace");
  assert.equal(statusAt(2800, 84)?.direction, "gain");
  assert.equal(statusAt(2800, 84)?.status, "onPace", "the same food is right on a bulk");
  assert.ok((statusAt(2800, 84)?.neededKcal ?? 0) > 2500);
  assert.equal(statusAt(2500, 80)?.status, "atGoal");
  assert.equal(statusAt(3500, 80)?.status, "wrongWay", "drifting off a goal already reached");

  // the deficit never goes below resting
  const floored = buildGoalPath({ ...base, days: eating(1500), measurements: [weigh(TODAY, 80)], formulaMaintenance: 1800, restingKcal: 1700 });
  assert.equal(floored?.neededKcal, 1700);

  // what it needs
  assert.equal(buildGoalPath({ ...base, goalKg: undefined, days: eating(2000), measurements: [weigh(TODAY, 80)], formulaMaintenance: 2500 }), undefined, "no goal");
  assert.equal(buildGoalPath({ ...base, days: eating(2000), measurements: [], formulaMaintenance: 2500 }), undefined, "no weigh-in");
  assert.equal(buildGoalPath({ ...base, days: lastDays(6), measurements: [weigh(TODAY, 80)], formulaMaintenance: 2500 }), undefined, "under a week of food");
  assert.equal(buildGoalPath({ ...base, days: eating(2000), measurements: [weigh(TODAY, 80)] }), undefined, "no maintenance at all");
}
{
  // Very slow: the goal is past two years off, so no date, and the chart stops at its horizon.
  const slow = buildGoalPath({ goalKg: 40, today: TODAY, days: lastDays(10, () => [meal({ kcal: 2400 })]), measurements: [weigh(TODAY, 80)], formulaMaintenance: 2500 });
  assert.equal(slow?.finishDate, undefined);
  assert.ok((slow?.rows[slow.rows.length - 1].date ?? "") <= shiftKey(TODAY, 26 * 7));
}

// -- energy availability
{
  const sessions: SessionEnergy[] = [{ date: TODAY, name: "Push", kind: "lifting", minutes: 60, met: 5, kcal: 2800 }, { date: shiftKey(TODAY, -40), name: "Old", kind: "lifting", minutes: 60, met: 5, kcal: 9999 }];
  const result = buildEnergyAvailability(lastDays(28), sessions, 60, TODAY);
  assert.equal(result?.exercisePerDay, 100, "over four weeks, and old sessions are out");
  assert.equal(result?.value, 31.7, "(2000 - 100) / 60");
  assert.equal(result?.band, "reduced");
  assert.equal(buildEnergyAvailability(lastDays(28, () => [meal({ kcal: 1500 })]), [], 60, TODAY)?.band, "low");
  assert.equal(buildEnergyAvailability(lastDays(28, () => [meal({ kcal: 3000 })]), [], 60, TODAY)?.band, "good");
  assert.equal(buildEnergyAvailability(lastDays(28), [], undefined, TODAY), undefined, "needs lean mass");
  assert.equal(buildEnergyAvailability(lastDays(5), [], 60, TODAY), undefined, "needs logged days");
}

// -- protein
{
  const rows = dailyIntake(
    [day("2026-11-01", [meal({ proteinG: 100 })]), day("2026-11-02", [meal({ proteinG: 150 })]), day("2026-11-03", [meal({ proteinG: 200 })])],
    ALL
  );
  const result = buildProteinDays(rows, [weigh("2026-10-01", 80)]);
  assert.deepEqual([result?.under, result?.within, result?.over], [1, 1, 1], "1.25, 1.88 and 2.5 g per kg");
  assert.equal(buildProteinDays(rows, []), undefined, "no weigh-in, no ratio");
}
{
  // At 80 kg the dose is 20 g.
  const items = [meal({ time: "08:00", proteinG: 30 }), meal({ time: "13:00", proteinG: 25 }), meal({ time: "16:00", proteinG: 10 }), meal({ time: "20:00", proteinG: 40 }), meal({ time: "22:00", proteinG: 50, status: "skipped" })];
  const result = buildProteinMeals([day("2026-11-02", items)], ALL, [weigh("2026-10-01", 80)]);
  assert.equal(result?.doseG, 20);
  assert.equal(result?.dosesPerDay, 3, "a small meal and a skipped one are not doses");
  assert.equal(result?.mealsPerDay, 4);
  assert.equal(result?.averageGapHours, 6, "08:00, 13:00, 20:00");
  assert.equal(buildProteinMeals([day("2026-11-02", [meal({ status: "pending" })])], ALL, [weigh("2026-10-01", 80)]), undefined);
  assert.equal(buildProteinMeals([day("2026-11-02")], ALL, []), undefined);
}

// -- carbs and fat
{
  const rows = dailyIntake(
    [day("2026-11-02", [meal({ carbsG: 400, kcal: 2500 })]), day("2026-11-03", [meal({ carbsG: 200, kcal: 1800 })])],
    ALL
  );
  const split = buildCarbSplit(rows, new Set(["2026-11-02"]), [weigh("2026-10-01", 80)]);
  assert.deepEqual(split?.training, { carbsPerKg: 5, kcal: 2500, days: 1 });
  assert.deepEqual(split?.rest, { carbsPerKg: 2.5, kcal: 1800, days: 1 });
  assert.equal(buildCarbSplit(rows, new Set(), [weigh("2026-10-01", 80)])?.training, undefined, "no workouts, no training side");
  assert.equal(buildCarbSplit(rows, new Set(), []), undefined);
}
{
  const rows = dailyIntake(
    [day("2026-11-02", [meal({ kcal: 2000, fatG: 20 })]), day("2026-11-03", [meal({ kcal: 2000, fatG: 60 })]), day("2026-11-04", [meal({ kcal: 2000, fatG: 100 })])],
    ALL
  );
  const fat = buildFatFloor(rows, [weigh("2026-10-01", 80)]);
  assert.deepEqual([fat?.under, fat?.within, fat?.over], [1, 1, 1], "9 %, 27 % and 45 %");
  assert.equal(fat?.averageShare, 27);
  assert.equal(fat?.averagePerKg, 0.75);
  assert.equal(buildFatFloor(dailyIntake([day("2026-11-02", [meal({ kcal: 0, fatG: 0 })])], ALL), []), undefined, "no calories, no share");
}

// -- weekend (2026-11-07 and 08 are a weekend)
{
  const rows = dailyIntake(
    [day("2026-11-02"), day("2026-11-03"), day("2026-11-07", [meal({ kcal: 2600, costInr: 300 })]), day("2026-11-08", [meal({ kcal: 2600, costInr: 300 })])],
    ALL
  );
  const gap = buildWeekendGap(rows);
  assert.equal(gap?.gapKcal, 600);
  assert.equal(gap?.weekendCost, 300);
  assert.equal(buildWeekendGap(rows.slice(0, 3)), undefined, "one weekend day is not a comparison");
}

// -- what protein costs
{
  const items = [
    meal({ name: "Paneer", proteinG: 30, costInr: 90, kcal: 500 }),
    meal({ name: "paneer ", proteinG: 30, costInr: 90, kcal: 500 }),
    meal({ name: "Soya", proteinG: 40, costInr: 40, kcal: 400 }),
    meal({ name: "Chai", proteinG: 2, costInr: 20, kcal: 100 }),
    meal({ name: "Free", proteinG: 50, costInr: 0, kcal: 500 }),
    meal({ name: "Skipped", proteinG: 50, costInr: 500, status: "skipped" })
  ];
  const value = buildProteinValue([day("2026-11-02", items)], ALL);
  assert.deepEqual(value?.meals.map((m) => m.name), ["Soya", "Paneer"], "cheapest first; one name counted once; chai is not a protein source");
  assert.equal(value?.meals[0].per100gProtein, 100);
  assert.equal(value?.meals[1].per100gProtein, 300);
  assert.equal(value?.meals[1].times, 2);
  assert.equal(value?.per100gProtein, 235, "240 rupees for 102 g, with no free or skipped meal in it");
  assert.equal(buildProteinValue([day("2026-11-02", [meal({ costInr: 0 })])], ALL), undefined, "no prices, no value");
}

console.log("diet science checks passed");

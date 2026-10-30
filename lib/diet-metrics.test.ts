// Run with: npm run check
import assert from "node:assert/strict";

import { adherence, averageIntake, dailyIntake, fuelVsWeight, macroShare, meterTone, proteinPerKg, spend } from "@/lib/diet-metrics";
import type { PlannedMeal, ScheduledMealDay } from "@/lib/diet-types";
import type { BodyMeasurement } from "@/lib/types";

const TODAY = "2026-11-10";
const WINDOW = { start: "2026-01-01", end: TODAY };

const meal = (status: PlannedMeal["status"], extra = false, kcal = 500, proteinG = 30, costInr = 50): PlannedMeal => ({
  id: crypto.randomUUID(), name: "M", time: "09:00", kcal, proteinG, carbsG: 50, fatG: 10, costInr, status, ...(extra ? { extra } : {})
});
const day = (date: string, items: PlannedMeal[]): ScheduledMealDay => ({ id: date, date, planName: "P", items, source: "repeat" });
const weigh = (date: string, value: number): BodyMeasurement => ({ id: date, date, metric: "weight", value });

const days = [
  day("2026-11-03", [meal("eaten"), meal("skipped"), meal("pending")]),
  day("2026-11-04", [meal("pending"), meal("pending")]), // nothing ticked
  day("2026-11-09", [meal("eaten"), meal("eaten", true, 300, 10, 20)]),
  day(TODAY, [meal("eaten"), meal("pending")]),
  day("2026-11-20", [meal("pending")])
];

// the bar's colour
assert.equal(meterTone(0, 100), "low");
assert.equal(meterTone(33, 100), "low");
assert.equal(meterTone(34, 100), "mid");
assert.equal(meterTone(66, 100), "mid");
assert.equal(meterTone(67, 100), "good");
assert.equal(meterTone(100, 100), "good");
assert.equal(meterTone(110, 100), "good", "a little over is still on target");
assert.equal(meterTone(111, 100), "over");
assert.equal(meterTone(150, 100, { noLimit: true }), "good", "more protein is not a problem");
assert.equal(meterTone(50, undefined), "none", "no target, no judgement");
assert.equal(meterTone(50, 0), "none");

// intake
{
  const intake = dailyIntake(days, WINDOW);
  assert.deepEqual(intake.map((r) => r.date), ["2026-11-03", "2026-11-09", TODAY], "a day with nothing ticked is not a day of zero");
  assert.equal(intake[0].kcal, 500, "skipped and pending meals never count");
  assert.equal(intake[1].kcal, 800, "an extra counts");
  assert.equal(intake[1].costInr, 70);
  assert.equal(averageIntake(intake).kcal, 600, "the average is per tracked day");
  assert.equal(averageIntake([]).kcal, 0);
  assert.equal(dailyIntake(days, { start: "2026-11-09", end: "2026-11-09" }).length, 1, "the window is honoured");
}

// protein per kg
{
  const intake = dailyIntake(days, WINDOW).slice(0, 2); // 30 g, then 40 g
  assert.equal(proteinPerKg(intake, [weigh("2026-11-01", 75), weigh("2026-11-08", 100)]), 0.4, "each day is read against that day's weight");
  assert.equal(proteinPerKg(intake, [weigh("2026-12-01", 100)]), 0.35, "only later weigh-ins: the first one stands in");
  assert.equal(proteinPerKg(intake, []), undefined, "no weigh-in, no ratio");
}

// adherence
{
  const result = adherence(days, WINDOW, TODAY);
  assert.equal(result.eaten, 3);
  assert.equal(result.skipped, 1);
  assert.equal(result.missed, 3, "past pending meals are missed; today's are not yet");
  assert.equal(result.planned, 7, "a future day is not due");
  assert.equal(result.extras, 1, "an extra is not on the plan");
  assert.equal(result.rate, 3 / 7);
  assert.equal(adherence([], WINDOW, TODAY).rate, undefined);
}

// spend
{
  const result = spend(days, WINDOW, TODAY);
  assert.equal(result.total, 170);
  assert.equal(result.thisMonth, 170);
  assert.equal(result.weeks.length, 2, "grouped by week");
  assert.equal(result.weeks.reduce((sum, w) => sum + w.costInr, 0), 170);
  assert.equal(spend(days, { start: TODAY, end: TODAY }, TODAY).thisMonth, 170, "this month ignores a shorter range");
  assert.equal(spend([day("2026-10-30", [meal("eaten")])], WINDOW, TODAY).thisMonth, 0, "last month is not this month");
}

// macros
assert.deepEqual(macroShare({ proteinG: 25, carbsG: 25, fatG: 0 }), { protein: 50, carbs: 50, fat: 0 });
assert.deepEqual(macroShare({ proteinG: 0, carbsG: 0, fatG: 0 }), { protein: 0, carbs: 0, fat: 0 }, "no food, no division by zero");

// the fuel line stays silent until it can mean something
{
  const span = (weeks: number) => {
    const out: ScheduledMealDay[] = [];
    for (let i = 0; i <= weeks * 7; i += 1) {
      const date = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
      out.push(day(date, [meal("eaten")]));
    }
    return out;
  };
  const measured = [weigh("2026-01-01", 80), weigh("2026-02-20", 78.5)];
  assert.equal(fuelVsWeight(dailyIntake(span(7), WINDOW), measured), undefined, "under eight weeks: nothing at all");
  assert.equal(fuelVsWeight(dailyIntake(span(9), WINDOW), [weigh("2026-01-01", 80)]), undefined, "one weigh-in is no trend");
  const result = fuelVsWeight(dailyIntake(span(9), WINDOW), measured);
  assert.equal(result?.weeks, 9);
  assert.equal(result?.weightChange, -1.5);
  assert.equal(result?.averageKcal, 500);
}

console.log("diet metrics checks passed");

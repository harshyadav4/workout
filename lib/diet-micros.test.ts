// Run with: npm run check
import assert from "node:assert/strict";

import { MICRONUTRIENTS, buildMicroReport, microTone } from "@/lib/diet-micros";
import type { Micros, PlannedMeal, ScheduledMealDay } from "@/lib/diet-types";

const TODAY = "2026-11-30";
const ALL = { start: "2026-01-01", end: TODAY };
const zero: Micros = { ironMg: 0, calciumMg: 0, magnesiumMg: 0, zincMg: 0, potassiumMg: 0, sodiumMg: 0, vitaminCMg: 0, vitaminDUg: 0, vitaminAUg: 0, folateUg: 0, thiamineMg: 0, riboflavinMg: 0, fiberG: 0 };

const meal = (patch: Partial<PlannedMeal> = {}, micros: Partial<Micros> | null = {}): PlannedMeal => ({
  id: crypto.randomUUID(), name: "Dal", time: "13:00", kcal: 1000, proteinG: 1, carbsG: 1, fatG: 1, costInr: 1, status: "eaten",
  ...(micros ? { micros: { ...zero, ...micros } } : {}),
  ...patch
});
const day = (date: string, items: PlannedMeal[]): ScheduledMealDay => ({ id: date, date, planName: "P", items, source: "repeat" });
const row = (report: ReturnType<typeof buildMicroReport>, key: keyof Micros) => report?.rows.find((item) => item.key === key);
const threeDays = (items: () => PlannedMeal[]) => ["2026-11-01", "2026-11-02", "2026-11-03"].map((date) => day(date, items()));

// the targets are the published ones (ICMR-NIN 2020, tables 3 and 4)
{
  const of = (key: keyof Micros) => MICRONUTRIENTS.find((item) => item.key === key);
  assert.deepEqual([of("ironMg")?.male, of("ironMg")?.female], [19, 29]);
  assert.deepEqual([of("calciumMg")?.male, of("calciumMg")?.female], [1000, 1000]);
  assert.deepEqual([of("magnesiumMg")?.male, of("magnesiumMg")?.female], [440, 370]);
  assert.deepEqual([of("zincMg")?.male, of("zincMg")?.female], [17, 13]);
  assert.deepEqual([of("folateUg")?.male, of("folateUg")?.female], [300, 220]);
  assert.deepEqual([of("vitaminCMg")?.male, of("vitaminCMg")?.female], [80, 65]);
  assert.deepEqual([of("vitaminAUg")?.male, of("vitaminAUg")?.female], [1000, 840]);
  assert.deepEqual([of("thiamineMg")?.male, of("thiamineMg")?.female], [1.8, 1.7]);
  assert.deepEqual([of("riboflavinMg")?.male, of("riboflavinMg")?.female], [2.5, 2.4]);
  assert.equal(of("vitaminDUg")?.male, 15, "600 IU is 15 micrograms");
}

// tones
assert.equal(microTone(10, 100), "low");
assert.equal(microTone(40, 100), "mid");
assert.equal(microTone(70, 100), "good");
assert.equal(microTone(300, 100), "good", "more of a floor is not flagged");
assert.equal(microTone(500, 2000, true), "good", "low sodium is good");
assert.equal(microTone(2100, 2000, true), "over");
assert.equal(microTone(5, 0), "none");

// a target needs a sex
assert.equal(buildMicroReport([], ALL, undefined, TODAY), undefined);
assert.equal(buildMicroReport([], ALL, "other", TODAY), undefined, "no published figure, so no guess");

// averages, and targets by sex
{
  const days = threeDays(() => [meal({}, { ironMg: 19, sodiumMg: 2500, fiberG: 30 })]);
  const men = buildMicroReport(days, ALL, "male", TODAY);
  assert.equal(men?.haveEaten, true);
  assert.equal(row(men, "ironMg")?.eaten, 19);
  assert.equal(row(men, "ironMg")?.target, 19);
  assert.equal(row(men, "ironMg")?.tone, "good");
  assert.equal(row(men, "fiberG")?.target, 14, "14 g per 1,000 kcal eaten");
  assert.equal(row(men, "sodiumMg")?.tone, "over");
  assert.equal(row(men, "calciumMg")?.tone, "low");
  assert.ok(men?.low.some((item) => item.key === "calciumMg"));
  assert.ok(men?.low.some((item) => item.key === "sodiumMg"), "over a limit needs attention too");
  assert.ok(men?.good.some((item) => item.key === "ironMg"));

  const women = buildMicroReport(days, ALL, "female", TODAY);
  assert.equal(row(women, "ironMg")?.target, 29);
  assert.equal(row(women, "ironMg")?.tone, "mid", "the same food, a higher target");
}

// unknown is not zero
{
  const typedOnSomeDays = [
    day("2026-11-01", [meal({}, { ironMg: 20 })]),
    day("2026-11-02", [meal({}, { ironMg: 20 })]),
    day("2026-11-03", [meal({}, { ironMg: 20 })]),
    day("2026-11-04", [meal({}, { ironMg: 20 }), meal({ name: "Typed" }, null)]),
    day("2026-11-05", [meal({ name: "Typed" }, null)])
  ];
  const report = buildMicroReport(typedOnSomeDays, ALL, "male", TODAY);
  assert.equal(report?.completeDays, 3, "a day with an unknown meal is left out");
  assert.equal(row(report, "ironMg")?.eaten, 20, "so it cannot drag the average down");
  assert.equal(report?.knownMeals, 4);
  assert.equal(report?.eatenMeals, 6, "and the card says how much was unknown");

  const tooFew = buildMicroReport(typedOnSomeDays.slice(0, 2), ALL, "male", TODAY);
  assert.equal(tooFew?.haveEaten, false, "two days is not an average");
  assert.equal(row(tooFew, "ironMg")?.eaten, undefined);
  assert.equal(row(tooFew, "ironMg")?.tone, "none");

  const none = buildMicroReport([day("2026-11-01", [meal({}, null)])], ALL, "male", TODAY);
  assert.equal(none?.haveEaten, false);
  assert.equal(none?.havePlanned, false);
}

// junk from a backup file is unknown, not a broken number
{
  const junk = [meal({ micros: { ...zero, ironMg: Number.NaN } }), meal({ micros: "lots" as unknown as Micros }), meal({ micros: { ironMg: 5 } as unknown as Micros })];
  const report = buildMicroReport([day("2026-11-01", junk)], ALL, "male", TODAY);
  assert.equal(report?.knownMeals, 0);
  assert.ok(report?.rows.every((item) => item.eaten === undefined));
}

// if every planned meal were eaten
{
  const items = () => [
    meal({ time: "08:00" }, { ironMg: 15, calciumMg: 900, sodiumMg: 900 }),
    meal({ time: "20:00", status: "skipped", name: "Dinner" }, { ironMg: 10, calciumMg: 100, sodiumMg: 1500 })
  ];
  const report = buildMicroReport(threeDays(items), ALL, "male", TODAY);
  assert.equal(row(report, "ironMg")?.eaten, 15, "a skipped meal is not eaten");
  assert.equal(row(report, "ironMg")?.planned, 25, "but the plan counts it");
  assert.equal(row(report, "calciumMg")?.planned, 1000);
  assert.equal(report?.fixedByPlan.some((item) => item.key === "ironMg"), false, "15 of 19 is already good");
  assert.ok(report?.overInPlan.some((item) => item.key === "sodiumMg"), "2,400 mg of sodium if all eaten");
  assert.ok(report?.shortInPlan.some((item) => item.key === "vitaminDUg"), "no food in the plan has it");
  assert.equal(report?.shortInPlan.some((item) => item.key === "sodiumMg"), false, "low on a limit is never short");

  const lowNow = () => [meal({}, { zincMg: 2 }), meal({ status: "pending" }, { zincMg: 14 })];
  const fixed = buildMicroReport(threeDays(lowNow), ALL, "male", TODAY);
  assert.ok(fixed?.fixedByPlan.some((item) => item.key === "zincMg"), "low now, reached by eating the plan");
}

// an extra is what was eaten, not what was planned
{
  const items = () => [meal({}, { ironMg: 10 }), meal({ extra: true, name: "Extra" }, { ironMg: 5 })];
  const report = buildMicroReport(threeDays(items), ALL, "male", TODAY);
  assert.equal(row(report, "ironMg")?.eaten, 15);
  assert.equal(row(report, "ironMg")?.planned, 10);
}

// a new plan shows before anything is eaten, from the days ahead
{
  const report = buildMicroReport([day("2026-12-03", [meal({ status: "pending" }, { ironMg: 19 })])], { start: "2026-11-01", end: TODAY }, "male", TODAY);
  assert.equal(report?.haveEaten, false);
  assert.equal(row(report, "ironMg")?.planned, 19);
  const far = buildMicroReport([day("2027-03-01", [meal({ status: "pending" }, { ironMg: 19 })])], { start: "2026-11-01", end: TODAY }, "male", TODAY);
  assert.equal(far?.havePlanned, false, "far ahead is not your plan yet");
}

// where it came from
{
  const items = () => [meal({ name: "Spinach" }, { ironMg: 10 }), meal({ name: "Rice" }, { ironMg: 1 })];
  const report = buildMicroReport(threeDays(items), ALL, "male", TODAY);
  assert.equal(row(report, "ironMg")?.topMeal, "Spinach");
  assert.equal(row(report, "vitaminDUg")?.topMeal, undefined, "no meal gave any");
}

console.log("diet micros checks passed");

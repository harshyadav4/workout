// Run with: npm run check
import assert from "node:assert/strict";

import { buildGoalPath } from "@/lib/diet-science";
import type { ScheduledMealDay } from "@/lib/diet-types";
import type { BodyMeasurement } from "@/lib/types";
import { buildBodyRoadmap, currentStep, hasBodyGoal, muscleKgPerMonth, pathMilestones, suggestLeanGoal, trainingLevel, trainingMonths } from "@/lib/diet-body-goal";
import { shiftKey } from "@/lib/progress-metrics";

const TODAY = "2026-11-02";
// 80 kg at 20 % body fat: 64 kg lean, 16 kg fat.
const composition = { leanMassKg: 64, bodyFatPercent: 20 };
const base = { composition, currentKg: 80, heightCm: 178, sex: "male" as const, months: 6, maintenance: 2600, restingKcal: 1800, today: TODAY };

assert.equal(trainingLevel(0), "beginner");
assert.equal(trainingLevel(12), "intermediate");
assert.equal(trainingLevel(36), "advanced");
assert.equal(trainingMonths(undefined, TODAY), 0);
assert.equal(trainingMonths("2026-05-01", TODAY), 6);
assert.equal(muscleKgPerMonth(80, "beginner", "male"), 0.8, "1 % of bodyweight");
assert.equal(muscleKgPerMonth(80, "advanced", "male"), 0.2);
assert.equal(muscleKgPerMonth(80, "beginner", "female"), 0.4, "about half for women");
assert.equal(hasBodyGoal({}), false);
assert.equal(hasBodyGoal({ leanGoalKg: 70 }), true);
assert.equal(hasBodyGoal({ bodyFatGoalPercent: 12 }), true);

// no goal, no map
assert.equal(buildBodyRoadmap({ ...base, settings: {} }), undefined);

// both goals: cut, then build, and the weight the goals add up to
{
  const map = buildBodyRoadmap({ ...base, settings: { leanGoalKg: 68, bodyFatGoalPercent: 15 }, averageIntake: 2400 });
  assert.ok(map);
  assert.equal(map.goalWeightKg, 80, "68 kg lean at 15 % fat is 80 kg, the weight he is now");
  assert.deepEqual(map.phases.map((phase) => phase.id), ["cut", "build"], "the scale would say nothing changed; the map says otherwise");

  const [cut, build] = map.phases;
  assert.equal(cut.fromKg, 80);
  assert.equal(cut.toKg, 75.3, "64 kg lean at 15 %");
  assert.equal(cut.leanKg, 64, "muscle is kept on the cut");
  assert.equal(cut.days, Math.ceil(((80 - 64 / 0.85) / 0.4) * 7), "at 0.5 % of 80 kg a week");
  assert.equal(cut.kcalPerDay, 2160, "2,600 less 0.4 kg a week at 7,700 kcal");
  assert.deepEqual(cut.proteinG, { low: 128, high: 176 });

  assert.equal(build.fromDate, cut.toDate, "one follows the other");
  assert.equal(build.fromKg, 75.3);
  assert.equal(build.toKg, 80);
  assert.equal(build.leanKg, 68);
  assert.equal(build.kcalPerDay, 2860, "10 % over maintenance");
  assert.equal(build.days, Math.ceil((4 / muscleKgPerMonth(64 / 0.85, "beginner", "male")) * 30.44));
  assert.equal(map.finishDate, build.toDate);
  assert.equal(map.gapKcal, 240, "eating 2,400 against the cut's 2,160");
}

// one goal at a time
{
  const leanOnly = buildBodyRoadmap({ ...base, settings: { leanGoalKg: 68 } });
  assert.deepEqual(leanOnly?.phases.map((phase) => phase.id), ["build"], "no fat goal: no cut");
  assert.equal(leanOnly?.goalBodyFat, 20, "body fat stays as it is");
  assert.equal(leanOnly?.goalWeightKg, 85);

  const fatOnly = buildBodyRoadmap({ ...base, settings: { bodyFatGoalPercent: 15 } });
  assert.deepEqual(fatOnly?.phases.map((phase) => phase.id), ["cut"], "no muscle goal: no build");
  assert.equal(fatOnly?.goalLeanKg, 64);
  assert.equal(fatOnly?.goalWeightKg, 75.3);
}

// goals already met
{
  const done = buildBodyRoadmap({ ...base, settings: { leanGoalKg: 60, bodyFatGoalPercent: 25 } });
  assert.deepEqual(done?.phases.map((phase) => phase.id), ["hold"]);
  assert.equal(done?.goalLeanKg, 64, "a goal under today's lean mass never plans a muscle loss");
  assert.equal(done?.goalWeightKg, 80, "and being leaner than a body fat goal is not a reason to gain 5 kg of fat");
  assert.equal(done?.goalBodyFat, 20);
  assert.equal(done && currentStep(done), undefined, "nothing to follow: it is a hold");
  assert.equal(done?.finishDate, TODAY);
}

// safety and honesty
{
  const floored = buildBodyRoadmap({ ...base, restingKcal: 2500, settings: { bodyFatGoalPercent: 15 } });
  assert.equal(floored?.phases[0].kcalPerDay, 2500, "never under the resting burn");
  const silly = buildBodyRoadmap({ ...base, settings: { bodyFatGoalPercent: 1 } });
  assert.equal(silly?.goalBodyFat, 6, "an unsafe body fat goal is raised to a floor");
  assert.equal(buildBodyRoadmap({ ...base, settings: { leanGoalKg: 68 } })?.pastNaturalCeiling, false);
  assert.equal(buildBodyRoadmap({ ...base, settings: { leanGoalKg: 90 } })?.pastNaturalCeiling, true, "past what few drug-free men reach");
  assert.equal(buildBodyRoadmap({ ...base, sex: "female", settings: { leanGoalKg: 90 } })?.pastNaturalCeiling, false, "that figure is from men");
  const noFormula = buildBodyRoadmap({ ...base, maintenance: undefined, restingKcal: undefined, averageIntake: 2400, settings: { leanGoalKg: 68 } });
  assert.equal(noFormula?.gapKcal, undefined, "no maintenance, no gap");
  assert.equal(buildBodyRoadmap({ ...base, currentKg: 0, settings: { leanGoalKg: 68 } }), undefined);
  const advanced = buildBodyRoadmap({ ...base, months: 60, settings: { leanGoalKg: 68 } });
  const beginner = buildBodyRoadmap({ ...base, settings: { leanGoalKg: 68 } });
  assert.ok((advanced?.phases[0].days ?? 0) > (beginner?.phases[0].days ?? 0) * 3, "the same muscle takes an advanced lifter far longer");
}

// the roadmap and the weight path must never give opposite advice
{
  const meals: ScheduledMealDay[] = Array.from({ length: 28 }, (_, index) => ({
    id: `d${index}`,
    date: shiftKey(TODAY, -index),
    planName: "P",
    source: "repeat",
    items: [{ id: "i", name: "Dal", time: "13:00", kcal: 2600, proteinG: 120, carbsG: 300, fatG: 70, costInr: 200, status: "eaten" }]
  }));
  const steady: BodyMeasurement[] = [0, 7, 14, 21, 28].map((back) => ({ id: `w${back}`, date: shiftKey(TODAY, -back), metric: "weight", value: 80 }));
  // 68 kg lean at 15 % is 80 kg, today's weight: the final weight alone says "nothing to do".
  const both = buildBodyRoadmap({ ...base, settings: { leanGoalKg: 68, bodyFatGoalPercent: 15 }, averageIntake: 2600 });
  assert.ok(both);
  const step = currentStep(both);
  assert.ok(step);
  const path = buildGoalPath({ days: meals, measurements: steady, goalKg: step.toKg, step, formulaMaintenance: 2600, restingKcal: 1800, today: TODAY });
  assert.ok(path);
  assert.equal(path.fromRoadmap, true);
  assert.equal(path.goalKg, 75.3, "the path aims for the end of the step, not the final weight");
  assert.equal(path.direction, "lose", "and agrees on the direction");
  assert.equal(path.neededKcal, both.phases[0].kcalPerDay, "and on the calories");
  assert.equal(path.gapKcal, both.gapKcal, "and on the gap");
  assert.equal(path.planFinishDate, both.phases[0].toDate, "and on the date");
  assert.equal(path.againstPlanKg, undefined, "a step starting today has nothing to be behind");
  const first = path.rows[0];
  assert.equal(first.plan, undefined, "the pace line starts today, not in the past");
  assert.ok(path.rows.some((row) => row.date === TODAY && row.plan === 80));
  assert.ok(path.rows.some((row) => row.plan === 75.3), "and reaches the end of the step");

  // A build-only goal follows the slow muscle pace, not the standard 0.5 % a week.
  const build = buildBodyRoadmap({ ...base, settings: { leanGoalKg: 68 }, averageIntake: 2600 });
  const buildStep = build && currentStep(build);
  assert.ok(buildStep);
  assert.ok(buildStep.kgPerWeek < 0.3, `${buildStep.kgPerWeek} kg a week`);
  const buildPath = buildGoalPath({ days: meals, measurements: steady, goalKg: buildStep.toKg, step: buildStep, formulaMaintenance: 2600, restingKcal: 1800, today: TODAY });
  assert.equal(buildPath?.direction, "gain");
  assert.equal(buildPath?.neededKcal, build?.phases[0].kcalPerDay);
  assert.equal(buildPath?.planFinishDate, build?.phases[0].toDate);
}

// a suggestion from your own numbers
{
  const suggestion = suggestLeanGoal({ composition, weightKg: 80, heightCm: 178, sex: "male", months: 6 });
  assert.equal(suggestion.kgPerYear, 9.6);
  assert.equal(suggestion.leanKg, 74);
  assert.equal(suggestion.capped, false);
  const capped = suggestLeanGoal({ composition: { leanMassKg: 78 }, weightKg: 95, heightCm: 178, sex: "male", months: 6 });
  assert.equal(capped.capped, true, "never suggests past the natural ceiling");
  assert.ok(capped.leanKg <= 80);
}

// stops on the way
{
  const stops = pathMilestones(80, 76, TODAY, shiftKey(TODAY, 80), 4);
  assert.deepEqual(stops.map((stop) => stop.kg), [79, 78, 77, 76]);
  assert.equal(stops[0].date, shiftKey(TODAY, 20));
  assert.equal(stops[3].date, shiftKey(TODAY, 80), "the last stop is the goal");
  assert.deepEqual(pathMilestones(80, 80, TODAY, shiftKey(TODAY, 80)), [], "nowhere to go");
  assert.deepEqual(pathMilestones(80, 76, TODAY, TODAY), [], "no time");
}

console.log("diet body goal checks passed");

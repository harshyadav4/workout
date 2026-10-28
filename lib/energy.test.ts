// Run with: npm run check
import assert from "node:assert/strict";

import type { CardioSession } from "@/lib/cardio-metrics";
import {
  ACTIVITY_LEVELS,
  KCAL_PER_KG,
  MAX_SURPLUS_KCAL,
  activityFactor,
  ageOn,
  bmr,
  bmrNeeds,
  buildEnergyBalance,
  buildIntakeTarget,
  buildSessionEnergy,
  buildWeeklyKcal,
  cardioMet,
  liftingMet,
  sessionKcal
} from "@/lib/energy";
import { shiftKey } from "@/lib/progress-metrics";
import type { TimedSession } from "@/lib/session-time";
import type { BodyMeasurement, WorkoutLog } from "@/lib/types";

const today = "2026-10-28";
const near = (a: number, b: number, tolerance: number, message: string) => assert.ok(Math.abs(a - b) <= tolerance, `${message}: ${a} vs ${b}`);
let count = 0;
const weigh = (value: number, date = today): BodyMeasurement => ({ id: `m${(count += 1)}`, date, metric: "weight", value });
const timed = (date: string, minutes: number): TimedSession => ({ id: `t${(count += 1)}`, date, name: "Push", start: `${date}T18:00:00.000Z`, end: `${date}T18:${minutes}:00.000Z`, seconds: minutes * 60 });
const male = { sex: "male" as const, weightKg: 80, heightCm: 180, birthYear: 1996 };

// --- BMR -------------------------------------------------------------------------

assert.equal(ageOn(1996, today), 30);
assert.equal(bmr(male, today), 1780, "Mifflin-St Jeor: 800 + 1125 − 150 + 5");
assert.equal(bmr({ ...male, sex: "female" }, today), 1614, "the female constant is −161");
assert.equal(bmr({ ...male, sex: "other" }, today), undefined, "no constant for other");
assert.equal(bmr({ ...male, birthYear: undefined }, today), undefined);
assert.equal(bmr(male, today, 90), 1880, "a weigh-in overrides the profile copy");
assert.deepEqual(bmrNeeds({ sex: undefined, weightKg: 0, heightCm: 0, birthYear: undefined }), ["your sex", "your birth year", "your height", "a weigh-in"]);
assert.deepEqual(bmrNeeds(male), []);

// --- activity from logged hours -------------------------------------------------------------

{
  const none = activityFactor([], today);
  assert.equal(none.factor, ACTIVITY_LEVELS[0].factor, "nothing logged reads as mostly sitting");
  // Twelve 80-minute sessions inside the last four Monday-first weeks (today is
  // a Wednesday, so "back 1..23" stays within them): 4 hours a week → moderately active.
  const sessions = [1, 2, 3, 8, 9, 10, 15, 16, 17, 21, 22, 23].map((back) => timed(shiftKey(today, -back), 80));
  const level = activityFactor(sessions, today);
  assert.equal(level.label, "moderately active");
  near(level.hours, 4, 0.2, "hours a week");
}

// --- METs --------------------------------------------------------------------------------------

assert.equal(liftingMet(undefined), 3.5);
assert.equal(liftingMet(60), 5);
assert.equal(liftingMet(120), 6);
near(cardioMet(10), 10.5, 0.1, "ACSM: 10 km/h is about 10.5 METs");
near(cardioMet(5), 3.4, 0.1, "ACSM walking: a 5 km/h walk on the flat is about 3.4 METs");
assert.equal(sessionKcal(5, 80, 1), 400, "MET × kg × hours");

// --- per session, no double counting ------------------------------------------------------------

{
  const logs: WorkoutLog[] = [{ date: today, workoutId: "bp", name: "Bench", totalVolume: 6000, muscles: [] }];
  const run: CardioSession = { logId: "r", date: today, workoutId: "run", name: "Run", km: 5, seconds: 1500, pace: 300 };
  const rows = buildSessionEnergy([timed(today, 60)], logs, [run], 80);
  assert.deepEqual(rows.map((row) => row.kind), ["lifting", "cardio"]);
  assert.equal(rows[0].minutes, 35, "the run's 25 minutes come off the session before the lifting MET applies");
  near(rows[1].kcal, sessionKcal(cardioMet(12), 80, 1500 / 3600), 1e-6, "the run at 12 km/h");
  assert.deepEqual(buildSessionEnergy([timed(today, 60)], logs, [], 0), [], "no bodyweight, no calories");

  const weeks = buildWeeklyKcal(rows, today, 2);
  assert.equal(weeks.length, 2);
  assert.equal(weeks[1].kcal, Math.round(rows[0].kcal + rows[1].kcal), "this week holds both");
  assert.equal(weeks[0].kcal, 0);
}

// --- balance from the scale -----------------------------------------------------------------------

{
  const cut = [weigh(80, shiftKey(today, -21)), weigh(79.6, shiftKey(today, -14)), weigh(79.3, shiftKey(today, -7)), weigh(78.8)];
  const balance = buildEnergyBalance(cut, today)!;
  assert.ok(balance.dailyKcal < 0, "losing weight is a deficit");
  near(balance.dailyKcal, (balance.rate.kgPerWeek * KCAL_PER_KG) / 7, 1e-9, "7,700 kcal a kilogram, per day");
  assert.equal(buildEnergyBalance([weigh(80)], today), undefined);
}

// --- the intake target ----------------------------------------------------------------------------------

{
  const flatScale = [weigh(90, shiftKey(today, -14)), weigh(90.05, shiftKey(today, -7)), weigh(90)];
  const lose = buildIntakeTarget({ profile: { ...male, goalWeightKg: 80 }, measurements: flatScale, timed: [], today });
  assert.equal(lose.direction, "lose");
  assert.equal(lose.restingKcal, 1880, "from the 90 kg weigh-in");
  near(lose.maintenance!, 1880 * 1.2, 1e-6, "nothing timed: sitting");
  assert.equal(lose.paces.length, 2);
  const [slow, standard] = lose.paces;
  near(standard.kgPerWeek, 0.45, 1e-9, "0.5 % of 90 kg");
  // 2256 − 495 would be 1761, under the 1880 resting burn: the floor holds.
  assert.equal(standard.kcalPerDay, 1880, "never under resting, even when the pace asks for it");
  near(slow.kcalPerDay, 1880 * 1.2 - (0.225 * KCAL_PER_KG) / 7, 1e-6, "the slow pace fits above the floor: maintenance minus its deficit");
  near(standard.weeks, 10 / 0.45, 1e-9, "weeks to the goal at that pace");
  assert.equal(standard.finishDate, shiftKey(today, Math.ceil((10 / 0.45) * 7)));
  assert.ok(slow.kcalPerDay > standard.kcalPerDay, "the slow pace eats more");
  assert.ok(slow.weeks > standard.weeks, "and takes longer");
  assert.equal(lose.check, "stalled", "a flat scale with a loss goal is a stall");
  near(lose.proteinG!.low, 144, 1e-9, "1.6 g/kg");
  near(lose.proteinG!.high, 198, 1e-9, "2.2 g/kg");

  // Never under resting: a small person with a big deficit asked for.
  const small = buildIntakeTarget({ profile: { sex: "female", weightKg: 50, heightCm: 155, birthYear: 1990, goalWeightKg: 45 }, measurements: [weigh(50)], timed: [], today });
  small.paces.forEach((pace) => assert.ok(pace.kcalPerDay >= small.restingKcal!, `${pace.id} never under resting`));

  const gain = buildIntakeTarget({ profile: { ...male, goalWeightKg: 88 }, measurements: [weigh(80)], timed: [], today });
  assert.equal(gain.direction, "gain");
  const bigSurplus = (0.005 * 80 * KCAL_PER_KG) / 7; // 0.5 %/wk of 80 kg is 440 kcal/day, under the cap
  near(gain.paces[1].kcalPerDay, gain.maintenance! + Math.min(MAX_SURPLUS_KCAL, bigSurplus), 1e-6, "surplus capped at 500");
  assert.ok(gain.paces[1].kcalPerDay - gain.maintenance! <= MAX_SURPLUS_KCAL);
  assert.equal(gain.check, "noData", "one weigh-in is no trend");

  const hold = buildIntakeTarget({ profile: { ...male, goalWeightKg: 80.1 }, measurements: flatScale.map((row) => ({ ...row, value: row.value - 10 })), timed: [], today });
  assert.equal(hold.direction, "hold");
  assert.deepEqual(hold.paces, [], "nothing to pace toward");
  assert.equal(hold.check, "onPace", "flat is on pace for a hold");

  const noGoal = buildIntakeTarget({ profile: { ...male }, measurements: [weigh(80)], timed: [], today });
  assert.equal(noGoal.direction, "noGoal");
  assert.equal(noGoal.maintenance !== undefined, true, "maintenance still shows without a goal");
  assert.deepEqual(noGoal.paces, []);

  const noProfile = buildIntakeTarget({ profile: { sex: undefined, weightKg: 80, heightCm: 180, birthYear: undefined, goalWeightKg: 75 }, measurements: [weigh(80)], timed: [], today });
  assert.equal(noProfile.maintenance, undefined);
  assert.deepEqual(noProfile.paces, [], "no maintenance, no target — the card asks for the profile fields");
  assert.ok(noProfile.proteinG, "protein needs only a weight");

  const onPace = buildIntakeTarget({ profile: { ...male, goalWeightKg: 75 }, measurements: [weigh(80, shiftKey(today, -21)), weigh(79.65, shiftKey(today, -14)), weigh(79.3, shiftKey(today, -7)), weigh(78.95)], timed: [], today });
  assert.equal(onPace.check, "onPace", "0.35 kg a week down on 79 kg is inside the band, toward the goal");
  const away = buildIntakeTarget({ profile: { ...male, goalWeightKg: 75 }, measurements: [weigh(80, shiftKey(today, -21)), weigh(80.4, shiftKey(today, -14)), weigh(80.8, shiftKey(today, -7)), weigh(81.2)], timed: [], today });
  assert.equal(away.check, "away");
}

console.log("energy checks passed");

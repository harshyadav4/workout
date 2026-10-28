// Run with: npm run check
import assert from "node:assert/strict";

import { shiftKey } from "@/lib/progress-metrics";
import {
  allometric,
  buildAllometric,
  buildDots,
  buildE1rmTrend,
  buildIntensityDistribution,
  buildRepZones,
  buildStandards,
  classifyLift,
  dots,
  projectDate,
  standardLevel
} from "@/lib/strength-science";
import type { MuscleGroup, SetLog, WorkoutLog } from "@/lib/types";

const today = "2026-10-28";
let count = 0;
const set = (workoutId: string, weight: number, reps: number, date = today): SetLog => ({
  id: `s${(count += 1)}`,
  logId: `l-${workoutId}-${date}`,
  workoutId,
  date,
  setIndex: 0,
  reps,
  weight
});
const log = (workoutId: string, name: string, date = today): WorkoutLog => ({
  date,
  workoutId,
  name,
  totalVolume: 1,
  muscles: []
});
const near = (a: number, b: number, tolerance: number, message: string) =>
  assert.ok(Math.abs(a - b) <= tolerance, `${message}: ${a} vs ${b}`);
const allTime = { start: "2000-01-01", end: today };

// --- classifying lifts: barbell versions only ------------------------------------

assert.equal(classifyLift("Back Squat"), "squat");
assert.equal(classifyLift("Squat"), "squat");
assert.equal(classifyLift("Goblet Squat"), undefined, "no table for a goblet squat");
assert.equal(classifyLift("Bulgarian Split Squat"), undefined);
assert.equal(classifyLift("Bench Press"), "bench");
assert.equal(classifyLift("Incline Bench Press"), undefined, "incline is a different lift");
assert.equal(classifyLift("Dumbbell Bench Press"), undefined);
assert.equal(classifyLift("Deadlift"), "deadlift");
assert.equal(classifyLift("Sumo Deadlift"), "deadlift", "sumo counts in every federation");
assert.equal(classifyLift("Romanian Deadlift"), undefined);
assert.equal(classifyLift("Overhead Press"), "press");
assert.equal(classifyLift("Seated Shoulder Press"), "press");
assert.equal(classifyLift("Dumbbell Shoulder Press"), undefined);
assert.equal(classifyLift("Lat Pulldown"), undefined);

// --- allometric: e1RM ÷ bodyweight^⅔ ------------------------------------------------

near(allometric(200, 80), 200 / 80 ** (2 / 3), 1e-9, "the formula");
assert.equal(allometric(200, 0), 0, "no bodyweight, no score");
{
  // The point of the exponent: at the same 2× bodyweight the heavier lifter
  // scores higher, because a plain ratio flatters light lifters (Jaric 2002).
  assert.ok(allometric(200, 100) > allometric(120, 60), "2× at 100 kg beats 2× at 60 kg allometrically");
  // And the same absolute lift still favours the lighter lifter, just less steeply than ÷ bodyweight does.
  assert.ok(allometric(150, 60) > allometric(150, 100));
  assert.ok(allometric(150, 60) / allometric(150, 100) < 150 / 60 / (150 / 100), "the gap is narrower than the plain ratio's");
}

{
  const logs = [log("sq", "Back Squat"), log("curl", "Biceps Curl"), log("pu", "Pull-up")];
  const sets = [set("sq", 140, 5), set("curl", 20, 10), set("pu", 0, 8)];
  const rows = buildAllometric(sets, logs, 80);
  assert.deepEqual(rows.map((row) => row.workoutId), ["sq", "curl"], "big lifts first; the bodyweight pull-up at 0 kg has no estimate and drops out");
  assert.equal(rows[0].lift, "squat");
  assert.equal(rows[0].estimate.value, 163.5, "140 × 5 by Epley, to the half kilo");
  near(rows[0].ratio, 163.5 / 80, 1e-9, "plain ratio alongside");
  assert.deepEqual(buildAllometric(sets, logs, 0), [], "no bodyweight, no rows");
}

// --- standards -----------------------------------------------------------------------------

{
  const squat = standardLevel(100, 80, "male", "squat");
  assert.equal(squat.level, "novice", "1.25× is where novice starts");
  assert.equal(squat.next?.level, "intermediate");
  assert.equal(squat.next?.kg, 120, "1.5 × 80, rounded up to a plate");
  assert.equal(standardLevel(99, 80, "male", "squat").level, "beginner");
  assert.equal(standardLevel(200, 80, "male", "squat").level, "elite");
  assert.equal(standardLevel(200, 80, "male", "squat").next, undefined, "nothing above elite");
  assert.equal(standardLevel(60, 60, "female", "bench").level, "advanced", "1× bodyweight bench is advanced for women");
  assert.equal(standardLevel(60, 60, "male", "bench").level, "intermediate");

  const logs = [log("sq", "Back Squat"), log("bp", "Bench Press"), log("ibp", "Incline Bench Press"), log("dl", "Deadlift")];
  const sets = [set("sq", 140, 5), set("bp", 100, 3), set("ibp", 120, 1), set("dl", 180, 3)];
  const rows = buildStandards(sets, logs, 80, "male");
  assert.deepEqual(rows.map((row) => row.lift), ["squat", "bench", "deadlift"], "one row per big lift found, in S/B/D/P order");
  assert.equal(rows[1].workoutId, "bp", "the incline at 120 is not the bench row, even though it is heavier");
  assert.deepEqual(buildStandards(sets, logs, 80, "other"), [], "no table for other");
  assert.deepEqual(buildStandards(sets, logs, 80, undefined), []);
}

// --- DOTS -------------------------------------------------------------------------------------

near(dots(500, 90, "male"), 323.3, 1, "a 500 kg total at 90 kg");
near(dots(300, 60, "female"), 332.6, 1, "a 300 kg total at 60 kg, by the published polynomial");
assert.ok(dots(500, 70, "male") > dots(500, 90, "male"), "the same total is worth more at a lighter weight");
{
  const logs = [log("sq", "Back Squat"), log("bp", "Bench Press"), log("dl", "Deadlift")];
  const two = buildDots([set("sq", 140, 5), set("bp", 100, 3)], logs, 80, "male");
  assert.equal(two, undefined, "two lifts is not a total");
  const three = buildDots([set("sq", 140, 5), set("bp", 100, 3), set("dl", 180, 3)], logs, 80, "male")!;
  near(three.total, 163.5 + 110 + 198, 0.01, "the three estimates add up");
  near(three.score, dots(three.total, 80, "male"), 1e-9, "scored by the formula");
  assert.equal(buildDots([set("sq", 140, 5), set("bp", 100, 3), set("dl", 180, 3)], logs, 80, undefined), undefined);
}

// --- trend, plateau, projection ------------------------------------------------------------

{
  const weekly = (values: number[]) => values.map((weight, i) => set("bp", weight, 5, shiftKey(today, -7 * (values.length - 1 - i))));
  assert.equal(buildE1rmTrend(weekly([80, 82, 84]), "bp", allTime, today), undefined, "three sessions is too few");

  const rising = buildE1rmTrend(weekly([80, 81, 82, 83, 84, 85, 86, 87]), "bp", allTime, today)!;
  assert.equal(rising.points.length, 8);
  near(rising.slopePerWeek, 1 * (1 + 5 / 30), 0.01, "1 kg a week on the bar is 1.17 kg a week of e1RM");
  assert.equal(rising.plateau, false);
  assert.equal(rising.spanWeeks, 7);
  near(rising.fitted, 87 * (1 + 5 / 30), 0.01, "today's fitted value is the last point on a perfect line");
  assert.equal(projectDate(rising, 110, today), shiftKey(today, Math.ceil(((110 - rising.fitted) / rising.slopePerWeek) * 7)), "a date for +8 kg or so");
  assert.equal(projectDate(rising, 80, today), undefined, "already past it");
  assert.equal(projectDate(rising, 500, today), undefined, "not within a year");

  const flat = buildE1rmTrend(weekly([80, 80.5, 80, 80.5, 80, 80.5, 80]), "bp", allTime, today)!;
  assert.equal(flat.plateau, true, "six weeks of noise around 80 is a plateau");
  // The threshold is a share of the lift: +0.2 kg a week on a 15 kg curl is 1.3 % a week, not a stall.
  const curl = buildE1rmTrend(weekly([12, 12.2, 12.4, 12.6, 12.8, 13, 13.2]), "bp", allTime, today)!;
  assert.equal(curl.plateau, false, "a light lift rising slowly in kg is still rising");
  const flatButShort = buildE1rmTrend(weekly([80, 80.5, 80, 80.5, 80]), "bp", allTime, today)!;
  assert.equal(flatButShort.plateau, false, "four weeks flat is not yet a plateau");
  assert.equal(projectDate(flat, 100, today), undefined, "a flat line reaches nothing");

  const recent = { start: shiftKey(today, -27), end: today };
  assert.equal(buildE1rmTrend(weekly([80, 81, 82, 83, 84, 85, 86, 87]), "bp", recent, today)?.points.length, 4, "the window scopes the points");
}

// --- intensity distribution ------------------------------------------------------------------

{
  // Best ever is 100 × 1 = 100 kg. Edges sit exactly on the bucket bounds.
  const sets = [
    set("bp", 100, 1, "2026-01-01"),
    set("bp", 59.9, 8),
    set("bp", 60, 8),
    set("bp", 70, 5),
    set("bp", 80, 3),
    set("bp", 90, 2),
    set("bp", 95, 1),
    set("pu", 0, 10),
    set("high", 40, 20)
  ];
  const report = buildIntensityDistribution(sets, { start: "2026-10-01", end: today });
  assert.deepEqual(report.buckets.map((bucket) => bucket.sets), [1, 1, 1, 1, 2], "59.9 is under 60; 60, 70, 80 open their buckets; 90 and 95 are 90+");
  assert.equal(report.rated, 6);
  assert.equal(report.unrated, 2, "the bodyweight pull-up and the 20-rep set with no estimate are left out");
  near(report.buckets[4].share, 2 / 6, 1e-9, "shares are of rated sets");
  assert.equal(report.buckets.reduce((sum, bucket) => sum + bucket.sets, 0), 6, "the January single is outside the window");
}

// --- rep zones -------------------------------------------------------------------------------------

{
  const groupOf = new Map<string, MuscleGroup>([["bp", "chest"], ["sq", "legs"], ["row", "back"]]);
  const sets = [set("bp", 80, 5), set("bp", 70, 6), set("bp", 70, 12), set("bp", 50, 13), set("sq", 100, 3), set("plank", 0, 0), set("mystery", 50, 10)];
  const rows = buildRepZones(sets, allTime, groupOf);
  assert.deepEqual(rows.map((row) => row.group), ["chest", "legs"], "group order, and only groups with sets; a lift with no group is skipped");
  assert.deepEqual([rows[0].low, rows[0].mid, rows[0].high, rows[0].total], [1, 2, 1, 4], "5 is low, 6 and 12 are mid, 13 is high");
  assert.deepEqual([rows[1].low, rows[1].total], [1, 1]);
}

console.log("strength science checks passed");

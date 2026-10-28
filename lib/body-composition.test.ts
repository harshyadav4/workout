// Run with: npm run check
import assert from "node:assert/strict";

import {
  bmi,
  bmiBand,
  buildComposition,
  buildRecomposition,
  buildShapeRatios,
  buildSymmetry,
  buildWeightRate,
  compositionNeeds,
  navyBodyFat
} from "@/lib/body-composition";
import { shiftKey } from "@/lib/progress-metrics";
import type { BodyMeasurement, BodyMetric } from "@/lib/types";

const today = "2026-10-28";
let count = 0;
const reading = (metric: BodyMetric, value: number, date = today): BodyMeasurement => ({
  id: `m${(count += 1)}`,
  date,
  metric,
  value
});
const near = (a: number, b: number, tolerance: number, message: string) =>
  assert.ok(Math.abs(a - b) <= tolerance, `${message}: ${a} vs ${b}`);

// --- BMI --------------------------------------------------------------------

near(bmi(70, 175)!, 22.9, 0.05, "70 kg at 1.75 m");
assert.equal(bmi(0, 175), undefined, "no weight, no index");
assert.equal(bmi(70, 0), undefined, "no height, no index");
assert.equal(bmiBand(18.4), "under");
assert.equal(bmiBand(18.5), "healthy");
assert.equal(bmiBand(24.9), "healthy");
assert.equal(bmiBand(25), "over");
assert.equal(bmiBand(30), "obese");

// --- shape ratios: each row only when both inputs exist --------------------

{
  const none = buildShapeRatios([], { heightCm: 0, weightKg: 0, sex: undefined });
  assert.deepEqual(none, [], "nothing measured, nothing claimed");

  const waistOnly = buildShapeRatios([reading("waist", 80)], { heightCm: 180, weightKg: 0, sex: undefined });
  assert.deepEqual(waistOnly.map((row) => row.id), ["waistHeight"], "a waist and a height make one ratio");
  near(waistOnly[0].value, 0.444, 0.001, "80 / 180");
  assert.equal(waistOnly[0].tone, "good", "under 0.5");

  const full = buildShapeRatios(
    [reading("weight", 80), reading("waist", 92), reading("hips", 100), reading("shoulders", 120)],
    { heightCm: 180, weightKg: 80, sex: "male" }
  );
  assert.deepEqual(full.map((row) => row.id), ["bmi", "waistHeight", "waistHip", "shoulderWaist"]);
  assert.equal(full[1].tone, "watch", "92 / 180 is over 0.5");
  assert.equal(full[2].tone, "watch", "0.92 is over the 0.90 male cut-off");
  assert.equal(full[3].tone, "neutral", "the V-taper has no health cut-off");

  const unsexed = buildShapeRatios([reading("waist", 80), reading("hips", 100)], { heightCm: 0, weightKg: 0, sex: "other" });
  assert.equal(unsexed[0].id, "waistHip");
  assert.equal(unsexed[0].tone, "neutral", "no cut-off without a sex the tables cover");
  assert.match(unsexed[0].verdict, /sex/);
}

// --- symmetry: flagged at 5 %, strong at 10 % ---------------------------------

{
  const rows = buildSymmetry([
    reading("armL", 36),
    reading("armR", 36.5, "2026-10-01"),
    reading("thighL", 60),
    reading("thighR", 63.2),
    reading("calfL", 38),
    reading("calfR", 42)
  ]);
  assert.deepEqual(rows.map((row) => row.pair), ["arm", "thigh", "calf"]);
  near(rows[0].diffPercent, 1.38, 0.01, "arms");
  assert.equal(rows[0].flagged, false);
  assert.equal(rows[0].bigger, "right");
  assert.equal(rows[0].date, today, "the newer of the two sides' dates");
  near(rows[1].diffPercent, 5.19, 0.01, "thighs");
  assert.equal(rows[1].flagged, true, "5.1 % is flagged");
  assert.equal(rows[1].strong, false);
  assert.equal(rows[2].flagged && rows[2].strong, true, "10 % is strong");

  const one = buildSymmetry([reading("armL", 36), reading("thighL", 60)]);
  assert.deepEqual(one, [], "a side on its own is not a pair");
  const even = buildSymmetry([reading("calfL", 38), reading("calfR", 38)]);
  assert.equal(even[0].diffPercent, 0);
  assert.equal(even[0].bigger, undefined);
}

// --- weight rate: three weigh-ins in four weeks, judged against the band ------

{
  const weekly = (start: number, step: number, n: number) =>
    Array.from({ length: n }, (_, i) => reading("weight", start + step * i, shiftKey(today, -7 * (n - 1 - i))));

  assert.equal(buildWeightRate(weekly(80, -0.4, 2), today), undefined, "two points is not a trend");
  const old = Array.from({ length: 5 }, (_, i) => reading("weight", 80 - i, shiftKey(today, -60 - 7 * i)));
  assert.equal(buildWeightRate(old, today), undefined, "weigh-ins older than the window do not count");

  const cut = buildWeightRate(weekly(80, -0.35, 4), today)!;
  near(cut.kgPerWeek, -0.35, 0.001, "0.35 kg a week off");
  assert.equal(cut.direction, "down");
  assert.equal(cut.band, "safe", "0.35 kg on ~79.5 kg is 0.44 %, inside the band");
  const edge = buildWeightRate(weekly(80, -0.4, 4), today)!;
  assert.equal(edge.band, "fast", "0.4 kg on 79.4 kg is 0.504 %: the band is a share of bodyweight, not a kg figure");
  assert.equal(cut.points, 4);
  assert.equal(cut.days, 21);

  const crash = buildWeightRate(weekly(80, -1, 4), today)!;
  assert.equal(crash.band, "fast", "1 kg a week on 80 kg is 1.3 %");
  const creep = buildWeightRate(weekly(80, 0.1, 4), today)!;
  assert.equal(creep.direction, "up");
  assert.equal(creep.band, "slow", "0.1 kg a week is 0.12 %: moving, but under the band");
  const flat = buildWeightRate([reading("weight", 80, shiftKey(today, -14)), reading("weight", 80.05, shiftKey(today, -7)), reading("weight", 80)], today)!;
  assert.equal(flat.direction, "flat");
  assert.equal(flat.band, "flat");
}

// --- recomposition: scale flat, waist down, over four weeks or more -----------

{
  const from = shiftKey(today, -35);
  const detected = buildRecomposition(
    [reading("waist", 86, from), reading("weight", 80.2, shiftKey(from, 1)), reading("waist", 84.5), reading("weight", 80)],
    today
  )!;
  assert.ok(detected, "two waist readings five weeks apart, each with a weigh-in nearby");
  assert.equal(detected.weeks, 5);
  near(detected.waistChangeCm, -1.5, 0.001, "waist");
  near(detected.weightChangePercent, -0.25, 0.01, "weight held");
  assert.equal(detected.detected, true);

  const lostWeight = buildRecomposition(
    [reading("waist", 86, from), reading("weight", 82, from), reading("waist", 84.5), reading("weight", 80)],
    today
  )!;
  assert.equal(lostWeight.detected, false, "a 2.4 % weight drop is a cut, not a recomposition");

  const short = buildRecomposition([reading("waist", 86, shiftKey(today, -20)), reading("weight", 80, shiftKey(today, -20)), reading("waist", 84), reading("weight", 80)], today);
  assert.equal(short, undefined, "under four weeks is too soon to say");

  const noScale = buildRecomposition([reading("waist", 86, from), reading("waist", 84.5)], today);
  assert.equal(noScale, undefined, "no weigh-in near the tape day");
}

// --- US Navy body fat -----------------------------------------------------------

near(navyBodyFat({ sex: "male", heightCm: 178, waistCm: 85, neckCm: 38 })!, 16.4, 0.15, "male, 85 waist, 38 neck, 178 tall");
near(navyBodyFat({ sex: "female", heightCm: 165, waistCm: 75, neckCm: 33, hipsCm: 95 })!, 26.9, 0.15, "female, with hips");
assert.equal(navyBodyFat({ sex: "female", heightCm: 165, waistCm: 75, neckCm: 33 }), undefined, "the female formula needs hips");
assert.equal(navyBodyFat({ sex: "other", heightCm: 178, waistCm: 85, neckCm: 38 }), undefined, "no formula for other");
assert.equal(navyBodyFat({ sex: undefined, heightCm: 178, waistCm: 85, neckCm: 38 }), undefined, "nor for unset");
assert.equal(navyBodyFat({ sex: "male", heightCm: 178, waistCm: 38, neckCm: 40 }), undefined, "a waist under the neck is a typo, not a body");

// --- composition: lean mass and FFMI -------------------------------------------

{
  const inputs = [reading("weight", 80), reading("waist", 85), reading("neck", 38)];
  const comp = buildComposition(inputs, { heightCm: 180, sex: "male", weightKg: 80 })!;
  assert.ok(comp);
  near(comp.fatMassKg + comp.leanMassKg, 80, 0.001, "fat and lean add up to the weigh-in");
  near(comp.ffmi, comp.ffmiNormalized, 0.001, "at exactly 1.80 m the normalisation is the identity");
  const tall = buildComposition(inputs, { heightCm: 190, sex: "male", weightKg: 80 })!;
  assert.ok(tall.ffmiNormalized < tall.ffmi, "Kouri's term is 6.1 × (1.8 − height): a taller lifter is adjusted down, a shorter one up");
  const short = buildComposition(inputs, { heightCm: 170, sex: "male", weightKg: 80 })!;
  assert.ok(short.ffmiNormalized > short.ffmi);
  assert.equal(comp.date, today);

  assert.equal(buildComposition(inputs, { heightCm: 180, sex: "other", weightKg: 80 }), undefined);
  assert.deepEqual(
    compositionNeeds([reading("weight", 80)], { heightCm: 180, sex: undefined, weightKg: 80 }),
    ["your sex", "a waist measurement", "a neck measurement"],
    "the card lists what is missing, in order"
  );
  assert.deepEqual(compositionNeeds(inputs, { heightCm: 180, sex: "female", weightKg: 80 }), ["a hips measurement"]);
  assert.deepEqual(compositionNeeds(inputs, { heightCm: 180, sex: "male", weightKg: 80 }), []);
}

console.log("body composition checks passed");

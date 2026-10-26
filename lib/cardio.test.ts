// Run with: npm run check
import assert from "node:assert/strict";

import { formatDistance, formatPace, fromUnit, isDistanceExercise, paceSecondsPerKm, readUnit, toUnit } from "@/lib/cardio";

// Units are a view: stored km round-trips through miles unchanged.
assert.equal(readUnit("mi"), "mi");
assert.equal(readUnit(null), "km", "km unless asked");
assert.equal(readUnit("furlongs"), "km", "and anything unknown is km");
assert.ok(Math.abs(fromUnit(toUnit(5, "mi"), "mi") - 5) < 1e-9, "km → mi → km is lossless");

assert.equal(formatDistance(5, "km"), "5 km");
assert.equal(formatDistance(0.4, "km"), "0.4 km");
assert.equal(formatDistance(5, "mi"), "3.11 mi");

// 5 km in 28:30 is 5:42 a km; the same run in miles is 9:10 a mile.
assert.equal(formatPace(1710, 5, "km"), "5:42 /km");
assert.equal(formatPace(1710, 5, "mi"), "9:10 /mi");
assert.equal(formatPace(1710, 0, "km"), undefined, "no distance, no pace");
assert.equal(formatPace(0, 5, "km"), undefined, "no time, no pace");
assert.equal(paceSecondsPerKm(1710, 5), 342);

// Distance cardio from the library; the on-the-spot moves are left alone.
for (const name of ["run", "run (equipment)", "short stride run", "walking on incline treadmill", "stationary bike run v. 3", "walk elliptical cross trainer", "walking on stepmill", "cycle cross trainer"]) {
  assert.ok(isDistanceExercise(name), `${name} is distance`);
}
for (const name of ["burpee", "jack burpee", "mountain climber", "high knee against wall", "skater hops", "walking high knees lunge", "bear crawl", "jump rope"]) {
  assert.equal(isDistanceExercise(name), false, `${name} is not`);
}

console.log("cardio checks passed");

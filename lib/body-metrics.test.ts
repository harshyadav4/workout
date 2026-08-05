// Run with: npm run check
import assert from "node:assert/strict";

import {
  changeFor,
  dueState,
  hasAny,
  mergeSeries,
  seriesFor,
  sitesForMuscle,
  unitFor,
  upsertMeasurement,
  withMovingAverage
} from "@/lib/body-metrics";
import { buildLogFromSession } from "@/lib/workout-helpers";
import type { BodyMeasurement, BodyMetric } from "@/lib/types";

let count = 0;
function entry(date: string, metric: BodyMetric, value: number): BodyMeasurement {
  count += 1;
  return { id: `m-${count}`, date, metric, value };
}

// -- upsert ----------------------------------------------------------------

// A second reading on the same day for the same site replaces the first.
// Two tape readings a day apart is noise, not a trend.
let list: BodyMeasurement[] = [];
list = upsertMeasurement(list, entry("2026-08-01", "weight", 80));
list = upsertMeasurement(list, entry("2026-08-01", "weight", 79.4));
assert.equal(list.length, 1, "same day, same metric replaces");
assert.equal(list[0].value, 79.4);

// A different site on the same day is a separate reading.
list = upsertMeasurement(list, entry("2026-08-01", "chest", 102));
assert.equal(list.length, 2, "same day, different metric coexists");

// Out-of-order writes stay sorted, so `.at(-1)` is always the newest.
list = upsertMeasurement(list, entry("2026-07-25", "weight", 81));
assert.deepEqual(
  seriesFor(list, "weight").map((point) => point.date),
  ["2026-07-25", "2026-08-01"],
  "kept in date order regardless of write order"
);

// -- derived readings ------------------------------------------------------

assert.equal(changeFor(list, "weight"), 79.4 - 81, "change is latest minus previous");
assert.equal(changeFor(list, "chest"), undefined, "no change until there are two readings");
assert.equal(unitFor("weight"), "kg");
assert.equal(unitFor("chest"), "cm");

// -- moving average --------------------------------------------------------

// The window is calendar days, not readings: a gap in weighing must widen the
// window in time rather than quietly average across a month.
const daily = [
  entry("2026-08-01", "weight", 80),
  entry("2026-08-02", "weight", 82),
  entry("2026-09-01", "weight", 70)
];
const averaged = withMovingAverage(seriesFor(daily, "weight"), 7);
assert.equal(averaged[0].average, 80, "first point averages only itself");
assert.equal(averaged[1].average, 81, "second averages both");
assert.equal(
  averaged[2].average,
  70,
  "a reading a month later must not average against last month's"
);

// -- merged series ---------------------------------------------------------

const arms = [
  entry("2026-08-01", "armL", 38),
  entry("2026-08-01", "armR", 38.5),
  entry("2026-08-15", "armL", 38.4)
];
const merged = mergeSeries(arms, ["armL", "armR"]);
assert.deepEqual(merged[0], { date: "2026-08-01", armL: 38, armR: 38.5 });
assert.equal(merged[1].armR, undefined, "a day measured on one side only leaves a gap");

// -- muscle -> site mapping ------------------------------------------------

assert.deepEqual(sitesForMuscle("biceps"), ["armL", "armR"]);
assert.deepEqual(sitesForMuscle("vastusLateralis"), ["thighL", "thighR"]);
assert.deepEqual(sitesForMuscle("lats"), [], "a muscle with no tape site renders no card");
assert.equal(hasAny(arms, sitesForMuscle("biceps")), true);
assert.equal(hasAny(arms, sitesForMuscle("abs")), false);

// -- cadence ---------------------------------------------------------------

assert.equal(dueState(list, ["weight"], "off").due, null, "off is never overdue");
assert.equal(dueState(list, ["weight"], undefined).due, null, "unset reads as off");
assert.equal(
  dueState([], ["weight"], "weekly").due,
  true,
  "never recorded is due, so the card has something to ask for"
);
assert.equal(
  dueState(list, ["weight"], "weekly", "2026-08-05").due,
  false,
  "four days after a weekly reading is not yet due"
);
assert.equal(
  dueState(list, ["weight"], "weekly", "2026-08-08").due,
  true,
  "seven days after is due"
);
assert.equal(
  dueState(list, ["weight"], "monthly", "2026-08-08").daysUntil,
  23,
  "monthly counts from the last reading, not the last due date"
);

// -- the boundary that matters --------------------------------------------

// Body measurements must never reach the training aggregations. A plank and a
// weigh-in both score zero volume, but for different reasons, and a measurement
// entering buildLogFromSession would corrupt every volume figure on Progress.
const logs = buildLogFromSession(
  {
    id: "s1",
    date: "2026-08-01",
    dayIndex: 6,
    sessionName: "Push",
    type: "workout",
    status: "completed",
    source: "manual",
    exercises: [
      {
        id: "e1",
        workoutId: "bench",
        templateName: "Bench press",
        sets: [{ id: "set-1", reps: 5, weight: 100, type: "normal", completed: true }]
      }
    ]
  },
  []
);
assert.equal(logs.length, 1, "a session logs its exercises and nothing else");
assert.equal(logs[0].totalVolume, 500);
assert.ok(
  !Object.keys(logs[0]).some((key) => key.includes("measurement") || key.includes("metric")),
  "WorkoutLog carries no measurement fields — the two series stay separate"
);

console.log("body metrics checks passed");

import assert from "node:assert/strict";

import {
  bestEstimate,
  epley,
  MAX_ELIGIBLE_REPS,
  oneRepMaxSeries,
  weightForReps
} from "@/lib/one-rep-max";
import type { SetLog } from "@/lib/types";

let counter = 0;
const set = (date: string, weight: number, reps: number, workoutId = "bench"): SetLog => ({
  id: `s${counter++}`,
  logId: `l-${date}`,
  workoutId,
  date,
  setIndex: 0,
  reps,
  weight
});

// --- the formula, and where it refuses ------------------------------------

assert.equal(epley(100, 1), 100, "a single is measured, not estimated");
assert.equal(epley(100, 10), 100 * (1 + 10 / 30), "Epley in the range it is good for");
assert.equal(epley(100, MAX_ELIGIBLE_REPS + 1), 0, "past the ceiling it refuses rather than guesses");
assert.equal(epley(0, 5), 0, "no weight, no estimate");
assert.equal(epley(100, 0), 0, "no reps, no estimate");

// --- best eligible set -----------------------------------------------------

const history = [
  set("2026-01-01", 105, 1), // 105
  set("2026-01-08", 100, 3), // 110
  set("2026-01-08", 60, 20) // ineligible, and would score 100 if it weren't
];

const best = bestEstimate(history, "bench");
assert.equal(best?.value, 110, "the best estimate, not the heaviest set");
assert.equal(best?.fromWeight, 100, "and it names the set it came from");
assert.equal(best?.fromReps, 3);
assert.equal(bestEstimate(history, "squat"), undefined, "an untrained lift has no estimate");
assert.equal(
  bestEstimate([set("2026-01-01", 60, 20)], "bench"),
  undefined,
  "only ineligible sets means no estimate at all"
);

// --- the curve -------------------------------------------------------------

const series = oneRepMaxSeries(history, "bench");
assert.equal(series.length, 2, "one point per session");
assert.deepEqual(
  series.map((point) => point.date),
  ["2026-01-01", "2026-01-08"],
  "oldest first"
);
assert.equal(series[1].value, 110, "the day's best eligible set");

// A session of nothing but high-rep work draws no point — a zero here would be
// a cliff in the chart that never happened.
assert.equal(
  oneRepMaxSeries([set("2026-02-01", 60, 20)], "bench").length,
  0,
  "an all-ineligible session contributes no point, not a zero"
);

// --- the calculator --------------------------------------------------------

assert.equal(weightForReps(110, 3), 100, "the inverse round-trips");
assert.equal(weightForReps(110, 1), 110, "a single is the max itself");
assert.equal(weightForReps(110, 20), 0, "and it refuses past the same ceiling");

console.log("one-rep-max.test.ts ok");

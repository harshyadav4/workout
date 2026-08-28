import assert from "node:assert/strict";

import {
  DEFAULT_INCREMENT_KG,
  DEFAULT_INCREMENT_SECONDS,
  nextTarget,
  sessionTops
} from "@/lib/progression";
import type { SetLog } from "@/lib/types";

// The property the whole feature rests on: a missed set never advances the load.
// Everything else here is a variation on that.

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

/** A held set: no reps, no load, only seconds. */
const hold = (date: string, seconds: number | undefined, workoutId = "plank"): SetLog => ({
  ...set(date, 0, 0, workoutId),
  durationSeconds: seconds
});

const linear = { rule: "linear" as const };
const base = { plannedWeight: 60, plannedReps: 8, workoutId: "bench" };

// --- sessionTops -----------------------------------------------------------

const mixed = [
  set("2026-01-01", 60, 8),
  set("2026-01-01", 50, 12), // a back-off set, lighter but more reps
  set("2026-01-08", 62.5, 8)
];

assert.deepEqual(
  sessionTops(mixed, "bench").map((top) => top.date),
  ["2026-01-08", "2026-01-01"],
  "newest session first"
);
assert.equal(sessionTops(mixed, "bench")[1].weight, 60, "the top set, not the back-off set");
assert.equal(sessionTops(mixed, "bench").length, 2, "one row per session, not per set");
assert.equal(sessionTops(mixed, "squat").length, 0, "filters by exercise");

// --- no rule, no history ---------------------------------------------------

assert.equal(
  nextTarget({ ...base, setLogs: mixed }).weight,
  60,
  "no settings means the plan stands"
);
assert.equal(
  nextTarget({ ...base, settings: { rule: "off" }, setLogs: mixed }).reason,
  "",
  "off is silent — no reason to show"
);
assert.equal(
  nextTarget({ ...base, settings: linear, setLogs: [] }).weight,
  60,
  "no history means the plan stands"
);

// --- linear ----------------------------------------------------------------

const hit = nextTarget({ ...base, settings: linear, setLogs: [set("2026-01-08", 60, 8)] });
assert.equal(hit.weight, 60 + DEFAULT_INCREMENT_KG, "hit the reps, load goes up");
assert.equal(hit.reps, 8, "reps go back to target");
assert.match(hit.reason, /up to 62\.5kg/, "the reason names the new weight");

const missed = nextTarget({ ...base, settings: linear, setLogs: [set("2026-01-08", 60, 6)] });
assert.equal(missed.weight, 60, "missed the reps, weight does NOT advance");
assert.match(missed.reason, /same weight again/);

const custom = nextTarget({
  ...base,
  settings: { rule: "linear", incrementKg: 5 },
  setLogs: [set("2026-01-08", 60, 8)]
});
assert.equal(custom.weight, 65, "the increment is the calibration knob");

// --- stalls and deload -----------------------------------------------------

const oneMiss = nextTarget({
  ...base,
  settings: linear,
  setLogs: [set("2026-01-08", 60, 6)]
});
assert.equal(oneMiss.weight, 60, "one miss holds the weight — two is the limit, not one");
assert.equal(oneMiss.reason.includes("stalled"), false, "and it is not called a stall yet");

const deload = nextTarget({
  ...base,
  settings: linear,
  setLogs: [set("2026-01-01", 60, 6), set("2026-01-08", 60, 7)]
});
assert.equal(deload.weight, 54, "the second miss deloads: 10% off, rounded to a loadable step");
assert.match(deload.reason, /stalled 2 sessions/);

const brokenStall = nextTarget({
  ...base,
  settings: linear,
  setLogs: [set("2026-01-01", 60, 6), set("2026-01-08", 60, 8), set("2026-01-15", 60, 5)]
});
assert.equal(
  brokenStall.weight,
  60,
  "a good session in between breaks the streak — one bad day is not a stall"
);

const otherWeight = nextTarget({
  ...base,
  settings: linear,
  setLogs: [set("2026-01-01", 55, 5), set("2026-01-08", 60, 6)]
});
assert.equal(otherWeight.weight, 60, "stalls only count at the same weight");

// --- double progression ----------------------------------------------------

const double = { rule: "double" as const, repMax: 12 };
const dbase = { ...base, plannedReps: 8 };

const climbing = nextTarget({ ...dbase, settings: double, setLogs: [set("2026-01-08", 60, 9)] });
assert.equal(climbing.weight, 60, "inside the range the weight holds");
assert.equal(climbing.reps, 10, "and the reps climb by one");

const topped = nextTarget({ ...dbase, settings: double, setLogs: [set("2026-01-08", 60, 12)] });
assert.equal(topped.weight, 62.5, "topping the range moves the weight");
assert.equal(topped.reps, 8, "and drops the reps back to the bottom");

const belowRange = nextTarget({ ...dbase, settings: double, setLogs: [set("2026-01-08", 60, 5)] });
assert.equal(belowRange.weight, 60, "below the range is a miss, not a climb");

// --- bodyweight ------------------------------------------------------------

const bw = { ...base, plannedWeight: 0, plannedReps: 10, workoutId: "pullup" };

const bwHit = nextTarget({ ...bw, settings: linear, setLogs: [set("2026-01-08", 0, 10, "pullup")] });
assert.equal(bwHit.weight, 0, "nothing gets added to a pull-up");
assert.equal(bwHit.reps, 11, "the reps go up instead");

const bwMiss = nextTarget({ ...bw, settings: linear, setLogs: [set("2026-01-08", 0, 7, "pullup")] });
assert.equal(bwMiss.reps, 10, "a missed bodyweight set repeats the target");

const belted = nextTarget({
  ...bw,
  plannedWeight: 10,
  settings: linear,
  setLogs: [set("2026-01-08", 10, 10, "pullup")]
});
assert.equal(belted.weight, 12.5, "a dip belt reads as weight and takes the normal path");

// --- timed sets ------------------------------------------------------------

// A held set stores reps: 0 by design. Judged against a rep target it would read
// as a failure forever and deload a plank into nothing.
const held = nextTarget({
  ...base,
  plannedReps: 0,
  settings: linear,
  setLogs: [set("2026-01-08", 20, 0)]
});
assert.equal(held.weight, 60, "a timed set is left on the plan's own weight");
assert.equal(held.reason, "", "and says nothing");

// --- the time rule ---------------------------------------------------------

const timed = { rule: "time" as const };
const plank = {
  plannedWeight: 0,
  plannedReps: 0,
  plannedDurationSeconds: 45,
  workoutId: "plank"
};

assert.equal(
  sessionTops([hold("2026-02-01", 30), hold("2026-02-01", 50)], "plank")[0].durationSeconds,
  50,
  "the top set of a hold is the longest one, not the first"
);

const reached = nextTarget({ ...plank, settings: timed, setLogs: [hold("2026-02-01", 45)] });
assert.equal(
  reached.durationSeconds,
  45 + DEFAULT_INCREMENT_SECONDS,
  "reaching the target holds longer next time"
);
assert.equal(reached.weight, 0, "and nothing is added to the bar");
assert.match(reached.reason, /go for 50s/, "the reason names the new hold");

// The target is replayed, not read off the template: 47s clears the template's
// own 45 but falls short of the 50 the previous session earned.
const shortOfIt = nextTarget({
  ...plank,
  settings: timed,
  setLogs: [hold("2026-02-01", 45), hold("2026-02-08", 47)]
});
assert.equal(shortOfIt.durationSeconds, 50, "falling short repeats the target rather than raising it");
assert.match(shortOfIt.reason, /47s of 50s/);

const easedOff = nextTarget({
  ...plank,
  settings: timed,
  setLogs: [hold("2026-02-01", 45), hold("2026-02-08", 47), hold("2026-02-15", 48)]
});
assert.equal(easedOff.durationSeconds, 45, "two short sessions cut the target 10%, in whole seconds");
assert.match(easedOff.reason, /stalled 2 sessions at 50s/);

const customSeconds = nextTarget({
  ...plank,
  settings: { rule: "time", incrementSeconds: 15 },
  setLogs: [hold("2026-02-01", 45)]
});
assert.equal(customSeconds.durationSeconds, 60, "the seconds increment is the calibration knob");

// Everything planked before `duration_seconds` existed is a row of 0 reps at
// 0 kg. Read as misses, those rows would deload a lifter on day one.
const noDurations = nextTarget({
  ...plank,
  settings: timed,
  setLogs: [hold("2026-02-01", undefined), hold("2026-02-08", undefined)]
});
assert.equal(noDurations.durationSeconds, 45, "history with no seconds in it leaves the plan alone");
assert.equal(noDurations.reason, "", "and explains nothing, because nothing was judged");

// The rule steps seconds; it must not quietly zero a rep target if someone
// points it at a rep lift.
const timeOnReps = nextTarget({ ...base, settings: timed, setLogs: [set("2026-01-08", 60, 8)] });
assert.equal(timeOnReps.reps, 8, "a rep lift under the time rule keeps its reps");
assert.equal(timeOnReps.weight, 60, "and its weight");

console.log("progression.test.ts ok");

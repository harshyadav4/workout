// Run with: npm run check
import assert from "node:assert/strict";

import { cardioRecords, cardioSessions, cardioTypes, paceTrend, weeklyDistance } from "@/lib/cardio-metrics";
import { buildStreaks } from "@/lib/progress-trends";
import type { SetLog, WorkoutLog } from "@/lib/types";

let n = 0;
const runRow = (logId: string, date: string, km: number, seconds: number, workoutId = "run"): SetLog => ({
  id: `r${(n += 1)}`,
  logId,
  workoutId,
  date,
  setIndex: 0,
  reps: 0,
  weight: 0,
  distanceKm: km,
  durationSeconds: seconds
});
const log = (id: string, date: string, workoutId = "run", name = "Run"): WorkoutLog => ({
  id,
  date,
  workoutId,
  name,
  totalVolume: 0,
  totalSets: 1,
  totalReps: 0,
  peakWeight: 0,
  muscles: []
});

const rows: SetLog[] = [
  runRow("a", "2026-10-13", 5, 1710), // Mon, 5:42 /km
  // Intervals: 4 × 0.4 km is one 1.6 km session.
  ...[0, 1, 2, 3].map((i) => ({ ...runRow("b", "2026-10-15", 0.4, 100), setIndex: i })),
  runRow("c", "2026-10-21", 10, 3300), // next week, 5:30 /km
  runRow("d", "2026-10-22", 20, 2400, "bike"),
  // A lifting row is not cardio.
  { id: "lift", logId: "e", workoutId: "bench", date: "2026-10-22", setIndex: 0, reps: 5, weight: 70 }
];
const logs = [log("a", "2026-10-13"), log("b", "2026-10-15"), log("c", "2026-10-21"), log("d", "2026-10-22", "bike", "Bike")];

const sessions = cardioSessions(rows, logs);
assert.equal(sessions.length, 4, "one session per log; the lifting row is left out");
const intervals = sessions.find((session) => session.logId === "b");
assert.deepEqual([intervals?.km, intervals?.seconds, intervals?.pace], [1.6, 400, 250], "intervals sum into one session");

assert.deepEqual(
  weeklyDistance(sessions, "2026-10-26", 3),
  [
    { week: "2026-10-12", km: 6.6 },
    { week: "2026-10-19", km: 30 },
    { week: "2026-10-26", km: 0 }
  ],
  "km per Monday-first week; an empty week is 0, not missing"
);

assert.deepEqual(cardioTypes(sessions).map((type) => type.name), ["Run", "Bike"], "most-logged kind first");
assert.deepEqual(
  paceTrend(sessions, "run").map((point) => point.pace),
  [342, 250, 330],
  "a run's pace line never mixes in the bike"
);

const records = cardioRecords(sessions);
assert.equal(records.totalKm, 36.6);
assert.equal(records.longest?.logId, "d", "longest distance");
assert.equal(records.fastest?.logId, "d", "fastest pace over at least 1 km (a ride is fast)");
assert.equal(cardioRecords(sessions.filter((s) => s.workoutId === "run")).fastest?.logId, "b", "intervals count once they pass 1 km");
assert.equal(records.longestTime?.logId, "c", "longest time");
assert.deepEqual(cardioRecords([]), { totalKm: 0, longest: undefined, fastest: undefined, longestTime: undefined }, "nothing logged");

// A week with only cardio keeps the streak alive: the streak reads logs, and a
// run writes one like any lift.
const streaks = buildStreaks([log("c", "2026-10-21"), log("x", "2026-10-14")], { start: "2026-10-12", end: "2026-10-25" });
assert.equal(streaks.currentWeeks, 2, "two weeks of runs only are a two-week streak");

console.log("cardio metrics checks passed");

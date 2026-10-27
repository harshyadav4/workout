// Run with: npm run check
import assert from "node:assert/strict";

import {
  CHRONIC_WEEKS,
  GIRTH_CALLOUT_WEEKS,
  buildCumulativeVolume,
  buildGirthCallout,
  buildMuscleMatrix,
  buildPRLedger,
  buildRollingLoad,
  buildSplitDrift,
  buildStreaks,
  buildWeeklyLoadStats,
  daysSincePR,
  matrixBucketFor,
  monthStartKey
} from "@/lib/progress-trends";
import type { DateWindow } from "@/lib/progress-metrics";
import type { WorkoutLog, WorkoutMuscleTarget } from "@/lib/types";

function log(
  date: string,
  workoutId: string,
  overrides: Partial<WorkoutLog> = {},
  targets: WorkoutMuscleTarget[] = [{ muscleId: "pecUpper", engagement: 100 }]
): WorkoutLog {
  return {
    date,
    workoutId,
    name: workoutId,
    totalVolume: 1000,
    totalSets: 4,
    totalReps: 40,
    peakWeight: 100,
    muscles: targets,
    ...overrides
  };
}

// Mondays, so week starts and log dates line up and the arithmetic is readable.
const W = ["2026-01-05", "2026-01-12", "2026-01-19", "2026-01-26", "2026-02-02"];
const window: DateWindow = { start: "2026-01-05", end: "2026-02-08" };

// -- rolling load ----------------------------------------------------------

const flat = W.map((date) => log(date, "bench"));
const load = buildRollingLoad(flat, window);

assert.equal(load.length, 5, "one point per week of history");
assert.deepEqual(
  load.map((point) => point.warm),
  [false, false, false, true, true],
  "the baseline is cold until four weeks sit behind it"
);
assert.equal(
  load.slice(0, CHRONIC_WEEKS - 1).every((point) => point.ratio === undefined),
  true,
  "no ratio is published while the baseline is cold"
);
assert.equal(load[3].ratio, 1, "four identical weeks put the ratio exactly on 1.0");

const spiked = buildRollingLoad(
  [...W.slice(0, 4).map((date) => log(date, "bench")), log(W[4], "bench", { totalVolume: 2000 })],
  window
);
// acute 2000 over a baseline of (1000 + 1000 + 1000 + 2000) / 4 = 1250.
assert.equal(spiked[4].acute, 2000);
assert.equal(spiked[4].chronic, 1250);
assert.equal(spiked[4].ratio, 1.6, "a doubled week reads as a spike, not as 2.0");

assert.deepEqual(buildRollingLoad([], window), [], "no logs, no points — never a NaN");

// The window highlights, it never filters: a point outside it still exists.
const narrow = buildRollingLoad(flat, { start: "2026-02-02", end: "2026-02-08" });
assert.equal(narrow.length, 5, "history outside the window is still computed");
assert.deepEqual(
  narrow.map((point) => point.inWindow),
  [false, false, false, false, true],
  "the window only marks which points fall inside it"
);

// -- PR ledger -------------------------------------------------------------

const ledger = buildPRLedger([
  log("2026-01-05", "bench", { peakWeight: 80 }),
  log("2026-01-12", "bench", { peakWeight: 80 }),
  log("2026-01-19", "bench", { peakWeight: 85 }),
  log("2026-01-26", "bench", { peakWeight: 82 }),
  log("2026-02-02", "squat", { peakWeight: 140 }),
  log("2026-02-09", "bench", { peakWeight: 90 })
]);

assert.equal(ledger.length, 2, "a first appearance is a baseline, not a record");
assert.equal(ledger[0].date, "2026-02-09", "newest first");
assert.deepEqual(
  { from: ledger[0].from, to: ledger[0].to },
  { from: 85, to: 90 },
  "a PR reports what it beat, not just what it hit"
);
assert.equal(ledger[1].date, "2026-01-19");
assert.equal(
  ledger.some((entry) => entry.workoutId === "squat"),
  false,
  "one session of a new lift never announces itself as a record"
);
assert.equal(daysSincePR(ledger, "2026-02-19"), 10, "the plateau reading");
assert.equal(daysSincePR([], "2026-02-19"), undefined);

assert.equal(
  buildPRLedger([log("2026-01-05", "bench", { peakWeight: 0 })]).length,
  0,
  "a lift logged without a weight cannot set a record"
);

// The same lift twice in one day is one log per instance. One day, one record.
{
  const twice = buildPRLedger([
    log("2026-01-05", "curl", { peakWeight: 20 }),
    log("2026-01-12", "curl", { peakWeight: 22 }),
    log("2026-01-12", "curl", { peakWeight: 25 })
  ]);
  assert.equal(twice.length, 1, "two instances on one day make one PR, not two rows with one key");
  assert.deepEqual({ from: twice[0].from, to: twice[0].to }, { from: 20, to: 25 }, "the day's heaviest, against the day before it");
}

// -- muscle matrix ---------------------------------------------------------

assert.equal(matrixBucketFor({ start: "2026-01-01", end: "2026-02-04" }), "week", "35 days");
assert.equal(matrixBucketFor({ start: "2025-08-01", end: "2026-02-04" }), "month", "half a year");
assert.equal(monthStartKey("2026-02-17"), "2026-02-01");

const matrix = buildMuscleMatrix(
  [
    log("2026-01-05", "bench", {}, [{ muscleId: "pecUpper", engagement: 100 }]),
    log("2026-01-12", "row", {}, [{ muscleId: "lats", engagement: 100 }])
  ],
  window
);

assert.equal(matrix.bucket, "week");
assert.equal(matrix.columns.length, 5, "five week columns across the window");
assert.equal(matrix.rows.length, 30, "every muscle keeps its row — an empty row is the finding");
assert.equal(matrix.rows[0].muscleId, "pecUpper", "rows order by total volume");

const pec = matrix.rows.find((row) => row.muscleId === "pecUpper");
assert.equal(pec?.cells[0].share, 100, "the only lift that week took all of that week's volume");
assert.equal(pec?.cells[1].share, 0, "and none of the next week's");
assert.equal(pec?.cells[1].level, 0, "an untouched cell is level 0, never a faint step");

const untouched = matrix.rows.find((row) => row.muscleId === "soleus");
assert.equal(untouched?.total, 0);
assert.equal(
  untouched?.cells.every((cell) => cell.level === 0),
  true,
  "a muscle you never trained is a blank row, not a missing one"
);

// A legacy coarse id still has to land somewhere.
const legacy = buildMuscleMatrix(
  [log("2026-01-05", "old", {}, [{ muscleId: "chest" as never, engagement: 100 }])],
  window
);
assert.equal(
  (legacy.rows.find((row) => row.muscleId === "pecUpper")?.total ?? 0) > 0,
  true,
  "legacy `chest` resolves into the pec heads"
);

// -- cumulative tonnage ----------------------------------------------------

const cumulative = buildCumulativeVolume(
  W.map((date) => log(date, "bench", { totalVolume: 40_000 })),
  window
);

assert.equal(cumulative.total, 200_000);
assert.deepEqual(
  cumulative.points.map((point) => point.total),
  [40_000, 80_000, 120_000, 160_000, 200_000],
  "a running total only goes up"
);
assert.deepEqual(
  cumulative.milestones.map((milestone) => milestone.label),
  ["100k"],
  "only the milestones actually crossed"
);
assert.equal(cumulative.milestones[0].date, "2026-01-19", "crossed on the day it was crossed");
assert.deepEqual(buildCumulativeVolume([], window).milestones, []);

// -- split drift -----------------------------------------------------------

const drift = buildSplitDrift(
  [
    log("2026-01-05", "bench", {}, [{ muscleId: "pecUpper", engagement: 100 }]),
    log("2026-01-05", "squat", {}, [{ muscleId: "gluteMax", engagement: 100 }]),
    log("2026-01-19", "bench", {}, [{ muscleId: "pecUpper", engagement: 100 }])
  ],
  window
);

assert.equal(drift.rows.length, 5);
assert.equal(drift.rows[0].chest, 50, "an even week splits fifty-fifty by share");
assert.equal(drift.rows[0].legs, 50);
assert.equal(drift.rows[2].chest, 100, "a chest-only week is all chest, whatever its tonnage");
assert.equal(
  drift.rows[1].chest + drift.rows[1].legs,
  0,
  "a week you did not train stays on the axis at zero"
);
assert.equal(drift.groups.length, 6);

// -- monotony and strain ---------------------------------------------------

const stats = buildWeeklyLoadStats(
  [
    // One session in the week: six zeros and a spike, so the spread is wide.
    log("2026-01-05", "bench", { totalVolume: 7000 }),
    // Seven identical days: no spread at all.
    ...Array.from({ length: 7 }, (_, offset) =>
      log(`2026-01-${String(12 + offset).padStart(2, "0")}`, "bench", { totalVolume: 1000 })
    )
  ],
  window
);

assert.equal(stats.length, 2);
assert.equal(Math.round((stats[0].monotony ?? 0) * 100) / 100, 0.41, "one spike scores low");
assert.equal(stats[1].monotony, undefined, "seven identical days have no deviation to divide by");
assert.equal(stats[1].strain, undefined, "and therefore no strain rather than a fabricated one");
assert.equal(stats[0].load, 7000);
assert.deepEqual(buildWeeklyLoadStats([], window), []);

// -- streaks ---------------------------------------------------------------

const streaks = buildStreaks(
  [log(W[0], "bench"), log(W[1], "bench"), log(W[4], "bench")],
  window
);

assert.equal(streaks.trainedDays, 3);
assert.equal(streaks.totalDays, 35);
assert.equal(streaks.longestWeeks, 2, "two weeks on, two off, one on");
assert.equal(streaks.currentWeeks, 1, "the streak in progress is the one ending at the window");
assert.equal(
  buildStreaks([], window).currentWeeks,
  0,
  "an empty history has no streak rather than a partial one"
);

// A window ending on a Monday you have not trained yet: the partial week is not
// a break. Without this, eight straight weeks report as zero every Monday.
assert.equal(
  buildStreaks(
    [log(W[0], "bench"), log(W[1], "bench"), log(W[2], "bench")],
    { start: W[0], end: W[3] }
  ).currentWeeks,
  3,
  "an untrained partial final week does not break the streak"
);

// But once that week is complete and still empty, it is a real break.
assert.equal(
  buildStreaks(
    [log(W[0], "bench"), log(W[1], "bench"), log(W[2], "bench")],
    { start: W[0], end: "2026-02-01" }
  ).currentWeeks,
  0,
  "a completed week with no sessions ends the streak"
);

// --- the volume-girth callout ---
//
// The easiest place in this product to overclaim, so the assertions here are
// mostly about what it refuses to say.
{
  const session = (date: string, volume: number) => ({
    id: date,
    date,
    workoutId: "curl",
    name: "Curl",
    totalVolume: volume,
    totalSets: 4,
    totalReps: 40,
    peakWeight: 20,
    muscles: [{ muscleId: "biceps" as const, engagement: 80 }]
  });
  const tape = (date: string, value: number) => ({
    id: date,
    date,
    metric: "armR" as const,
    value
  });

  assert.equal(buildGirthCallout([], []), undefined, "nothing measured is nothing to say");
  assert.equal(
    buildGirthCallout([session("2026-06-01", 100)], [tape("2026-06-01", 35)]),
    undefined,
    "one reading is not a change"
  );

  // Six weeks of real data, and it still says nothing — this is the gate.
  assert.equal(
    buildGirthCallout(
      [session("2026-06-01", 1000), session("2026-07-10", 2000)],
      [tape("2026-06-01", 35), tape("2026-07-13", 36)]
    ),
    undefined,
    `under ${GIRTH_CALLOUT_WEEKS} weeks it returns nothing at all — not a hedged statement`
  );

  const spanned = buildGirthCallout(
    [
      session("2026-06-01", 1000),
      session("2026-06-15", 1000),
      session("2026-07-20", 3000),
      session("2026-08-01", 1000)
    ],
    [tape("2026-06-01", 35), tape("2026-08-03", 36.5)]
  );
  assert.ok(spanned, "past the threshold it speaks");
  assert.equal(spanned?.weeks, 9);
  assert.equal(spanned?.girthChangeCm.toFixed(1), "1.5");
  assert.ok(spanned!.volumeChangePct > 0, "the second half carried more volume than the first");

  assert.equal(
    buildGirthCallout([], [tape("2026-06-01", 35), tape("2026-08-03", 36.5)]),
    undefined,
    "no volume in the first half means no percentage to report, rather than a division by zero"
  );

  // Left and right are separate sites. Sorted by date alone, "first" could be
  // the left arm and "last" the right, and a 1 cm asymmetry read as 1 cm of growth.
  const left = (date: string, value: number) => ({ ...tape(date, value), id: `${date}-L`, metric: "armL" as const });
  const steady = buildGirthCallout(
    [session("2026-06-01", 1000), session("2026-07-15", 1000), session("2026-08-01", 1000)],
    [left("2026-06-01", 35), tape("2026-06-01", 36), left("2026-08-03", 35), tape("2026-08-03", 36)]
  );
  assert.equal(steady?.girthChangeCm, 0, "two arms that did not change report no change");
  const grew = buildGirthCallout(
    [session("2026-06-01", 1000), session("2026-07-15", 1000), session("2026-08-01", 1000)],
    [left("2026-06-01", 35), tape("2026-06-01", 36), left("2026-08-03", 36), tape("2026-08-03", 36.5)]
  );
  assert.equal(grew?.girthChangeCm.toFixed(2), "0.75", "the per-site changes, averaged");

  // A session on the midpoint day belongs to one half, not both.
  const split = buildGirthCallout(
    [session("2026-06-01", 1000), session("2026-07-02", 1000)],
    [tape("2026-06-01", 35), tape("2026-08-03", 36)]
  );
  assert.equal(split?.volumeChangePct, -100, "midpoint (02 Jul) counted once: early 2000, late 0");
}

// The load series runs to the end of the range, so a month off reads as light,
// not as "close to normal" frozen at the last trained week.
{
  const points = buildRollingLoad(
    [log("2026-08-03", "bench"), log("2026-08-10", "bench"), log("2026-08-17", "bench"), log("2026-08-24", "bench"), log("2026-08-31", "bench")],
    { start: "2026-08-01", end: "2026-09-14" }
  );
  const lastPoint = points[points.length - 1];
  assert.equal(lastPoint.key, "2026-09-14", "the series reaches the week of the range's end");
  assert.equal(lastPoint.acute, 0, "and that week is empty");
  assert.equal(lastPoint.ratio, 0, "so the ratio says light, not normal");
}

console.log("progress-trends: ok");

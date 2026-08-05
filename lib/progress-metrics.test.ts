// Run with: npm run check
import assert from "node:assert/strict";

import {
  bucketFor,
  buildCalendar,
  buildMuscleGroupVolume,
  buildMuscleVolume,
  buildRestStats,
  buildStrengthGrowth,
  buildTableRows,
  buildTopSetSeries,
  buildTrend,
  buildWeekdayRhythm,
  buildWeeklySetsByGroup,
  attributeToMuscle,
  buildExerciseTotals,
  daysBetween,
  filterByMuscle,
  muscleEngagement,
  muscleWeeklySets,
  percentChange,
  previousWindow,
  rangeWindow,
  summarize,
  weekStartKey,
  windowDays
} from "@/lib/progress-metrics";
import type { WorkoutLog, WorkoutMuscleTarget } from "@/lib/types";

function log(
  date: string,
  workoutId: string,
  overrides: Partial<WorkoutLog> = {},
  targets: WorkoutMuscleTarget[] = []
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

// -- dates -----------------------------------------------------------------

// Monday-first weeks, read in UTC. A local-time parse shifts the calendar's
// weekday columns by one for anyone west of UTC and nothing here would notice.
assert.equal(weekStartKey("2026-08-01"), "2026-07-27", "Saturday belongs to the Monday before it");
assert.equal(weekStartKey("2026-07-27"), "2026-07-27", "a Monday is its own week start");
assert.equal(weekStartKey("2026-07-26"), "2026-07-20", "Sunday closes the week, it does not open one");
assert.equal(daysBetween("2026-07-27", "2026-08-01"), 5);

// -- ranges ----------------------------------------------------------------

const fourWeeks = rangeWindow("4w", "2026-08-01");
assert.deepEqual(fourWeeks, { start: "2026-07-05", end: "2026-08-01" });
assert.equal(windowDays(fourWeeks), 28, "the window is inclusive of both ends");

const before = previousWindow("4w", fourWeeks);
assert.deepEqual(before, { start: "2026-06-07", end: "2026-07-04" });
assert.equal(
  previousWindow("all", fourWeeks),
  undefined,
  "all-time has nothing before it to compare against"
);

assert.deepEqual(
  rangeWindow("all", "2026-08-01", "2025-01-15"),
  { start: "2025-01-15", end: "2026-08-01" },
  "all-time starts at the first logged day"
);
assert.deepEqual(
  rangeWindow("all", "2026-08-01"),
  { start: "2026-08-01", end: "2026-08-01" },
  "an empty history collapses to today rather than inventing a start"
);

// Hand-picked dates: the window is the picker's, the comparison window is the
// same length before it, and the bucket comes off the length, not the chip.
const picked = rangeWindow("custom", "2026-08-01", undefined, {
  start: "2026-05-04",
  end: "2026-05-31"
});
assert.deepEqual(picked, { start: "2026-05-04", end: "2026-05-31" });
assert.deepEqual(
  rangeWindow("custom", "2026-08-01", undefined, { start: "2026-05-31", end: "2026-05-04" }),
  picked,
  "a backwards pair is read as a range, not as an empty one"
);
assert.deepEqual(previousWindow("custom", picked), { start: "2026-04-06", end: "2026-05-03" });
assert.equal(rangeWindow("custom", "2026-08-01").end, "2026-08-01", "the picker opens on today");

assert.equal(bucketFor(picked), "day", "four weeks of daily bars still read");
assert.equal(bucketFor(rangeWindow("1y", "2026-08-01")), "week", "365 of them do not");

assert.equal(percentChange(120, 100), 20);
assert.equal(percentChange(120, 0), undefined, "no baseline is not +100%");

// -- trend -----------------------------------------------------------------

const trend = buildTrend(
  [log("2026-07-06", "bench"), log("2026-07-06", "fly"), log("2026-07-20", "bench")],
  "week",
  { start: "2026-07-06", end: "2026-07-26" }
);

assert.deepEqual(
  trend.map((point) => point.volume),
  [2000, 0, 1000],
  "the untrained week stays in the series as a zero, not as a missing point"
);
assert.equal(trend[0].sessions, 1, "two exercises on one day are one session");
assert.equal(trend[0].sets, 8);

// -- calendar --------------------------------------------------------------

// Levels are quartiles of the days actually trained, so the ramp only spans its
// full range once there are enough trained days to have quartiles.
const calendar = buildCalendar(
  [100, 200, 300, 400, 500].map((totalVolume, offset) =>
    log(`2026-07-${27 + offset}`, "a", { totalVolume })
  ),
  { start: "2026-07-27", end: "2026-08-02" }
);

assert.equal(calendar.length, 1, "one week start to end is one column");
assert.equal(calendar[0].days[0]?.level, 1, "the lightest trained day sits on the lowest step");
assert.equal(calendar[0].days[2]?.level, 2);
assert.equal(calendar[0].days[3]?.level, 3);
assert.equal(calendar[0].days[4]?.level, 4, "the heaviest day tops the ramp");
assert.equal(calendar[0].days[5]?.level, 0, "a rest day is level 0");
assert.equal(
  buildCalendar([], { start: "2026-07-27", end: "2026-08-02" })[0].days.filter(Boolean).length,
  7,
  "an empty history still draws the week"
);
assert.equal(
  buildCalendar([], { start: "2026-07-29", end: "2026-08-02" })[0].days[0],
  undefined,
  "days before the window are holes, not zero-volume cells"
);

// -- muscles ---------------------------------------------------------------

const chestTargets: WorkoutMuscleTarget[] = [
  { muscleId: "pecUpper", engagement: 60 },
  { muscleId: "pecLower", engagement: 60 },
  { muscleId: "tricepsLong", engagement: 25 }
];

const press = log("2026-07-27", "bench", { totalVolume: 1450, totalSets: 4 }, chestTargets);

const groupVolume = buildMuscleGroupVolume([press]);
const chest = groupVolume.find((item) => item.group === "chest");
const arms = groupVolume.find((item) => item.group === "arms");
assert.equal(chest?.volume, 1200, "volume splits by engagement share: 120 of 145");
assert.equal(arms?.volume, 250);
assert.equal(
  groupVolume.reduce((sum, item) => sum + item.volume, 0),
  1450,
  "no volume is lost or invented by the split"
);

// A log written before the anatomical split carries `chest`, not `pecUpper`.
// Unresolved it matches no muscle and its volume silently vanishes.
const legacy = buildMuscleGroupVolume([
  log("2026-07-27", "old", { totalVolume: 800 }, [{ muscleId: "chest" as never, engagement: 100 }])
]);
assert.equal(
  legacy.find((item) => item.group === "chest")?.volume,
  800,
  "legacy coarse ids still count toward their group"
);

const perMuscle = buildMuscleVolume([press]);
assert.equal(perMuscle[0].muscleId === "pecUpper" || perMuscle[0].muscleId === "pecLower", true);
assert.equal(Math.round(perMuscle[0].share), 41, "shares are percentages of the range's volume");

// Credit is the max across a group's muscles, never the sum — a 4-set bench
// press is 4 sets of chest, not 8 because it engages both pec heads.
const weeklySets = buildWeeklySetsByGroup([press], { start: "2026-07-27", end: "2026-08-02" });
assert.equal(weeklySets.find((item) => item.group === "chest")?.setsPerWeek, 4);
assert.equal(
  weeklySets.find((item) => item.group === "arms")?.setsPerWeek,
  2,
  "engagement 25 is an indirect half-set"
);
assert.equal(
  weeklySets.find((item) => item.group === "legs")?.setsPerWeek,
  0,
  "every group is present so the chart never changes shape"
);
assert.equal(
  buildWeeklySetsByGroup([press], { start: "2026-07-27", end: "2026-08-09" }).find(
    (item) => item.group === "chest"
  )?.setsPerWeek,
  2,
  "the same work over two weeks is half the weekly sets"
);

// -- exercises -------------------------------------------------------------

const growth = buildStrengthGrowth([
  log("2026-06-01", "bench", { peakWeight: 100 }),
  log("2026-07-01", "bench", { peakWeight: 110 }),
  log("2026-06-01", "squat", { peakWeight: 100 }),
  log("2026-07-01", "squat", { peakWeight: 130 }),
  log("2026-07-01", "curl", { peakWeight: 20 })
]);

assert.deepEqual(
  growth.map((item) => item.workoutId),
  ["squat", "bench"],
  "steepest gain first; a single-session lift is not a trend"
);
assert.equal(growth[1].first, 100);
assert.equal(growth[1].last, 110);
assert.equal(growth[1].changePercent, 10);

assert.deepEqual(
  buildTopSetSeries(
    [
      log("2026-07-01", "bench", { peakWeight: 80 }),
      log("2026-07-01", "bench", { peakWeight: 100 }),
      log("2026-06-01", "bench", { peakWeight: 90 }),
      log("2026-06-01", "squat", { peakWeight: 200 })
    ],
    "bench"
  ),
  [
    { date: "2026-06-01", weight: 90 },
    { date: "2026-07-01", weight: 100 }
  ],
  "one point per session, the heaviest set of that day, oldest first"
);
// -- rhythm ----------------------------------------------------------------

const rhythm = buildWeekdayRhythm([
  log("2026-07-27", "a"), // Monday
  log("2026-07-27", "b"), // same day, same session
  log("2026-08-01", "c") // Saturday
]);

assert.deepEqual(
  rhythm.map((item) => item.label),
  ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  "columns run Monday to Sunday, matching the calendar"
);
assert.equal(rhythm[0].sessions, 1, "two exercises on one day are one session");
assert.equal(rhythm[0].volume, 2000);
assert.equal(rhythm[5].sessions, 1);
assert.equal(rhythm[2].sessions, 0, "Wednesday off is a zero column, not a missing one");

const rest = buildRestStats(
  [log("2026-07-27", "a"), log("2026-07-29", "b"), log("2026-07-30", "c")],
  { start: "2026-07-27", end: "2026-08-02" }
);
assert.equal(rest.longestGap, 1, "Mon to Wed is one day off, not two");
assert.equal(rest.averageGap, 0.5, "gaps of 1 and 0");
assert.equal(rest.restDays, 4);
assert.equal(rest.daysSinceLast, 3);
assert.equal(rest.sessionsPerWeek, 3);

// -- summary & table -------------------------------------------------------

const summary = summarize(
  [
    log("2026-07-27", "bench", { totalVolume: 2000, totalSets: 4, totalReps: 40, peakWeight: 100 }),
    log("2026-07-29", "squat", { totalVolume: 3000, totalSets: 6, totalReps: 30, peakWeight: 140 })
  ],
  { start: "2026-07-27", end: "2026-08-02" }
);

assert.equal(summary.volume, 5000);
assert.equal(summary.sessions, 2);
assert.equal(summary.best?.name, "squat");
assert.equal(summary.volumePerWeek, 5000, "a 7-day window is exactly one week");
assert.equal(summary.sessionVolume, 2500);
assert.equal(summary.weightPerRep, 5000 / 70, "average load per rep, the intensity factor");
assert.equal(summary.repsPerSet, 7);
assert.equal(summary.setsPerSession, 5);
assert.equal(
  summarize([], { start: "2026-07-27", end: "2026-08-02" }).weightPerRep,
  0,
  "an empty range divides by zero nowhere"
);

const rows = buildTableRows(
  [
    log("2026-07-27", "bench", { name: "Bench", totalVolume: 2000 }),
    log("2026-07-27", "fly", { name: "Fly", totalVolume: 500 }),
    log("2026-08-01", "squat", { name: "Squat", totalVolume: 3000 })
  ],
  "session"
);

assert.deepEqual(rows.map((row) => row.key), ["2026-08-01", "2026-07-27"], "newest first");
assert.equal(rows[1].detail, "Bench +1", "the heaviest exercise names the session");
assert.equal(rows[1].volume, 2500);

const weekRows = buildTableRows(
  [log("2026-07-27", "bench"), log("2026-08-01", "squat")],
  "week"
);
assert.equal(weekRows.length, 1, "Monday and the Saturday after it are one week");
assert.equal(weekRows[0].detail, "2 sessions · 2 exercises");

// The muscle drill-down: one muscle, its lifts, and the volume that reached it.
const latPull = log("2026-08-01", "row", { name: "Row", totalVolume: 1200 }, [
  { muscleId: "lats", engagement: 80 },
  { muscleId: "biceps", engagement: 40 },
  { muscleId: "abs", engagement: 10 }
]);
const benchPress = log("2026-08-02", "bench", { name: "Bench", totalVolume: 900 }, [
  { muscleId: "pecLower", engagement: 90 }
]);

assert.equal(muscleEngagement(latPull, "lats"), 80);
assert.equal(muscleEngagement(latPull, "gluteMax"), 0, "a muscle the lift never names reads 0");

assert.deepEqual(
  filterByMuscle([latPull, benchPress], "lats").map((entry) => entry.workoutId),
  ["row"]
);
assert.deepEqual(
  filterByMuscle([latPull, benchPress], "abs").map((entry) => entry.workoutId),
  [],
  "10 engagement is along for the ride, not ab work"
);
assert.equal(
  filterByMuscle([latPull], "biceps").length,
  1,
  "40 clears the indirect floor — it counts, at half credit elsewhere"
);

const lats = attributeToMuscle([latPull, benchPress], "lats");
assert.equal(lats.length, 1);
assert.equal(lats[0].totalVolume, (1200 * 80) / 130, "only the share that reached the lats");
assert.equal(latPull.totalVolume, 1200, "the source log is left alone");

// Attribution is NOT floored, or the load chart would total less than the share
// printed beside it. `abs` is below the floor and still carries its 10/130.
assert.equal(
  attributeToMuscle([latPull], "abs")[0].totalVolume,
  (1200 * 10) / 130,
  "sub-floor work still counts toward the muscle's volume"
);
assert.equal(attributeToMuscle([benchPress], "lats").length, 0, "a lift that misses it is dropped");

// Hard sets a week: full credit at 50+, half at 25+, nothing below.
const setWindow = { start: "2026-07-27", end: "2026-08-09" }; // two weeks
assert.equal(muscleWeeklySets([latPull], "lats", setWindow), 2, "4 sets over two weeks");
assert.equal(muscleWeeklySets([latPull], "biceps", setWindow), 1, "engagement 40 is a half set");
assert.equal(muscleWeeklySets([latPull], "abs", setWindow), 0, "engagement 10 is not ab work");
assert.equal(
  muscleWeeklySets([latPull], "lats", { start: "2026-08-01", end: "2026-08-07" }),
  4,
  "the same work over one week is twice the weekly sets"
);

// A log still carrying a legacy coarse id has to resolve into the heads it covers.
assert.equal(
  filterByMuscle(
    [log("2026-08-01", "old", {}, [{ muscleId: "chest" as never, engagement: 70 }])],
    "pecLower"
  )
    .length,
  1,
  "legacy `chest` still drills into the pecs"
);

const totals = buildExerciseTotals([
  log("2026-07-27", "bench", { peakWeight: 80 }),
  log("2026-08-01", "bench", { peakWeight: 95 }),
  log("2026-08-01", "bench", { peakWeight: 90 })
]);
assert.equal(totals[0].sessions, 2, "two dates, three logged entries");
assert.equal(totals[0].topSet, 95);

console.log("progress-metrics: ok");

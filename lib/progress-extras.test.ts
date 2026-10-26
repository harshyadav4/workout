// Run with: npm run check
import assert from "node:assert/strict";

import {
  buildBalance,
  buildBestMonth,
  buildGroupSetsTimeline,
  buildMuscleRecovery,
  buildGoalEta,
  buildMilestones,
  buildMonthCompare,
  buildMonthlyWeightChange,
  buildRecordsPerMonth,
  buildStrengthRatios,
  buildWeeklySessions
} from "@/lib/progress-extras";
import { shiftKey, weekStartKey } from "@/lib/progress-metrics";
import type { BodyMeasurement, MuscleGroup, MuscleId, WorkoutLog } from "@/lib/types";

const today = "2026-10-14";

function log(date: string, workoutId: string, peakWeight = 100, totalVolume = 1000): WorkoutLog {
  return {
    date,
    workoutId,
    name: workoutId,
    totalVolume,
    totalSets: 3,
    totalReps: 30,
    peakWeight,
    muscles: [{ muscleId: "pecUpper", engagement: 100 }]
  };
}

function weigh(date: string, value: number): BodyMeasurement {
  return { id: date, date, metric: "weight", value };
}

// -- milestones ---------------------------------------------------------------

{
  assert.deepEqual(buildMilestones([], today), { earned: [], next: [] });

  // 30 sessions, 1,000 kg each: past 25 sessions, short of 50; 30,000 kg.
  const logs = Array.from({ length: 30 }, (_, index) => log(shiftKey(today, -index * 3), "bench"));
  const { earned, next } = buildMilestones(logs, today);

  const sessions = earned.find((badge) => badge.kind === "sessions");
  assert.equal(sessions?.title, "25 sessions", "the highest step reached, not every step");
  assert.equal(earned.find((badge) => badge.kind === "weight")?.title, "10 thousand kg lifted");

  const nextSessions = next.find((badge) => badge.kind === "sessions");
  assert.equal(nextSessions?.title, "50 sessions");
  assert.equal(nextSessions?.detail, "20 more sessions");
  assert.equal(nextSessions?.progress, 30 / 50);
  assert.equal(next.find((badge) => badge.kind === "weight")?.detail, "70 thousand kg to go");
}

// -- this month vs last month ------------------------------------------------------

{
  const rows = buildMonthCompare(
    [
      log("2026-10-02", "bench", 100),
      log("2026-10-09", "bench", 110),
      log("2026-10-09", "squat", 100),
      log("2026-09-03", "bench", 90),
      // After the 14th of last month: outside the fair comparison.
      log("2026-09-20", "bench", 95)
    ],
    today
  );

  const [sessions, weight, records] = rows;
  assert.equal(sessions.now, 2, "two days, three logs: two sessions");
  assert.equal(sessions.before, 1, "only the 1st–14th of last month counts");
  assert.equal(sessions.change, 100);
  assert.equal(weight.now, 3000);
  assert.equal(records.now, 2, "bench beat 95 on the 2nd and again on the 9th");
  assert.equal(records.before, 0);
  assert.equal(records.change, undefined, "nothing last month: no percent");

  // On the 31st, a 30-day last month compares in full.
  const end = buildMonthCompare([log("2026-09-30", "bench")], "2026-10-31");
  assert.equal(end[0].before, 1);
}

// -- strength vs bodyweight ----------------------------------------------------------

{
  const logs = [
    log("2026-09-01", "curl", 20),
    log("2026-10-01", "curl", 25),
    log("2026-09-01", "squat", 100),
    log("2026-10-01", "squat", 120),
    log("2026-09-01", "bench", 80),
    log("2026-10-01", "bench", 70)
  ];
  const ratios = buildStrengthRatios(logs, [weigh("2026-10-01", 80)]);
  assert.equal(ratios[0].name, "squat");
  assert.equal(ratios[0].ratio, 1.5, "best set over the latest bodyweight");
  assert.equal(ratios[1].best, 80, "the best set, not the latest");
  assert.ok(!ratios.some((row) => row.name === "curl"), "small lifts stay out when big ones exist");
  assert.equal(
    buildStrengthRatios([log("2026-09-01", "curl", 20), log("2026-10-01", "curl", 25)], [weigh("2026-10-01", 80)])[0].name,
    "curl",
    "no big lift: the most-done lifts instead"
  );

  assert.deepEqual(buildStrengthRatios(logs, []), [], "no bodyweight: no ratio");
  assert.equal(buildStrengthRatios(logs, [], 100)[0].ratio, 1.2, "profile weight as the fallback");
}

// -- records per month -------------------------------------------------------------

{
  const groups = new Map<string, MuscleGroup>([
    ["bench", "chest"],
    ["squat", "legs"]
  ]);
  const months = buildRecordsPerMonth(
    [
      log("2026-08-01", "bench", 100),
      log("2026-09-01", "bench", 105),
      log("2026-10-01", "bench", 110),
      log("2026-08-01", "squat", 100),
      log("2026-10-05", "squat", 120)
    ],
    today,
    groups,
    3
  );

  assert.deepEqual(
    months.map((month) => month.key),
    ["2026-08", "2026-09", "2026-10"]
  );
  assert.equal(months[0].total, 0, "a first lift is a starting point");
  assert.equal(months[1].chest, 1);
  assert.equal(months[2].chest, 1);
  assert.equal(months[2].legs, 1);
  assert.equal(months[2].total, 2);
  assert.equal(months[2].label, "Oct");
}

// -- sessions per week ---------------------------------------------------------------

{
  const monday = weekStartKey(today);
  const weeks = buildWeeklySessions(
    [log(monday, "bench"), log(shiftKey(monday, 1), "bench"), log(shiftKey(monday, -7), "bench")],
    today,
    2,
    3
  );

  assert.equal(weeks.length, 3);
  assert.equal(weeks[2].start, monday);
  assert.equal(weeks[2].sessions, 2);
  assert.equal(weeks[2].hit, true);
  assert.equal(weeks[2].partial, true);
  assert.equal(weeks[1].sessions, 1);
  assert.equal(weeks[1].hit, false);
  assert.equal(weeks[0].sessions, 0);

  const best = buildBestMonth([
    log("2026-03-01", "bench"),
    log("2026-03-02", "bench"),
    log("2026-03-02", "squat"),
    log("2026-04-01", "bench")
  ]);
  assert.deepEqual(best, { key: "2026-03", label: "March 2026", sessions: 2 });
  assert.equal(buildBestMonth([]), undefined);
}

// -- goal date ------------------------------------------------------------------------

{
  // Losing 0.5 kg a week from 80, goal 75.
  const weighIns = [0, 7, 14, 21, 28].map((day, index) =>
    weigh(shiftKey("2026-09-16", day), 80 - index * 0.5)
  );
  const eta = buildGoalEta(weighIns, 75, today);
  assert.ok(eta, "a steady trend toward the goal has a date");
  assert.equal(eta!.perWeek, -0.5);
  // At 78 on the 14th, 3 kg at 0.5 a week is 42 days.
  assert.equal(eta!.date, shiftKey(today, 42));

  assert.equal(buildGoalEta(weighIns, 85, today), undefined, "trend away from the goal: no date");
  assert.equal(buildGoalEta(weighIns.slice(0, 2), 75, today), undefined, "too few weigh-ins");
  assert.equal(buildGoalEta(weighIns, undefined, today), undefined, "no goal");
  assert.equal(
    buildGoalEta(
      [0, 7, 14].map((day) => weigh(shiftKey("2026-09-30", day), 80)),
      75,
      today
    ),
    undefined,
    "a flat line never arrives"
  );
}

// -- monthly weight change ---------------------------------------------------------------

{
  const rows = buildMonthlyWeightChange([
    weigh("2026-08-05", 80),
    weigh("2026-08-20", 80),
    weigh("2026-09-05", 79),
    weigh("2026-09-20", 78),
    weigh("2026-10-05", 77.5)
  ]);

  assert.deepEqual(rows, [
    { key: "2026-09", label: "Sep", change: -1.5 },
    { key: "2026-10", label: "Oct", change: -1 }
  ]);
}

// -- muscle recovery ------------------------------------------------------------------

{
  const worked = (date: string, muscleId: MuscleId, engagement = 100): WorkoutLog => ({
    ...log(date, `${muscleId}-lift`),
    muscles: [{ muscleId, engagement }]
  });

  const recovery = buildMuscleRecovery(
    [
      worked(today, "pecUpper"),
      worked(shiftKey(today, -1), "lats"),
      worked(shiftKey(today, -4), "biceps"),
      worked(shiftKey(today, -10), "abs"),
      // Helped, but not worked directly: does not count.
      worked(today, "tricepsLong", 30),
      // A planned future day is not training done.
      worked(shiftKey(today, 2), "gastrocnemius")
    ],
    today
  );
  const state = (id: MuscleId) => recovery.find((muscle) => muscle.muscleId === id);

  assert.equal(state("pecUpper")?.state, "recovering");
  assert.equal(state("lats")?.state, "recovering", "one day is still recovering");
  assert.equal(state("biceps")?.state, "ready");
  assert.equal(state("biceps")?.days, 4);
  assert.equal(state("abs")?.state, "due");
  assert.equal(state("tricepsLong")?.state, "never", "indirect work is not training the muscle");
  assert.equal(state("gastrocnemius")?.state, "never");
  assert.equal(state("pecUpper")?.group, "chest");
}

// -- growth timeline -------------------------------------------------------------------

{
  const monday = weekStartKey(today);
  const timeline = buildGroupSetsTimeline(
    [log(monday, "bench"), log(shiftKey(monday, 2), "bench"), log(shiftKey(monday, -7), "bench")],
    today,
    3
  );

  assert.equal(timeline.length, 3);
  assert.equal(timeline[2].start, shiftKey(monday, -7), "ends at the last complete week");
  assert.ok(!timeline.some((week) => week.start === monday), "the running week is left out");
  assert.equal(timeline[2].chest, 3);
  assert.equal(timeline[1].chest, 0);
  assert.equal(timeline[2].legs, 0);

  const twoSessions = buildGroupSetsTimeline(
    [log(shiftKey(monday, -7), "bench"), log(shiftKey(monday, -5), "bench")],
    today,
    1
  );
  assert.equal(twoSessions[0].chest, 6, "two sessions of three sets");
}

// -- balance ---------------------------------------------------------------------------------

{
  const lift = (workoutId: string, muscleId: MuscleId, totalVolume: number): WorkoutLog => ({
    ...log("2026-10-01", workoutId, 100, totalVolume),
    muscles: [{ muscleId, engagement: 100 }]
  });

  const lopsided = buildBalance([lift("bench", "pecUpper", 2000), lift("row", "lats", 1000)]);
  assert.equal(Math.round(lopsided.pushPull!.leftShare), 67);
  assert.match(lopsided.pushPull!.sentence, /You do 100% more push than pull\. Add a pulling lift/);
  assert.match(lopsided.upperLower!.sentence, /All upper body, no lower body\. Add a leg lift/);

  const even = buildBalance([
    lift("bench", "pecUpper", 1000),
    lift("row", "lats", 1000),
    lift("squat", "vastusLateralis", 2000)
  ]);
  assert.match(even.pushPull!.sentence, /well balanced/);
  assert.match(even.upperLower!.sentence, /well balanced/);

  assert.deepEqual(buildBalance([]), { pushPull: undefined, upperLower: undefined });
}

console.log("progress extras checks passed");

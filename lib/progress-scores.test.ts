// Run with: npm run check
import assert from "node:assert/strict";

import { shiftKey, weekStartKey } from "@/lib/progress-metrics";
import {
  MAX_WINS,
  comparablePrevious,
  bodyRing,
  buildWeightRepsSeries,
  buildWins,
  consistencyRing,
  musclesRing,
  plannedThisWeek,
  strengthRing,
  usualWeeklySessions
} from "@/lib/progress-scores";
import type { BodyMeasurement, ScheduledSession, SetLog, WorkoutLog } from "@/lib/types";

const today = "2026-10-28";
const monday = weekStartKey(today);

function log(date: string, workoutId: string, peakWeight = 100): WorkoutLog {
  return {
    date,
    workoutId,
    name: workoutId,
    totalVolume: peakWeight * 10,
    totalSets: 3,
    totalReps: 30,
    peakWeight,
    muscles: [{ muscleId: "pecUpper", engagement: 100 }]
  };
}

function weigh(date: string, value: number): BodyMeasurement {
  return { id: date, date, metric: "weight", value };
}

function set(date: string, weight: number, reps: number, extra: Partial<SetLog> = {}): SetLog {
  return {
    id: `${date}-${weight}-${reps}`,
    logId: date,
    workoutId: "bench",
    date,
    setIndex: 0,
    reps,
    weight,
    ...extra
  };
}

// -- strength ---------------------------------------------------------------

{
  const empty = strengthRing([]);
  assert.equal(empty.ready, false, "no lifts: ring waits");
  assert.equal(empty.fill, 0);

  // Bench 100 → 110 (+10%), squat 100 → 100 (0%): one of two went up.
  const ring = strengthRing([
    log("2026-09-01", "bench", 100),
    log("2026-10-01", "bench", 110),
    log("2026-09-01", "squat", 100),
    log("2026-10-01", "squat", 100)
  ]);
  assert.equal(ring.ready, true);
  assert.equal(ring.fill, 0.5, "fill is the share of lifts that went up");
  assert.equal(ring.value, "+5%", "value is the average gain");
  assert.equal(ring.tone, "good");
  assert.match(ring.sentence, /1 of your 2 main exercises went up/);
  assert.match(
    strengthRing([log("2026-09-01", "bench", 100), log("2026-10-01", "bench", 110), log("2026-09-01", "squat", 100), log("2026-10-01", "squat", 105)]).sentence,
    /^All 2 main exercises went up/
  );

  const single = strengthRing([log("2026-09-01", "bench", 100), log("2026-10-01", "bench", 120)]);
  assert.match(single.sentence, /^bench went up 20%/, "one lift is named, not counted");

  const down = strengthRing([log("2026-09-01", "bench", 100), log("2026-10-01", "bench", 90)]);
  assert.equal(down.tone, "low");
  assert.equal(down.value, "-10%");

  // Only the five most-trained lifts speak for the ring.
  const many = ["a", "b", "c", "d", "e"].flatMap((id) => [
    log("2026-09-01", id, 100),
    log("2026-09-15", id, 100),
    log("2026-10-01", id, 100)
  ]);
  const rare = [log("2026-09-01", "rare", 50), log("2026-10-01", "rare", 100)];
  assert.equal(strengthRing([...many, ...rare]).value, "0%", "a rarely done lift is left out");
}

// -- consistency ------------------------------------------------------------

{
  assert.equal(usualWeeklySessions([], today), 3, "no history: the default target");

  // Four sessions a week for the last eight weeks.
  const habit = Array.from({ length: 8 }, (_, week) =>
    [0, 1, 2, 3].map((day) => log(shiftKey(monday, -7 * (week + 1) + day), "bench"))
  ).flat();
  assert.equal(usualWeeklySessions(habit, today), 4, "the usual week is read from history");

  const behind = consistencyRing([...habit, log(monday, "bench")], today);
  assert.equal(behind.value, "1/4");
  assert.equal(behind.fill, 0.25);
  assert.match(behind.sentence, /3 more workouts to reach 4 this week/);
  assert.match(behind.sentence, /9-week streak/, "a live streak is named");

  const keepStreak = consistencyRing(habit, today);
  assert.equal(keepStreak.value, "0/4");
  assert.match(keepStreak.sentence, /Do 1 workout this week to keep your 8-week streak/);

  const done = consistencyRing(
    [...habit, ...[0, 1].map((day) => log(shiftKey(monday, day), "bench"))],
    today,
    2
  );
  assert.equal(done.fill, 1, "a passed target fills the ring");
  assert.equal(done.tone, "good");
  assert.match(done.sentence, /Weekly goal done, 9 weeks in a row/);

  // Two exercises on one day are one session.
  const sameDay = consistencyRing([log(monday, "bench"), log(monday, "squat")], today, 3);
  assert.equal(sameDay.value, "1/3");

  assert.equal(consistencyRing([], today).ready, false);

  const plan = (date: string, type: "workout" | "rest" = "workout"): ScheduledSession => ({
    id: date,
    date,
    dayIndex: 0,
    sessionName: "Push",
    exercises: [],
    type,
    status: "planned",
    source: "repeat"
  });
  assert.equal(
    plannedThisWeek(
      [plan(monday), plan(shiftKey(monday, 2)), plan(shiftKey(monday, 3), "rest"), plan(shiftKey(monday, 7))],
      today
    ),
    2,
    "only this week's workout days count"
  );
  assert.equal(plannedThisWeek([], today), undefined, "no plan: no goal from it");
}

// -- body -------------------------------------------------------------------

{
  assert.equal(bodyRing([]).ready, false, "no weigh-ins: ring waits");
  const noGoal = bodyRing([weigh("2026-10-01", 80)]);
  assert.equal(noGoal.ready, false);
  assert.match(noGoal.sentence, /Set a goal weight/);

  // Losing: 80 → 77 toward 75. Single readings a week apart, so the average is the reading.
  const losing = bodyRing([weigh("2026-09-01", 80), weigh("2026-10-01", 77)], 75);
  assert.equal(losing.fill, 0.6);
  assert.equal(losing.value, "3.0 kg");
  assert.match(losing.sentence, /3\.0 kg of 5\.0 kg done, 2\.0 kg to go\./);
  assert.equal(losing.tone, "good");

  // Gaining works by the sign of the goal.
  const gaining = bodyRing([weigh("2026-09-01", 60), weigh("2026-10-01", 62)], 64);
  assert.equal(gaining.fill, 0.5);

  const wrongWay = bodyRing([weigh("2026-09-01", 80), weigh("2026-10-01", 82)], 75);
  assert.equal(wrongWay.fill, 0);
  assert.equal(wrongWay.tone, "low");

  const reached = bodyRing([weigh("2026-09-01", 80), weigh("2026-10-01", 75.3)], 75);
  assert.equal(reached.fill, 1);
  assert.match(reached.sentence, /Goal reached/);

  // The 7-day average, not the last reading: one heavy morning does not empty the ring.
  const noisy = bodyRing(
    [weigh("2026-09-01", 80), weigh("2026-10-20", 77), weigh("2026-10-21", 79)],
    75
  );
  assert.equal(noisy.value, "2.0 kg");
}

// -- wins -------------------------------------------------------------------

{
  const window = { start: "2026-09-01", end: today };
  const logs = [
    log("2026-08-01", "bench", 80),
    log("2026-09-02", "bench", 90),
    log("2026-10-27", "bench", 100),
    log("2026-09-02", "squat", 100),
    log("2026-10-20", "squat", 120)
  ];

  const wins = buildWins({
    logs,
    window,
    measurements: [weigh("2026-09-01", 80), weigh("2026-10-01", 77)],
    goalWeightKg: 75,
    today
  });

  assert.equal(wins[0].kind, "record", "a record leads");
  assert.equal(wins[0].title, "New record: bench 100 kg");
  assert.match(wins[0].detail, /3 records in this range · latest yesterday/);
  assert.ok(
    wins.some((win) => win.kind === "strength" && win.title === "squat: 100 → 120 kg"),
    "the growing lift is listed"
  );
  assert.ok(
    !wins.some((win) => win.kind === "strength" && win.title.startsWith("bench")),
    "the record lift is not listed twice"
  );
  assert.ok(
    wins.some((win) => win.kind === "body" && win.title === "Bodyweight: 80.0 → 77.0 kg"),
    "bodyweight toward the goal is a win, told as the change"
  );
  assert.ok(wins.length <= MAX_WINS);

  const quiet = buildWins({
    logs: [log("2026-01-01", "bench", 100)],
    window,
    measurements: [],
    today
  });
  assert.deepEqual(quiet, [], "nothing good to say: no wins, not bad news");
}

// -- weight and reps --------------------------------------------------------

{
  const series = buildWeightRepsSeries(
    [
      set("2026-10-01", 60, 8),
      set("2026-10-01", 60, 10),
      set("2026-10-01", 50, 12),
      set("2026-10-08", 65, 6),
      set("2026-10-08", 0, 20),
      set("2026-10-15", 0, 0, { durationSeconds: 60 }),
      { ...set("2026-10-15", 70, 5), workoutId: "squat" }
    ],
    "bench"
  );

  assert.deepEqual(series, [
    { date: "2026-10-01", weight: 60, reps: 10 },
    { date: "2026-10-08", weight: 65, reps: 6 }
  ]);
}


// -- comparison -------------------------------------------------------------

{
  const summary = (sessions: number) => ({ sessions }) as Parameters<typeof comparablePrevious>[0];
  assert.equal(comparablePrevious(summary(200), summary(4)), undefined, "a few days is not a year");
  assert.equal(comparablePrevious(summary(10), summary(2)), undefined, "too few sessions to compare");
  assert.ok(comparablePrevious(summary(10), summary(6)), "a real earlier period compares");
  assert.equal(comparablePrevious(summary(10)), undefined);
}

// -- muscles ----------------------------------------------------------------

{
  const sets = (values: number[]) =>
    ["Chest", "Back", "Shoulders", "Arms", "Core", "Legs"].map((label, index) => ({
      group: label.toLowerCase() as "chest",
      label,
      setsPerWeek: values[index]
    }));

  const empty = musclesRing(sets([0, 0, 0, 0, 0, 0]));
  assert.equal(empty.ready, false, "no training: ring waits");
  assert.equal(empty.value, "0/6");

  const mixed = musclesRing(sets([12, 14, 10, 20, 3, 25]));
  assert.equal(mixed.value, "4/6", "10 and 20 are both on goal");
  assert.equal(mixed.fill, 4 / 6);
  assert.equal(mixed.tone, "steady");
  assert.match(mixed.sentence, /Core gets 3\.0 sets a week/, "the lowest group is named");

  const skipped = musclesRing(sets([12, 14, 10, 15, 0, 12]));
  assert.match(skipped.sentence, /Core gets no sets/);
  assert.equal(skipped.tone, "good");

  assert.match(musclesRing(sets([12, 12, 12, 12, 12, 12])).sentence, /All 6 muscle groups/);
  assert.match(musclesRing(sets([12, 12, 12, 12, 12, 30])).sentence, /Legs gets over 20/);
}

console.log("progress score checks passed");

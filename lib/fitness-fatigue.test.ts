// Run with: npm run check
import assert from "node:assert/strict";

import {
  FATIGUE_TAU,
  buildBanister,
  buildEffectiveReps,
  buildRepDropoff,
  buildRestAdherence,
  buildRirMaxes,
  buildSessionDensity,
  effectiveReps,
  formState,
  rirAdjustedE1rm
} from "@/lib/fitness-fatigue";
import { shiftKey } from "@/lib/progress-metrics";
import type { MuscleGroup, ScheduledSession, SetLog, WorkoutLog } from "@/lib/types";

const today = "2026-10-28";
const allTime = { start: "2000-01-01", end: today };
let count = 0;
const log = (date: string, totalVolume: number, workoutId = "bp", name = "Bench Press"): WorkoutLog => ({ id: `l${(count += 1)}`, date, workoutId, name, totalVolume, muscles: [] });
const set = (logId: string, workoutId: string, setIndex: number, reps: number, weight: number, rir?: number, date = today): SetLog => ({ id: `s${(count += 1)}`, logId, workoutId, date, setIndex, reps, weight, rir });
const near = (a: number, b: number, tolerance: number, message: string) => assert.ok(Math.abs(a - b) <= tolerance, `${message}: ${a} vs ${b}`);

// --- Banister ------------------------------------------------------------------

{
  // One session, then rest: fatigue decays to 1/e of its peak after exactly τ days.
  const start = shiftKey(today, -20);
  const points = buildBanister([log(start, 7000)], allTime, today);
  assert.equal(points.length, 21, "one point a day from the first log to today");
  const peak = points[0].fatigue;
  near(points[FATIGUE_TAU].fatigue, peak * Math.exp(-1), 1e-9, "1/e after τ days");
  assert.ok(points[0].fitness < points[0].fatigue, "a single day moves the fast average more than the slow one");
  points.forEach((point) => near(point.form, point.fitness - point.fatigue, 1e-9, "form is the difference"));
  assert.equal(points[0].form < 0, true, "the day of a session, form is negative");

  // A constant daily load converges to that load on both lines, so the axis is kg/day.
  const steady = Array.from({ length: 400 }, (_, i) => log(shiftKey(today, -399 + i), 1000));
  const last = buildBanister(steady, allTime, today).at(-1)!;
  near(last.fitness, 1000, 1, "fitness converges to the daily load");
  near(last.fatigue, 1000, 1, "so does fatigue");
  assert.equal(formState(last), "steady");
  assert.equal(formState({ fitness: 1000, form: 200 }), "fresh");
  assert.equal(formState({ fitness: 1000, form: -200 }), "loaded");
  assert.equal(formState({ fitness: 1000, form: -400 }), "run down");
  assert.deepEqual(buildBanister([], allTime, today), [], "no logs, no points");
}

// --- rep drop-off ----------------------------------------------------------------

{
  const logs = [log(today, 1, "bp"), log(today, 1, "sq", "Squat")];
  const sets = [
    set("a", "bp", 0, 10, 80), set("a", "bp", 1, 8, 80), set("a", "bp", 2, 6, 80), // 40 % drop
    set("b", "bp", 0, 10, 80, undefined, shiftKey(today, -3)), set("b", "bp", 1, 9, 80, undefined, shiftKey(today, -3)), // 10 %
    set("c", "sq", 0, 5, 100), set("c", "sq", 1, 5, 110), // weight changed: not counted
    set("d", "sq", 0, 5, 100, undefined, shiftKey(today, -3)), set("d", "sq", 1, 5, 100, undefined, shiftKey(today, -3)) // 0 %, one session only
  ];
  const rows = buildRepDropoff(sets, logs, allTime);
  assert.deepEqual(rows.map((row) => row.workoutId), ["bp"], "the squat has one usable session, under the floor of two");
  assert.equal(rows[0].medianPercent, 25, "median of 40 and 10");
  assert.equal(rows[0].sessions, 2);
  assert.equal(rows[0].flagged, true, "25 % is the flag");
}

// --- rest: same-exercise gaps against the plan -----------------------------------------

{
  const at = (minute: number, second = 0) => `${today}T18:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}.000Z`;
  const session: ScheduledSession = {
    id: "x", date: today, dayIndex: 0, sessionName: "Push", type: "workout", status: "completed", source: "manual",
    startedAt: at(0), finishedAt: at(40),
    exercises: [
      { id: "e1", workoutId: "bp", templateName: "Bench Press", restSeconds: 120, sets: [
        { id: "1", reps: 5, weight: 80, type: "normal", completed: true, completedAt: at(2) },
        { id: "2", reps: 5, weight: 80, type: "normal", completed: true, completedAt: at(5) },
        { id: "3", reps: 5, weight: 80, type: "normal", completed: true, completedAt: at(7, 30) }
      ] },
      { id: "e2", workoutId: "fly", templateName: "Fly", sets: [
        { id: "4", reps: 12, weight: 15, type: "normal", completed: true, completedAt: at(9) },
        { id: "5", reps: 12, weight: 15, type: "normal", completed: true, completedAt: at(11) }
      ] }
    ]
  };
  const rows = buildRestAdherence([session], allTime);
  assert.deepEqual(rows.map((row) => row.name), ["Bench Press"], "no planned rest on the fly, so nothing to compare");
  assert.equal(rows[0].medianGap, 165, "median of 180 and 150 seconds");
  assert.equal(rows[0].gaps, 2);
  assert.equal(rows[0].plannedSeconds, 120);
  assert.deepEqual(buildRestAdherence([{ ...session, status: "planned" }], allTime), [], "only finished sessions");
}

// --- density ----------------------------------------------------------------------------------

{
  const session = (id: string, date: string, minutes: number): ScheduledSession => ({
    id, date, dayIndex: 0, sessionName: "Push", type: "workout", status: "completed", source: "manual", exercises: [],
    startedAt: `${date}T18:00:00.000Z`, finishedAt: `${date}T18:${String(minutes).padStart(2, "0")}:00.000Z`
  });
  const untimed: ScheduledSession = { ...session("u", shiftKey(today, -1), 30), startedAt: undefined, finishedAt: undefined };
  const points = buildSessionDensity([session("a", today, 50), untimed], [log(today, 5000), log(shiftKey(today, -1), 4000)], allTime);
  assert.equal(points.length, 1, "the untimed session has no minutes to divide by");
  assert.equal(points[0].kgPerMin, 100);
  assert.equal(points[0].kg, 5000);
}

// --- effective reps and RIR-adjusted max ------------------------------------------------------

assert.equal(effectiveReps(10, 0), 5, "to failure: the last five count");
assert.equal(effectiveReps(3, 4), 1);
assert.equal(effectiveReps(8, 5), 0, "five in the tank: nothing stimulating");
assert.equal(effectiveReps(3, 0), 3, "a triple to failure is three, not five");
near(rirAdjustedE1rm(100, 5, 2), 100 * (1 + 7 / 30), 1e-9, "Epley on reps-to-failure");
assert.equal(rirAdjustedE1rm(100, 10, 3), 0, "13 reps-to-failure is past the ceiling, like a 13-rep set");
{
  const groupOf = new Map<string, MuscleGroup>([["bp", "chest"], ["sq", "legs"]]);
  const sets = [set("a", "bp", 0, 8, 80, 2), set("a", "bp", 1, 8, 80, 0), set("b", "sq", 0, 5, 100), set("c", "bp", 0, 10, 70, 5)];
  const report = buildEffectiveReps(sets, allTime, groupOf);
  assert.deepEqual(report.rows, [{ group: "chest", label: "Chest", effective: 8, rated: 3 }], "3 + 5 + 0; the unrated squat is not a chest row");
  assert.equal(report.rated, 3);
  assert.equal(report.unrated, 1);

  const maxes = buildRirMaxes(sets, [log(today, 1, "bp")]);
  assert.equal(maxes.length, 1);
  assert.equal(maxes[0].adjusted, 106.5, "80 × 8 with 2 left is 80 × (1 + 10/30)");
  assert.equal(maxes[0].plain, 101.5);
  assert.equal(maxes[0].rir, 2);
}

console.log("fitness-fatigue checks passed");

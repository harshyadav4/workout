// Run with: npm run check
import assert from "node:assert/strict";

import { starterScheduledSessions } from "@/lib/seed-data";
import {
  buildLogFromSession,
  firstPendingSetId,
  normalizeMuscleHeat,
  plannedExercisesFromTemplate,
  removeSetFromExercises,
  sessionTotals
} from "@/lib/workout-helpers";
import type { PlannedSet, ScheduledSession, SessionTemplate, WorkoutTemplate } from "@/lib/types";

let setCount = 0;

function set(reps: number, weight: number, completed?: boolean): PlannedSet {
  setCount += 1;
  return { id: `set-${setCount}`, reps, weight, type: "normal", completed };
}

function session(sets: { name: string; sets: PlannedSet[] }[]): ScheduledSession {
  return {
    id: "s1",
    date: "2026-07-22",
    dayIndex: 3,
    sessionName: "Push A",
    type: "workout",
    status: "completed",
    source: "repeat",
    exercises: sets.map((item, index) => ({
      id: `e${index}`,
      workoutId: item.name,
      templateName: item.name,
      sets: item.sets
    }))
  };
}

const templates: WorkoutTemplate[] = [
  {
    id: "bench",
    name: "Bench Press",
    category: "push",
    isPreset: true,
    muscles: [{ muscleId: "pecLower", engagement: 80 }]
  }
];

// Nothing was ticked off: Finish must not credit sets their own Log set
// button was never tapped for, even though the whole session was planned.
const untracked = buildLogFromSession(
  session([{ name: "bench", sets: [set(8, 60), set(8, 60), set(6, 65)] }]),
  templates
);
assert.deepEqual(untracked, []);

// Cut short after two sets: the third was never done and must not be logged.
const partial = buildLogFromSession(
  session([{ name: "bench", sets: [set(8, 60, true), set(8, 60, true), set(6, 65)] }]),
  templates
);
assert.equal(partial[0].totalSets, 2);
assert.equal(partial[0].totalReps, 16);
assert.equal(partial[0].totalVolume, 8 * 60 * 2);
assert.equal(partial[0].peakWeight, 60);

// An exercise you never started drops out entirely rather than logging a zero.
const skipped = buildLogFromSession(
  session([
    { name: "bench", sets: [set(8, 60, true)] },
    { name: "fly", sets: [set(12, 15), set(12, 15)] }
  ]),
  templates
);
assert.deepEqual(
  skipped.map((log) => log.name),
  ["bench"]
);

// Marked in one exercise, unmarked in another: each exercise counts only its
// own completed sets.
const mixed = buildLogFromSession(
  session([
    { name: "bench", sets: [set(8, 60, true), set(8, 60)] },
    { name: "fly", sets: [set(12, 15, true)] }
  ]),
  templates
);
assert.deepEqual(
  mixed.map((log) => log.totalSets),
  [1, 1]
);

// A session where nothing at all was logged produces no entries.
assert.deepEqual(buildLogFromSession(session([{ name: "bench", sets: [] }]), templates), []);

// --- what Home opens, and what it counts ---

const midSession = session([
  { name: "bench", sets: [set(8, 60, true), set(8, 60)] },
  { name: "fly", sets: [set(12, 15), set(12, 15)] }
]);

// The open set is the first unlogged one, and it crosses into the next exercise
// once this one is finished.
assert.equal(firstPendingSetId(midSession), midSession.exercises[0].sets[1].id);
const spillover = session([
  { name: "fly", sets: [set(12, 15, true)] },
  { name: "row", sets: [set(10, 40)] }
]);
assert.equal(firstPendingSetId(spillover), spillover.exercises[1].sets[0].id);

// A finished session has nothing left to open, and neither does an empty one.
assert.equal(firstPendingSetId(session([{ name: "bench", sets: [set(8, 60, true)] }])), undefined);
assert.equal(firstPendingSetId(undefined), undefined);

// Header counts: progress is what you logged, never the plan.
const live = sessionTotals(midSession);
assert.equal(live.done, 1);
assert.equal(live.total, 4);
assert.equal(live.volume, 8 * 60);

// Finishing without ticking anything logs nothing — Finish cannot promise
// more than the Log set button actually recorded.
const untouched = sessionTotals(session([{ name: "bench", sets: [set(8, 60), set(8, 60)] }]));
assert.equal(untouched.done, 0);
assert.equal(untouched.loggedSets, 0);
assert.equal(untouched.loggedVolume, 0);

// Only ticked sets are on the books — the same rule buildLogFromSession
// applies, so the header cannot promise more than it logs.
assert.equal(live.loggedSets, 1);
assert.equal(live.loggedVolume, 8 * 60);
assert.deepEqual(sessionTotals(undefined), {
  done: 0,
  total: 0,
  volume: 0,
  loggedSets: 0,
  loggedVolume: 0
});

// --- removing a set ---

const twoExercises = session([
  { name: "bench", sets: [set(8, 60, true), set(8, 60)] },
  { name: "fly", sets: [set(12, 15)] }
]);
const benchSets = twoExercises.exercises[0].sets;

// The named set goes, its neighbours and the other exercise are untouched.
const trimmed = removeSetFromExercises(twoExercises.exercises, "e0", benchSets[0].id);
assert.deepEqual(
  trimmed[0].sets.map((setItem) => setItem.id),
  [benchSets[1].id]
);
assert.equal(trimmed[1], twoExercises.exercises[1]);

// The last set of an exercise stays: 0/0 sets would read as finished.
assert.deepEqual(removeSetFromExercises(trimmed, "e0", benchSets[1].id), trimmed);
assert.deepEqual(
  removeSetFromExercises(twoExercises.exercises, "e1", twoExercises.exercises[1].sets[0].id),
  twoExercises.exercises
);

// Unknown ids are a no-op, not a throw.
assert.deepEqual(removeSetFromExercises(twoExercises.exercises, "nope", "nope"), [
  ...twoExercises.exercises
]);

// Home tracks one open set by id across every exercise on screen, so ids have
// to be unique session-wide. Duplicates would open a panel in every exercise.
for (const scheduled of starterScheduledSessions) {
  const ids = scheduled.exercises.flatMap((exercise) => exercise.sets.map((setItem) => setItem.id));
  assert.equal(new Set(ids).size, ids.length, `duplicate set ids in ${scheduled.sessionName}`);
}

// Muscle heat sums engagement without a ceiling, so the body map has to read it
// relative to the hardest-hit muscle — otherwise a month of training paints
// every trained muscle the same maximum shade.
const rawHeat = [
  { muscleId: "pecLower" as const, name: "Mid & Lower Chest", intensity: 480 },
  { muscleId: "lats" as const, name: "Lats", intensity: 120 },
  { muscleId: "soleus" as const, name: "Soleus", intensity: 0 }
];
const scaled = normalizeMuscleHeat(rawHeat);
assert.equal(scaled.find((item) => item.muscleId === "pecLower")?.intensity, 100, "the peak anchors 100");
assert.equal(scaled.find((item) => item.muscleId === "lats")?.intensity, 25, "the rest scale against it");
assert.equal(scaled.find((item) => item.muscleId === "soleus")?.intensity, 0, "untrained stays cold");

// An empty range must not divide by zero and paint the whole body.
assert.deepEqual(
  normalizeMuscleHeat(rawHeat.map((item) => ({ ...item, intensity: 0 }))).map((item) => item.intensity),
  [0, 0, 0]
);

// The builder's per-exercise note has to survive onto the planned exercise —
// the ledger reads `targetNotes`, so dropping it here blanks the note silently.
const noted: SessionTemplate = {
  id: "session-push",
  name: "Push",
  workoutIds: ["bench"],
  exercises: [
    {
      id: "e1",
      workoutId: "bench",
      name: "Bench press",
      muscles: [],
      sets: 3,
      reps: 8,
      weight: 60,
      restSeconds: 90,
      notes: "Elbows at 45 degrees"
    }
  ],
  summary: { totalSets: 3, totalReps: 24, totalWeight: 1440 }
};
assert.equal(plannedExercisesFromTemplate(noted)[0].targetNotes, "Elbows at 45 degrees");
assert.equal(
  plannedExercisesFromTemplate({
    ...noted,
    exercises: [{ ...noted.exercises[0], notes: undefined }]
  })[0].targetNotes,
  undefined,
  "no note stays absent rather than becoming an empty string"
);

// A held exercise (plank, carry, run) scores zero reps on purpose: that is what
// keeps it out of volume, totalReps and peakWeight without a guard downstream.
const plank: SessionTemplate = {
  id: "session-core",
  name: "Core",
  workoutIds: ["plank"],
  exercises: [
    {
      id: "e1",
      workoutId: "plank",
      name: "Plank",
      muscles: [],
      sets: 3,
      // Deliberately non-zero: the builder writes 0 for a hold, but the field is
      // required and a record switched from reps to time can carry the old count
      // over. The helper, not the writer, is what has to guarantee the zero.
      reps: 10,
      weight: 0,
      restSeconds: 60,
      metric: "time",
      durationSeconds: 45
    }
  ],
  summary: { totalSets: 3, totalReps: 0, totalWeight: 0 }
};

const heldExercise = plannedExercisesFromTemplate(plank)[0];
assert.equal(heldExercise.metric, "time", "the metric reaches the planned exercise");
assert.deepEqual(
  heldExercise.sets.map((item) => item.durationSeconds),
  [45, 45, 45]
);
assert.deepEqual(heldExercise.sets.map((item) => item.reps), [0, 0, 0]);
assert.ok(
  heldExercise.sets.every((item) => item.type === "normal"),
  "a drop set is a load concept and must not appear on a hold"
);

const heldLog = buildLogFromSession(
  {
    id: "s-core",
    date: "2026-07-23",
    dayIndex: 4,
    sessionName: "Core",
    type: "workout",
    status: "completed",
    source: "manual",
    exercises: [
      { ...heldExercise, sets: heldExercise.sets.map((item) => ({ ...item, completed: true })) }
    ]
  },
  []
)[0];
assert.equal(heldLog.totalVolume, 0, "a hold adds no volume");
assert.equal(heldLog.totalReps, 0, "a hold adds no reps");
assert.equal(heldLog.peakWeight, 0, "a bodyweight hold never becomes a peak lift");
assert.equal(heldLog.totalSets, 3, "but the sets still count, so streaks hold");

console.log("session log checks passed");

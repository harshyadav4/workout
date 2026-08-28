// Run with: npm run check
import assert from "node:assert/strict";

import { starterScheduledSessions } from "@/lib/seed-data";
import {
  buildLogFromSession,
  firstPendingSetId,
  nextPendingSetId,
  normalizeMuscleHeat,
  lastPerformance,
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
assert.deepEqual(untracked.logs, []);
assert.deepEqual(untracked.setLogs, [], "and no set rows either");

// Cut short after two sets: the third was never done and must not be logged.
const partial = buildLogFromSession(
  session([{ name: "bench", sets: [set(8, 60, true), set(8, 60, true), set(6, 65)] }]),
  templates
);
assert.equal(partial.logs[0].totalSets, 2);
assert.equal(partial.logs[0].totalReps, 16);
assert.equal(partial.logs[0].totalVolume, 8 * 60 * 2);
assert.equal(partial.logs[0].peakWeight, 60);

// An exercise you never started drops out entirely rather than logging a zero.
const skipped = buildLogFromSession(
  session([
    { name: "bench", sets: [set(8, 60, true)] },
    { name: "fly", sets: [set(12, 15), set(12, 15)] }
  ]),
  templates
);
assert.deepEqual(
  skipped.logs.map((log) => log.name),
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
  mixed.logs.map((log) => log.totalSets),
  [1, 1]
);

// A session where nothing at all was logged produces no entries.
assert.deepEqual(buildLogFromSession(session([{ name: "bench", sets: [] }]), templates).logs, []);

// `workout_logs` stays a rollup and `set_logs` is the grain beneath it. Nothing
// re-derives one from the other at read time, so the only thing keeping them
// honest is that one function emits both — assert they agree.
{
  const built = buildLogFromSession(
    session([
      {
        name: "bench",
        sets: [set(8, 60, true), set(8, 62.5, true), set(6, 65, true), set(6, 65), set(6, 65)]
      },
      { name: "fly", sets: [set(12, 15), set(12, 15), set(12, 15)] }
    ]),
    templates
  );

  assert.equal(built.setLogs.length, 3, "only completed sets become rows — 3 of 8");
  assert.deepEqual(
    built.setLogs.map((row) => [row.setIndex, row.reps, row.weight]),
    [
      [0, 8, 60],
      [1, 8, 62.5],
      [2, 6, 65]
    ],
    "each row carries its own reps and weight, in session order"
  );

  assert.equal(built.logs.length, 1, "the un-started exercise drops from both");
  assert.equal(
    built.logs[0].totalVolume,
    built.setLogs.reduce((sum, row) => sum + row.reps * row.weight, 0),
    "the rollup is exactly the sum of the rows beneath it"
  );
  assert.ok(
    built.setLogs.every((row) => row.logId === built.logs[0].id),
    "every set row points at the rollup it belongs to — the FK the migration cascades on"
  );
}

// A warm-up happened, and counts for nothing. Left in, it inflates exactly the
// weekly set total the 10-20 band comparison rests on.
{
  const built = buildLogFromSession(
    session([
      {
        name: "bench",
        sets: [set(10, 20, true), set(8, 60, true), set(8, 60, true)]
      }
    ]),
    templates
  );
  assert.equal(built.logs[0].totalSets, 3, "with nothing flagged, all three count");

  const withWarmUp = buildLogFromSession(
    {
      ...session([{ name: "bench", sets: [] }]),
      exercises: [
        {
          id: "e1",
          workoutId: "bench",
          templateName: "Bench press",
          sets: [
            { id: "w", reps: 10, weight: 20, type: "warmup", completed: true },
            { id: "a", reps: 8, weight: 60, type: "normal", completed: true },
            { id: "b", reps: 8, weight: 60, type: "normal", completed: true }
          ]
        }
      ]
    },
    templates
  );

  assert.equal(withWarmUp.logs[0].totalSets, 2, "a warm-up is not a working set");
  assert.equal(withWarmUp.logs[0].totalVolume, 8 * 60 * 2, "and carries none of the volume");
  assert.equal(withWarmUp.setLogs.length, 2, "nor does it become a set row");
}

// A pull-up entered at 0 kg used to score zero volume against every chart in the
// app. The lifter's own mass is the load.
{
  const bodyweightTemplates = [
    { id: "pullup", name: "Pull-up", category: "Pull", isPreset: true, equipment: "Bodyweight", muscles: [] }
  ];
  const pullups = {
    ...session([{ name: "bench", sets: [] }]),
    exercises: [
      {
        id: "e1",
        workoutId: "pullup",
        templateName: "Pull-up",
        sets: [{ id: "s1", reps: 10, weight: 0, type: "normal" as const, completed: true }]
      }
    ]
  };

  assert.equal(
    buildLogFromSession(pullups, bodyweightTemplates, 80).logs[0].totalVolume,
    10 * 80,
    "reps x (bodyweight + added)"
  );
  assert.equal(
    buildLogFromSession(
      { ...pullups, exercises: [{ ...pullups.exercises[0], sets: [{ id: "s1", reps: 10, weight: 10, type: "normal" as const, completed: true }] }] },
      bodyweightTemplates,
      80
    ).logs[0].totalVolume,
    10 * 90,
    "a weighted pull-up adds the belt to the lifter"
  );
  assert.equal(
    buildLogFromSession(pullups, bodyweightTemplates, 0).logs[0].totalVolume,
    0,
    "with no profile weight it falls back to the old formula rather than inventing a body"
  );
  assert.equal(
    buildLogFromSession(
      { ...pullups, exercises: [{ ...pullups.exercises[0], workoutId: "bench" }] },
      templates,
      80
    ).logs[0].totalVolume,
    0,
    "and a barbell lift is never credited with the lifter's mass"
  );
}

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

// The open panel walks forward from the set you just logged. Skipping one used
// to send it back to the top of the session after every log — see
// `nextPendingSetId`.
const withGap = session([
  { name: "bench", sets: [set(8, 60, true), set(8, 60), set(8, 60, true)] },
  { name: "row", sets: [set(10, 40, true), set(10, 40)] }
]);

assert.equal(
  nextPendingSetId(withGap, withGap.exercises[0].sets[2].id),
  withGap.exercises[1].sets[1].id,
  "a withGap set above is not what opens next"
);

assert.equal(
  nextPendingSetId(withGap, withGap.exercises[1].sets[1].id),
  withGap.exercises[0].sets[1].id,
  "and it is swept up once nothing is left after"
);

const lastOne = session([{ name: "bench", sets: [set(8, 60, true), set(8, 60)] }]);

assert.equal(
  nextPendingSetId(lastOne, lastOne.exercises[0].sets[1].id),
  undefined,
  "the set being logged never re-opens itself when the session runs out"
);

assert.equal(
  nextPendingSetId(withGap, "not-in-this-session"),
  withGap.exercises[0].sets[1].id,
  "an unknown set falls back to the first gap rather than nothing"
);

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

const heldBuild = buildLogFromSession(
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
);
const heldLog = heldBuild.logs[0];
assert.equal(heldLog.totalVolume, 0, "a hold adds no volume");
assert.equal(heldLog.totalReps, 0, "a hold adds no reps");
assert.equal(heldLog.peakWeight, 0, "a bodyweight hold never becomes a peak lift");
assert.equal(heldLog.totalSets, 3, "but the sets still count, so streaks hold");

// The rollup above is blind to the hold on purpose, so the set rows are the only
// record of it. Dropped there, a 45s plank is a set of zero reps at zero kg and
// the number the lifter actually hit is gone at Finish.
assert.deepEqual(
  heldBuild.setLogs.map((row) => row.durationSeconds),
  [45, 45, 45],
  "the seconds held reach the set rows"
);
assert.equal(
  buildLogFromSession(
    session([{ name: "bench", sets: [set(8, 60, true)] }]),
    templates
  ).setLogs[0].durationSeconds,
  undefined,
  "and a rep set carries no duration at all — not zero"
);

// --- what "last" actually means ---
//
// The template used to supply it, so the number above the stepper was the plan
// read back as history. These pin the three states it can now be in.
{
  const rollupOnly = [
    { id: "l1", date: "2026-08-01", workoutId: "bench", name: "Bench", totalVolume: 0, peakWeight: 60, muscles: [] },
    { id: "l2", date: "2026-08-08", workoutId: "bench", name: "Bench", totalVolume: 0, peakWeight: 65, muscles: [] }
  ];

  assert.equal(
    lastPerformance("bench", [], []),
    undefined,
    "a first-ever performance has no last — not a fabricated one"
  );

  const fromRollup = lastPerformance("bench", rollupOnly, []);
  assert.equal(fromRollup?.weight, 65, "the newest rollup wins, not the first in the array");
  assert.equal(fromRollup?.reps, undefined, "a rollup does not know the reps behind its peak");
  assert.equal(fromRollup?.source, "rollup");

  const rows = [
    { id: "s1", logId: "l1", workoutId: "bench", date: "2026-08-01", setIndex: 0, reps: 5, weight: 60 },
    { id: "s2", logId: "l3", workoutId: "bench", date: "2026-08-15", setIndex: 0, reps: 8, weight: 70 },
    { id: "s3", logId: "l3", workoutId: "bench", date: "2026-08-15", setIndex: 1, reps: 6, weight: 75 },
    { id: "s4", logId: "l3", workoutId: "bench", date: "2026-08-15", setIndex: 2, reps: 4, weight: 62.5 },
    { id: "s5", logId: "l3", workoutId: "other", date: "2026-08-20", setIndex: 0, reps: 10, weight: 200 }
  ];

  const fromSets = lastPerformance("bench", rollupOnly, rows);
  assert.equal(fromSets?.source, "sets", "set rows beat a rollup even when the rollup is newer");
  assert.equal(fromSets?.date, "2026-08-15");
  assert.equal(fromSets?.weight, 75, "the top set of that day, not the last set — 62.5 was a back-off");
  assert.equal(fromSets?.reps, 6);

  // A template no longer supplies the number, so a lift with no history leaves
  // both fields empty and Home renders "first time" instead of the plan.
  const planned = plannedExercisesFromTemplate({
    id: "t1",
    name: "Push",
    workoutIds: ["bench"],
    summary: { totalSets: 0, totalReps: 0, totalWeight: 0 },
    exercises: [
      { id: "e1", workoutId: "bench", name: "Bench", muscles: [], sets: 2, reps: 8, weight: 60, restSeconds: 90 }
    ]
  });
  assert.equal(planned[0].sets[0].previousWeight, undefined, "no history, no 'last'");
  assert.equal(planned[0].sets[0].weight, 60, "the plan still supplies the *target*");
}

console.log("session log checks passed");

// --- progression reaches the planned session -------------------------------
// The engine is covered in progression.test.ts; this is only the wiring — that
// a rule on the template actually decides the number the session opens with,
// and that a template without one behaves exactly as it did before.

const progressionTemplate = (progression?: SessionTemplate["progression"]): SessionTemplate => ({
  id: "s1",
  name: "Push",
  workoutIds: ["bench"],
  progression,
  exercises: [
    {
      id: "e1",
      workoutId: "bench",
      name: "Bench Press",
      muscles: [],
      sets: 3,
      reps: 8,
      weight: 60,
      restSeconds: 90
    }
  ],
  summary: { totalSets: 3, totalReps: 24, totalWeight: 180 }
});

const benchHistory = {
  logs: [],
  setLogs: [
    { id: "x1", logId: "l1", workoutId: "bench", date: "2026-01-08", setIndex: 0, reps: 8, weight: 60 }
  ]
};

const withoutRule = plannedExercisesFromTemplate(progressionTemplate(), benchHistory);
assert.equal(withoutRule[0].sets[0].weight, 60, "no rule, the template's own number stands");
assert.equal(withoutRule[0].progressionNote, undefined, "and nothing is explained");

const withRule = plannedExercisesFromTemplate(
  progressionTemplate({ rule: "linear" }),
  benchHistory
);
assert.equal(withRule[0].sets[0].weight, 62.5, "the rule decides the opening weight");
assert.equal(withRule[0].sets[2].weight, 62.5, "every working set, not just the first");
assert.match(withRule[0].progressionNote ?? "", /up to 62\.5kg/, "and the session says why");

const overridden = plannedExercisesFromTemplate(
  {
    ...progressionTemplate({ rule: "linear" }),
    exercises: [
      { ...progressionTemplate().exercises[0], progression: { rule: "off" } }
    ]
  },
  benchHistory
);
assert.equal(overridden[0].sets[0].weight, 60, "a per-exercise rule beats the session's");

// A rule must not throw away per-set weights the user typed by hand. It moves
// the whole exercise as a block, so a ramp keeps its shape and the top set is
// what actually advances.
const ramped = plannedExercisesFromTemplate(
  {
    ...progressionTemplate({ rule: "linear" }),
    exercises: [
      {
        ...progressionTemplate().exercises[0],
        weights: [40, 50, 60]
      }
    ]
  },
  benchHistory
);
assert.deepEqual(
  ramped[0].sets.map((set) => set.weight),
  [42.5, 52.5, 62.5],
  "the ramp shifts as a block — every set keeps its distance from the top set"
);

const rampedNoRule = plannedExercisesFromTemplate(
  {
    ...progressionTemplate(),
    exercises: [{ ...progressionTemplate().exercises[0], weights: [40, 50, 60] }]
  },
  benchHistory
);
assert.deepEqual(
  rampedNoRule[0].sets.map((set) => set.weight),
  [40, 50, 60],
  "and with no rule the weights pass through exactly as typed"
);

// Both libs are right on their own; the combination is where the bug was. Double
// progression adds one rep, which on a unilateral lift is half a rep on one side
// — a set nobody can perform.
const perSideDouble = plannedExercisesFromTemplate(
  {
    ...progressionTemplate({ rule: "double", repMax: 20 }),
    exercises: [{ ...progressionTemplate().exercises[0], perSide: true, reps: 12 }]
  },
  {
    logs: [],
    setLogs: [
      { id: "p1", logId: "pl1", workoutId: "bench", date: "2026-01-08", setIndex: 0, reps: 16, weight: 60 }
    ]
  }
);
assert.equal(
  perSideDouble[0].sets[0].reps,
  18,
  "a unilateral target steps in twos even when the rule steps in ones"
);
assert.equal(perSideDouble[0].perSide, true, "and the flag reaches the ledger that renders the split");

// A held lift progresses by holding longer. The rule reads the seconds off the
// set rows above, so this is the other half of that round trip.
const heldHistory = {
  logs: [],
  setLogs: [
    { id: "h1", logId: "hl1", workoutId: "plank", date: "2026-02-01", setIndex: 0, reps: 0, weight: 0, durationSeconds: 45 }
  ]
};
const timedPlank = plannedExercisesFromTemplate(
  { ...plank, progression: { rule: "time" } },
  heldHistory
);
assert.deepEqual(
  timedPlank[0].sets.map((item) => item.durationSeconds),
  [50, 50, 50],
  "reaching the hold makes every set of the next session longer"
);
assert.deepEqual(timedPlank[0].sets.map((item) => item.reps), [0, 0, 0], "and it is still no reps");
assert.deepEqual(timedPlank[0].sets.map((item) => item.weight), [0, 0, 0], "at no load");
assert.match(timedPlank[0].progressionNote ?? "", /go for 50s/, "and the session says why");

assert.deepEqual(
  plannedExercisesFromTemplate(plank, heldHistory)[0].sets.map((item) => item.durationSeconds),
  [45, 45, 45],
  "with no rule the template's own hold stands"
);

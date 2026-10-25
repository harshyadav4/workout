// Run with: npm run check
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  AiPlanError,
  buildPlanImport,
  choiceKey,
  extractJson,
  matchExercise,
  parseAiPlan
} from "@/lib/ai-plan";
import type { Exercise } from "@/lib/exercises";
import type { SessionTemplate, WorkoutTemplate } from "@/lib/types";

const library = JSON.parse(
  readFileSync(new URL("../public/exercises.json", import.meta.url), "utf8")
) as Exercise[];
const byName = (name: string) => library.find((item) => item.name === name)!;

const throwsWith = (fn: () => unknown, pattern: RegExp) =>
  assert.throws(fn, (error: unknown) => error instanceof AiPlanError && pattern.test(error.message));

// --- extracting the JSON from whatever was pasted ---

assert.deepEqual(extractJson('Here you go:\n```json\n{"a": 1}\n```\nEnjoy!'), { a: 1 });
assert.deepEqual(extractJson('{"a": {"b": 2}}'), { a: { b: 2 } });
throwsWith(() => extractJson(""), /Nothing was pasted/);
throwsWith(() => extractJson("no braces here"), /No JSON object/);
throwsWith(() => extractJson('{"a": 1,'), /No JSON object|incomplete/);

// --- parsing ---

const good = JSON.stringify({
  gymflow: "sessions/v1",
  sessions: [
    {
      name: "Push",
      progression: "double",
      exercises: [
        { name: "barbell bench press", equipment: "barbell", target: "pectorals", sets: 4, reps: 8, weightKg: 60, restSeconds: 120 },
        { name: "plank", equipment: "body weight", target: "abs", sets: 3, seconds: 45 },
        { name: "Landmine Press", equipment: "barbell", target: "delts", sets: 3, reps: 9, perSide: true, gifUrl: "https://example.com/landmine.gif" }
      ]
    },
    { name: "Pull", exercises: [{ name: "cable seated row", sets: 3, reps: 12 }] }
  ],
  schedule: { startDate: "2026-11-02", endDate: "2026-12-28", days: { mon: "Push", wed: "pull", sun: "rest" } }
});

const plan = parseAiPlan(good);
assert.equal(plan.sessions.length, 2);
assert.equal(plan.sessions[0].progression, "double");
assert.equal(plan.sessions[0].exercises[1].seconds, 45);
assert.equal(plan.sessions[0].exercises[1].reps, undefined, "a held set carries seconds, not reps");
assert.equal(plan.schedule?.mode, "weekly", "days implies a weekly schedule");
assert.equal(plan.schedule?.days?.wed, "Pull", "session names in the schedule match case-insensitively");
assert.equal(plan.schedule?.days?.sun, "rest");

// Only an https link is ever kept for fetching.
assert.equal(
  parseAiPlan(good.replace("https://example.com/landmine.gif", "http://example.com/x.gif")).sessions[0].exercises[2].gifUrl,
  undefined
);

throwsWith(() => parseAiPlan('{"sessions": []}'), /no sessions/);
throwsWith(() => parseAiPlan('{"sessions": [{"name": "A", "exercises": [{"name": "x", "sets": 3}]}]}'), /reps or seconds/);
throwsWith(() => parseAiPlan('{"sessions": [{"name": "A", "exercises": [{"name": "x", "sets": 0, "reps": 5}]}]}'), /sets must be a positive number/);
throwsWith(
  () => parseAiPlan('{"sessions": [{"name": "A", "exercises": [{"name": "x", "sets": 3, "reps": 5}]}, {"name": "a", "exercises": [{"name": "y", "sets": 3, "reps": 5}]}]}'),
  /Two sessions are called/
);
throwsWith(
  () => parseAiPlan('{"sessions": [{"name": "A", "exercises": [{"name": "x", "sets": 3, "reps": 5}]}], "schedule": {"days": {"mon": "B"}}}'),
  /not one of the sessions/
);
throwsWith(
  () => parseAiPlan('{"sessions": [{"name": "A", "exercises": [{"name": "x", "sets": 3, "reps": 5}]}], "schedule": {"startDate": "2026-12-01", "endDate": "2026-11-01", "days": {"mon": "A"}}}'),
  /before/
);

// --- matching ---

assert.equal(matchExercise({ name: "Barbell Bench Press", sets: 3, reps: 5 }, library).status, "exact");
const shorthand = matchExercise({ name: "DB romanian deadlift", equipment: "dumbbell", sets: 3, reps: 8 }, library);
assert.equal(shorthand.exercise?.name, "dumbbell romanian deadlift", "db expands to dumbbell");
assert.notEqual(shorthand.status, "none");
const nothing = matchExercise({ name: "zzz qqq", sets: 3, reps: 8 }, library);
assert.equal(nothing.status, "none");
assert.equal(nothing.exercise, undefined);

// --- building the import ---

const existingTemplates: WorkoutTemplate[] = [];
const existingSessions: SessionTemplate[] = [
  { id: "mine-push", name: "Push", workoutIds: [], exercises: [], summary: { totalSets: 0, totalReps: 0, totalWeight: 0 } }
];

const built = buildPlanImport(plan, {
  library,
  existingTemplates,
  existingSessions,
  today: "2026-11-01"
});

assert.equal(built.sessions[0].template.name, "Push (AI)", "a name clash is renamed, never overwritten by default");
assert.equal(built.sessions[0].replaces, undefined);
assert.equal(built.sessions[1].template.name, "Pull");

const bench = built.sessions[0].template.exercises[0];
assert.equal(bench.workoutId, `db-${byName("barbell bench press").id}`, "a library match points at its dataset id, so it has media");
assert.ok(bench.muscles.length > 0, "and carries the library's muscles");
assert.equal(built.sessions[0].template.exercises[1].metric, "time");
assert.equal(built.sessions[0].template.exercises[1].durationSeconds, 45);
assert.equal(built.sessions[0].template.exercises[1].reps, 0);

const landmine = built.sessions[0].template.exercises[2];
assert.equal(landmine.reps, 10, "an odd per-side target is evened up");
assert.deepEqual(built.media, built.media.filter((item) => item.url.endsWith(".gif")));
assert.equal(
  built.templates.some((template) => template.id === landmine.workoutId),
  true,
  "every exercise resolves to a registered template"
);
assert.equal(built.sessions[0].template.progression?.rule, "double");
assert.ok(built.sessions[0].template.summary.totalSets > 0, "the summary is computed, not left at zero");

// The schedule points at the imported sessions' ids, rest days included.
assert.equal(built.scheduleConfig?.startDate, "2026-11-02");
assert.equal(built.scheduleConfig?.weekly[1], built.sessions[0].template.id);
assert.equal(built.scheduleConfig?.weekly[3], built.sessions[1].template.id);
assert.deepEqual(built.scheduleConfig?.restWeekdays, [0]);

// A start date in the past starts today instead.
const late = buildPlanImport(parseAiPlan(good.replace("2026-11-02", "2025-01-01")), {
  library,
  existingTemplates,
  existingSessions,
  today: "2026-11-01"
});
assert.equal(late.scheduleConfig?.startDate, "2026-11-01");

// Replacing keeps the user's id, so their calendar still points at it.
const replaced = buildPlanImport(plan, {
  library,
  existingTemplates,
  existingSessions,
  replace: new Set(["Push"]),
  today: "2026-11-01"
});
assert.equal(replaced.sessions[0].template.id, "mine-push");
assert.equal(replaced.sessions[0].replaces, "mine-push");
assert.equal(replaced.sessions[0].template.name, "Push");

// A choice from the review screen wins over the matcher; no choice means custom.
const chosen = buildPlanImport(plan, {
  library,
  existingTemplates,
  existingSessions,
  choices: { [choiceKey(0, 0)]: { exercise: byName("barbell incline bench press") }, [choiceKey(1, 0)]: {} },
  today: "2026-11-01"
});
assert.equal(chosen.sessions[0].template.exercises[0].name, "barbell incline bench press");
assert.match(chosen.sessions[1].template.exercises[0].workoutId, /^custom-/);

// Skipping the schedule leaves the calendar alone.
assert.equal(
  buildPlanImport(plan, { library, existingTemplates, existingSessions, applySchedule: false, today: "2026-11-01" })
    .scheduleConfig,
  undefined
);

// An existing template with the same name is reused, not duplicated.
const reused = buildPlanImport(plan, {
  library,
  existingTemplates: [
    { id: "bench-press", name: "barbell bench press", category: "Chest", isPreset: true, muscles: [] }
  ],
  existingSessions: [],
  today: "2026-11-01"
});
assert.equal(reused.sessions[0].template.exercises[0].workoutId, "bench-press");
assert.equal(reused.templates.some((template) => template.name === "barbell bench press"), false);

console.log("ai plan checks passed");

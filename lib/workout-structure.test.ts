import assert from "node:assert/strict";

import { parseAiPlan, buildPlanImport } from "@/lib/ai-plan";
import { buildScheduleSessions, mergeGeneratedSessions, schedulePhaseError } from "@/lib/schedule";
import { sessionTemplateToRow, rowToSessionTemplate, sessionToRow, rowToSession } from "@/lib/sync";
import { plannedThisWeek } from "@/lib/progress-scores";
import { buildLogFromSession, firstPendingSetId, nextPendingSetId, plannedExercisesFromTemplate, refreshUpcomingSessions, sessionTotals } from "@/lib/workout-helpers";
import { isExerciseIncluded, orderExercises } from "@/lib/workout-structure";
import { createWorkoutStore, flushPersist } from "@/features/workout/workout-store";
import type { ScheduledSession } from "@/lib/types";

const text = JSON.stringify({
  sessions: [
    { name: "Full Upper", progression: "double", exercises: [
      { name: "Press", sets: 2, reps: 8, weightKg: 8 },
      { name: "Press", section: "warmup", sets: 1, reps: 10, weightKg: 4 },
      { name: "Hold", section: "skill", sets: 2, seconds: 30 },
      { name: "Wrist curl", optional: true, sets: 2, reps: 15, weightKg: 5, notes: "Filler · during rest" },
      { name: "Stretch", section: "stretching", sets: 1, seconds: 30 }
    ] },
    { name: "Deload Upper", progression: "off", exercises: [{ name: "Press", sets: 1, reps: 8, weightKg: 4 }] },
    { name: "Core Upper", exercises: [{ name: "Press", sets: 1, reps: 8, weightKg: 8 }] },
    { name: "Kickboxing", optional: true, exercises: [{ name: "Boxing", sets: 1, seconds: 600 }] }
  ],
  schedule: {
    startDate: "2026-11-02", endDate: "2026-11-22",
    days: { mon: "Full Upper", sat: "Kickboxing", sun: "rest" },
    phases: [{ name: "Deload", startDate: "2026-11-09", endDate: "2026-11-15", days: { mon: "Deload Upper", sun: "rest" } }]
  }
});
const plan = parseAiPlan(text);
const imported = buildPlanImport(plan, { library: [], existingTemplates: [], existingSessions: [], today: "2026-11-02" });
const templates = imported.sessions.map((item) => item.template);
const full = templates[0];
const exercises = plannedExercisesFromTemplate(full);
assert.deepEqual(exercises.map((e) => e.section ?? "main"), ["warmup", "skill", "main", "main", "stretching"]);
assert.equal(full.summary.totalSets, 6, "optional sets start outside the target");
assert.equal(exercises.find((e) => e.templateName === "Wrist curl")?.optional, true);
assert.equal(isExerciseIncluded(exercises.find((e) => e.optional)!), false);
assert.deepEqual(orderExercises([{ section: "stretching" as const }, {}, { section: "warmup" as const }]).map((e) => e.section), ["warmup", undefined, "stretching"]);

const session: ScheduledSession = {
  id: "session", date: "2026-11-02", dayIndex: 1, sessionName: full.name,
  sessionTemplateId: full.id, exercises, type: "workout", status: "active", source: "manual"
};
assert.equal(firstPendingSetId(session), exercises[0].sets[0].id);
const main = exercises.find((e) => e.templateName === "Press" && !e.section)!;
assert.equal(nextPendingSetId(session, main.sets.at(-1)!.id), exercises.at(-1)!.sets[0].id, "auto-advance skips unselected optional work");
assert.equal(sessionTotals(session).total, 6);
session.exercises.forEach((e) => e.sets.forEach((set) => { if (isExerciseIncluded(e)) set.completed = true; }));
assert.equal(sessionTotals(session).done, 6);
assert.equal(sessionTotals(session).volume, 128, "preparation cannot add to lifting volume");
const logged = buildLogFromSession(session, imported.templates);
assert.equal(logged.logs.length, 2, "only skill and main work produce training logs");
assert.equal(logged.setLogs.length, 4);
assert.ok(!logged.logs.some((log) => log.name === "Stretch"));
assert.ok(session.exercises.find((e) => e.section === "stretching")?.sets[0].completed, "stretch history stays on the session");

const optional = session.exercises.find((e) => e.optional)!;
optional.included = true;
optional.sets[0].completed = true;
optional.included = false;
assert.equal(sessionTotals(session).total, 7, "leaving out remaining sets retains a completed optional set");
assert.equal(sessionTotals(session).done, 7);
assert.equal(buildLogFromSession(session, imported.templates).setLogs.length, 5);

const syncedTemplate = rowToSessionTemplate(sessionTemplateToRow({ ...full, optional: true }, "test-user"));
assert.equal(syncedTemplate.optional, true);
assert.deepEqual(syncedTemplate.exercises, full.exercises, "section fields survive cloud mapping");
const syncedSession = rowToSession(sessionToRow({ ...session, optional: true, phaseName: "Deload" }, "test-user"));
assert.equal(syncedSession.optional, true);
assert.equal(syncedSession.phaseName, "Deload");
assert.deepEqual(syncedSession.exercises, session.exercises, "inclusion and preparation history survive cloud mapping");
const config = imported.scheduleConfig!;
const calendar = buildScheduleSessions(config, templates, plannedExercisesFromTemplate);
assert.equal(calendar.find((day) => day.date === "2026-11-09")?.sessionName, "Deload Upper");
assert.equal(calendar.find((day) => day.date === "2026-11-09")?.phaseName, "Deload");
assert.equal(calendar.find((day) => day.date === "2026-11-16")?.sessionName, "Full Upper");
assert.equal(calendar.find((day) => day.date === "2026-11-15")?.type, "rest");
assert.equal(calendar.some((day) => day.date === "2026-11-14"), false, "phase patterns do not inherit an unwanted optional Saturday");
assert.equal(calendar.find((day) => day.date === "2026-11-07")?.optional, true);
assert.equal(calendar.some((day) => day.sessionName === "Core Upper"), false, "unscheduled tiers never join the calendar");
assert.equal(plannedThisWeek(calendar, "2026-11-04"), 1, "optional days cannot raise the required target");
const rotated = buildScheduleSessions({ ...config, mode: "rotation", rotationOrder: [full.id, templates[2].id], restWeekdays: [0], phases: [{
  name: "Rotation deload", startDate: "2026-11-09", endDate: "2026-11-15", mode: "rotation", weekly: {},
  rotationOrder: [templates[1].id, "rest"], restWeekdays: [0]
}] }, templates, plannedExercisesFromTemplate);
assert.equal(rotated.find((s) => s.date === "2026-11-09")?.sessionName, "Deload Upper");
assert.equal(rotated.find((s) => s.date === "2026-11-10")?.type, "rest");
assert.equal(rotated.find((s) => s.date === "2026-11-16")?.sessionName, "Full Upper", "base rotation resumes after the phase");
const highHistory = { logs: [], setLogs: [{ id: "history", logId: "h", workoutId: main.workoutId, date: "2026-11-01", setIndex: 0, reps: 20, weight: 100 }] };
assert.equal(plannedExercisesFromTemplate(templates[1], highHistory)[0].sets[0].weight, 4, "fixed deload targets do not carry last week's load");
assert.equal(plannedExercisesFromTemplate(full, highHistory)[0].sets[0].weight, 4, "preparation ignores strength progression");
assert.ok(schedulePhaseError([config.phases![0], config.phases![0]], config.startDate, config.endDate)?.includes("overlap"));
for (const change of [
  { section: "bad" }, { optional: "yes" }, { progression: "bad" }
]) {
  const bad = JSON.parse(text);
  Object.assign(bad.sessions[0].exercises[0], change);
  assert.throws(() => parseAiPlan(JSON.stringify(bad)));
}
const invalidDate = JSON.parse(text);
invalidDate.schedule.phases[0].startDate = "2026-02-30";
assert.throws(() => parseAiPlan(JSON.stringify(invalidDate)), /date/);
const overlap = JSON.parse(text);
overlap.schedule.phases.push(overlap.schedule.phases[0]);
assert.throws(() => parseAiPlan(JSON.stringify(overlap)), /overlap/);

const untouched = { ...session, status: "planned" as const, exercises: plannedExercisesFromTemplate(full) };
untouched.exercises.find((e) => e.optional)!.included = true;
assert.equal(refreshUpcomingSessions([untouched], templates, highHistory, session.date)[0], untouched, "including an exercise before Start survives replanning");
assert.ok(mergeGeneratedSessions([session], calendar).some((s) => s === session), "regeneration retains active work");

// Save, reopen, finish: choices and all section history survive on the device.
const storage = new Map<string, string>();
Object.assign(globalThis, { window: {}, localStorage: {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key)
} });
const store = createWorkoutStore();
store.setState({ activeDate: session.date, selectedSessionId: session.id, scheduledSessions: [untouched], sessionTemplates: templates, templates: imported.templates });
const extra = untouched.exercises.find((e) => e.optional)!;
store.getState().setExerciseIncluded(session.id, extra.id, false);
flushPersist();
const reopened = createWorkoutStore();
assert.equal(reopened.getState().scheduledSessions[0].exercises.find((e) => e.optional)?.included, false);
reopened.getState().startSession(session.id);
reopened.getState().setExerciseIncluded(session.id, extra.id, true);
reopened.getState().updateSessionSet(session.id, extra.id, extra.sets[0].id, { completed: true });
reopened.getState().setExerciseIncluded(session.id, extra.id, false);
reopened.getState().logTodayWorkout();
assert.equal(reopened.getState().setLogs.length, 1, "a completed optional set is never lost when the rest is left out");
assert.equal(reopened.getState().scheduledSessions[0].status, "completed");
flushPersist();
console.log("workout structure checks passed");

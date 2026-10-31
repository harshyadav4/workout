// Run with: npm run check
import assert from "node:assert/strict";

import {
  GUEST_STORAGE_KEY,
  createWorkoutStore,
  flushPersist,
  readGuestCopy
} from "@/features/workout/workout-store";
import { shiftKey } from "@/lib/progress-metrics";
import type { Injury } from "@/lib/types";
import { todayKey } from "@/lib/utils";

// The store saves to localStorage when `window` exists. A stand-in for both.
const storage = new Map<string, string>();
Object.assign(globalThis, {
  window: {},
  localStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key)
  }
});

const hip: Injury = { id: "hip", place: "hip", side: "left", startDate: "2026-10-01" };

const store = createWorkoutStore();
const state = () => store.getState();

assert.deepEqual(state().injuries, [], "a new phone has no injuries");
assert.deepEqual(state().painLogs, []);

// --- adding ---------------------------------------------------------------------

state().addInjury(hip, 11);
assert.deepEqual(state().injuries, [], "no injury without a real score");
assert.deepEqual(state().painLogs, []);

state().addInjury(hip, 6);
assert.deepEqual(state().injuries, [hip]);
assert.equal(state().painLogs.length, 1, "the first score comes with it");
assert.equal(state().painLogs[0].injuryId, "hip");
assert.equal(state().painLogs[0].date, "2026-10-01", "on its first day");
assert.equal(state().painLogs[0].score, 6);

// --- logging --------------------------------------------------------------------

state().logPain("hip", 5, "2026-10-08");
assert.equal(state().painLogs.length, 2);
state().logPain("hip", 4, "2026-10-08");
assert.equal(state().painLogs.length, 2, "one score a day");
assert.equal(state().painLogs.at(-1)?.score, 4, "the newer one wins");
state().logPain("hip", 12, "2026-10-09");
state().logPain("hip", 2.5, "2026-10-09");
state().logPain("nothing", 5, "2026-10-09");
assert.equal(state().painLogs.length, 2, "a bad score, or no such injury, changes nothing");

// --- changing -------------------------------------------------------------------

state().updateInjury("hip", { worseWith: "Deep squats" });
assert.equal(state().injuries[0].worseWith, "Deep squats");
assert.equal(state().injuries[0].place, "hip", "the rest stays");

state().markInjuryHealed("hip", "2026-10-20");
assert.equal(state().injuries[0].healedDate, "2026-10-20");
assert.equal(state().painLogs.length, 2, "healing keeps the log");
state().reopenInjury("hip");
assert.equal(state().injuries[0].healedDate, undefined, "Undo brings it back");

// --- saved, and read back -------------------------------------------------------

flushPersist();
{
  const nextLaunch = createWorkoutStore().getState();
  assert.equal(nextLaunch.injuries.length, 1, "it survives a restart");
  assert.equal(nextLaunch.painLogs.length, 2);
}
assert.equal(readGuestCopy()?.injuries?.length, 1, "it moves with the guest copy");
assert.equal(readGuestCopy()?.painLogs?.length, 2);

// --- another person's phone -----------------------------------------------------

state().switchToAccount("someone");
assert.deepEqual(state().injuries, [], "an account never sees the guest's injuries unasked");
assert.deepEqual(state().painLogs, []);
state().switchToGuest();
assert.equal(state().injuries.length, 1, "the guest's injuries come back");

// --- merging: a read that says nothing leaves them alone ------------------------

state().hydrateRemote({
  templates: [],
  sessionTemplates: [],
  scheduledSessions: [],
  logs: [],
  setLogs: [],
  measurements: []
});
assert.equal(state().injuries.length, 1, "no answer about injuries is not an empty list");
assert.equal(state().painLogs.length, 2);

// --- deleting -------------------------------------------------------------------

state().removeInjury("hip");
assert.deepEqual(state().injuries, []);
assert.deepEqual(state().painLogs, [], "its scores go with it");
assert.deepEqual(state().deletedInjuries, [], "a guest has no other phone to tell");

state().switchToAccount("someone");
state().addInjury({ ...hip, id: "knee", place: "knee" }, 5);
state().removeInjury("knee");
assert.deepEqual(state().injuries, []);
assert.deepEqual(state().deletedInjuries.map((item) => item.id), ["knee"], "an account remembers it");
assert.ok(state().deletedInjuries[0].deletedAt, "and when");
flushPersist();
assert.deepEqual(
  createWorkoutStore().getState().deletedInjuries.map((item) => item.id),
  ["knee"],
  "the deletion survives a restart, so it still reaches the account"
);
state().hydrateRemote({
  templates: [],
  sessionTemplates: [],
  scheduledSessions: [],
  logs: [],
  setLogs: [],
  measurements: [],
  injuries: [{ ...hip, id: "knee", place: "knee" }],
  painLogs: [{ id: "old", injuryId: "knee", date: "2026-10-01", score: 5 }],
  deletedInjuries: []
});
assert.deepEqual(state().injuries, [], "a read from before the deletion reached the account does not undo it");
assert.deepEqual(state().painLogs, []);
state().switchToGuest();

// --- the injury's workout --------------------------------------------------------

{
  const today = todayKey();
  const tomorrow = shiftKey(today, 1);
  const exercise = (id: string, name: string, weight: number) => ({
    id,
    workoutId: id,
    name,
    muscles: [{ muscleId: "gluteMed" as const, engagement: 80 }],
    sets: 3,
    reps: 10,
    weight,
    restSeconds: 60
  });
  const summary = { totalSets: 3, totalReps: 30, totalWeight: 0 };
  const hipWork = {
    id: "hip-work",
    name: "Left hip exercises",
    workoutIds: ["clamshell"],
    exercises: [exercise("clamshell", "Clamshell", 0)],
    summary
  };
  const legs = {
    id: "legs",
    name: "Legs",
    workoutIds: ["squat"],
    exercises: [exercise("squat", "Squat", 80)],
    summary
  };

  state().createSessionTemplate(legs);
  state().createSessionTemplate(hipWork);
  state().addInjury({ id: "w", place: "hip", side: "left", startDate: today }, 5);

  // Monday to Sunday of Legs from today, as Edit schedule would make it.
  const config = {
    startDate: today,
    endDate: shiftKey(today, 13),
    mode: "weekly" as const,
    weekly: { 0: "legs", 1: "legs", 2: "legs", 3: "legs", 4: "legs", 5: "legs", 6: "legs" },
    rotationOrder: [],
    restWeekdays: []
  };
  state().generateSchedule(config);
  const legsDays = () => state().scheduledSessions.filter((session) => session.sessionTemplateId === "legs");
  const hipDays = () => state().scheduledSessions.filter((session) => session.sessionTemplateId === "hip-work");
  assert.equal(legsDays().length, 14);

  state().setInjuryWorkout("w", "hip-work", { kind: "every", days: 1 }, 2);
  assert.equal(hipDays().length, 14, "a day for each day of 2 weeks");
  assert.equal(legsDays().length, 14, "the normal workouts stay");
  assert.equal(state().injuries.find((item) => item.id === "w")?.workout?.endDate, shiftKey(today, 13));

  // The trap: a kept session used to cost the generated workout on its date.
  state().generateSchedule(config);
  assert.equal(legsDays().length, 14, "Edit schedule keeps every normal workout");
  assert.equal(hipDays().length, 14, "and every day of the injury's workout");

  // Today shows the main workout. The injury's has its own row.
  assert.equal(createdToday().map((session) => session.sessionName).join(), "Legs");
  function createdToday() {
    const current = state();
    return current.scheduledSessions.filter(
      (session) =>
        session.date === current.activeDate &&
        (session.sessionTemplateId !== "hip-work" || session.id === current.selectedSessionId)
    );
  }

  // Doing it writes no logs, so no total, record, streak or rank can move.
  const before = state().logs.length;
  const hipToday = hipDays().find((session) => session.date === today);
  assert.ok(hipToday);
  state().startSession(hipToday.id);
  assert.equal(state().selectedSessionId, hipToday.id);
  const set = hipDays().find((session) => session.id === hipToday.id)?.exercises[0].sets[0];
  assert.ok(set);
  state().updateSessionSet(hipToday.id, "clamshell", set.id, { completed: true, reps: 10 });
  state().logTodayWorkout();
  assert.equal(state().logs.length, before, "no logs");
  assert.equal(state().setLogs.length, 0, "no set logs");
  assert.equal(hipDays().find((session) => session.id === hipToday.id)?.status, "completed", "but the day is done");
  assert.equal(state().selectedSessionId, undefined, "and Today goes back to the main workout");

  // A normal workout with the same exercise cannot raise its numbers.
  state().createSessionTemplate({ ...legs, id: "more", name: "More", workoutIds: ["clamshell"], exercises: [exercise("clamshell", "Clamshell", 40)] });
  const more = state().scheduleSession({
    date: today,
    sessionTemplateId: "more",
    sessionName: "More",
    exercises: [
      {
        id: "x",
        workoutId: "clamshell",
        templateName: "Clamshell",
        sets: [{ id: "s", reps: 10, weight: 40, type: "normal", completed: true }]
      }
    ]
  });
  assert.equal(more, undefined);
  const moreToday = state().scheduledSessions.find((session) => session.sessionTemplateId === "more");
  assert.ok(moreToday);
  state().selectSession(moreToday.id);
  state().logTodayWorkout();
  assert.ok(state().logs.some((log) => log.workoutId === "clamshell"), "the normal workout logs");
  state().refreshUpcoming();
  assert.equal(
    hipDays().find((session) => session.date === tomorrow)?.exercises[0].sets[0].weight,
    0,
    "the doctor's number stays as typed"
  );

  // Changing how often replaces the days ahead, and keeps the day done.
  state().setInjuryWorkout("w", "hip-work", { kind: "every", days: 2 }, 2);
  assert.equal(hipDays().filter((session) => session.status === "completed").length, 1, "done stays done");
  assert.equal(hipDays().length, 7, "every 2 days for 2 weeks, today among them");

  // Healing removes the days ahead, and Undo brings them back.
  state().markInjuryHealed("w");
  assert.deepEqual(hipDays().map((session) => session.status), ["completed"], "only what was done is left");
  state().reopenInjury("w");
  assert.equal(hipDays().length, 7, "Undo brings the days back, with no second one today");

  // Swapping changes one day only.
  const legsToday = legsDays().find((session) => session.date === tomorrow);
  assert.ok(legsToday);
  state().swapSessionExercise(legsToday.id, legsToday.exercises[0].id, [
    { id: "new", workoutId: "press", templateName: "Leg Press", sets: [] }
  ]);
  assert.equal(legsDays().find((session) => session.id === legsToday.id)?.exercises[0].templateName, "Leg Press");
  assert.equal(state().sessionTemplates.find((item) => item.id === "legs")?.exercises[0].name, "Squat", "the workout stays");
  assert.equal(
    legsDays().find((session) => session.date === shiftKey(today, 2))?.exercises[0].templateName,
    "Squat",
    "other days stay"
  );

  // Stopping it, or deleting the workout, takes its days and never turns them into normal workouts.
  state().stopInjuryWorkout("w");
  assert.equal(state().injuries.find((item) => item.id === "w")?.workout, undefined);
  assert.deepEqual(hipDays().map((session) => session.status), ["completed"]);

  state().setInjuryWorkout("w", "hip-work", { kind: "weekdays", weekdays: [0, 1, 2, 3, 4, 5, 6] }, 2);
  state().deleteSessionTemplate("hip-work");
  assert.equal(state().injuries.find((item) => item.id === "w")?.workout, undefined, "the label goes with the workout");
  assert.deepEqual(hipDays().map((session) => session.status), ["completed"]);

  // Deleting the injury takes its days too.
  state().createSessionTemplate(hipWork);
  state().setInjuryWorkout("w", "hip-work", { kind: "every", days: 1 }, 2);
  assert.ok(hipDays().length > 1);
  state().removeInjury("w");
  assert.deepEqual(hipDays().map((session) => session.status), ["completed"], "the planned days go");
  state().setInjuryWorkout("gone", "hip-work", { kind: "every", days: 1 }, 2);
  assert.deepEqual(hipDays().map((session) => session.status), ["completed"], "no such injury changes nothing");
}

// --- a phone from before this feature -------------------------------------------

flushPersist();
{
  const old = JSON.parse(storage.get(GUEST_STORAGE_KEY) ?? "{}") as Record<string, unknown>;
  delete old.injuries;
  delete old.painLogs;
  storage.set(GUEST_STORAGE_KEY, JSON.stringify(old));
  const opened = createWorkoutStore().getState();
  assert.deepEqual(opened.injuries, [], "an older saved copy opens with none");
  assert.deepEqual(opened.painLogs, []);
}

console.log("injury store checks passed");

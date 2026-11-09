import assert from "node:assert/strict";

import { createWorkoutStore, flushPersist } from "@/features/workout/workout-store";
import { resolveDayState } from "@/lib/schedule";
import type { ScheduledSession } from "@/lib/types";

const storage = new Map<string, string>();
Object.assign(globalThis, {
  window: {},
  localStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key)
  }
});

const beforeMidnight = "2026-11-07";
const afterMidnight = "2026-11-08";
const store = createWorkoutStore();
const workout = store.getState().templates[0];
const session = (id: string, date: string): ScheduledSession => ({
  id, date, dayIndex: 0, sessionName: id, type: "workout", status: "planned", source: "manual",
  exercises: [{
    id: "exercise", workoutId: workout.id, templateName: workout.name,
    sets: [{ id: "set", reps: 8, weight: 8, type: "normal" }]
  }]
});
store.setState({
  activeDate: beforeMidnight,
  scheduledSessions: [session("late", beforeMidnight), session("next", afterMidnight)]
});
store.getState().startSession("late");
store.setState({ scheduledSessions: store.getState().scheduledSessions.map((row) => row.id === "late"
  ? { ...row, startedAt: "2026-11-07T23:55:00+05:30" } : row) });

// The same action runs on mount, focus, pageshow and returning from the background.
store.getState().setActiveDate(afterMidnight);
assert.equal(store.getState().activeDate, beforeMidnight);
assert.equal(store.getState().selectedSessionId, "late");
flushPersist();

const reopened = createWorkoutStore();
// Recover even if a previous version already switched the date and selection.
reopened.setState({ activeDate: afterMidnight, selectedSessionId: "next" });
reopened.getState().setActiveDate(afterMidnight);
assert.equal(reopened.getState().activeDate, beforeMidnight);
assert.equal(reopened.getState().selectedSessionId, "late");
const active = reopened.getState().scheduledSessions.find((row) => row.id === reopened.getState().selectedSessionId);
assert.equal(resolveDayState({
  today: reopened.getState().activeDate, session: active,
  sessions: reopened.getState().scheduledSessions, hasPlan: true
}).kind, "logging", "the recovered workout remains editable");

reopened.getState().updateSessionSet("late", "exercise", "set", {
  completed: true, completedAt: "2026-11-08T00:10:00+05:30"
});
reopened.getState().logTodayWorkout();
assert.equal(reopened.getState().scheduledSessions.find((row) => row.id === "late")?.status, "completed");
assert.equal(reopened.getState().logs.length, 1);
assert.equal(reopened.getState().setLogs.length, 1);
assert.equal(reopened.getState().logs[0].date, beforeMidnight);
assert.equal(reopened.getState().setLogs[0].date, beforeMidnight);
assert.equal(reopened.getState().setLogs[0].weight, 8);
assert.equal(reopened.getState().scheduledSessions.find((row) => row.id === "next")?.status, "planned");

// Keep the completed session's recap until the next foreground sync.
assert.equal(reopened.getState().activeDate, beforeMidnight);
reopened.getState().setActiveDate(afterMidnight);
assert.equal(reopened.getState().activeDate, afterMidnight);
assert.equal(reopened.getState().selectedSessionId, "next");

// A day with no workout also rolls forward normally.
reopened.getState().setActiveDate("2026-11-09");
assert.equal(reopened.getState().activeDate, "2026-11-09");
flushPersist();
console.log("midnight workout checks passed");

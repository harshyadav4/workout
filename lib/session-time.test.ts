// Run with: npm run check
import assert from "node:assert/strict";

import {
  durationRecords,
  finishTime,
  formatDuration,
  formatTimeOfDay,
  partOfDay,
  sessionBreakdown,
  timedSessions,
  weeklyHours,
  whenYouTrain
} from "@/lib/session-time";
import type { ScheduledSession } from "@/lib/types";

// Finish on time is Finish. Finish three hours late is the last set + its rest.
const sets = ["2026-10-26T18:10:00.000Z", "2026-10-26T19:02:00.000Z", "2026-10-26T18:40:00.000Z"];
assert.equal(finishTime("2026-10-26T19:10:00.000Z", sets), "2026-10-26T19:10:00.000Z", "eight minutes after the last set: the tap stands");
assert.equal(
  finishTime("2026-10-26T22:05:00.000Z", sets, 120),
  "2026-10-26T19:04:00.000Z",
  "a forgotten Finish ends at the last set plus its rest"
);
assert.equal(finishTime("2026-10-26T22:05:00.000Z", sets), "2026-10-26T19:03:00.000Z", "a minute when it had no rest set");
assert.equal(finishTime("2026-10-26T19:10:00.000Z", []), "2026-10-26T19:10:00.000Z", "nothing logged: the tap");

assert.equal(formatDuration(4320), "1 h 12 min");
assert.equal(formatDuration(2520), "42 min");
assert.equal(formatDuration(3600), "1 h");
assert.equal(formatDuration(20), "under a minute");
assert.equal(formatTimeOfDay("2026-10-26T18:10:00.000Z", "UTC"), "6:10 PM");
assert.deepEqual([6, 13, 19, 23, 2].map(partOfDay), ["morning", "afternoon", "evening", "night", "night"]);

// Per workout and per set: the gap since the previous logged set.
const set = (id: string, at?: string) => ({ id, reps: 5, weight: 60, type: "normal" as const, completed: Boolean(at), completedAt: at });
const session: ScheduledSession = {
  id: "s1",
  date: "2026-10-26",
  dayIndex: 1,
  sessionName: "Push",
  type: "workout",
  status: "completed",
  source: "manual",
  startedAt: "2026-10-26T18:00:00.000Z",
  finishedAt: "2026-10-26T18:30:00.000Z",
  exercises: [
    { id: "bench", workoutId: "bench", templateName: "Bench", sets: [set("b1", "2026-10-26T18:05:00.000Z"), set("b2", "2026-10-26T18:08:00.000Z")] },
    { id: "fly", workoutId: "fly", templateName: "Fly", sets: [set("f1", "2026-10-26T18:15:00.000Z"), set("f2")] }
  ]
};
const breakdown = sessionBreakdown(session);
assert.deepEqual(
  breakdown.map((item) => [item.name, item.seconds, item.sets.map((s) => s.gap)]),
  [
    ["Bench", 480, [300, 180]],
    ["Fly", 420, [420]]
  ],
  "Start to the first set, then set to set; an unlogged set has no time"
);

// Progress.
const done = (id: string, date: string, start: string, minutes: number, name = "Push"): ScheduledSession => ({
  ...session,
  id,
  date,
  sessionName: name,
  startedAt: start,
  finishedAt: new Date(Date.parse(start) + minutes * 60_000).toISOString()
});
const history = [
  done("a", "2026-10-13", "2026-10-13T06:30:00.000Z", 50),
  done("b", "2026-10-15", "2026-10-15T18:00:00.000Z", 70),
  done("c", "2026-10-21", "2026-10-21T18:30:00.000Z", 90, "Pull"),
  { ...session, id: "old", startedAt: undefined, finishedAt: undefined },
  { ...done("live", "2026-10-26", "2026-10-26T18:00:00.000Z", 10), status: "active" as const }
];
const timed = timedSessions(history);
assert.deepEqual(timed.map((item) => item.id), ["a", "b", "c"], "only finished sessions with both times; old ones are left out");
assert.deepEqual(
  weeklyHours(timed, "2026-10-26", 3),
  [
    { week: "2026-10-12", hours: 2 },
    { week: "2026-10-19", hours: 1.5 },
    { week: "2026-10-26", hours: 0 }
  ]
);
const when = whenYouTrain(timed, "UTC");
assert.deepEqual(when.counts, { morning: 1, afternoon: 0, evening: 2, night: 0 });
assert.equal(when.usualStartMinutes, 18 * 60, "the median start: 6 PM");
const records = durationRecords(timed);
assert.deepEqual(
  records.map((item) => [item.name, item.count, item.average, item.longest.id, item.shortest.id]),
  [
    ["Push", 2, 3600, "b", "a"],
    ["Pull", 1, 5400, "c", "c"]
  ]
);

console.log("session time checks passed");

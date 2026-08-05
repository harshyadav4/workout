// Run with: npm run check
import assert from "node:assert/strict";

import { type DayState, mergeGeneratedSessions, resolveDayState } from "@/lib/schedule";
import type { ScheduledSession } from "@/lib/types";

function session(
  date: string,
  name: string,
  status: ScheduledSession["status"],
  type: ScheduledSession["type"] = "workout"
): ScheduledSession {
  return {
    id: `${date}-${name}`,
    date,
    dayIndex: 0,
    sessionName: name,
    exercises: [],
    type,
    status,
    source: "repeat"
  };
}

// Arrange: a finished day, a started day, and a stale planned day.
const existing = [
  session("2026-07-20", "Push", "completed"),
  session("2026-07-21", "Pull", "active"),
  session("2026-07-22", "Legs", "planned")
];
const generated = [
  session("2026-07-20", "Legs", "planned"),
  session("2026-07-21", "Push", "planned"),
  session("2026-07-22", "Pull", "planned"),
  session("2026-07-23", "Push", "planned")
];

// Act
const merged = mergeGeneratedSessions(existing, generated);

// Assert: work already done survives, and its date is not regenerated onto.
assert.deepEqual(
  merged.map((item) => `${item.date} ${item.sessionName} ${item.status}`),
  [
    "2026-07-20 Push completed",
    "2026-07-21 Pull active",
    "2026-07-22 Pull planned",
    "2026-07-23 Push planned"
  ]
);

// A planned-only schedule is replaced wholesale.
assert.deepEqual(mergeGeneratedSessions([session("2026-07-22", "Legs", "planned")], generated), generated);

// Nothing generated (no templates, bad range) still keeps the record.
assert.deepEqual(mergeGeneratedSessions(existing, []), [existing[0], existing[1]]);

console.log("schedule merge checks passed");

// --- resolveDayState ---

const TODAY = "2026-07-22";
const week = [
  session("2026-07-20", "Push", "completed"),
  session("2026-07-21", "Rest Day", "planned", "rest"),
  session("2026-07-23", "Pull", "planned"),
  session("2026-07-24", "Legs", "planned")
];

function kindFor(today: ScheduledSession | undefined, sessions = week) {
  return resolveDayState({ today: TODAY, session: today, sessions, hasPlan: true });
}

function nextOf(state: DayState) {
  return state.kind === "setup" ? undefined : state.next;
}

// Nothing built and nothing scheduled is the only first-run state.
assert.equal(resolveDayState({ today: TODAY, sessions: [], hasPlan: false }).kind, "setup");

// The bug this resolver exists for: a plan is in place but this weekday has no
// session, which is a normal off day rather than an empty workout screen.
const open = kindFor(undefined);
assert.equal(open.kind, "open");
assert.equal(nextOf(open)?.sessionName, "Pull");

// One state per session shape.
assert.equal(kindFor(session(TODAY, "Rest Day", "planned", "rest")).kind, "rest");
assert.equal(kindFor(session(TODAY, "Push", "planned")).kind, "ready");
assert.equal(kindFor(session(TODAY, "Push", "active")).kind, "logging");
assert.equal(kindFor(session(TODAY, "Push", "completed")).kind, "done");

// "Next" is the earliest workout still ahead: never today, never behind,
// never a rest day, never one already finished.
assert.equal(nextOf(kindFor(session(TODAY, "Push", "completed")))?.sessionName, "Pull");
assert.equal(
  nextOf(
    kindFor(undefined, [
      session("2026-07-25", "Legs", "planned"),
      session("2026-07-23", "Rest Day", "planned", "rest"),
      session("2026-07-24", "Pull", "completed"),
      session("2026-07-21", "Push", "planned")
    ])
  )?.sessionName,
  "Legs"
);

// A finished schedule has nothing ahead, and the screen still resolves.
assert.equal(nextOf(kindFor(session(TODAY, "Push", "completed"), [week[0]])), undefined);

console.log("day state checks passed");

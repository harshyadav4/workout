// Run with: npm run check
import assert from "node:assert/strict";

import {
  daysOfScheduleLeft,
  type DayState,
  mergeGeneratedSessions,
  resolveDayState,
  moveSession,
  REST_SLOT,
  maxScheduleEnd,
  buildScheduleSessions,
} from "@/lib/schedule";
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

// A session the user put there themselves survives a regeneration of the window
// it sits in. Quick-log from Home writes exactly this shape, so without it the
// whole no-planning-required path is erased the next time the schedule is built.
{
  const mine: ScheduledSession = {
    id: "adhoc",
    date: "2026-08-26",
    dayIndex: 3,
    sessionName: "Chest, whatever was free",
    exercises: [],
    type: "workout",
    status: "planned",
    source: "manual"
  };
  const generated: ScheduledSession = { ...mine, id: "gen", sessionName: "Push", source: "repeat" };
  const stale: ScheduledSession = {
    ...generated,
    id: "stale",
    date: "2026-08-27",
    sessionName: "Pull"
  };

  const merged = mergeGeneratedSessions([mine, stale], [generated]);
  assert.ok(
    merged.some((session) => session.id === "adhoc"),
    "a manually created session is not the generator's to delete"
  );
  assert.ok(
    !merged.some((session) => session.id === "stale"),
    "but its own previous output still is"
  );
}

// The horizon. Eight weeks is the default and nothing extends it, so the only
// thing standing between a user and an empty calendar is this number.
{
  const config = {
    startDate: "2026-08-01",
    endDate: "2026-09-01",
    mode: "weekly" as const,
    weekly: {},
    rotationOrder: [],
    restWeekdays: []
  };

  assert.equal(daysOfScheduleLeft(config, "2026-08-25"), 7);
  assert.equal(daysOfScheduleLeft(config, "2026-09-01"), 0, "the last day is not a day left");
  assert.equal(
    daysOfScheduleLeft(config, "2026-09-20"),
    0,
    "an expired horizon is zero days left, never negative"
  );
  assert.equal(daysOfScheduleLeft(undefined, "2026-08-25"), 0, "no schedule is no horizon");

  const pushTemplate = {
    id: "push",
    name: "Push",
    workoutIds: [],
    exercises: [],
    summary: { totalSets: 0, totalReps: 0, totalWeight: 0 }
  };
  // The generator stops at 400 days. "Days left" must stop there too, or the
  // calendar empties while the warning still thinks there is a year to go.
  const far = { ...config, startDate: "2026-10-27", endDate: "2027-12-31" };
  assert.equal(maxScheduleEnd("2026-10-27"), "2027-11-30", "400 days from the start, inclusive");
  assert.equal(daysOfScheduleLeft(far, "2027-11-20"), 10, "counts to the generated end, not the typed one");
  const generatedFar = buildScheduleSessions({ ...far, weekly: { 1: "push" }, restWeekdays: [] }, [pushTemplate], () => []);
  assert.ok(
    generatedFar.every((session) => session.date <= maxScheduleEnd(far.startDate)),
    "nothing is generated past the horizon the count reports"
  );
}

// A rest slot inside a rotation is an off day in the cycle, not a dropped item.
{
  const pushTemplate = {
    id: "push",
    name: "Push",
    workoutIds: [],
    exercises: [],
    summary: { totalSets: 0, totalReps: 0, totalWeight: 0 }
  };
  const rotation = buildScheduleSessions(
    {
      startDate: "2026-11-02",
      endDate: "2026-11-05",
      mode: "rotation",
      weekly: {},
      rotationOrder: ["push", REST_SLOT],
      restWeekdays: []
    },
    [pushTemplate],
    () => []
  );
  assert.deepEqual(
    rotation.map((session) => session.type),
    ["workout", "rest", "workout", "rest"],
    "push, rest, push, rest"
  );
}

// A workout beside the plan, like an injury's, is kept but does not claim its
// date. Before this, a daily one cost every generated workout in its range.
{
  const beside = { ...session("2026-07-22", "Left hip exercises", "planned"), source: "manual" as const, sessionTemplateId: "hip" };
  const onThatDay = session("2026-07-22", "Legs", "planned");
  const kept = mergeGeneratedSessions([beside], [onThatDay], new Set(["hip"]));
  assert.deepEqual(kept.map((item) => item.sessionName).sort(), ["Left hip exercises", "Legs"], "both stay");
  assert.deepEqual(
    mergeGeneratedSessions([beside], [onThatDay]).map((item) => item.sessionName),
    ["Left hip exercises"],
    "without the rule, the date is taken"
  );
}

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

// --- moving a day ----------------------------------------------------------
// The property that matters is not "the session changed date" — it is that the
// move SURVIVES the next regeneration. mergeGeneratedSessions replaces anything
// still `planned` + `repeat`, so a move that forgets to claim `manual` snaps
// back, and a vacated date left empty gets refilled with a duplicate.

const moveDay = (
  id: string,
  date: string,
  extra: Partial<ScheduledSession> = {}
): ScheduledSession => ({
  id,
  date,
  dayIndex: 0,
  sessionName: "Push",
  exercises: [],
  type: "workout",
  status: "planned",
  source: "repeat",
  ...extra
});

const moveWeek = [moveDay("a", "2026-03-02"), moveDay("b", "2026-03-04")];

const moved = moveSession(moveWeek, "a", "2026-03-05");
assert.equal(moved.ok, true);
const afterMove = moved.ok ? moved.sessions : [];

assert.equal(
  afterMove.find((session) => session.id === "a")?.date,
  "2026-03-05",
  "the session lands on the new day"
);
assert.equal(
  afterMove.find((session) => session.id === "a")?.source,
  "manual",
  "and claims the move, or the generator undoes it"
);
assert.equal(
  afterMove.find((session) => session.date === "2026-03-02")?.type,
  "rest",
  "the day it left becomes a rest day, not a hole"
);

// The check the whole feature rests on. Regenerate the original week over the
// top and the move must still stand.
const regenerated = mergeGeneratedSessions(afterMove, [
  moveDay(crypto.randomUUID(), "2026-03-02"),
  moveDay(crypto.randomUUID(), "2026-03-04")
]);

assert.equal(
  regenerated.filter((session) => session.type === "workout" && session.sessionName === "Push")
    .length,
  2,
  "regenerating does not duplicate the session that moved"
);
assert.equal(
  regenerated.find((session) => session.date === "2026-03-02")?.type,
  "rest",
  "and does not refill the vacated day"
);
assert.equal(
  regenerated.some((session) => session.date === "2026-03-05"),
  true,
  "the moved session is still where it was put"
);

// Landing on an occupied day swaps them rather than overwriting one.
const swapped = moveSession(moveWeek, "a", "2026-03-04");
assert.equal(swapped.ok, true);
const afterSwap = swapped.ok ? swapped.sessions : [];
assert.equal(afterSwap.find((s) => s.id === "a")?.date, "2026-03-04");
assert.equal(
  afterSwap.find((s) => s.id === "b")?.date,
  "2026-03-02",
  "the day that was there moves to the day that was vacated"
);
assert.equal(afterSwap.length, 2, "a swap creates no extra rest day");

// A finished session is a record of a day that happened.
const done = moveSession([moveDay("a", "2026-03-02", { status: "completed" })], "a", "2026-03-05");
assert.equal(done.ok, false, "a completed session does not move");

assert.equal(
  moveSession(moveWeek, "a", "2026-03-02").ok,
  true,
  "moving to the day it is already on is a no-op, not an error"
);
assert.equal(moveSession(moveWeek, "nope", "2026-03-05").ok, false, "an unknown id is refused");

// Into the past: the date input's `min` is only a hint. A session landed there
// could never be moved or removed again, because Plan hides both on past days.
assert.equal(moveSession(moveWeek, "a", "2026-02-20", "2026-03-01").ok, false, "a past day is refused");
assert.equal(moveSession(moveWeek, "a", "2026-03-01", "2026-03-01").ok, true, "today is allowed");

// Onto a day with a workout in progress: the swap would carry the half-done
// session (and its logs' date) to another day.
const inProgress = moveSession(
  [moveDay("a", "2026-03-02"), moveDay("live", "2026-03-04", { status: "active", startedAt: "2026-03-04T09:00:00.000Z" })],
  "a",
  "2026-03-04"
);
assert.equal(inProgress.ok, false, "an active session is never displaced");

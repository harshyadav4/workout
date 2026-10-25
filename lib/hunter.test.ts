import assert from "node:assert/strict";

import { hunterRank, isLevelUp, previousBest, rankParts, scoreOf } from "@/lib/hunter";
import { shiftKey, weekStartKey } from "@/lib/progress-metrics";
import type { ScheduledSession, WorkoutLog } from "@/lib/types";

const today = "2026-10-26"; // a Monday, nothing logged yet today

const log = (date: string, workoutId = "bench", peakWeight = 60, totalVolume = 1000): WorkoutLog => ({
  date,
  workoutId,
  name: workoutId,
  totalVolume,
  peakWeight,
  muscles: []
});

/** `count` full weeks before this one, Monday, Wednesday and Friday each week. */
function weeks(count: number, options: { peak?: (week: number) => number; stopAt?: number } = {}) {
  const start = shiftKey(weekStartKey(today), -7 * count);
  const rows: WorkoutLog[] = [];
  for (let week = 0; week < (options.stopAt ?? count); week += 1) {
    for (const day of [0, 2, 4]) rows.push(log(shiftKey(start, 7 * week + day), "bench", options.peak?.(week) ?? 60));
  }
  return rows;
}

// A new account: E, nothing earned, and no score from nothing.
const fresh = hunterRank([], [], today);
assert.equal(fresh.rank, "E");
assert.equal(fresh.score, 0);
assert.deepEqual(
  { done: fresh.next?.weeksDone, needed: fresh.next?.weeksNeeded, onTrack: fresh.next?.onTrack },
  { done: 0, needed: 9, onTrack: false }
);

// Steady training, three days a week, holding the same lifts: a score of 80.
// The first two weeks only set the line, then nine qualifying weeks earn D —
// two to three months a rank, a year from E to S at the very fastest.
const steady10 = hunterRank(weeks(10), [], today);
assert.equal(steady10.score, 80);
assert.equal(steady10.rank, "E", "ten weeks in is not D yet");
assert.equal(steady10.next?.weeksDone, 8);
// On track, so the date is the Sunday the last counting week ends.
assert.equal(steady10.next?.onTrack, true);
assert.equal(steady10.next?.eta, "2026-11-01");
const steady12 = hunterRank(weeks(12), [], today);
assert.equal(steady12.rank, "D");
assert.equal(steady12.next?.rank, "C");
assert.equal(steady12.next?.weeksDone, 1);
assert.equal(steady12.next?.progress, 0.1);
assert.equal(hunterRank(weeks(30), [], today).rank, "C");

// Holding level forever tops out at A, never S.
const steady60 = hunterRank(weeks(60), [], today);
assert.equal(steady60.rank, "A");
assert.equal(steady60.next?.onTrack, false);

// S is rare but human: every session, best sets up about 2% a month, and a
// little more work. That scores at S's line; one missed session a month does not.
const human = (stopAt?: number) =>
  weeks(30, { peak: (week) => 60 * 1.005 ** week, stopAt }).map((row, index) => ({
    ...row,
    totalVolume: 1000 * 1.0025 ** index
  }));
assert.ok(hunterRank(human(), [], today).score >= 90, "every session and slow, steady growth reaches S's line");
const oneMissed = human().filter((row) => row.date !== shiftKey(weekStartKey(today), -5));
assert.ok(hunterRank(oneMissed, [], today).score < 90, "S asks for every planned session");

// Stop training and the rank falls, two weeks below level per step.
const lapsed = hunterRank(weeks(36, { stopAt: 30 }), [], today); // C, then six empty weeks
assert.equal(lapsed.rank, "E");
assert.equal(lapsed.score, 0);

// Lighter best sets and less work cost score, against the same attendance.
const month = shiftKey(today, -28); // the live window ends yesterday
const lighter = [
  ...weeks(8).filter((row) => row.date < month),
  ...weeks(8).filter((row) => row.date >= month).map((row) => ({ ...row, peakWeight: 50, totalVolume: 800 }))
];
const lighterParts = rankParts(lighter, [], shiftKey(today, -1));
assert.equal(lighterParts.strength, 0, "a best set 1/6 down is the bottom");
assert.ok(lighterParts.volume < 0.6);
assert.ok(scoreOf(lighterParts) < scoreOf(rankParts(weeks(8), [], shiftKey(today, -1))));

// With a schedule, showing up is planned days trained, and a missed one says so.
const plannedDays = weeks(4).map((row) => row.date);
const scheduled = plannedDays.map(
  (date, index) =>
    ({ id: `s${index}`, date, dayIndex: 0, sessionName: "Push", exercises: [{}], type: "workout", status: "planned", source: "repeat" }) as unknown as ScheduledSession
);
const missedTwo = weeks(10).filter((row) => row.date !== plannedDays[3] && row.date !== plannedDays[7]);
const withPlan = hunterRank(missedTwo, scheduled, today);
assert.equal(withPlan.parts.planned, 12);
assert.equal(withPlan.parts.trained, 10);
assert.match(withPlan.reason, /2 planned sessions missed/);

// Best before today only, per exercise.
const history = [log("2026-01-01", "bench", 70), log("2026-01-02", "bench", 75), log("2026-01-02", "squat", 120), log("2026-01-03", "bench", 90)];
assert.equal(previousBest(history, "bench", "2026-01-03"), 75);
assert.equal(previousBest(history, "deadlift", "2026-01-03"), 0);

// Level up: beats history and today's sets; never on a first-ever lift.
assert.equal(isLevelUp(80, 75, 0), true);
assert.equal(isLevelUp(75, 75, 0), false, "equal is not a record");
assert.equal(isLevelUp(80, 75, 80), false, "already levelled up at this weight today");
assert.equal(isLevelUp(85, 75, 80), true, "a new high on top of today's");
assert.equal(isLevelUp(100, 0, 0), false, "a first lift is a baseline");

console.log("hunter checks passed");

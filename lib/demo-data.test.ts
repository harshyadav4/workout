// Run with: npm run check
import assert from "node:assert/strict";

import { buildComposition } from "@/lib/body-composition";
import { buildDemoState, DEMO_MISSED_WEEK, DEMO_PROFILE, DEMO_WEEKS } from "@/lib/demo-data";
import { buildEffectiveReps } from "@/lib/fitness-fatigue";
import { buildDots, buildStandards } from "@/lib/strength-science";
import { cardioSessions } from "@/lib/cardio-metrics";
import { buildGoalEta } from "@/lib/progress-extras";
import { buildWeeklySetsByGroup, daysBetween, shiftKey, weekStartKey } from "@/lib/progress-metrics";
import { musclesRing, strengthRing } from "@/lib/progress-scores";
import { buildPRLedger, buildStreaks } from "@/lib/progress-trends";
import { timedSessions } from "@/lib/session-time";
import { skillProgress } from "@/lib/skills";

// A Monday, a Thursday and a Sunday: the story must hold on any day of the week.
for (const today of ["2026-10-26", "2026-10-29", "2026-11-01"]) {
  const demo = buildDemoState(today);
  const label = `(${today})`;
  const first = demo.logs.map((log) => log.date).sort()[0];

  // About six months of history, and nothing in the future.
  assert.ok(daysBetween(first, today) >= (DEMO_WEEKS - 1) * 7, `six months of history ${label}`);
  assert.ok(demo.logs.every((log) => log.date < today), `no logs from today or later ${label}`);

  // Today: a lifting session, planned and not started — Home's ready state.
  const todays = demo.scheduledSessions.filter((session) => session.date === today);
  assert.equal(todays.length, 1, `exactly one session today ${label}`);
  assert.equal(todays[0].type, "workout");
  assert.equal(todays[0].status, "planned");
  assert.ok(todays[0].exercises.length >= 4, `today has a full session ${label}`);
  assert.ok(todays[0].exercises.every((exercise) => exercise.sets.every((set) => !set.completed)));

  // Next week is planned, so Plan has something ahead.
  assert.ok(demo.scheduledSessions.some((session) => session.date > today && session.type === "workout"));

  // Set ids are unique: Home tracks the open set by id.
  const setIds = demo.scheduledSessions.flatMap((session) => session.exercises.flatMap((exercise) => exercise.sets.map((set) => set.id)));
  assert.equal(new Set(setIds).size, setIds.length, `unique set ids ${label}`);

  // One missed week, then a streak back to today.
  const missedStart = shiftKey(weekStartKey(today), -7 * DEMO_MISSED_WEEK);
  assert.ok(
    !demo.logs.some((log) => log.date >= missedStart && log.date <= shiftKey(missedStart, 6)),
    `the missed week is empty ${label}`
  );
  const streaks = buildStreaks(demo.logs, { start: first, end: today });
  assert.ok(streaks.currentWeeks >= DEMO_MISSED_WEEK - 1, `streak runs from after the gap ${label}`);
  assert.ok(streaks.currentWeeks <= DEMO_MISSED_WEEK, `and not across it ${label}`);

  // Getting stronger, with a record in the last two weeks.
  assert.equal(strengthRing(demo.logs).tone, "good", `strength is going well ${label}`);
  const recent = buildPRLedger(demo.logs).filter((entry) => daysBetween(entry.date, today) <= 14);
  assert.ok(recent.length >= 1, `a recent record ${label}`);

  // Muscles: on goal except core, which the advice names.
  const window = { start: shiftKey(today, -27), end: today };
  const ring = musclesRing(buildWeeklySetsByGroup(demo.logs.filter((log) => log.date >= window.start), window));
  assert.match(ring.sentence, /Core/, `core is the weak spot ${label}`);
  assert.ok(ring.fill >= 4 / 6, `most groups on goal (${ring.value}) ${label}`);

  // Runs getting faster.
  const runs = cardioSessions(demo.setLogs, demo.logs);
  assert.ok(runs.length >= 40, `two runs a week ${label}`);
  assert.ok((runs[0].pace ?? 0) > (runs[runs.length - 1].pace ?? 0), `pace improves ${label}`);

  // Timed sessions for the Time section, with sensible lengths.
  const timed = timedSessions(demo.scheduledSessions);
  assert.ok(timed.length >= 100, `sessions carry their times ${label}`);
  const lifting = timed.filter((session) => !session.name.includes("run"));
  assert.ok(lifting.every((session) => session.seconds >= 20 * 60 && session.seconds <= 120 * 60), `lifting sessions take 20–120 minutes ${label}`);

  // Weight on its way to the goal, with a date.
  const eta = buildGoalEta(demo.measurements, DEMO_PROFILE.goalWeightKg, today);
  assert.ok(eta && eta.perWeek < 0, `a goal date while losing weight ${label}`);
  assert.ok(demo.profile.weightKg > DEMO_PROFILE.goalWeightKg, `not there yet ${label}`);

  // The Science tab lights up: a body-fat estimate, a DOTS score, effective reps.
  const bodyweight = demo.profile.weightKg;
  const composition = buildComposition(demo.measurements, { heightCm: DEMO_PROFILE.heightCm, sex: DEMO_PROFILE.sex, weightKg: bodyweight });
  assert.ok(composition && composition.bodyFatPercent > 8 && composition.bodyFatPercent < 30, `a plausible body-fat estimate ${label}`);
  // Standards for the squat and the bench; no DOTS, because the programme's
  // only deadlift is a Romanian one and the tables are for the conventional
  // lift — the classifier is right to leave it out, and the card says why.
  const standards = buildStandards(demo.setLogs, demo.logs, bodyweight, DEMO_PROFILE.sex);
  assert.deepEqual(standards.map((row) => row.lift), ["squat", "bench", "press"], `standards for the barbell lifts the demo has ${label}`);
  assert.equal(buildDots(demo.setLogs, demo.logs, bodyweight, DEMO_PROFILE.sex), undefined, `no conventional deadlift, no DOTS ${label}`);
  const effective = buildEffectiveReps(demo.setLogs, { start: first, end: today }, new Map(demo.logs.map((log) => [log.workoutId, "chest" as const])));
  assert.ok(effective.rated > 0 && effective.rows[0]?.effective > 0, `rated sets with effective reps ${label}`);

  // The pull-up skill: three rungs cleared, working on chin-ups.
  const goal = demo.skillGoals?.[0];
  assert.ok(goal, `a skill goal ${label}`);
  const skill = skillProgress(goal, demo.setLogs);
  assert.equal(skill.level, 3, `three levels cleared ${label}`);
  assert.equal(skill.current?.name, "Chin-up");
  assert.ok(skill.ratio > 0 && skill.ratio < 1, `chin-ups in progress ${label}`);
}

// Same day, same numbers.
const once = buildDemoState("2026-10-26");
const twice = buildDemoState("2026-10-26");
assert.deepEqual(
  once.logs.map((log) => [log.date, log.workoutId, log.peakWeight, log.totalReps]),
  twice.logs.map((log) => [log.date, log.workoutId, log.peakWeight, log.totalReps]),
  "the sample is deterministic"
);
assert.deepEqual(once.measurements, twice.measurements);

console.log("demo data checks passed");

// Run with: npm run check
import assert from "node:assert/strict";

import { MUSCLE_IDS } from "@/features/body/body-map-shared";
import {
  INJURY_PLACES,
  activeInjuries,
  frequencyWords,
  injuriesLoadedBy,
  injuryName,
  injuryWorkoutDates,
  injuryWorkoutDaysLeft,
  injuryWorkoutIds,
  injuryWorkoutLine,
  injuryWorkoutProgress,
  injuryWorkoutWeeks,
  isInjurySession,
  isCheckInDue,
  isHighPain,
  isPainScore,
  latestPain,
  loadsInjury,
  mayLoadLine,
  painChangeWords,
  painLogsFor,
  painQuestion,
  painTrend,
  readInjury,
  shouldSeePhysio,
  upsertPainLog,
  withoutInjury
} from "@/lib/injuries";
import { shiftKey } from "@/lib/progress-metrics";
import type { Injury, InjuryPlace, InjuryWorkout, MuscleId, PainLog, ScheduledSession } from "@/lib/types";

const injury = (over: Partial<Injury> = {}): Injury => ({
  id: "hip",
  place: "hip",
  side: "left",
  startDate: "2026-09-05",
  ...over
});

/** One score a week, ending on `end`. */
const weekly = (scores: number[], end = "2026-10-31", injuryId = "hip"): PainLog[] =>
  scores.map((score, index) => ({
    id: `${injuryId}-${index}`,
    injuryId,
    date: shiftKey(end, (index - (scores.length - 1)) * 7),
    score
  }));

// --- names ----------------------------------------------------------------------

assert.equal(injuryName(injury()), "Left hip");
assert.equal(injuryName(injury({ side: "right", place: "hamstring" })), "Right hamstring");
assert.equal(injuryName(injury({ side: "both", place: "knee" })), "Knee, both sides");
assert.equal(injuryName(injury({ place: "lowerBack", side: undefined })), "Lower back");
assert.equal(
  injuryName(injury({ place: "lowerBack", side: "left" })),
  "Lower back",
  "a place on the body's middle line has no side, even if a row carries one"
);

assert.equal(painQuestion(injury()), "How is your hip today?");
assert.equal(painQuestion(injury({ place: "lowerBack", side: undefined })), "How is your lower back today?");
assert.equal(painQuestion(injury({ place: "abs", side: undefined })), "How are your abs today?");
assert.equal(mayLoadLine(injury()), "May load your hip");

// --- places ---------------------------------------------------------------------

const places = Object.keys(INJURY_PLACES) as InjuryPlace[];
assert.equal(places.length, 20, "the 20 places the body map can name");

const named = new Set<MuscleId>(places.flatMap((place) => INJURY_PLACES[place].muscles));
for (const muscle of MUSCLE_IDS) {
  assert.ok(named.has(muscle), `${muscle} loads some place, so no exercise is silently never warned about`);
}
for (const place of places) {
  assert.ok(INJURY_PLACES[place].muscles.length > 0, `${place} has muscles behind it`);
}
assert.deepEqual(
  places.filter((place) => INJURY_PLACES[place].middle).sort(),
  ["abs", "lowerBack", "neck", "upperBack"],
  "only these four have no left and right"
);

// --- scores ---------------------------------------------------------------------

for (const good of [0, 1, 7, 10]) {
  assert.equal(isPainScore(good), true, `${good} is a score`);
}
for (const bad of [-1, 11, 4.5, "4", Number.NaN, null, undefined]) {
  assert.equal(isPainScore(bad), false, `${String(bad)} is not a score`);
}
assert.equal(isHighPain(6), false);
assert.equal(isHighPain(7), true);

// --- logs -----------------------------------------------------------------------

{
  const first: PainLog = { id: "a", injuryId: "hip", date: "2026-10-01", score: 5 };
  const again: PainLog = { id: "b", injuryId: "hip", date: "2026-10-01", score: 3 };
  const otherInjury: PainLog = { id: "c", injuryId: "knee", date: "2026-10-01", score: 8 };
  const earlier: PainLog = { id: "d", injuryId: "hip", date: "2026-09-20", score: 6 };

  const list = upsertPainLog(upsertPainLog(upsertPainLog([first], otherInjury), earlier), again);
  assert.equal(list.length, 3, "one score per injury per day");
  assert.equal(latestPain(list, "hip")?.score, 3, "the newer score on a day wins");
  assert.equal(latestPain(list, "knee")?.score, 8, "another injury on the same day is left alone");
  assert.deepEqual(
    painLogsFor(list, "hip").map((log) => log.date),
    ["2026-09-20", "2026-10-01"],
    "oldest first, for the chart"
  );
  assert.equal(latestPain(list, "nothing"), undefined);
}

// --- active ---------------------------------------------------------------------

assert.deepEqual(
  activeInjuries([injury(), injury({ id: "old", healedDate: "2026-10-01" })]).map((item) => item.id),
  ["hip"]
);

// --- the weekly question --------------------------------------------------------

{
  const logs = weekly([5], "2026-10-24");
  assert.equal(isCheckInDue(injury(), [], "2026-10-31"), true, "no score yet");
  assert.equal(isCheckInDue(injury(), logs, "2026-10-30"), false, "6 days");
  assert.equal(isCheckInDue(injury(), logs, "2026-10-31"), true, "7 days");
  assert.equal(isCheckInDue(injury({ healedDate: "2026-10-30" }), logs, "2026-10-31"), false, "healed");
  assert.equal(isCheckInDue(injury(), logs, "2026-10-31", "2026-10-28"), false, "skipped this week");
  assert.equal(isCheckInDue(injury(), logs, "2026-11-04", "2026-10-28"), true, "the skip lasts one week");
  assert.equal(isCheckInDue(injury(), [], "2026-10-31", "2026-10-31"), false, "a skip also covers no score yet");
}

// --- the trend ------------------------------------------------------------------

assert.equal(painTrend([], "hip"), "new");
assert.equal(painTrend(weekly([5]), "hip"), "new", "one score says nothing yet");
{
  const close: PainLog[] = [
    { id: "a", injuryId: "hip", date: "2026-10-28", score: 8 },
    { id: "b", injuryId: "hip", date: "2026-10-31", score: 2 }
  ];
  assert.equal(painTrend(close, "hip"), "new", "under a week apart says nothing yet");
}
assert.equal(painTrend(weekly([7, 5]), "hip"), "better", "2 points lower is a real change");
assert.equal(painTrend(weekly([5, 4]), "hip"), "same", "1 point is not");
assert.equal(painTrend(weekly([4, 6]), "hip"), "worse");
assert.equal(
  painTrend(weekly([7, 7, 6, 6, 5, 6, 5, 4, 4]), "hip"),
  "better",
  "compared with 3 weeks ago, not with last week"
);

// --- the line beside the chart --------------------------------------------------

assert.equal(painChangeWords(weekly([5])), undefined);
assert.equal(painChangeWords(weekly([7, 7, 6, 6, 5, 6, 5, 4, 4])), "down from 7 in 8 weeks");
assert.equal(painChangeWords(weekly([3, 6])), "up from 3 in 1 week");
assert.equal(painChangeWords(weekly([6, 6, 6, 6])), "no change in 3 weeks");
assert.equal(
  painChangeWords([
    { id: "a", injuryId: "hip", date: "2026-10-29", score: 5 },
    { id: "b", injuryId: "hip", date: "2026-10-31", score: 4 }
  ]),
  "down from 5 this week"
);

// --- see a physio ---------------------------------------------------------------

assert.equal(shouldSeePhysio(injury(), weekly([6, 6, 6, 6])), true, "no change in 3 weeks");
assert.equal(shouldSeePhysio(injury(), weekly([6, 6, 6, 5])), true, "1 point in 3 weeks is no real change");
assert.equal(shouldSeePhysio(injury(), weekly([6, 6, 6, 4])), false, "2 points in 3 weeks is");
assert.equal(shouldSeePhysio(injury(), weekly([4, 5, 6, 7])), true, "getting worse");
assert.equal(shouldSeePhysio(injury(), weekly([6, 6, 6])), false, "only 2 weeks so far");
assert.equal(shouldSeePhysio(injury(), weekly([1, 1, 1, 1])), false, "barely any pain left");
assert.equal(shouldSeePhysio(injury(), weekly([7, 7, 6, 6, 5, 6, 5, 4, 4])), false, "it is improving");
assert.equal(shouldSeePhysio(injury({ healedDate: "2026-10-31" }), weekly([6, 6, 6, 6])), false, "healed");
assert.equal(shouldSeePhysio(injury(), []), false);

// --- "May load" -----------------------------------------------------------------

{
  const squat = [
    { muscleId: "rectusFemoris" as const, engagement: 60 },
    { muscleId: "erectors" as const, engagement: 20 }
  ];
  assert.equal(loadsInjury(squat, injury()), true, "a direct muscle");
  assert.equal(loadsInjury(squat, injury({ place: "lowerBack", side: undefined })), false, "below direct work");
  assert.equal(loadsInjury(squat, injury({ place: "wrist" })), false, "another part of the body");
  assert.equal(
    loadsInjury([{ muscleId: "quads" as MuscleId, engagement: 80 }], injury()),
    true,
    "a stored log's old coarse id still counts"
  );

  const healed = injury({ id: "old", place: "knee", healedDate: "2026-10-01" });
  const hip = injury({
    workout: {
      sessionTemplateId: "hip-work",
      frequency: { kind: "every", days: 1 },
      startDate: "2026-10-31",
      endDate: "2026-12-11"
    }
  });
  assert.deepEqual(injuriesLoadedBy(squat, [hip, healed], "legs"), [hip], "healed injuries give no warning");
  assert.deepEqual(injuriesLoadedBy(squat, [hip], "hip-work"), [], "never on the injury's own workout");
}

// --- how often ------------------------------------------------------------------

{
  const start = "2026-10-31";
  const daily = injuryWorkoutDates({ kind: "every", days: 1 }, start, 6);
  assert.equal(daily.length, 42);
  assert.equal(daily[0], start, "starts today");
  assert.equal(daily.at(-1), "2026-12-11");

  const everyOther = injuryWorkoutDates({ kind: "every", days: 2 }, start, 6);
  assert.equal(everyOther.length, 21);
  assert.equal(everyOther.at(-1), "2026-12-10");
  assert.equal(injuryWorkoutDates({ kind: "every", days: 2 }, start, 2).at(-1), "2026-11-12");

  const picked = injuryWorkoutDates({ kind: "weekdays", weekdays: [1, 3, 5] }, start, 2);
  assert.deepEqual(picked, [
    "2026-11-02",
    "2026-11-04",
    "2026-11-06",
    "2026-11-09",
    "2026-11-11",
    "2026-11-13"
  ]);
  assert.deepEqual(injuryWorkoutDates({ kind: "weekdays", weekdays: [] }, start, 4), [], "no day picked");
}

// --- a saved workout ------------------------------------------------------------

{
  const workout: InjuryWorkout = {
    sessionTemplateId: "hip-work",
    frequency: { kind: "every", days: 1 },
    startDate: "2026-10-31",
    endDate: "2026-12-11"
  };
  assert.deepEqual([...injuryWorkoutIds([injury({ workout }), injury({ id: "b" })])], ["hip-work"]);
  assert.equal(isInjurySession({ sessionTemplateId: "hip-work" }, new Set(["hip-work"])), true);
  assert.equal(isInjurySession({ sessionTemplateId: "legs" }, new Set(["hip-work"])), false);
  assert.equal(isInjurySession({ sessionTemplateId: undefined }, new Set(["hip-work"])), false, "a quick start");

  assert.equal(frequencyWords({ kind: "every", days: 1 }), "Every day");
  assert.equal(frequencyWords({ kind: "every", days: 2 }), "Every 2 days");
  assert.equal(frequencyWords({ kind: "weekdays", weekdays: [0, 5, 1] }), "Mon, Fri, Sun", "Monday first");
  assert.equal(injuryWorkoutLine(workout), "Every day to Dec 11");

  assert.equal(injuryWorkoutWeeks(workout), 6);
  assert.equal(injuryWorkoutWeeks({ ...workout, frequency: { kind: "every", days: 2 }, endDate: "2026-12-10" }), 6);
  assert.equal(injuryWorkoutWeeks({ ...workout, endDate: "2026-11-13" }), 2);

  assert.equal(injuryWorkoutDaysLeft(workout, "2026-10-31").length, 42);
  assert.equal(injuryWorkoutDaysLeft(workout, "2026-12-11").length, 1);
  assert.deepEqual(injuryWorkoutDaysLeft(workout, "2026-12-12"), [], "nothing after the last day");

  const session = (status: ScheduledSession["status"], sessionTemplateId: string) =>
    ({ status, sessionTemplateId }) as ScheduledSession;
  assert.deepEqual(
    injuryWorkoutProgress(workout, [
      session("completed", "hip-work"),
      session("planned", "hip-work"),
      session("completed", "legs")
    ]),
    { done: 1, total: 2 }
  );
}

// --- deleting -------------------------------------------------------------------

{
  const left = withoutInjury([injury(), injury({ id: "knee", place: "knee" })], [...weekly([5, 4]), ...weekly([6], "2026-10-31", "knee")], "hip");
  assert.deepEqual(left.injuries.map((item) => item.id), ["knee"]);
  assert.deepEqual(left.painLogs.map((log) => log.injuryId), ["knee"], "its scores go with it");
}

// --- a row from a file or the account, which nothing here trusts ----------------

{
  const good = {
    id: "a",
    place: "hip",
    side: "left",
    startDate: "2026-10-01",
    worseWith: "Deep squats",
    stopSign: true,
    healedDate: "2026-10-20",
    workout: {
      sessionTemplateId: "s1",
      frequency: { kind: "weekdays", weekdays: [1, 3] },
      startDate: "2026-10-01",
      endDate: "2026-10-29"
    }
  };
  assert.deepEqual(readInjury(good), good, "a good row survives whole");

  for (const bad of [
    null,
    "hip",
    { ...good, id: "" },
    { ...good, place: "elbowish" },
    { ...good, place: "toString" },
    { ...good, startDate: "yesterday" },
    { ...good, side: undefined },
    { ...good, side: "middle" }
  ]) {
    assert.equal(readInjury(bad), undefined, `drops ${JSON.stringify(bad)}`);
  }

  assert.equal(readInjury({ ...good, place: "neck" })?.side, undefined, "a middle place loses its side");
  assert.equal(readInjury({ ...good, worseWith: 5 })?.worseWith, undefined);
  assert.equal(readInjury({ ...good, healedDate: "soon" })?.healedDate, undefined);
  assert.equal(readInjury({ ...good, stopSign: "yes" })?.stopSign, undefined);
  for (const workout of [
    "s1",
    { ...good.workout, sessionTemplateId: "" },
    { ...good.workout, endDate: "later" },
    { ...good.workout, frequency: { kind: "every", days: 3 } },
    { ...good.workout, frequency: { kind: "weekdays", weekdays: [9] } }
  ]) {
    const read = readInjury({ ...good, workout });
    assert.equal(read?.id, "a", "a damaged workout does not lose the injury");
    assert.equal(read?.workout, undefined);
  }
}

console.log("injuries checks passed");

import assert from "node:assert/strict";

import { ImportError, importSummary, parseExport, parseExportText } from "@/lib/import-backup";

// The file is hostile input — the only place arbitrary user JSON reaches the
// store. Every assertion here is about what must NOT get through.

const good = {
  exportedAt: "2026-08-27T00:00:00.000Z",
  templates: [{ id: "t1", name: "Bench", muscles: [] }],
  sessionTemplates: [{ id: "s1", name: "Push", exercises: [] }],
  scheduledSessions: [{ id: "d1", date: "2026-08-27", exercises: [] }],
  logs: [{ id: "l1", date: "2026-08-27", workoutId: "t1", totalVolume: 480 }],
  setLogs: [{ id: "x1", logId: "l1", workoutId: "t1", date: "2026-08-27", reps: 8, weight: 60 }],
  measurements: [{ id: "m1", date: "2026-08-27", metric: "weight", value: 80 }],
  skillGoals: [{ id: "g1", name: "Pull-up", levels: [], createdAt: "2026-08-01T00:00:00.000Z" }],
  profile: { name: "A", email: "a@b.c", heightCm: 180, weightKg: 80 }
};

// --- the happy path --------------------------------------------------------

const parsed = parseExport(good);
assert.equal(parsed.state.logs.length, 1);
assert.equal(parsed.state.setLogs.length, 1);
assert.equal(parsed.state.profile?.name, "A");

// 0013's optional fields ride through untouched, like goalWeightKg does.
{
  const science = parseExport({
    ...good,
    setLogs: [{ ...good.setLogs[0], rir: 2 }],
    measurements: [...good.measurements, { id: "m2", date: "2026-08-27", metric: "neck", value: 38 }],
    profile: { ...good.profile, birthYear: 1990, sex: "male" }
  });
  assert.equal(science.state.setLogs[0].rir, 2, "reps in reserve survive a backup");
  assert.equal(science.state.measurements[1].metric, "neck", "a neck reading survives a backup");
  assert.equal(science.state.profile?.birthYear, 1990);
  assert.equal(science.state.profile?.sex, "male");
}
assert.equal(parsed.counts.sets, 1);
assert.equal(parsed.state.skillGoals?.length, 1, "skill goals round-trip — a restore used to drop them");
assert.equal(parsed.counts.skills, 1);

// Injuries round-trip, and a bad row is dropped on its own.
{
  const injury = { id: "i1", place: "hip", side: "left", startDate: "2026-08-01" };
  const pain = { id: "p1", injuryId: "i1", date: "2026-08-01", score: 6 };
  const withInjuries = parseExport({
    ...good,
    injuries: [injury, { id: "i2", place: "toString", side: "left", startDate: "2026-08-01" }],
    painLogs: [pain, { ...pain, id: "p2", score: 11 }, { ...pain, id: "p3", injuryId: "" }]
  });
  assert.deepEqual(withInjuries.state.injuries, [injury]);
  assert.deepEqual(withInjuries.state.painLogs, [pain]);
  assert.equal(withInjuries.counts.injuries, 1);
  assert.equal(withInjuries.counts["pain scores"], 1);
  assert.equal(parsed.state.injuries, undefined, "a file from before injuries leaves the device's alone");
  assert.equal(parsed.state.painLogs, undefined);
  assert.equal(parseExport({ injuries: [injury] }).counts.injuries, 1, "a file with only an injury is still a backup");

  const deletion = { id: "i9", deletedAt: "2026-08-02T00:00:00.000Z" };
  assert.deepEqual(
    parseExport({ ...good, deletedInjuries: [deletion, { id: "i8" }, { deletedAt: "x" }] }).state.deletedInjuries,
    [deletion],
    "a deletion rides along, so a restore does not bring the injury back"
  );
  assert.equal(parsed.state.deletedInjuries, undefined);
}
assert.equal(
  parseExport({ ...good, skillGoals: undefined }).state.skillGoals,
  undefined,
  "an export from before skills leaves the device's goals alone"
);
assert.equal(
  parseExport({ ...good, skillGoals: [{ id: "g2", name: "No ladder" }] }).state.skillGoals?.length,
  0,
  "a goal without levels or a creation time is dropped, not carried"
);
assert.equal(parseExportText(JSON.stringify(good)).state.logs.length, 1, "round-trips as text");

// --- what must not get through ---------------------------------------------

assert.throws(() => parseExport(null), ImportError, "null is not an export");
assert.throws(() => parseExport([1, 2]), ImportError, "an array is not an export");
assert.throws(() => parseExportText("not json"), ImportError, "bad JSON is a wrong-file mistake");
assert.throws(() => parseExport({ templates: [] }), ImportError, "an empty file is reported, not silently merged");

const dirty = parseExport({
  ...good,
  logs: [
    { id: "l1", date: "2026-08-27", workoutId: "t1", totalVolume: 480 },
    { id: "l2", date: "2026-08-27", workoutId: "t1", totalVolume: "lots" }, // wrong type
    { id: "l3", workoutId: "t1", totalVolume: 10 }, // no date
    null,
    "a string"
  ],
  setLogs: [{ id: "x1", logId: "l1", workoutId: "t1", date: "2026-08-27", reps: NaN, weight: 60 }]
});
assert.equal(dirty.state.logs.length, 1, "rows that do not typecheck are dropped, not carried");
assert.equal(dirty.state.setLogs.length, 0, "NaN is not a finite number");

// A half-built profile would render NaN into the header rather than fail
// anywhere a user could see and report.
assert.equal(
  parseExport({ ...good, profile: { name: "A" } }).state.profile,
  undefined,
  "an incomplete profile is refused whole"
);
assert.equal(
  parseExport({ ...good, scheduleConfig: { startDate: "2026-01-01" } }).state.scheduleConfig,
  undefined,
  "so is an incomplete schedule config"
);
assert.equal(
  parseExport({ ...good, scheduleConfig: { ...good, mode: "sideways" } }).state.scheduleConfig,
  undefined,
  "and an unknown schedule mode"
);

// --- the summary -----------------------------------------------------------

assert.equal(importSummary({ workouts: 3, sets: 0 }), "3 workouts", "zero counts are left out");
assert.equal(importSummary({ workouts: 0 }), "nothing");

console.log("import-backup.test.ts ok");

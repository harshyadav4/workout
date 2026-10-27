import assert from "node:assert/strict";

import { reconcile } from "@/lib/reconcile";
import type { RemoteState, SyncableState } from "@/lib/sync";
import type { ScheduledSession, WorkoutLog, WorkoutTemplate } from "@/lib/types";

// The failure this exists to end: `hydrateRemote` replaced outright, so a
// session logged while the push was failing was destroyed by the next read.

const preset: WorkoutTemplate = {
  id: "bench",
  name: "Bench press",
  category: "chest",
  muscles: [],
  isPreset: true
};

const log = (id: string, date: string): WorkoutLog => ({
  id,
  date,
  workoutId: "bench",
  name: "Bench press",
  totalVolume: 100,
  muscles: []
});

const session = (id: string, status: ScheduledSession["status"], date = "2026-08-20"): ScheduledSession => ({
  id,
  date,
  dayIndex: 4,
  sessionName: "Upper",
  exercises: [],
  type: "workout",
  status,
  source: "manual"
});

const emptyLocal = (over: Partial<SyncableState> = {}): SyncableState => ({
  templates: [preset],
  sessionTemplates: [],
  scheduledSessions: [],
  logs: [],
  setLogs: [],
  measurements: [],
  profile: { name: "", email: "", heightCm: 0, weightKg: 0 },
  ...over
});

const emptyRemote = (over: Partial<RemoteState> = {}): RemoteState => ({
  templates: [],
  sessionTemplates: [],
  scheduledSessions: [],
  logs: [],
  setLogs: [],
  measurements: [],
  ...over
});

// 1. A local log the server has never seen survives the read. This is the one
//    that used to be a lost workout.
{
  const mine = log("local", "2026-08-20");
  const merged = reconcile(emptyLocal({ logs: [mine] }), emptyRemote());
  assert.deepEqual(merged.logs, [mine], "an unsynced local log must not be destroyed by a read");
}

// 2. A remote log this device has never seen is kept — the other half of the
//    merge, and what makes a second device work at all.
{
  const theirs = log("remote", "2026-08-19");
  const mine = log("local", "2026-08-20");
  const merged = reconcile(emptyLocal({ logs: [mine] }), emptyRemote({ logs: [theirs] }));
  assert.deepEqual(
    merged.logs.map((item) => item.id),
    ["local", "remote"],
    "both sides survive, newest first"
  );
}

// 3. A session in both takes the one further along. Status is the only ordering
//    the row carries, and a workout you finished offline must not revert to
//    "planned" because the server still thinks it is.
{
  const merged = reconcile(
    emptyLocal({ scheduledSessions: [session("s1", "completed")] }),
    emptyRemote({ scheduledSessions: [session("s1", "planned")] })
  );
  assert.equal(merged.scheduledSessions[0].status, "completed", "a finished session cannot revert");

  const other = reconcile(
    emptyLocal({ scheduledSessions: [session("s1", "planned")] }),
    emptyRemote({ scheduledSessions: [session("s1", "completed")] })
  );
  assert.equal(other.scheduledSessions[0].status, "completed", "and the same holds in reverse");
}

// 3b. Same status on both sides: the copy with more sets logged is further
//     along. Started online, five sets logged offline, killed before Finish —
//     the account's copy is `active` with nothing in it and must not win.
{
  const set = (done: boolean) => ({ id: `set-${done}`, reps: 5, weight: 60, type: "normal" as const, completed: done });
  const withSets = (id: string, done: number): ScheduledSession => ({
    ...session(id, "active"),
    exercises: [{ id: "e", workoutId: "bench", templateName: "Bench", sets: [set(done > 0), set(done > 1)] }]
  });
  const merged = reconcile(
    emptyLocal({ scheduledSessions: [withSets("s1", 2)] }),
    emptyRemote({ scheduledSessions: [withSets("s1", 0)] })
  );
  assert.equal(
    merged.scheduledSessions[0].exercises[0].sets.filter((item) => item.completed).length,
    2,
    "sets logged offline inside an active session survive the read"
  );
  const tie = reconcile(
    emptyLocal({ scheduledSessions: [withSets("s1", 1)] }),
    emptyRemote({ scheduledSessions: [{ ...withSets("s1", 1), sessionName: "Theirs" }] })
  );
  assert.equal(tie.scheduledSessions[0].sessionName, "Theirs", "a tie goes to the account");
}

// 4. Presets survive. They ship with the app and are never stored, so a remote
//    list that legitimately lacks them must not delete them locally.
{
  const merged = reconcile(emptyLocal(), emptyRemote());
  assert.deepEqual(merged.templates, [preset], "presets are not the user's rows and must persist");

  const custom: WorkoutTemplate = { ...preset, id: "mine", name: "My lift", isPreset: false };
  const withCustom = reconcile(emptyLocal(), emptyRemote({ templates: [custom] }));
  assert.deepEqual(
    withCustom.templates.map((item) => item.id),
    ["bench", "mine"],
    "presets first, then what the account holds"
  );
}

// Sessions come back in date order — the store and Postgres both assume it.
{
  const merged = reconcile(
    emptyLocal({ scheduledSessions: [session("late", "planned", "2026-08-25")] }),
    emptyRemote({ scheduledSessions: [session("early", "planned", "2026-08-21")] })
  );
  assert.deepEqual(merged.scheduledSessions.map((item) => item.id), ["early", "late"]);
}

// The account is the authority on profile, but an empty read must not blank it.
{
  const profile = { name: "A", email: "a@b.co", heightCm: 172, weightKg: 72 };
  assert.deepEqual(reconcile(emptyLocal({ profile }), emptyRemote()).profile, profile);

  const theirs = { ...profile, name: "B" };
  assert.deepEqual(
    reconcile(emptyLocal({ profile }), emptyRemote({ profile: theirs })).profile,
    theirs,
    "when the account has one, it wins"
  );
}

// Measurements collide on `(date, metric)`, not on id — re-measuring a day mints
// a fresh uuid, so a union by id leaves Tuesday holding two weights and feeds
// both to the girth series the differentiator is built on.
{
  const merged = reconcile(
    emptyLocal({
      measurements: [{ id: "local", date: "2026-08-25", metric: "weight", value: 71 }]
    }),
    emptyRemote({
      measurements: [{ id: "remote", date: "2026-08-25", metric: "weight", value: 72 }]
    })
  );
  assert.equal(merged.measurements.length, 1, "one reading per site per day");
  assert.equal(merged.measurements[0].value, 72, "the account wins the collision");
}

console.log("reconcile checks passed");

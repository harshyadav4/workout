import assert from "node:assert/strict";

import { reconcile } from "@/lib/reconcile";
import { buildExport, diffRows, remoteBaseline, syncErrorKind, syncErrorMessage, type RemoteState, type SyncableState } from "@/lib/sync";
import type { WorkoutLog, WorkoutTemplate } from "@/lib/types";

// The whole sync rests on this: a missed delete resurrects a session on the
// next device, a missed upsert loses a logged set.

const a = { id: "a", n: 1 };
const b = { id: "b", n: 1 };
const c = { id: "c", n: 1 };

// Untouched rows are the same object, so nothing is rewritten.
{
  const { upserts, deletedIds } = diffRows([a, b], [a, b]);
  assert.deepEqual(upserts, [], "unchanged rows must not be rewritten");
  assert.deepEqual(deletedIds, []);
}

// A changed row is a new object at the same id — the store rebuilds what it touches.
{
  const edited = { id: "b", n: 2 };
  const { upserts, deletedIds } = diffRows([a, b], [a, edited]);
  assert.deepEqual(upserts, [edited], "an edited row must be upserted");
  assert.deepEqual(deletedIds, []);
}

// Added rows are upserted.
{
  const { upserts, deletedIds } = diffRows([a], [a, c]);
  assert.deepEqual(upserts, [c]);
  assert.deepEqual(deletedIds, []);
}

// Removed rows are deleted, not merely dropped locally.
{
  const { upserts, deletedIds } = diffRows([a, b], [a]);
  assert.deepEqual(upserts, []);
  assert.deepEqual(deletedIds, ["b"], "a removed row must be deleted remotely");
}

// Add and remove in the same tick — generateSchedule replaces a whole range.
{
  const { upserts, deletedIds } = diffRows([a, b], [a, c]);
  assert.deepEqual(upserts, [c]);
  assert.deepEqual(deletedIds, ["b"]);
}

// First sync of an empty account writes nothing.
{
  const { upserts, deletedIds } = diffRows([], []);
  assert.deepEqual(upserts, []);
  assert.deepEqual(deletedIds, []);
}

// The property the whole offline-recovery path rests on: pushing against an
// empty base upserts everything local and deletes nothing. `supabase-sync` uses
// exactly this base when the read failed, so if it ever emitted a delete it
// would wipe the account it could not read.
{
  const { upserts, deletedIds } = diffRows([], [a, b]);
  assert.deepEqual(upserts, [a, b], "an unknown base must upsert every local row");
  assert.deepEqual(deletedIds, [], "and must never delete a remote row it has not seen");
}

// An export is the user's data, not the app's. Presets ship in seed-data and are
// never stored remotely either — a backup full of them is mostly not a backup.
{
  const preset: WorkoutTemplate = {
    id: "preset",
    name: "Bench press",
    category: "chest",
    muscles: [],
    isPreset: true
  };
  const mine: WorkoutTemplate = { ...preset, id: "mine", name: "My lift", isPreset: false };

  const state: SyncableState = {
    templates: [preset, mine],
    sessionTemplates: [],
    scheduledSessions: [],
    logs: [],
    setLogs: [],
    measurements: [],
    profile: { name: "A", email: "a@b.co", heightCm: 172, weightKg: 72 }
  };

  const payload = buildExport(state);
  assert.deepEqual(payload.templates, [mine], "presets must not be exported as the user's own");
  assert.equal(payload.profile, state.profile, "the rest of the state passes through");
  assert.match(payload.exportedAt, /^\d{4}-\d{2}-\d{2}T/, "the file says when it was written");
}

// Sync errors reach the screen, so they are sentences, never the raw Postgres
// text — that names tables and constraints. Only the code goes with them.
{
  assert.equal(syncErrorKind({ code: "23503", message: 'insert or update on table "profiles" violates foreign key constraint "profiles_id_fkey"' }), "account-gone");
  assert.equal(
    syncErrorMessage({ code: "23503", message: 'violates foreign key constraint "profiles_id_fkey"' }),
    "This account no longer exists. Sign in again. (23503)",
    "a deleted account's token reads as the account being gone, with no table named"
  );
  assert.equal(
    syncErrorMessage({ code: "42501", message: 'new row violates row-level security policy for table "data_archives"' }),
    "Your account refused the change. Sign out and in again. (42501)"
  );
  assert.equal(syncErrorKind({ message: "new row violates row-level security policy" }), "refused", "an RLS refusal without a code still reads from the words");
  assert.equal(syncErrorKind(new Error("JWT expired")), "expired");
  assert.equal(syncErrorKind({ code: "PGRST301", message: "JWT expired" }), "expired");
  assert.equal(syncErrorKind({ message: "Failed to fetch" }), "offline");
  assert.equal(syncErrorKind(new TypeError("Load failed")), "offline", "Safari's wording of a dead network");
  assert.equal(
    syncErrorMessage({ code: "PGRST205", message: "Could not find the table 'public.skill_goals'", hint: "Perhaps you meant..." }),
    "The account's database is missing an update. Run the migrations in supabase/migrations. (PGRST205)",
    "the migration pointer stays — the README promises it"
  );
  assert.equal(syncErrorKind({ code: "42703", message: "column does not exist" }), "missing-schema");
  assert.equal(syncErrorMessage({ message: "something odd", hint: "Check your RLS policy" }), "Could not reach your account.", "neither the message nor the hint leaks");
  assert.equal(syncErrorMessage("a bare string"), "Could not reach your account.");
  assert.equal(syncErrorMessage(undefined), "Could not reach your account.", "must not throw on a nullish reject");
}

// The baseline after a read is what the account holds, not the merged store.
// A session logged offline sits in the store but not on the server; diffing the
// merged store against itself called it synced and it never went up.
{
  const log = (id: string): WorkoutLog => ({
    id,
    date: "2026-10-20",
    workoutId: "bench",
    name: "Bench press",
    totalVolume: 100,
    muscles: []
  });
  const shared = log("shared");
  const offline = log("offline");
  const local: SyncableState = {
    templates: [],
    sessionTemplates: [],
    scheduledSessions: [],
    logs: [offline, { ...shared }],
    setLogs: [],
    measurements: [],
    profile: { name: "A", email: "a@b.co", heightCm: 172, weightKg: 72 }
  };
  const remote: RemoteState = {
    templates: [],
    sessionTemplates: [],
    scheduledSessions: [],
    logs: [shared],
    setLogs: [],
    measurements: [],
    profile: { name: "A", email: "a@b.co", heightCm: 172, weightKg: 72 }
  };
  const merged = reconcile(local, remote);
  const { upserts, deletedIds } = diffRows(remoteBaseline(remote).logs, merged.logs);
  assert.deepEqual(upserts, [offline], "the device-only row is the diff after a read");
  assert.deepEqual(deletedIds, [], "nothing the account holds is deleted by a read");
  assert.equal(
    remoteBaseline(remote).profile,
    merged.profile,
    "the account's own profile stays reference-equal, so it is not rewritten"
  );
  assert.equal(remoteBaseline({ ...remote, profile: undefined }).profile.name, "", "a new account starts from the empty profile");
}

console.log("sync diff checks passed");

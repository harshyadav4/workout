import assert from "node:assert/strict";

import { buildExport, diffRows, syncErrorMessage, type SyncableState } from "@/lib/sync";
import type { WorkoutTemplate } from "@/lib/types";

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

// Sync errors reach the user verbatim, so the unwrapping has to survive whatever
// supabase-js throws — including a rejected fetch that is not an Error subclass.
{
  assert.equal(syncErrorMessage(new Error("JWT expired")), "JWT expired");
  assert.equal(
    syncErrorMessage({ message: "permission denied", hint: "Check your RLS policy" }),
    "permission denied — Check your RLS policy",
    "PostgREST puts the actionable fix in hint, not message"
  );
  assert.equal(syncErrorMessage({ message: "Failed to fetch" }), "Failed to fetch");
  assert.equal(syncErrorMessage("a bare string"), "Unknown error");
  assert.equal(syncErrorMessage(undefined), "Unknown error", "must not throw on a nullish reject");
}

console.log("sync diff checks passed");

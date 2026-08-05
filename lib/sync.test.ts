import assert from "node:assert/strict";

import { diffRows } from "@/lib/sync";

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

console.log("sync diff checks passed");

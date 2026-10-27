// Run with: npm run check
import assert from "node:assert/strict";

import { elapsedSeconds, extendRest, formatClock, restoreLive, restoreRest } from "@/lib/timer";

const now = 1_000_000_000;

// The rest potion, reopened.
assert.deepEqual(
  restoreRest(JSON.stringify({ endsAt: now + 40_000, total: 90 }), now),
  { endsAt: now + 40_000, total: 90 },
  "a rest still running comes back exactly"
);
assert.equal(restoreRest(JSON.stringify({ endsAt: now - 1, total: 90 }), now), undefined, "a finished rest does not");
assert.equal(restoreRest("not json", now), undefined, "a corrupt copy is ignored, not thrown");
assert.equal(restoreRest(null, now), undefined, "nothing stored is nothing restored");
assert.equal(restoreRest(JSON.stringify({ endsAt: now + 5_000 }), now), undefined, "a half-written copy is ignored");

// The live hold timer, reopened.
assert.deepEqual(
  restoreLive(JSON.stringify({ setId: "s1", startedAt: now - 30_000 }), now),
  { setId: "s1", startedAt: now - 30_000 },
  "a hold under way comes back with its start"
);
assert.equal(
  restoreLive(JSON.stringify({ setId: "s1", startedAt: now - 7 * 3600_000 }), now),
  undefined,
  "one left running for hours was forgotten, not held"
);
assert.equal(restoreLive(JSON.stringify({ setId: "s1", startedAt: now + 5_000 }), now), undefined, "nor one from the future");

assert.equal(elapsedSeconds(now - 45_900, now), 45, "whole seconds, rounded down");
assert.equal(elapsedSeconds(now + 1_000, now), 0, "never negative if the clock moved back");

assert.equal(formatClock(45), "0:45");
assert.equal(formatClock(723), "12:03");
assert.equal(formatClock(3727), "1:02:07", "hours appear once there are some");

assert.deepEqual(
  extendRest({ endsAt: now + 30_000, total: 90 }, 15, now),
  { endsAt: now + 45_000, total: 105 },
  "+15 on a running rest adds fifteen to the deadline and the bar"
);
assert.deepEqual(
  extendRest({ endsAt: now + 4_000, total: 90 }, -15, now),
  { endsAt: now, total: 75 },
  "−15 on four seconds left is done, not a debt"
);
assert.deepEqual(
  extendRest({ endsAt: now - 30_000, total: 90 }, 15, now),
  { endsAt: now + 15_000, total: 15 },
  "+15 on a rest that ran out thirty seconds ago is a fresh fifteen, not still done"
);
assert.equal(extendRest({ endsAt: now - 30_000, total: 90 }, -15, now).endsAt, now, "−15 on a finished rest stays done");

console.log("timer checks passed");

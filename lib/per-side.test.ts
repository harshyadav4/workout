import assert from "node:assert/strict";

import { evenTarget, formatPerSide, stepForSide } from "@/lib/per-side";

assert.equal(stepForSide(true), 2, "a unilateral lift steps in twos");
assert.equal(stepForSide(false), 1);
assert.equal(stepForSide(undefined), 1, "absent means bilateral — no migration needed");

assert.equal(formatPerSide(16, true), "16 (8 per side)", "total first, split in the parenthesis");
assert.equal(formatPerSide(16, false), "16", "a bilateral lift is left alone");
assert.equal(formatPerSide(0, true), "0", "nothing to split");

// Only reachable by reclassifying a lift after the fact. Showing 8.5 is honest;
// showing 8 would quietly describe a set that never happened.
assert.equal(formatPerSide(17, true), "17 (8.5 per side)", "an odd total is not rounded away");

assert.equal(evenTarget(9, true), 10, "a target rounds up to something both sides can share");
assert.equal(evenTarget(10, true), 10, "an even target is already fine");
assert.equal(evenTarget(9, false), 9, "bilateral targets are untouched");

console.log("per-side.test.ts ok");

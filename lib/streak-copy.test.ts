import assert from "node:assert/strict";

import { streakHeadline } from "@/lib/streak-copy";

// No history at all — never a number, never a zero.
const fresh = streakHeadline(0, 0, false);
assert.equal(fresh.title, "Start the streak");
assert.ok(!/\d/.test(fresh.title));

// The state a bare number gets wrong: a missed week on top of a real history.
const lapsed = streakHeadline(0, 6, true);
assert.equal(lapsed.title, "Pick it back up");
assert.ok(lapsed.caption.includes("6 weeks"));

// A first week, and one that has never been beaten, both read as progress.
assert.equal(streakHeadline(1, 1, true).title, "1 week in a row");
assert.equal(streakHeadline(1, 1, true).caption, "Your longest run yet. Keep it.");
assert.equal(streakHeadline(4, 9, true).title, "4 weeks in a row");
assert.ok(streakHeadline(4, 9, true).caption.includes("9 weeks"));

console.log("streak copy checks passed");

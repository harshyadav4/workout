// Run with: npm run check
import assert from "node:assert/strict";

import { hasOwnData, markTourSeen, readTourSeen, shouldAutostart, TOUR_SEEN_KEY } from "@/features/tour/autostart-rule";

const fresh = { hasData: false, seen: false, accountPending: false, touring: false };

assert.equal(shouldAutostart(fresh), true, "an empty phone that never saw it: start");
assert.equal(shouldAutostart({ ...fresh, hasData: true }), false, "a phone with training: never by itself");
assert.equal(shouldAutostart({ ...fresh, seen: true }), false, "seen once: never again by itself");
assert.equal(shouldAutostart({ ...fresh, accountPending: true }), false, "the account may still bring data: wait");
assert.equal(shouldAutostart({ ...fresh, touring: true }), false, "already running");

const empty = { logs: [], sessionTemplates: [], measurements: [], scheduledSessions: [] };
assert.equal(hasOwnData(empty), false);
assert.equal(hasOwnData({ ...empty, scheduledSessions: [{ type: "rest" }] }), false, "rest days alone are not training");
assert.equal(hasOwnData({ ...empty, scheduledSessions: [{ type: "workout" }] }), true, "a planned session is");
assert.equal(hasOwnData({ ...empty, logs: [{}] }), true);
assert.equal(hasOwnData({ ...empty, sessionTemplates: [{}] }), true, "a built session is");
assert.equal(hasOwnData({ ...empty, measurements: [{}] }), true, "a weigh-in is");

// Seen: unreadable storage counts as seen, so the tour never nags.
assert.equal(readTourSeen(), true, "no storage at all: treated as seen");
const storage = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value)
  }
});
assert.equal(readTourSeen(), false, "a fresh phone has not seen it");
markTourSeen();
assert.equal(storage.get(TOUR_SEEN_KEY), "1");
assert.equal(readTourSeen(), true);

console.log("tour autostart checks passed");

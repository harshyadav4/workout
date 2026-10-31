// Run with: npm run check
import assert from "node:assert/strict";

import {
  closeTourLink,
  FIRST_OPEN_KEY,
  hasOwnData,
  markTourSeen,
  readFirstOpen,
  readTourLinkClosed,
  readTourSeen,
  shouldAutostart,
  showTourLink,
  TOUR_SEEN_KEY
} from "@/features/tour/autostart-rule";

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
assert.equal(hasOwnData({ ...empty, injuries: [{}] }), true, "an injury is your own data");
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

// -- the "Take the tour" line on Home -------------------------------------------

const week = { firstOpen: "2026-10-01", today: "2026-10-01", closed: false, touring: false };
assert.equal(showTourLink(week), true, "day 0: shown");
assert.equal(showTourLink({ ...week, today: "2026-10-08" }), true, "day 7: still shown");
assert.equal(showTourLink({ ...week, today: "2026-10-09" }), false, "day 8: gone");
assert.equal(showTourLink({ ...week, today: "2026-11-02", firstOpen: "2026-10-30" }), true, "counts across a month end");
assert.equal(showTourLink({ ...week, closed: true }), false, "closed: gone for good");
assert.equal(showTourLink({ ...week, touring: true }), false, "never over the tour");
assert.equal(showTourLink({ ...week, firstOpen: undefined }), false, "unreadable storage: not shown");

assert.equal(readFirstOpen("2026-10-01"), "2026-10-01", "the first open is saved");
assert.equal(storage.get(FIRST_OPEN_KEY), "2026-10-01");
assert.equal(readFirstOpen("2026-10-05"), "2026-10-01", "and kept on later opens");
assert.equal(readTourLinkClosed(), false);
closeTourLink();
assert.equal(readTourLinkClosed(), true);

console.log("tour autostart checks passed");

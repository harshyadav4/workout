// Run with: npm run check
import assert from "node:assert/strict";

import {
  ACTIVE_STORAGE_KEY,
  GUEST_STORAGE_KEY,
  clearGuestCopy,
  createWorkoutStore,
  declineGuestFor,
  guestDeclinedBy,
  readGuestCopy
} from "@/features/workout/workout-store";
import { decideGuestMerge, guestAsIncoming } from "@/lib/guest-merge";

// The store saves to localStorage when `window` exists — checked when it
// saves, not when it loads. A stand-in for both.
const storage = new Map<string, string>();
Object.assign(globalThis, {
  window: {},
  localStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key)
  }
});

const ACCOUNT_KEY = "gymflow-state-v4";
const weights = (store: ReturnType<typeof createWorkoutStore>) =>
  store.getState().measurements.map((row) => row.value);
const saved = (key: string) => JSON.parse(storage.get(key) ?? "{}") as { owner?: string; measurements?: { value: number }[] };

// -- a new phone is a guest ------------------------------------------------------

const phone = createWorkoutStore();
assert.equal(phone.getState().owner, undefined, "a new phone starts as a guest");
phone.getState().logMeasurement("weight", 70, "2026-10-01");
assert.deepEqual(saved(GUEST_STORAGE_KEY).measurements?.map((row) => row.value), [70], "guest work saves to the guest copy");
assert.equal(storage.has(ACCOUNT_KEY), false, "and never to an account copy");

// -- signing in shows the account's copy, not the guest's ---------------------------

phone.getState().switchToAccount("alice");
assert.equal(phone.getState().owner, "alice");
assert.deepEqual(weights(phone), [], "a new account starts empty: the guest copy is not taken in silently");
assert.equal(storage.get(ACTIVE_STORAGE_KEY), "account");
phone.getState().logMeasurement("weight", 80, "2026-10-02");
assert.equal(saved(ACCOUNT_KEY).owner, "alice", "account work saves to the account copy");
assert.deepEqual(saved(GUEST_STORAGE_KEY).measurements?.map((row) => row.value), [70], "the guest copy is untouched");

// Signing in again as the same account changes nothing.
const before = phone.getState();
phone.getState().switchToAccount("alice");
assert.equal(phone.getState(), before);

// -- signing out shows the guest copy; the account copy waits --------------------------

phone.getState().switchToGuest();
assert.equal(phone.getState().owner, undefined);
assert.deepEqual(weights(phone), [70], "signed out: the guest's data, not Alice's");
assert.equal(storage.get(ACTIVE_STORAGE_KEY), "guest");
assert.deepEqual(saved(ACCOUNT_KEY).measurements?.map((row) => row.value), [80], "Alice's copy is still saved");

// -- signing back in on your own phone finds your work, offline work included ------------

phone.getState().switchToAccount("alice");
assert.deepEqual(weights(phone), [80], "Alice's copy comes back");

// -- a reload opens the copy that was on screen -------------------------------------------

assert.deepEqual(weights(createWorkoutStore()), [80], "reload while signed in: the account copy");
phone.getState().switchToGuest();
assert.deepEqual(weights(createWorkoutStore()), [70], "reload while signed out: the guest copy");

// -- another account never sees the last one's data -----------------------------------------

phone.getState().switchToAccount("bob");
assert.deepEqual(weights(phone), [], "Bob does not see Alice's history");
assert.equal(phone.getState().owner, "bob");

// -- a phone from before guest mode: one account copy, no marker ----------------------------

storage.clear();
storage.set(ACCOUNT_KEY, JSON.stringify({ owner: "carol", measurements: [{ id: "c1", date: "2026-09-01", metric: "weight", value: 60 }] }));
const old = createWorkoutStore();
assert.equal(old.getState().owner, "carol", "an existing user opens on their own copy");
assert.deepEqual(weights(old), [60]);

// -- moving the guest copy into an account, as the sync layer does at sign-in -------------

storage.clear();
const fresh = createWorkoutStore();
fresh.getState().logMeasurement("weight", 75, "2026-10-05");
fresh.getState().setProfile({ heightCm: 181 });
fresh.getState().switchToAccount("dana");

const guest = readGuestCopy();
assert.ok(guest, "the guest copy is readable after sign-in");
assert.deepEqual(guest.measurements.map((row) => row.value), [75]);
assert.equal(
  decideGuestMerge({ guest, account: fresh.getState(), declined: guestDeclinedBy("dana") }),
  "move",
  "Dana's account is empty: it moves in by itself"
);

fresh.getState().setProfile({ name: "Dana", email: "dana@example.com" });
fresh.getState().hydrateRemote(guestAsIncoming(guest, fresh.getState().profile));
clearGuestCopy();
assert.deepEqual(weights(fresh), [75], "the guest's weigh-in is now Dana's");
assert.equal(fresh.getState().profile.name, "Dana", "the sign-in name stays");
assert.equal(fresh.getState().profile.heightCm, 181, "the guest's height fills Dana's empty one");
assert.equal(readGuestCopy(), undefined, "the guest copy is cleared, so it is never added twice");

fresh.getState().switchToGuest();
assert.deepEqual(weights(fresh), [], "signed out after the move: an empty guest");

// "Keep my account only" is remembered for that account, and only that one.
declineGuestFor("dana");
assert.equal(guestDeclinedBy("dana"), true);
assert.equal(guestDeclinedBy("erin"), false);

console.log("identity checks passed");

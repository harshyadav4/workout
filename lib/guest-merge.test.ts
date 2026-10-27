// Run with: npm run check
import assert from "node:assert/strict";

import { countCopy, decideGuestMerge, describeCounts, guestAsIncoming } from "@/lib/guest-merge";
import type { RemoteState } from "@/lib/sync";
import type { ProfileInfo, WorkoutLog } from "@/lib/types";

const empty = (): RemoteState => ({
  templates: [],
  sessionTemplates: [],
  scheduledSessions: [],
  logs: [],
  setLogs: [],
  measurements: []
});
const log = (date: string, id: string): WorkoutLog => ({
  id,
  date,
  workoutId: "bench-press",
  name: "Bench Press",
  totalVolume: 1000,
  muscles: []
});

const guest: RemoteState = {
  ...empty(),
  logs: [log("2026-10-01", "g1"), log("2026-10-01", "g2"), log("2026-10-03", "g3")],
  measurements: [{ id: "m1", date: "2026-10-01", metric: "weight", value: 80 }]
};
const account: RemoteState = { ...empty(), logs: [log("2026-09-01", "a1")] };

// -- counting --------------------------------------------------------------------

assert.deepEqual(countCopy(guest), { sessions: 2, weighIns: 1, plans: 0, total: 3 }, "two days of training, one weigh-in");
assert.equal(countCopy({ ...empty(), scheduledSessions: [{ type: "rest" } as never] }).total, 0, "rest days are not training");
assert.equal(countCopy({ ...empty(), templates: [{ isPreset: true } as never] }).total, 0, "presets ship with the app");
assert.equal(describeCounts(countCopy(guest)), "2 workouts and 1 weigh-in");
assert.equal(describeCounts({ sessions: 1, weighIns: 0, plans: 2, total: 3 }), "1 workout and 2 plans");
assert.equal(describeCounts({ sessions: 5, weighIns: 2, plans: 1, total: 8 }), "5 workouts, 1 plan and 2 weigh-ins");

// -- the decision -----------------------------------------------------------------

assert.equal(decideGuestMerge({ guest: undefined, account, declined: false }), "nothing", "no guest copy");
assert.equal(decideGuestMerge({ guest: empty(), account, declined: false }), "nothing", "an empty guest copy");
assert.equal(decideGuestMerge({ guest, account: empty(), declined: false }), "move", "an empty account takes it in by itself");
assert.equal(decideGuestMerge({ guest, account, declined: false }), "ask", "an account with history: ask");
assert.equal(decideGuestMerge({ guest, account, declined: true }), "nothing", "this account said no before");

// -- what goes in -------------------------------------------------------------------

const withPreset: RemoteState = {
  ...guest,
  templates: [
    { id: "bench-press", name: "Bench Press", category: "Chest", muscles: [], isPreset: true },
    { id: "my-lift", name: "My Lift", category: "Arms", muscles: [], isPreset: false }
  ],
  profile: { name: "", email: "", heightCm: 180, weightKg: 80, goalWeightKg: 75 }
};

const noProfile = guestAsIncoming(withPreset);
assert.equal(noProfile.profile, undefined, "no profile: the account's name and email always win");
assert.deepEqual(noProfile.templates.map((item) => item.id), ["my-lift"], "only what the guest built");
assert.equal(noProfile.logs, withPreset.logs);

const accountProfile: ProfileInfo = { name: "Alice", email: "alice@example.com", heightCm: 0, weightKg: 0 };
const filled = guestAsIncoming(withPreset, accountProfile).profile;
assert.equal(filled?.name, "Alice", "the sign-in name stays");
assert.equal(filled?.heightCm, 180, "the guest's height fills an empty one");
assert.equal(filled?.goalWeightKg, 75, "and the goal weight");
const kept = guestAsIncoming(withPreset, { ...accountProfile, heightCm: 170, goalWeightKg: 70 }).profile;
assert.equal(kept?.heightCm, 170, "the account's own height wins");
assert.equal(kept?.goalWeightKg, 70);

const guestSchedule = {
  startDate: "2026-01-01",
  endDate: "2026-12-31",
  mode: "weekly" as const,
  weekly: { 1: "session-guest" },
  rotationOrder: [],
  restWeekdays: []
};
const accountSchedule = { ...guestSchedule, weekly: { 2: "session-account" } };
assert.equal(
  guestAsIncoming({ ...withPreset, scheduleConfig: guestSchedule }, accountProfile, accountSchedule).scheduleConfig,
  accountSchedule,
  "the account's schedule wins when it has one"
);
assert.equal(
  guestAsIncoming({ ...withPreset, scheduleConfig: guestSchedule }, accountProfile).scheduleConfig,
  guestSchedule,
  "an account without a schedule takes the guest's"
);

console.log("guest merge checks passed");

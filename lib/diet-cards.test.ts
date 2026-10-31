// Run with: npm run check
import assert from "node:assert/strict";

import { averageLine, bodyRing, dietHeadline, eatingRing, moneyRing } from "@/lib/diet-cards";
import type { Adherence, Spend } from "@/lib/diet-metrics";
import type { GoalPath } from "@/lib/diet-science";

const TODAY = "2026-11-10"; // a Tuesday; its week starts on Monday the 9th

const eaten = (eatenCount: number, planned: number): Adherence => ({
  planned,
  eaten: eatenCount,
  skipped: 0,
  missed: planned - eatenCount,
  extras: 0,
  rate: eatenCount / planned
});
const none: Adherence = { planned: 0, eaten: 0, skipped: 0, missed: 0, extras: 0 };

// -- eating --------------------------------------------------------------------

{
  const ring = eatingRing(eaten(82, 100), 40, 84);
  assert.equal(ring.value, "82%");
  assert.equal(ring.fill, 0.82);
  assert.equal(ring.sentence, "You ate 82 of 100 planned meals.");
  assert.equal(ring.tone, "good");
  assert.equal(ring.ready, true);
}
assert.equal(eatingRing(eaten(60, 100), 40, 84).tone, "steady");
assert.equal(eatingRing(eaten(30, 100), 40, 84).tone, "low");

// Only extras: no plan to measure against, so it says the days you logged, and never judges.
{
  const ring = eatingRing(none, 21, 84);
  assert.equal(ring.value, "25%");
  assert.equal(ring.sentence, "You logged food on 21 of 84 days.");
  assert.equal(ring.tone, "steady");
}

// Nothing yet: the ring is empty and the sentence says what to do.
{
  const ring = eatingRing(none, 0, 84);
  assert.equal(ring.ready, false);
  assert.equal(ring.value, "—");
  assert.equal(ring.fill, 0);
}

// -- money ---------------------------------------------------------------------

const spend = (weeks: Spend["weeks"], perDay = 164): Spend => ({
  total: weeks.reduce((sum, week) => sum + week.costInr, 0),
  perDay,
  thisMonth: 0,
  thisWeek: weeks.find((week) => week.week === "2026-11-09")?.costInr ?? 0,
  weeks
});

// This week against the weeks before it.
{
  const ring = moneyRing(spend([{ week: "2026-10-26", costInr: 1000 }, { week: "2026-11-02", costInr: 1200 }, { week: "2026-11-09", costInr: 550 }]), TODAY);
  assert.equal(ring.value, "₹164");
  assert.equal(ring.fill, 0.5);
  assert.equal(ring.sentence, "₹164 a day. This week ₹550, a usual week ₹1,100.");
  assert.equal(ring.tone, "steady", "spending is never judged: there is no budget");
}

// A week over the usual one fills the ring and no more.
assert.equal(moneyRing(spend([{ week: "2026-11-02", costInr: 500 }, { week: "2026-11-09", costInr: 900 }]), TODAY).fill, 1);

// Nothing eaten this week yet: an empty ring, still with its number.
{
  const ring = moneyRing(spend([{ week: "2026-11-02", costInr: 500 }]), TODAY);
  assert.equal(ring.fill, 0);
  assert.equal(ring.sentence, "₹164 a day. This week ₹0, a usual week ₹500.");
}

// The first week: no usual week to compare with.
{
  const ring = moneyRing(spend([{ week: "2026-11-09", costInr: 500 }]), TODAY);
  assert.equal(ring.fill, 1);
  assert.equal(ring.sentence, "₹164 a day, on the days you logged.");
}

// A past range: this week still comes from the whole history, not from the range.
{
  const ring = moneyRing({ ...spend([{ week: "2026-09-07", costInr: 1000 }]), thisWeek: 500 }, TODAY);
  assert.equal(ring.fill, 0.5);
  assert.equal(ring.sentence, "₹164 a day. This week ₹500, a usual week ₹1,000.");
}

// No costs typed.
assert.equal(moneyRing(spend([]), TODAY).ready, false);

// -- body goals ----------------------------------------------------------------

const path = (over: Partial<GoalPath>): GoalPath => ({
  fromRoadmap: false,
  direction: "lose",
  currentKg: 78,
  goalKg: 75,
  averageIntake: 2200,
  maintenance: 2500,
  maintenanceSource: "formula",
  foodKgPerWeek: -0.3,
  neededKcal: 2200,
  gapKcal: 0,
  status: "onPace",
  rows: [],
  ...over
});

{
  const ring = bodyRing(path({}), 81, []);
  assert.equal(ring.value, "3 kg");
  assert.equal(ring.fill, 0.5, "half way from the first weigh-in to the target");
  assert.equal(ring.sentence, "3 kg to your target of 75 kg. What you eat keeps you on the path.");
  assert.equal(ring.tone, "good");
}

// Heavier than at the start, on a cut: no progress, and never below empty.
assert.equal(bodyRing(path({ currentKg: 83 }), 81, []).fill, 0);
assert.equal(bodyRing(path({ status: "wrongWay" }), 81, []).tone, "low");

// At the target.
{
  const ring = bodyRing(path({ currentKg: 75, status: "atGoal", direction: "hold" }), 81, []);
  assert.equal(ring.value, "At goal");
  assert.equal(ring.fill, 1);
}

// One weigh-in, which is also the start: nothing covered yet.
assert.equal(bodyRing(path({}), undefined, []).fill, 0);

// Not ready: says what is missing.
{
  const ring = bodyRing(undefined, undefined, ["a goal weight on You", "a weigh-in on You"]);
  assert.equal(ring.ready, false);
  assert.equal(ring.sentence, "Needs a goal weight on You, a weigh-in on You.");
}

// -- the page's sentence -------------------------------------------------------

assert.equal(dietHeadline(eaten(82, 100), 40, "12w"), "You ate 82% of your plan in the last 12 weeks.");
assert.equal(dietHeadline(eaten(82, 100), 40, "1y"), "You ate 82% of your plan in the last year.");
assert.equal(dietHeadline(none, 3, "4w"), "You logged 3 days in the last 4 weeks.");
assert.equal(dietHeadline(none, 1, "all"), "You logged 1 day since you started.");
assert.equal(dietHeadline(none, 0, "12w"), "Your food log starts here.");

assert.equal(
  averageLine({ kcal: 2426, proteinG: 127.4, carbsG: 300, fatG: 80, costInr: 164 }, 78),
  "2,426 kcal and 127 g of protein a day, on the 78 days you logged."
);
assert.match(averageLine({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, costInr: 0 }, 0), /Tick a meal/);

console.log("diet-cards ok");

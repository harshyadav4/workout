// Run with: npm run check
import assert from "node:assert/strict";

import { reconcileDiet } from "@/lib/diet-reconcile";
import type { DietData, Meal, PlannedMeal, ScheduledMealDay } from "@/lib/diet-types";

const meal = (id: string, costInr = 10): Meal => ({ id, name: id, kcal: 1, proteinG: 1, carbsG: 1, fatG: 1, costInr });
const planned = (id: string, status: PlannedMeal["status"], extra = {}): PlannedMeal => ({
  id, name: id, time: "09:00", kcal: 100, proteinG: 1, carbsG: 1, fatG: 1, costInr: 1, status, ...extra
});
const day = (id: string, date: string, items: PlannedMeal[]): ScheduledMealDay => ({ id, date, planName: "P", items, source: "repeat" });
const data = (patch: Partial<DietData>): DietData => ({ meals: [], mealPlans: [], scheduledMealDays: [], settings: {}, ...patch });

// rows
{
  const mine = meal("a", 10);
  const theirs = meal("a", 20);
  const merged = reconcileDiet(data({ meals: [mine, meal("local")] }), data({ meals: [theirs, meal("remote")] }));
  assert.equal(merged.meals.length, 3, "nothing is lost");
  assert.equal(merged.meals.find((m) => m.id === "a"), theirs, "the incoming copy wins, by identity");
}

// no tick is lost, on either side
{
  const theirs = day("r", "2026-11-02", [planned("a", "pending"), planned("b", "eaten")]);
  const mine = day("r", "2026-11-02", [planned("a", "eaten"), planned("b", "pending")]);
  const [merged] = reconcileDiet(data({ scheduledMealDays: [mine] }), data({ scheduledMealDays: [theirs] })).scheduledMealDays;
  assert.deepEqual(merged.items.map((i) => i.status), ["eaten", "eaten"], "a tick from each device survives");
}

// two days for one date become one
{
  const theirs = day("remote-id", "2026-11-02", [planned("a", "pending")]);
  const mine = day("local-id", "2026-11-02", [planned("x", "eaten", { extra: true }), planned("old", "pending")]);
  const merged = reconcileDiet(data({ scheduledMealDays: [mine] }), data({ scheduledMealDays: [theirs] })).scheduledMealDays;
  assert.equal(merged.length, 1, "one day per date");
  assert.equal(merged[0].id, "remote-id", "the row the account holds keeps its id");
  assert.deepEqual(merged[0].items.map((i) => i.id).sort(), ["a", "x"], "the touched meal stays, the stale pending one does not");
}

// identity: the sync diff compares by reference
{
  const theirs = day("r", "2026-11-02", [planned("a", "eaten")]);
  const same = reconcileDiet(data({ scheduledMealDays: [day("r", "2026-11-02", [planned("a", "pending")])] }), data({ scheduledMealDays: [theirs] }));
  assert.equal(same.scheduledMealDays[0], theirs, "when the incoming copy already has it all, no push is needed");

  const mine = day("r", "2026-11-02", [planned("a", "eaten")]);
  const pendingRemote = day("r", "2026-11-02", [planned("a", "pending")]);
  const kept = reconcileDiet(data({ scheduledMealDays: [mine] }), data({ scheduledMealDays: [pendingRemote] }));
  assert.equal(kept.scheduledMealDays[0], mine, "when this copy is further along it is kept, and pushed");
}

// settings and config
{
  const config = { startDate: "a", endDate: "b", weekly: {} };
  const local = data({ settings: { kcalTarget: 2000 }, mealScheduleConfig: config });
  const kept = reconcileDiet(local, { meals: [], mealPlans: [], scheduledMealDays: [] });
  assert.equal(kept.settings.kcalTarget, 2000, "absent settings leave the device's alone");
  assert.equal(kept.mealScheduleConfig, config);
  assert.equal(reconcileDiet(local, data({ settings: { kcalTarget: 1800 } })).settings.kcalTarget, 1800);
}

console.log("diet reconcile checks passed");

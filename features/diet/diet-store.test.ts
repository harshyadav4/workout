// Run with: npm run check
import assert from "node:assert/strict";

import {
  DIET_GUEST_STORAGE_KEY,
  DIET_STORAGE_KEY,
  bindDietTour,
  createDietStore,
  flushDietPersist
} from "@/features/diet/diet-store";
import { createStore } from "zustand/vanilla";

import { afterTour, endTour, startTour } from "@/features/tour/tour-store";
import { buildDemoState } from "@/lib/demo-data";
import type { Meal, MealPlan } from "@/lib/diet-types";
import { itemFromMeal } from "@/lib/meal-schedule";
import { todayKey } from "@/lib/utils";

const storage = new Map<string, string>();
Object.assign(globalThis, {
  window: {},
  localStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key)
  }
});

const meal = (name: string, id = name): Meal => ({ id, name, kcal: 300, proteinG: 20, carbsG: 30, fatG: 10, costInr: 40 });
const plan = (name: string, meals: Meal[], id = name): MealPlan => ({
  id,
  name,
  items: meals.map((item, index) => itemFromMeal(item, `0${index + 7}:00`)),
  summary: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, costInr: 0 }
});
const saved = (key: string) => JSON.parse(storage.get(key) ?? "null");

/** A store on an empty phone: a new store loads whatever the last one saved. */
const freshStore = () => {
  flushDietPersist();
  storage.clear();
  return createDietStore();
};

const today = todayKey();
const oats = meal("Oats");

// -- names ------------------------------------------------------------------
{
  const store = freshStore();
  const s = () => store.getState();
  assert.equal(s().addMeal(oats), true);
  assert.equal(s().addMeal(meal("  OATS ", "other")), false, "the same name is refused, whatever its case");
  assert.equal(s().meals.length, 1);
  assert.equal(s().updateMeal("Oats", { ...oats, costInr: 55 }), true, "a meal can keep its own name");
  assert.equal(s().meals[0].costInr, 55);
  s().addMeal(meal("Dal"));
  assert.equal(s().updateMeal("Dal", { ...meal("Dal"), name: "oats" }), false, "but cannot take another's");

  assert.equal(s().createMealPlan(plan("Cut", [oats])), true);
  assert.equal(s().createMealPlan(plan("cut", [oats], "other")), false);
  assert.equal(s().mealPlans[0].summary.kcal, 300, "the summary is worked out on the way in");
}

// -- the flow: plan, schedule, tick, delete ---------------------------------
{
  const store = freshStore();
  const s = () => store.getState();
  s().createMealPlan(plan("Cut", [oats]));
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  s().generateMealSchedule({ startDate: today, endDate: today, weekly: { [weekday]: "Cut" } });
  assert.equal(s().scheduledMealDays.length, 1, "the schedule reaches today");
  assert.ok(s().mealScheduleConfig);

  const day = s().scheduledMealDays[0];
  s().setMealStatus(day.id, day.items[0].id, "eaten");
  assert.equal(s().scheduledMealDays[0].items[0].status, "eaten");

  s().addExtraMeal(today, { name: "Samosa", time: "17:00", kcal: 260, proteinG: 4, carbsG: 30, fatG: 14, costInr: 20 });
  assert.equal(s().scheduledMealDays[0].items.length, 2);

  s().deleteMealPlan("Cut");
  assert.equal(s().mealPlans.length, 0);
  assert.equal(s().scheduledMealDays.length, 1, "what was eaten outlives the plan");
  assert.deepEqual(s().mealScheduleConfig?.weekly, {}, "the plan leaves the schedule too");

  s().scheduleMealDay(today, "gone");
  assert.equal(s().scheduledMealDays[0].mealPlanId, undefined, "a plan that is gone changes nothing");
}

// -- AI import never overwrites ---------------------------------------------
{
  const store = freshStore();
  const s = () => store.getState();
  s().addMeal({ ...oats, costInr: 99 });
  s().importAiDietPlan({ meals: [oats, meal("Dal")], mealPlans: [plan("Bulk", [oats])] });
  assert.equal(s().meals.length, 2, "a name already there is not added twice");
  assert.equal(s().meals.find((m) => m.name === "Oats")?.costInr, 99, "the user's own price stays");
  assert.equal(s().mealPlans.length, 1);
  assert.equal(s().scheduledMealDays.length, 0, "no calendar came with it, so none is made");
  const myOats = s().meals.find((m) => m.name === "Oats");
  assert.equal(s().mealPlans[0].items[0].mealId, myOats?.id, "the plan points at the meal the user already had");

  // The same plan name again is the new version of it, not a refusal.
  const again = plan("bulk", [meal("Dal")], "new-id");
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  s().importAiDietPlan({
    meals: [meal("Dal")],
    mealPlans: [again],
    mealScheduleConfig: { startDate: today, endDate: today, weekly: { [weekday]: "new-id" } }
  });
  assert.equal(s().mealPlans.length, 1, "replaced, not doubled");
  assert.equal(s().mealPlans[0].id, "Bulk", "it keeps its id");
  assert.equal(s().mealPlans[0].items[0].name, "Dal");
  assert.equal(s().scheduledMealDays[0]?.mealPlanId, "Bulk", "the calendar follows the kept id");
}

// -- saving and accounts: a shared phone never mixes people -----------------
{
  const store = freshStore();
  const s = () => store.getState();
  s().addMeal(meal("Guest meal"));
  flushDietPersist();
  assert.equal(saved(DIET_GUEST_STORAGE_KEY).meals.length, 1, "no owner saves as the guest");
  assert.equal(storage.has(DIET_STORAGE_KEY), false);

  s().switchDietToAccount("user-a");
  assert.equal(s().meals.length, 0, "an account does not see the guest's meals");
  s().addMeal(meal("A meal"));
  flushDietPersist();
  assert.equal(saved(DIET_STORAGE_KEY).owner, "user-a");
  assert.equal(saved(DIET_GUEST_STORAGE_KEY).meals[0].name, "Guest meal", "the guest copy is untouched");

  s().switchDietToAccount("user-b");
  assert.equal(s().meals.length, 0, "another account's copy is dropped, never shown");
  assert.equal(s().owner, "user-b");
  flushDietPersist();

  s().switchDietToGuest();
  assert.equal(s().owner, undefined);
  assert.equal(s().meals[0].name, "Guest meal", "signing out brings the guest copy back");

  s().switchDietToAccount("user-b");
  s().addMeal(meal("B meal"));
  flushDietPersist();
  const reopened = createDietStore().getState();
  assert.equal(reopened.owner, "user-b", "a reload opens the copy that was on screen");
  assert.equal(reopened.meals[0].name, "B meal");
}

// -- the tour never saves, shows a sample, and gives the real data back -------
{
  const store = freshStore();
  const stop = bindDietTour(store);
  store.getState().addMeal(meal("Real meal"));
  flushDietPersist();
  const real = store.getState().meals;
  const before = storage.get(DIET_GUEST_STORAGE_KEY);

  const target = createStore(() => ({ ...buildDemoState(today), templates: [] as never[] }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  startTour(target as any, buildDemoState(today) as any);
  assert.ok(store.getState().mealPlans.length > 0, "the sample is on screen");
  store.getState().addMeal(meal("Tapped during the tour"));
  flushDietPersist();
  assert.equal(storage.get(DIET_GUEST_STORAGE_KEY), before, "nothing tapped in the tour reaches the phone");

  let seenByDeferred: Meal[] | undefined;
  afterTour(() => {
    seenByDeferred = store.getState().meals;
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  endTour(target as any);
  assert.equal(store.getState().meals, real, "the real data is back, object for object");
  assert.equal(seenByDeferred, real, "work the tour held back lands on the real data");

  store.getState().addMeal(meal("After the tour"));
  flushDietPersist();
  assert.ok(!storage.get(DIET_GUEST_STORAGE_KEY)?.includes("Tapped during the tour"), "a sample tap is not saved later either");
  stop();
}

// -- the merge and the archive ----------------------------------------------
{
  const store = freshStore();
  const s = () => store.getState();
  s().addMeal(meal("Local"));
  s().hydrateDiet({ meals: [meal("Remote")], mealPlans: [], scheduledMealDays: [] });
  assert.equal(s().meals.length, 2, "a merge deletes nothing");

  s().archiveDietLocal("2026-11-01T00:00:00Z");
  assert.equal(s().meals.length, 0, "the phone is emptied");
  assert.equal(s().archivedAt, "2026-11-01T00:00:00Z");

  s().addMeal(meal("Since"));
  s().restoreDietArchive({ meals: [meal("Old")], mealPlans: [], scheduledMealDays: [] }, "merge");
  assert.deepEqual(s().meals.map((m) => m.name).sort(), ["Old", "Since"], "merge keeps what was added since");
  assert.equal(s().archivedAt, undefined, "and the request is over");

  s().restoreDietArchive({ meals: [meal("Old")], mealPlans: [], scheduledMealDays: [] }, "replace");
  assert.deepEqual(s().meals.map((m) => m.name), ["Old"], "replace returns to the archive exactly");

  s().clearDietGuestData();
  assert.equal(s().meals.length, 0, "a guest can clear the phone");
}

console.log("diet store checks passed");

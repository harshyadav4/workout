// Run with: npm run check
import assert from "node:assert/strict";

import type { MealPlan, MealScheduleConfig, ScheduledMealDay } from "@/lib/diet-types";
import {
  UNPLANNED_DAY_NAME,
  buildMealDays,
  mergeGeneratedMealDays,
  normalizePlan,
  refreshDaysFromPlan,
  removePlanFromConfig,
  removePlanFromDays,
  scheduleOnDate,
  sortByTime,
  summarizeItems,
  formatMealTime,
  formatRupees,
  withExtraMeal,
  withMealStatus,
  withoutMeal
} from "@/lib/meal-schedule";

const NOW = "2026-11-02T09:05:00.000Z";
const TODAY = "2026-11-02"; // a Monday

const item = (id: string, time: string, kcal = 400) => ({
  id,
  mealId: `meal-${id}`,
  name: `Meal ${id}`,
  time,
  kcal,
  proteinG: 20.1,
  carbsG: 40,
  fatG: 10,
  costInr: 50.5
});

const planA: MealPlan = normalizePlan({
  id: "plan-a",
  name: "Plan A",
  items: [item("lunch", "13:00"), item("breakfast", "09:00")],
  summary: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, costInr: 0 }
});
const planB: MealPlan = normalizePlan({ ...planA, id: "plan-b", name: "Plan B", items: [item("dinner", "20:00")] });

const config: MealScheduleConfig = { startDate: "2026-11-02", endDate: "2026-11-08", weekly: { 1: "plan-a", 3: "plan-b" } };

// -- sums and order ---------------------------------------------------------

assert.deepEqual(planA.items.map((i) => i.id), ["breakfast", "lunch"], "a plan is stored in time order");
assert.deepEqual(planA.summary, { kcal: 800, proteinG: 40.2, carbsG: 80, fatG: 20, costInr: 101 }, "the summary is worked out, not trusted");
assert.equal(summarizeItems([{ kcal: 0, proteinG: 0.1, carbsG: 0, fatG: 0, costInr: 0 }, { kcal: 0, proteinG: 0.2, carbsG: 0, fatG: 0, costInr: 0 }]).proteinG, 0.3, "no float noise");
assert.deepEqual(summarizeItems([]), { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, costInr: 0 });
assert.deepEqual(sortByTime([{ time: "09:00", n: 1 }, { time: "08:00", n: 2 }, { time: "09:00", n: 3 }]).map((i) => i.n), [2, 1, 3], "same time keeps its order");

// -- building days ----------------------------------------------------------

const built = buildMealDays(config, [planA, planB], TODAY);
assert.deepEqual(built.map((d) => d.date), ["2026-11-02", "2026-11-04"], "only weekdays with a plan");
assert.ok(built[0].items.every((i) => i.status === "pending"), "every meal starts pending");
assert.equal(built[0].source, "repeat");
assert.equal(built[0].items[0].id, "breakfast", "a day keeps the plan's item ids");
assert.deepEqual(buildMealDays({ ...config, startDate: "2026-11-09" }, [planA], TODAY), [], "an inverted range is nothing");
assert.deepEqual(buildMealDays(config, [], TODAY), [], "a plan that is gone is no day");
assert.deepEqual(
  buildMealDays({ ...config, startDate: "2026-10-26" }, [planA, planB], TODAY).map((d) => d.date),
  ["2026-11-02", "2026-11-04"],
  "the past is never generated: an unticked past day would read as a missed meal"
);

// -- regenerating never loses what the user did -----------------------------

const pendingDay = (date: string, extra: Partial<ScheduledMealDay> = {}): ScheduledMealDay => ({
  id: `day-${date}`,
  date,
  mealPlanId: "plan-a",
  planName: "Plan A",
  items: planA.items.map((i) => ({ ...i, status: "pending" as const })),
  source: "repeat",
  ...extra
});

{
  const ticked = withMealStatus([pendingDay(TODAY)], `day-${TODAY}`, "breakfast", "eaten", NOW)[0];
  const untouched = pendingDay("2026-11-04");
  const manual = pendingDay("2026-11-06", { source: "manual" });
  const past = pendingDay("2026-10-30");
  const generated = buildMealDays({ ...config, weekly: { 1: "plan-b", 3: "plan-b", 5: "plan-b" } }, [planB], TODAY);
  const merged = mergeGeneratedMealDays([ticked, untouched, manual, past], generated, TODAY);

  assert.deepEqual(merged.map((d) => d.date), ["2026-10-30", "2026-11-02", "2026-11-04", "2026-11-06"], "one day per date, in order");
  assert.equal(merged[0].id, past.id, "the past is kept");
  assert.equal(merged[1].id, ticked.id, "a ticked day survives a regenerate");
  assert.equal(merged[2].mealPlanId, "plan-b", "an untouched repeat day is replaced");
  assert.equal(merged[3].id, manual.id, "a day set by hand survives");
}

// -- one day per date -------------------------------------------------------

{
  const created = scheduleOnDate([], "2026-11-10", planA);
  assert.equal(created[0].source, "manual");
  assert.equal(created[0].items.length, 2);

  const ticked = withMealStatus(created, created[0].id, "breakfast", "eaten", NOW);
  const swapped = scheduleOnDate(ticked, "2026-11-10", planB);
  assert.equal(swapped.length, 1, "a second plan does not stack a second checklist");
  assert.equal(swapped[0].mealPlanId, "plan-b");
  assert.deepEqual(swapped[0].items.map((i) => [i.id, i.status]), [["breakfast", "eaten"], ["dinner", "pending"]], "what was eaten stays, pending meals are replaced");
}

// -- ticking ----------------------------------------------------------------

{
  const days = [pendingDay(TODAY)];
  const id = days[0].id;
  const eaten = withMealStatus(days, id, "lunch", "eaten", NOW);
  const lunch = () => eaten[0].items.find((i) => i.id === "lunch");
  assert.equal(lunch()?.status, "eaten");
  assert.equal(lunch()?.eatenAt, NOW, "the first tick stamps the time");
  assert.equal(eaten[0].items.find((i) => i.id === "breakfast")?.status, "pending", "only that meal moves");
  assert.equal(days[0].items[1].status, "pending", "the old array is untouched");

  const again = withMealStatus(eaten, id, "lunch", "eaten", "2026-11-02T22:00:00.000Z");
  assert.equal(again[0].items[1].eatenAt, NOW, "a later tick keeps the first time");

  const undone = withMealStatus(eaten, id, "lunch", "pending", NOW);
  assert.equal(undone[0].items[1].status, "pending");
  assert.ok(!("eatenAt" in undone[0].items[1]), "not eaten carries no eaten time");

  const skipped = withMealStatus(eaten, id, "lunch", "skipped", NOW);
  assert.equal(skipped[0].items[1].status, "skipped");
  assert.ok(!("eatenAt" in skipped[0].items[1]));
}

// -- extras -----------------------------------------------------------------

{
  const extra = { name: "Samosa", time: "17:00", kcal: 260, proteinG: 4, carbsG: 30, fatG: 14, costInr: 20 };
  const onEmpty = withExtraMeal([], TODAY, extra, NOW);
  assert.equal(onEmpty.length, 1, "an extra on a day with no plan creates the day");
  assert.equal(onEmpty[0].planName, UNPLANNED_DAY_NAME);
  assert.equal(onEmpty[0].source, "manual");
  assert.equal(onEmpty[0].items[0].status, "eaten", "an extra counts as eaten");
  assert.equal(onEmpty[0].items[0].eatenAt, NOW);

  const onPlan = withExtraMeal([pendingDay(TODAY)], TODAY, extra, NOW);
  assert.deepEqual(onPlan[0].items.map((i) => i.time), ["09:00", "13:00", "17:00"], "it lands in time order");
  assert.equal(onPlan[0].items[2].extra, true);

  const merged = mergeGeneratedMealDays(onPlan, buildMealDays(config, [planB], TODAY), TODAY);
  assert.equal(merged.find((d) => d.date === TODAY)?.id, onPlan[0].id, "a day with an extra survives a regenerate");
}

// -- editing and deleting a plan --------------------------------------------

{
  const today = withMealStatus([pendingDay(TODAY)], `day-${TODAY}`, "breakfast", "eaten", NOW)[0];
  const past = pendingDay("2026-10-30");
  const future = pendingDay("2026-11-04");
  const other = { ...pendingDay("2026-11-05"), mealPlanId: "plan-b" };
  const days = [past, today, future, other];

  const edited = normalizePlan({
    ...planA,
    items: [{ ...planA.items[0], kcal: 999 }, { ...planA.items[1], kcal: 111 }, item("snack", "16:00", 100)]
  });
  const refreshed = refreshDaysFromPlan(days, edited, TODAY);

  assert.equal(refreshed[0], past, "the past keeps what it was");
  assert.equal(refreshed[1].items.find((i) => i.id === "breakfast")?.kcal, 400, "a meal already eaten keeps the numbers it was eaten at");
  assert.equal(refreshed[1].items.find((i) => i.id === "lunch")?.kcal, 111, "a pending meal today catches up");
  assert.equal(refreshed[1].items.length, 3, "a new meal reaches today");
  assert.equal(refreshed[2].items.find((i) => i.id === "breakfast")?.kcal, 999, "a future day catches up");
  assert.equal(refreshed[3], other, "another plan's day is left alone");
  assert.equal(refreshDaysFromPlan([past], edited, TODAY).length, 1);
  const unchanged = [past];
  assert.equal(refreshDaysFromPlan(unchanged, edited, TODAY), unchanged, "the same array back when nothing moved");

  const removed = removePlanFromDays(days, "plan-a", TODAY);
  assert.deepEqual(removed.map((d) => d.date), ["2026-10-30", TODAY, "2026-11-05"], "an untouched future day goes with its plan");
  assert.equal(removed[0], past, "the past stays");
  assert.equal(removed[1].mealPlanId, undefined, "a touched day stays, unlinked");
  assert.deepEqual(removed[1].items.map((i) => i.id), ["breakfast"], "and keeps only what was touched");

  const config2 = removePlanFromConfig(config, "plan-a");
  assert.deepEqual(config2?.weekly, { 3: "plan-b" }, "a deleted plan cannot come back on the next extend");
  assert.equal(removePlanFromConfig(undefined, "plan-a"), undefined);
}

// -- removing one meal, and formats ------------------------------------------

{
  const extra = { name: "Samosa", time: "17:00", kcal: 260, proteinG: 4, carbsG: 30, fatG: 14, costInr: 20 };
  const onEmpty = withExtraMeal([], TODAY, extra, NOW);
  assert.deepEqual(withoutMeal(onEmpty, onEmpty[0].id, onEmpty[0].items[0].id), [], "an unplanned day left empty goes");
  const onPlan = withExtraMeal([pendingDay(TODAY)], TODAY, extra, NOW);
  const added = onPlan[0].items.find((i) => i.extra);
  assert.equal(withoutMeal(onPlan, onPlan[0].id, added?.id ?? "")[0].items.length, 2, "a planned day stays");
}

assert.equal(formatMealTime("09:05"), "9:05 AM");
assert.equal(formatMealTime("00:30"), "12:30 AM");
assert.equal(formatMealTime("12:00"), "12:00 PM");
assert.equal(formatMealTime("20:15"), "8:15 PM");
assert.equal(formatMealTime("soon"), "soon", "an odd value is shown as it is");
assert.equal(formatRupees(1250), "₹1,250");
assert.equal(formatRupees(40.5), "₹40.50");

console.log("meal schedule checks passed");

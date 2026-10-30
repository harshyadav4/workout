/**
 * Merging two copies of diet data — the twin of lib/reconcile.ts, and pure so
 * the store can call it without pulling in the Supabase client.
 *
 * Like the workout merge it never deletes. Rows keep their object identity when
 * one side wins outright, because the sync diff compares by reference: a row
 * handed back unchanged is not pushed again.
 */
import type { DietData, DietIncoming, PlannedMeal, ScheduledMealDay } from "@/lib/diet-types";
import { sortByTime } from "@/lib/meal-schedule";

function unionById<T extends { id: string }>(local: T[], remote: T[]): T[] {
  const byId = new Map<string, T>();
  for (const item of [...local, ...remote]) {
    byId.set(item.id, item);
  }
  return [...byId.values()];
}

/** A ticked or skipped meal beats a pending one; both touched, the incoming copy wins. */
function furtherAlong(mine: PlannedMeal, theirs: PlannedMeal): PlannedMeal {
  return theirs.status === "pending" && mine.status !== "pending" ? mine : theirs;
}

/**
 * Two copies of one date: every meal either side knows about, and no tick lost.
 * This is what stops a phone that was offline at lunch undoing a tick made on
 * another device, or the other way round.
 */
function mergeDay(mine: ScheduledMealDay, theirs: ScheduledMealDay): ScheduledMealDay {
  const byId = new Map(theirs.items.map((item) => [item.id, item]));
  mine.items.forEach((item) => {
    const other = byId.get(item.id);
    // A pending meal only on this side was replaced by the other side's plan.
    if (other) {
      byId.set(item.id, furtherAlong(item, other));
    } else if (item.status !== "pending" || item.extra) {
      byId.set(item.id, item);
    }
  });
  const items = sortByTime([...byId.values()]);
  const same = (list: PlannedMeal[]) =>
    list.length === items.length && list.every((item) => items.includes(item));
  if (same(theirs.items)) {
    return theirs;
  }
  // Their row keeps its id: it is the one the account already holds.
  return same(mine.items) && mine.id === theirs.id ? mine : { ...theirs, items };
}

function unionDays(local: ScheduledMealDay[], remote: ScheduledMealDay[]): ScheduledMealDay[] {
  const byDate = new Map(local.map((day) => [day.date, day]));
  remote.forEach((day) => {
    const mine = byDate.get(day.date);
    byDate.set(day.date, mine ? mergeDay(mine, day) : day);
  });
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function reconcileDiet(local: DietData, incoming: DietIncoming): DietData {
  return {
    meals: unionById(local.meals, incoming.meals),
    mealPlans: unionById(local.mealPlans, incoming.mealPlans),
    scheduledMealDays: unionDays(local.scheduledMealDays, incoming.scheduledMealDays),
    mealScheduleConfig: incoming.mealScheduleConfig ?? local.mealScheduleConfig,
    settings: incoming.settings ?? local.settings
  };
}

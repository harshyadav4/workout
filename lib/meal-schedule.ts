/**
 * The diet calendar, as pure functions — the twin of lib/schedule.ts. No store
 * and no React, so every rule here is tested directly.
 *
 * The rule that shapes all of it: **a meal the user has touched is never
 * rewritten.** Regenerating a schedule, editing a plan, or putting another plan
 * on a day may only change items still pending. What was eaten stays eaten, at
 * the numbers it was eaten at, and that is what Progress sums.
 */
import type {
  Meal,
  MealPlan,
  MealPlanItem,
  MealScheduleConfig,
  MealStatus,
  MealTotals,
  Micros,
  PlannedMeal,
  ScheduledMealDay
} from "@/lib/diet-types";
import { eachDay } from "@/lib/schedule";

/** What a day with no plan is called, once an extra meal has created it. */
export const UNPLANNED_DAY_NAME = "Unplanned";

const ZERO: MealTotals = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, costInr: 0 };

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/** Sums a list of items. Rounded, so 0.1 + 0.2 never reaches the screen. */
export function summarizeItems(items: readonly MealTotals[]): MealTotals {
  const total = items.reduce<MealTotals>(
    (sum, item) => ({
      kcal: sum.kcal + item.kcal,
      proteinG: sum.proteinG + item.proteinG,
      carbsG: sum.carbsG + item.carbsG,
      fatG: sum.fatG + item.fatG,
      costInr: sum.costInr + item.costInr
    }),
    ZERO
  );
  return {
    kcal: Math.round(total.kcal),
    proteinG: round(total.proteinG, 1),
    carbsG: round(total.carbsG, 1),
    fatG: round(total.fatG, 1),
    costInr: round(total.costInr, 2)
  };
}

/** Earliest first. Stable, so two meals at 09:00 keep the order they were added. */
export function sortByTime<T extends { time: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.time.localeCompare(b.time));
}

/** A plan as it should be stored: items in time order, the summary worked out rather than trusted. */
export function normalizePlan(plan: MealPlan): MealPlan {
  const items = sortByTime(plan.items);
  return { ...plan, items, summary: summarizeItems(items) };
}

/** A library meal placed in a plan at a time. The numbers are copied here. */
export function itemFromMeal(meal: Meal, time: string): MealPlanItem {
  return {
    id: crypto.randomUUID(),
    mealId: meal.id,
    name: meal.name,
    time,
    kcal: meal.kcal,
    proteinG: meal.proteinG,
    carbsG: meal.carbsG,
    fatG: meal.fatG,
    costInr: meal.costInr,
    ...(meal.micros ? { micros: meal.micros } : {})
  };
}

/** A plan's items as a day's checklist. The id is kept, which is how a later refresh keeps a tick. */
function plannedFromPlan(plan: MealPlan): PlannedMeal[] {
  return plan.items.map((item) => ({ ...item, status: "pending" as const }));
}

/** Eaten, skipped, or added by hand on the day: the user's own, and never overwritten. */
function isTouched(item: PlannedMeal): boolean {
  return item.status !== "pending" || item.extra === true;
}

export function isDayTouched(day: ScheduledMealDay): boolean {
  return day.items.some(isTouched);
}

/**
 * Generate the dated days for a config across [startDate, endDate]. A weekday
 * with no plan gets no day. Days before `today` are never generated: a past day
 * that appears unticked would read as a meal the user missed.
 */
export function buildMealDays(
  config: MealScheduleConfig,
  plans: readonly MealPlan[],
  today: string
): ScheduledMealDay[] {
  if (!config.startDate || !config.endDate || config.startDate > config.endDate) {
    return [];
  }
  const byId = new Map(plans.map((plan) => [plan.id, plan]));
  const days: ScheduledMealDay[] = [];
  for (const { key, weekday } of eachDay(config.startDate, config.endDate)) {
    if (key < today) {
      continue;
    }
    const plan = byId.get(config.weekly[weekday]);
    if (!plan) {
      continue;
    }
    days.push({
      id: crypto.randomUUID(),
      date: key,
      mealPlanId: plan.id,
      planName: plan.name,
      items: plannedFromPlan(plan),
      source: "repeat"
    });
  }
  return days;
}

/**
 * Lay a new schedule over the old one. Kept: anything set by hand, anything the
 * user has touched, and all of the past, which is history. Everything else is
 * replaced, and a generated day never lands on a date a kept day holds.
 */
export function mergeGeneratedMealDays(
  existing: readonly ScheduledMealDay[],
  generated: readonly ScheduledMealDay[],
  today: string
): ScheduledMealDay[] {
  const kept = existing.filter((day) => day.source === "manual" || day.date < today || isDayTouched(day));
  const keptDates = new Set(kept.map((day) => day.date));
  return [...kept, ...generated.filter((day) => !keptDates.has(day.date))].sort((a, b) =>
    a.date.localeCompare(b.date)
  );
}

/** A day now on this plan: the touched items stay, the pending ones become the plan's. */
function dayOnPlan(day: ScheduledMealDay, plan: MealPlan): ScheduledMealDay {
  const touched = day.items.filter(isTouched);
  const touchedIds = new Set(touched.map((item) => item.id));
  return {
    ...day,
    mealPlanId: plan.id,
    planName: plan.name,
    items: sortByTime([...touched, ...plannedFromPlan(plan).filter((item) => !touchedIds.has(item.id))])
  };
}

/**
 * Put a plan on a date by hand. There is one day per date, so a second plan
 * replaces the first's pending meals rather than stacking a second checklist.
 */
export function scheduleOnDate(
  days: readonly ScheduledMealDay[],
  date: string,
  plan: MealPlan
): ScheduledMealDay[] {
  const existing = days.find((day) => day.date === date);
  if (existing) {
    return days.map((day) => (day.id === existing.id ? { ...dayOnPlan(day, plan), source: "manual" as const } : day));
  }
  const created: ScheduledMealDay = {
    id: crypto.randomUUID(),
    date,
    mealPlanId: plan.id,
    planName: plan.name,
    items: plannedFromPlan(plan),
    source: "manual"
  };
  return [...days, created].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * A plan was edited: today and later catch up, so Today never shows the old
 * meal. Past days keep what they were. Returns the same array when nothing
 * moved, so a caller can apply it freely.
 */
export function refreshDaysFromPlan(
  days: ScheduledMealDay[],
  plan: MealPlan,
  today: string
): ScheduledMealDay[] {
  let changed = false;
  const next = days.map((day) => {
    if (day.mealPlanId !== plan.id || day.date < today) {
      return day;
    }
    changed = true;
    return dayOnPlan(day, plan);
  });
  return changed ? next : days;
}

/**
 * A plan was deleted: its untouched days from today on go with it. A day the
 * user has touched stays, unlinked and without its pending meals, because what
 * was eaten is still true. The past is never rewritten.
 */
export function removePlanFromDays(
  days: readonly ScheduledMealDay[],
  planId: string,
  today: string
): ScheduledMealDay[] {
  return days.flatMap((day) => {
    if (day.mealPlanId !== planId || day.date < today) {
      return [day];
    }
    if (!isDayTouched(day)) {
      return [];
    }
    return [{ ...day, mealPlanId: undefined, items: day.items.filter(isTouched) }];
  });
}

/** A deleted plan must not come back when the schedule is next extended. */
export function removePlanFromConfig(
  config: MealScheduleConfig | undefined,
  planId: string
): MealScheduleConfig | undefined {
  if (!config) {
    return config;
  }
  const weekly = Object.fromEntries(Object.entries(config.weekly).filter(([, id]) => id !== planId));
  return { ...config, weekly };
}

/**
 * Tick, skip or undo one meal. `eatenAt` is stamped on the first tick and kept
 * through corrections, like a set's `completedAt`. Undoing clears it, because
 * "not eaten" with a time on it would be a false record.
 */
export function withMealStatus(
  days: readonly ScheduledMealDay[],
  dayId: string,
  itemId: string,
  status: MealStatus,
  now: string
): ScheduledMealDay[] {
  return days.map((day) =>
    day.id !== dayId
      ? day
      : {
          ...day,
          items: day.items.map((item) => {
            if (item.id !== itemId) {
              return item;
            }
            if (status === "eaten") {
              return { ...item, status, eatenAt: item.eatenAt ?? now };
            }
            const { eatenAt: _cleared, ...rest } = item;
            return { ...rest, status };
          })
        }
  );
}

export type ExtraMeal = MealTotals & { name: string; time: string; mealId?: string; micros?: Micros };

/**
 * A meal that was not on the plan. It is added as eaten, since saying so is why
 * the user typed it. The date is the key rather than a day id, because a day
 * with no plan has no row yet and this is what creates it.
 */
export function withExtraMeal(
  days: readonly ScheduledMealDay[],
  date: string,
  extra: ExtraMeal,
  now: string
): ScheduledMealDay[] {
  const item: PlannedMeal = { ...extra, id: crypto.randomUUID(), status: "eaten", eatenAt: now, extra: true };
  const existing = days.find((day) => day.date === date);
  if (existing) {
    return days.map((day) =>
      day.id === existing.id ? { ...day, items: sortByTime([...day.items, item]) } : day
    );
  }
  const created: ScheduledMealDay = {
    id: crypto.randomUUID(),
    date,
    planName: UNPLANNED_DAY_NAME,
    items: [item],
    source: "manual"
  };
  return [...days, created].sort((a, b) => a.date.localeCompare(b.date));
}

/** Takes one meal off a day: an extra typed by mistake. A day left empty goes too. */
export function withoutMeal(
  days: readonly ScheduledMealDay[],
  dayId: string,
  itemId: string
): ScheduledMealDay[] {
  return days.flatMap((day) => {
    if (day.id !== dayId) {
      return [day];
    }
    const items = day.items.filter((item) => item.id !== itemId);
    return items.length > 0 || day.mealPlanId ? [{ ...day, items }] : [];
  });
}

/** "09:05" as the clock on the wall reads it: "9:05 AM". */
export function formatMealTime(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return time;
  }
  const suffix = hours >= 12 ? "PM" : "AM";
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

/** Whole rupees when it is a whole number, paise when it is not. */
export function formatRupees(value: number): string {
  return `₹${Number.isInteger(value) ? value.toLocaleString("en-IN") : value.toFixed(2)}`;
}

"use client";

import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";

import { isTouring, onTourActive } from "@/features/tour/tour-store";
import { buildDemoDiet } from "@/lib/diet-demo";
import { reconcileDiet } from "@/lib/diet-reconcile";
import type { DietData, DietIncoming, DietSettings, Meal, MealPlan, MealScheduleConfig, MealStatus } from "@/lib/diet-types";
import {
  buildMealDays,
  mergeGeneratedMealDays,
  normalizePlan,
  refreshDaysFromPlan,
  removePlanFromConfig,
  removePlanFromDays,
  scheduleOnDate,
  withExtraMeal,
  withMealStatus,
  withoutMeal,
  type ExtraMeal
} from "@/lib/meal-schedule";
import { todayKey } from "@/lib/utils";

/**
 * Diet's own store. Separate from the workout store on purpose: its own saved
 * copy, its own tables, and nothing here can reach a training aggregation. The
 * shape follows the workout store, so the two read alike: one saved copy per
 * account and one for the guest, tagged with an owner, so a shared phone can
 * never show one person's meals to another.
 */
export interface DietState extends DietData {
  /** Which day Today is showing. Kept here so diet never reads the workout store. */
  activeDate: string;
  /** Which account the saved copy belongs to. Local only, never synced. */
  owner?: string;
  /**
   * The "delete all my data" request this copy has already been emptied for.
   * The merge never deletes, so another device's request needs this to be seen.
   */
  archivedAt?: string;
  /** False when a meal with this name already exists. */
  addMeal: (meal: Meal) => boolean;
  updateMeal: (id: string, meal: Meal) => boolean;
  deleteMeal: (id: string) => void;
  createMealPlan: (plan: MealPlan) => boolean;
  /** Today and later catch up with the edit. Past days keep what they were. */
  updateMealPlan: (id: string, plan: MealPlan) => boolean;
  deleteMealPlan: (id: string) => void;
  generateMealSchedule: (config: MealScheduleConfig) => void;
  scheduleMealDay: (date: string, mealPlanId: string) => void;
  removeScheduledMealDay: (id: string) => void;
  setMealStatus: (dayId: string, itemId: string, status: MealStatus) => void;
  addExtraMeal: (date: string, extra: ExtraMeal) => void;
  removeDayMeal: (dayId: string, itemId: string) => void;
  /** Build with AI: meals, plans, then the calendar when it came with one. */
  importAiDietPlan: (plan: { meals: Meal[]; mealPlans: MealPlan[]; mealScheduleConfig?: MealScheduleConfig }) => void;
  setDietSettings: (patch: DietSettings) => void;
  setDietActiveDate: (date: string) => void;
  switchDietToAccount: (userId: string) => void;
  switchDietToGuest: () => void;
  /** Merge in the account's copy, a backup or the guest copy. Deletes nothing. */
  hydrateDiet: (incoming: DietIncoming) => void;
  /** The local half of "delete all my data": the data itself is in the archive by now. */
  archiveDietLocal: (requestedAt: string) => void;
  /** `merge` keeps what was logged since; `replace` returns to the archive exactly. */
  restoreDietArchive: (archive: DietIncoming, mode: "merge" | "replace") => void;
  /** A guest's "Clear this phone". */
  clearDietGuestData: () => void;
}

export const DIET_STORAGE_KEY = "gymflow-diet-v1";
export const DIET_GUEST_STORAGE_KEY = "gymflow-diet-guest-v1";
const DIET_ACTIVE_KEY = "gymflow-diet-active";

function createInitialData(): DietData {
  return { meals: [], mealPlans: [], scheduledMealDays: [], mealScheduleConfig: undefined, settings: {} };
}

function normalizeName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function nameTaken(list: readonly { id: string; name: string }[], name: string, exceptId?: string) {
  const wanted = normalizeName(name);
  return list.some((item) => item.id !== exceptId && normalizeName(item.name) === wanted);
}

// -- saving: the same deferred write as the workout store ---------------------

let pendingSave: { key: string; state: DietState } | undefined;
let pendingTimer: ReturnType<typeof setTimeout> | undefined;

function keyFor(owner: string | undefined) {
  return owner ? DIET_STORAGE_KEY : DIET_GUEST_STORAGE_KEY;
}

function persist(state: DietState) {
  if (typeof window === "undefined") {
    return;
  }
  const key = keyFor(state.owner);
  if (pendingSave && pendingSave.key !== key) {
    flushDietPersist();
  }
  pendingSave = { key, state };
  if (pendingTimer === undefined) {
    pendingTimer = setTimeout(flushDietPersist, 0);
  }
}

/** Writes the save that is waiting, if any. Safe to call at any time. */
export function flushDietPersist() {
  if (pendingTimer !== undefined) {
    clearTimeout(pendingTimer);
    pendingTimer = undefined;
  }
  if (!pendingSave) {
    return;
  }
  const { key, state } = pendingSave;
  pendingSave = undefined;
  try {
    localStorage.setItem(
      key,
      JSON.stringify({
        meals: state.meals,
        mealPlans: state.mealPlans,
        scheduledMealDays: state.scheduledMealDays,
        mealScheduleConfig: state.mealScheduleConfig,
        settings: state.settings,
        owner: state.owner,
        archivedAt: state.archivedAt
      })
    );
  } catch (error) {
    // Quota or private mode. The screen is still right and the sync layer has it.
    console.warn("[diet-store] could not save to this device", error);
  }
}

function readSaved(key: string): (Partial<DietData> & { owner?: string; archivedAt?: string }) | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  flushDietPersist();
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

function markActive(copy: "guest" | "account") {
  if (typeof window !== "undefined") {
    localStorage.setItem(DIET_ACTIVE_KEY, copy);
  }
}

/** The guest copy as a merge takes it in, or undefined. Read from storage: at sign-in the screen shows the account's. */
export function readDietGuestCopy(): DietIncoming | undefined {
  const saved = readSaved(DIET_GUEST_STORAGE_KEY);
  if (!saved || saved.owner) {
    return undefined;
  }
  return { ...createInitialData(), ...saved };
}

/** After the guest copy has moved into an account, so it is never added twice. */
export function clearDietGuestCopy() {
  if (typeof window !== "undefined") {
    flushDietPersist();
    localStorage.removeItem(DIET_GUEST_STORAGE_KEY);
  }
}

function loadData(): DietData & { owner?: string; archivedAt?: string } {
  if (typeof window === "undefined") {
    return createInitialData();
  }
  const active = localStorage.getItem(DIET_ACTIVE_KEY);
  const saved =
    active === "guest"
      ? readSaved(DIET_GUEST_STORAGE_KEY)
      : readSaved(DIET_STORAGE_KEY) ?? readSaved(DIET_GUEST_STORAGE_KEY);
  return saved ? { ...createInitialData(), ...saved } : createInitialData();
}

// -- the store --------------------------------------------------------------

/** Exported for the tests; the app makes one, inside the provider. */
export function createDietStore() {
  return createStore<DietState>()((set) => {
    const setAndPersist = (updater: (state: DietState) => DietState) =>
      set((state) => {
        const next = updater(state);
        // Never while the tour's sample is on screen, like the workout store.
        if (!isTouring() && next !== state) {
          persist(next);
        }
        return next;
      });

    /** An update that can be refused: runs only when the name is free. */
    const unlessTaken = (taken: (state: DietState) => boolean, updater: (state: DietState) => DietState) => {
      let accepted = false;
      setAndPersist((state) => {
        if (taken(state)) {
          return state;
        }
        accepted = true;
        return updater(state);
      });
      return accepted;
    };

    return {
      ...loadData(),
      activeDate: todayKey(),

      addMeal: (meal) =>
        unlessTaken(
          (state) => nameTaken(state.meals, meal.name),
          (state) => ({ ...state, meals: [meal, ...state.meals] })
        ),
      updateMeal: (id, meal) =>
        unlessTaken(
          (state) => nameTaken(state.meals, meal.name, id),
          (state) => ({ ...state, meals: state.meals.map((item) => (item.id === id ? { ...meal, id } : item)) })
        ),
      // Plans and days hold their own copy of the numbers, so they are unaffected.
      deleteMeal: (id) => setAndPersist((state) => ({ ...state, meals: state.meals.filter((item) => item.id !== id) })),

      createMealPlan: (plan) =>
        unlessTaken(
          (state) => nameTaken(state.mealPlans, plan.name),
          (state) => ({ ...state, mealPlans: [normalizePlan(plan), ...state.mealPlans] })
        ),
      updateMealPlan: (id, plan) =>
        unlessTaken(
          (state) => nameTaken(state.mealPlans, plan.name, id),
          (state) => {
            const saved = normalizePlan({ ...plan, id });
            return {
              ...state,
              mealPlans: state.mealPlans.map((item) => (item.id === id ? saved : item)),
              scheduledMealDays: refreshDaysFromPlan(state.scheduledMealDays, saved, todayKey())
            };
          }
        ),
      deleteMealPlan: (id) =>
        setAndPersist((state) => ({
          ...state,
          mealPlans: state.mealPlans.filter((item) => item.id !== id),
          scheduledMealDays: removePlanFromDays(state.scheduledMealDays, id, todayKey()),
          mealScheduleConfig: removePlanFromConfig(state.mealScheduleConfig, id)
        })),

      generateMealSchedule: (config) =>
        setAndPersist((state) => {
          const today = todayKey();
          return {
            ...state,
            mealScheduleConfig: config,
            scheduledMealDays: mergeGeneratedMealDays(
              state.scheduledMealDays,
              buildMealDays(config, state.mealPlans, today),
              today
            )
          };
        }),
      scheduleMealDay: (date, mealPlanId) =>
        setAndPersist((state) => {
          const plan = state.mealPlans.find((item) => item.id === mealPlanId);
          return plan ? { ...state, scheduledMealDays: scheduleOnDate(state.scheduledMealDays, date, plan) } : state;
        }),
      removeScheduledMealDay: (id) =>
        setAndPersist((state) => ({
          ...state,
          scheduledMealDays: state.scheduledMealDays.filter((day) => day.id !== id)
        })),
      setMealStatus: (dayId, itemId, status) =>
        setAndPersist((state) => ({
          ...state,
          scheduledMealDays: withMealStatus(state.scheduledMealDays, dayId, itemId, status, new Date().toISOString())
        })),
      addExtraMeal: (date, extra) =>
        setAndPersist((state) => ({
          ...state,
          scheduledMealDays: withExtraMeal(state.scheduledMealDays, date, extra, new Date().toISOString())
        })),

      removeDayMeal: (dayId, itemId) =>
        setAndPersist((state) => ({ ...state, scheduledMealDays: withoutMeal(state.scheduledMealDays, dayId, itemId) })),

      importAiDietPlan: ({ meals, mealPlans, mealScheduleConfig }) =>
        setAndPersist((state) => {
          const today = todayKey();
          // A meal the user already has keeps their numbers (their price, above
          // all), and the plan items point at it. A plan with a name they
          // already have is the new version of it: same id, new meals.
          const existingMeal = new Map(state.meals.map((meal) => [normalizeName(meal.name), meal]));
          const freshMeals = meals.filter((meal) => !existingMeal.has(normalizeName(meal.name)));
          const mealIdMap = new Map(
            meals.flatMap((meal) => {
              const mine = existingMeal.get(normalizeName(meal.name));
              return mine ? [[meal.id, mine.id] as const] : [];
            })
          );
          const existingPlan = new Map(state.mealPlans.map((plan) => [normalizeName(plan.name), plan]));
          const planIdMap = new Map<string, string>();
          const incoming = mealPlans.map((plan) => {
            const mine = existingPlan.get(normalizeName(plan.name));
            if (mine) {
              planIdMap.set(plan.id, mine.id);
            }
            return normalizePlan({
              ...plan,
              id: mine?.id ?? plan.id,
              items: plan.items.map((item) => ({ ...item, mealId: mealIdMap.get(item.mealId) ?? item.mealId }))
            });
          });
          const replaced = new Set(incoming.map((plan) => plan.id));
          const allPlans = [...incoming, ...state.mealPlans.filter((plan) => !replaced.has(plan.id))];
          const config = mealScheduleConfig && {
            ...mealScheduleConfig,
            weekly: Object.fromEntries(
              Object.entries(mealScheduleConfig.weekly).map(([day, id]) => [day, planIdMap.get(id) ?? id])
            )
          };
          const refreshed = incoming.reduce(
            (days, plan) => refreshDaysFromPlan(days, plan, today),
            state.scheduledMealDays
          );
          return {
            ...state,
            meals: [...freshMeals, ...state.meals],
            mealPlans: allPlans,
            mealScheduleConfig: config ?? state.mealScheduleConfig,
            scheduledMealDays: config
              ? mergeGeneratedMealDays(refreshed, buildMealDays(config, allPlans, today), today)
              : refreshed
          };
        }),

      setDietSettings: (patch) => setAndPersist((state) => ({ ...state, settings: { ...state.settings, ...patch } })),
      // Not saved: it is reset to today on every load.
      setDietActiveDate: (date) => set({ activeDate: date }),

      switchDietToAccount: (userId) =>
        setAndPersist((state) => {
          if (state.owner === userId) {
            return state;
          }
          markActive("account");
          const saved = readSaved(DIET_STORAGE_KEY);
          const fresh = { ...state, ...createInitialData(), activeDate: todayKey() };
          // This account's copy from an earlier visit, or an empty one. Another
          // account's copy is dropped, never shown.
          return saved?.owner === userId ? { ...fresh, ...saved, owner: userId } : { ...fresh, owner: userId };
        }),
      switchDietToGuest: () =>
        setAndPersist((state) => {
          if (!state.owner) {
            return state;
          }
          markActive("guest");
          const saved = readSaved(DIET_GUEST_STORAGE_KEY);
          const fresh = { ...state, ...createInitialData(), owner: undefined, activeDate: todayKey() };
          return saved && !saved.owner ? { ...fresh, ...saved, owner: undefined } : fresh;
        }),

      hydrateDiet: (incoming) => setAndPersist((state) => ({ ...state, ...reconcileDiet(state, incoming) })),
      archiveDietLocal: (requestedAt) =>
        setAndPersist((state) => ({ ...state, ...createInitialData(), archivedAt: requestedAt })),
      restoreDietArchive: (archive, mode) =>
        setAndPersist((state) => ({
          ...state,
          ...reconcileDiet(mode === "replace" ? createInitialData() : state, archive),
          archivedAt: undefined
        })),
      clearDietGuestData: () =>
        setAndPersist((state) => (state.owner ? state : { ...state, ...createInitialData(), archivedAt: undefined }))
    };
  });
}

/**
 * The tour's sandbox for diet: the sample on screen while it runs, the real data
 * back the moment it ends. A synchronous subscription and not an effect, because
 * work the tour held back (the account's data arriving) runs as soon as it ends,
 * and must land on the real data. Nothing tapped in the sample survives it.
 */
export function bindDietTour(store: StoreApi<DietState>) {
  let kept: DietState | undefined;
  return onTourActive((active) => {
    if (active) {
      kept = store.getState();
      store.setState(buildDemoDiet(todayKey()));
    } else if (kept) {
      store.setState(kept, true);
      kept = undefined;
    }
  });
}

// -- React ------------------------------------------------------------------

const DietStoreContext = createContext<StoreApi<DietState> | null>(null);

export function DietStoreProvider({ children }: { children: React.ReactNode }) {
  const storeRef = useRef<StoreApi<DietState>>(null);
  if (!storeRef.current) {
    storeRef.current = createDietStore();
    bindDietTour(storeRef.current);
  }

  // An installed app stays open for days. Opened the morning after, Today must
  // not keep showing yesterday's meals, or a tick lands on the wrong day.
  useEffect(() => {
    const resync = () => {
      const store = storeRef.current;
      if (store && store.getState().activeDate !== todayKey()) {
        store.getState().setDietActiveDate(todayKey());
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        resync();
      }
    };
    resync();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", resync);
    window.addEventListener("pageshow", resync);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", resync);
      window.removeEventListener("pageshow", resync);
    };
  }, []);

  // The save waits for the next task, and the page may not get one.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") {
        flushDietPersist();
      }
    };
    window.addEventListener("pagehide", flushDietPersist);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", flushDietPersist);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, []);

  // Another tab saved. Merge it in rather than overwrite it with this tab's
  // older copy, and without saving, or the event would bounce for ever.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      const store = storeRef.current;
      if (!store || !event.newValue || isTouring()) {
        return;
      }
      const state = store.getState();
      if (event.key !== keyFor(state.owner)) {
        return;
      }
      try {
        const saved = JSON.parse(event.newValue) as DietIncoming & { owner?: string };
        if ((saved.owner ?? undefined) === (state.owner ?? undefined)) {
          store.setState((current) => ({ ...current, ...reconcileDiet(current, saved) }));
        }
      } catch {
        // A damaged write from the other tab: this tab's copy stands.
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return <DietStoreContext.Provider value={storeRef.current}>{children}</DietStoreContext.Provider>;
}

export function useDietStore<T>(selector: (store: DietState) => T) {
  const store = useContext(DietStoreContext);
  if (!store) {
    throw new Error("useDietStore must be used inside DietStoreProvider");
  }
  return useStore(store, selector);
}

/** The raw store, for `subscribe()`. The sync layer uses it to watch every change. */
export function useDietStoreApi() {
  const store = useContext(DietStoreContext);
  if (!store) {
    throw new Error("useDietStoreApi must be used inside DietStoreProvider");
  }
  return store;
}

/** The checklist for the day on screen, or undefined when nothing is planned. */
export function useTodayMealDay() {
  const days = useDietStore((state) => state.scheduledMealDays);
  const activeDate = useDietStore((state) => state.activeDate);
  return useMemo(() => days.find((day) => day.date === activeDate), [activeDate, days]);
}

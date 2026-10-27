import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";

import type { DemoState } from "@/lib/demo-data";

/**
 * The tour's sandbox: sample data on screen, the user's own data safe.
 *
 * Starting the tour keeps the real store state in memory, then swaps the
 * sample in. While it runs, two things are switched off — saving to this
 * phone (`persist` in workout-store checks `isTouring()`) and syncing to the
 * account (`supabase-sync` checks it too) — so nothing the tour shows or the
 * user taps can reach either. Ending it puts the kept state back, object for
 * object, and only then turns saving and syncing on again.
 *
 * A module singleton, like sync-status: one tour at a time, and outside the
 * workout store on purpose, because the sync layer subscribes to every change
 * there. A reload mid-tour simply forgets it: the phone's copy was never
 * touched, so the real data loads as if the tour had not happened.
 */

export interface TourState {
  active: boolean;
  /** The step on screen, 0-based. */
  step: number;
  /**
   * "Keep looking around": the step cards are gone, the sample stays, and a
   * small pill offers the way out. Still a tour — nothing saves or syncs.
   */
  exploring: boolean;
}

const tour = createStore<TourState>(() => ({ active: false, step: 0, exploring: false }));

/** The real state, kept while the sample is on screen. */
let kept: unknown;

/** Work that must land on the real data, not the sample — run when the tour ends. */
let deferred: (() => void)[] = [];

export function isTouring(): boolean {
  return tour.getState().active;
}

/**
 * The fields the sample replaces. Everything else — the actions, `muscles`,
 * the owner, UI flags — stays as the store had it.
 */
interface SampleTarget {
  templates: { isPreset: boolean }[];
  activeDate: string;
}

/**
 * The store state with the sample swapped in. Presets stay (every store has
 * them); the user's own exercises go, the sample's come in. Selections are
 * cleared so no screen points at a session that is not there.
 */
export function withSample<S extends SampleTarget>(state: S, demo: DemoState): S {
  return {
    ...state,
    templates: [...state.templates.filter((template) => template.isPreset), ...demo.templates],
    sessionTemplates: demo.sessionTemplates,
    scheduledSessions: demo.scheduledSessions,
    logs: demo.logs,
    setLogs: demo.setLogs,
    measurements: demo.measurements,
    skillGoals: demo.skillGoals ?? [],
    profile: demo.profile,
    scheduleConfig: demo.scheduleConfig,
    selectedSessionId: undefined,
    selectedMuscleId: undefined
  };
}

/**
 * Keep the real state, then show the sample. `active` goes on *before* the
 * swap: the swap is itself a store change, and it must already be invisible
 * to saving and syncing.
 */
export function startTour<S extends SampleTarget>(store: StoreApi<S>, demo: DemoState): void {
  if (isTouring()) {
    return;
  }
  const real = store.getState();
  kept = real;
  tour.setState({ active: true, step: 0, exploring: false });
  store.setState(withSample(real, demo), true);
}

/**
 * Put the real state back exactly, then turn saving and syncing on, then run
 * whatever waited. In that order: the restore must not be saved or synced as
 * if it were a change (it is the state both already hold), and the waiting
 * work must land on the real data.
 */
export function endTour<S>(store: StoreApi<S>): void {
  if (!isTouring()) {
    return;
  }
  if (kept !== undefined) {
    store.setState(kept as S, true);
  }
  kept = undefined;
  tour.setState({ active: false, step: 0, exploring: false });

  const waiting = deferred;
  deferred = [];
  waiting.forEach((run) => run());
}

/**
 * Run now, or — while the tour is on — once it ends. For the account load
 * that lands mid-tour: merged now, it would mix the real data into the sample
 * and be thrown away with it.
 */
export function afterTour(run: () => void): void {
  if (isTouring()) {
    deferred.push(run);
  } else {
    run();
  }
}

export function setTourStep(step: number): void {
  if (isTouring()) {
    tour.setState({ step: Math.max(0, step) });
  }
}

/** Close the step cards and leave the sample on screen to look around. */
export function exploreSample(): void {
  if (isTouring()) {
    tour.setState({ exploring: true });
  }
}

export function useTour(): TourState {
  return useStore(tour);
}

/**
 * For state that lives outside the workout store but must not mix with the
 * sample either — the rest and live timers keep their own copy and swap it
 * out for the tour the way `startTour` does the store's.
 */
export function subscribeTour(listener: (state: TourState, previous: TourState) => void): () => void {
  return tour.subscribe(listener);
}

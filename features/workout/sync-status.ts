"use client";

import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

/**
 * Whether the Supabase copy is up to date, for the line on Profile.
 *
 * Deliberately *not* in the workout store: `supabase-sync` subscribes to every
 * change there, so writing status back into it would push, set state, push
 * again, forever. One `<SupabaseSync />` renders for the whole app and one user
 * is signed in, so a module singleton is the whole of it — no provider.
 */
export interface SyncStatus {
  /** Epoch ms of the last successful read or write. Never survives a reload. */
  lastSyncedAt?: number;
  error?: {
    // A failed load leaves the tab with nothing subscribed, so it stays broken
    // until it is retried; a failed push is retried by the next change on its
    // own. Different failures, different offers.
    stage: "load" | "push";
    message: string;
  };
  /** Bumped by the Retry button. `supabase-sync` re-runs its effect on it. */
  attempt: number;
}

const store = createStore<SyncStatus>(() => ({ attempt: 0 }));

export function setSyncStatus(patch: Partial<Omit<SyncStatus, "attempt">>) {
  store.setState(patch);
}

/** Clears the error first, so a failing retry is visibly a *new* failure. */
export function retrySync() {
  store.setState((state) => ({ attempt: state.attempt + 1, error: undefined }));
}

export function useSyncStatus() {
  return useStore(store);
}

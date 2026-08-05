"use client";

import { useEffect, useRef } from "react";

import { useAuth } from "@/features/auth/use-auth";
import { useWorkoutStoreApi } from "@/features/workout/workout-store";
import { loadUserState, pushChanges, type SyncableState } from "@/lib/sync";
import { supabase } from "@/lib/supabase";

/**
 * Keeps the workout store and Supabase in step.
 *
 * Reads once on sign-in, then watches the store and pushes what changed. The
 * store itself knows nothing about Supabase: `persist()` still writes
 * localStorage synchronously on every action, so the UI never waits on the
 * network, and this pushes the durable copy behind it.
 */

// Long enough that a run of stepper taps collapses into one write, short
// enough that closing the tab right after a set does not lose it.
const DEBOUNCE_MS = 1500;

function snapshot(state: SyncableState): SyncableState {
  return {
    templates: state.templates,
    sessionTemplates: state.sessionTemplates,
    scheduledSessions: state.scheduledSessions,
    logs: state.logs,
    measurements: state.measurements,
    profile: state.profile,
    scheduleConfig: state.scheduleConfig
  };
}

export function SupabaseSync() {
  const { user } = useAuth();
  const store = useWorkoutStoreApi();
  const userId = user?.id;

  // The last state Supabase is known to hold. Writes diff against this, not
  // against the previous render, so a failed push is retried by the next one
  // instead of being silently skipped.
  const syncedRef = useRef<SyncableState | undefined>(undefined);

  useEffect(() => {
    if (!supabase || !userId) {
      syncedRef.current = undefined;
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let unsubscribe: (() => void) | undefined;

    const flush = () => {
      const base = syncedRef.current;
      if (!base) {
        return;
      }

      const next = snapshot(store.getState());
      void pushChanges(userId, base, next)
        .then(() => {
          syncedRef.current = next;
        })
        .catch((error: unknown) => {
          // Leave syncedRef alone so the next change retries this diff. The
          // local copy is already safe in localStorage either way.
          console.error("[supabase-sync] push failed", error);
        });
    };

    void loadUserState()
      .then((remote) => {
        if (cancelled) {
          return;
        }

        store.getState().hydrateRemote(remote);
        syncedRef.current = snapshot(store.getState());

        unsubscribe = store.subscribe(() => {
          clearTimeout(timer);
          timer = setTimeout(flush, DEBOUNCE_MS);
        });
      })
      .catch((error: unknown) => {
        console.error("[supabase-sync] load failed", error);
      });

    return () => {
      cancelled = true;
      clearTimeout(timer);
      unsubscribe?.();
    };
  }, [store, userId]);

  return null;
}

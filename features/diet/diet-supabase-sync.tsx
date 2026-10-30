"use client";

import { useEffect, useRef } from "react";

import { askGuestMerge } from "@/features/auth/guest-merge-prompt";
import { useAuth } from "@/features/auth/use-auth";
import { clearDietGuestCopy, readDietGuestCopy, useDietStoreApi } from "@/features/diet/diet-store";
import { afterTour, isTouring } from "@/features/tour/tour-store";
import { setSyncStatus, useSyncStatus } from "@/features/workout/sync-status";
import { guestDeclinedBy } from "@/features/workout/workout-store";
import { describeDietCounts, hasDietData } from "@/lib/diet-backup";
import { dietBaseline, dietSnapshot, EMPTY_DIET, loadDietState, pushDietChanges } from "@/lib/diet-sync";
import type { DietData } from "@/lib/diet-types";
import { supabase } from "@/lib/supabase";
import { isMissingTable, syncErrorMessage } from "@/lib/sync";

const DEBOUNCE_MS = 1500;

/**
 * Keeps the diet store and Supabase in step, on its own beside `SupabaseSync`:
 * its own read, its own diff base, its own debounce. A diet failure cannot hold
 * up a workout write, and the reverse. The rules are the workout ones, and the
 * comments in features/workout/supabase-sync.tsx explain why each exists.
 */
export function DietSupabaseSync() {
  const { user, loading } = useAuth();
  const store = useDietStoreApi();
  const userId = user?.id;
  const { attempt } = useSyncStatus();
  const syncedRef = useRef<DietData | undefined>(undefined);
  const loadFailedRef = useRef(false);

  useEffect(() => {
    if (!supabase || !userId) {
      syncedRef.current = undefined;
      if (!loading) {
        afterTour(() => store.getState().switchDietToGuest());
      }
      return;
    }

    // Before anything is read or pushed: prove the saved copy is this user's.
    store.getState().switchDietToAccount(userId);
    loadFailedRef.current = false;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const flush = () => {
      // Mid-read, or the tour's sample on screen: nothing to send yet.
      if ((!syncedRef.current && !loadFailedRef.current) || isTouring()) {
        return;
      }
      const next = dietSnapshot(store.getState());
      // An empty base emits no deletes, so a failed read can only add rows.
      void pushDietChanges(userId, syncedRef.current ?? EMPTY_DIET, next)
        .then(() => {
          if (!cancelled) {
            syncedRef.current = next;
          }
        })
        .catch((error: unknown) => {
          // Before 0014 this is expected. The rows are safe on the device, and
          // leaving the base alone means the next change retries the whole diff.
          if (isMissingTable(error as { code?: string })) {
            console.warn("[diet-sync] migration 0014 has not run: diet stays on this device");
            return;
          }
          console.error(`[diet-sync] push failed: ${syncErrorMessage(error)}`, error);
          if (!cancelled) {
            setSyncStatus({ error: { stage: "push", message: syncErrorMessage(error) } });
          }
        });
    };

    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(flush, DEBOUNCE_MS);
    };
    const unsubscribe = store.subscribe(schedule);
    const flushNow = () => {
      clearTimeout(timer);
      flush();
    };
    window.addEventListener("pagehide", flushNow);
    window.addEventListener("online", flushNow);

    void loadDietState(userId)
      .then((remote) => {
        if (cancelled) {
          return;
        }
        afterTour(() => {
          if (cancelled) {
            return;
          }
          // Another device asked to delete everything. The merge never deletes,
          // so this phone's old copy must be emptied or it would be pushed back.
          const stamp = remote.deletionRequestedAt;
          if (stamp && store.getState().archivedAt !== stamp) {
            store.getState().archiveDietLocal(stamp);
          }
          store.getState().hydrateDiet(remote);
          syncedRef.current = dietBaseline(remote);
          schedule();

          // The guest copy, after the baseline so moving it in is a change that
          // gets pushed. The same answer as workouts: no question for an empty
          // account, the one shared question otherwise, because on a shared
          // phone the guest's meals may not be yours.
          const guest = readDietGuestCopy();
          if (!guest || !hasDietData(guest) || guestDeclinedBy(userId)) {
            return;
          }
          const moveIn = () => {
            const current = readDietGuestCopy();
            if (current) {
              store.getState().hydrateDiet({ ...current, settings: undefined });
              clearDietGuestCopy();
            }
          };
          if (!hasDietData(store.getState())) {
            moveIn();
          } else {
            askGuestMerge(userId, describeDietCounts(guest) || "your meal days", moveIn);
          }
        });
      })
      .catch((error: unknown) => {
        console.error(`[diet-sync] load failed: ${syncErrorMessage(error)}`, error);
        loadFailedRef.current = true;
      });

    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener("pagehide", flushNow);
      window.removeEventListener("online", flushNow);
      unsubscribe();
    };
  }, [attempt, loading, store, userId]);

  return null;
}

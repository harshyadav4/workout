"use client";

import { useEffect, useRef } from "react";

import { useAuth } from "@/features/auth/use-auth";
import { setSyncStatus, useSyncStatus } from "@/features/workout/sync-status";
import { useWorkoutStoreApi } from "@/features/workout/workout-store";
import {
  loadUserState,
  pushChanges,
  snapshotState,
  syncErrorMessage,
  type SyncableState
} from "@/lib/sync";
import { supabase } from "@/lib/supabase";

/**
 * Keeps the workout store and Supabase in step.
 *
 * Reads once on sign-in, then watches the store and pushes what changed. The
 * store itself knows nothing about Supabase: `persist()` still writes
 * localStorage synchronously on every action, so the UI never waits on the
 * network, and this pushes the durable copy behind it.
 *
 * Every outcome is reported to `sync-status`, which Profile renders.
 */

// Long enough that a run of stepper taps collapses into one write, short
// enough that closing the tab right after a set does not lose it.
const DEBOUNCE_MS = 1500;

/**
 * The diff base when the read never succeeded. `diffRows` emits **zero** deletes
 * against an empty previous — asserted in `lib/sync.test.ts` — so pushing from
 * here can only upsert. Local work reaches the account without a successful read
 * first, which is what a failed load used to cost outright.
 */
const NOTHING_KNOWN_REMOTE: SyncableState = {
  templates: [],
  sessionTemplates: [],
  scheduledSessions: [],
  logs: [],
  setLogs: [],
  measurements: [],
  profile: { name: "", email: "", heightCm: 0, weightKg: 0 }
};

export function SupabaseSync() {
  const { user } = useAuth();
  const store = useWorkoutStoreApi();
  const userId = user?.id;
  // The only reason this component subscribes to its own status: a Retry tap on
  // Profile bumps `attempt`, which re-runs the effect below and re-reads.
  const { attempt } = useSyncStatus();

  // The last state Supabase is known to hold. Writes diff against this, not
  // against the previous render, so a failed push is retried by the next one
  // instead of being silently skipped.
  const syncedRef = useRef<SyncableState | undefined>(undefined);
  // Distinguishes "the read failed" from "the read has not landed yet". Both
  // leave `syncedRef` undefined, and only the first may push from an empty base.
  const loadFailedRef = useRef(false);

  useEffect(() => {
    if (!supabase || !userId) {
      syncedRef.current = undefined;
      setSyncStatus({ lastSyncedAt: undefined, error: undefined });
      return;
    }

    // Before anything is read or pushed: prove the persisted copy is this
    // user's, or drop it. Everything below may upload local state, and on a
    // shared device that state can be the previous account's.
    store.getState().claimFor(userId);

    loadFailedRef.current = false;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const flush = () => {
      // Mid-read: a cold mobile start routinely takes longer than the debounce,
      // and iOS fires `pagehide` on every app switch. Pushing from an empty base
      // here would upsert a stale local row over a newer remote one *before* the
      // read that would have reconciled it arrives.
      if (!syncedRef.current && !loadFailedRef.current) {
        return;
      }

      const next = snapshotState(store.getState());
      void pushChanges(userId, syncedRef.current ?? NOTHING_KNOWN_REMOTE, next)
        .then(() => {
          if (cancelled) {
            return;
          }
          syncedRef.current = next;
          setSyncStatus({ lastSyncedAt: Date.now(), error: undefined });
        })
        .catch((error: unknown) => {
          // Leave syncedRef alone so the next change retries this diff. The
          // local copy is safe in localStorage either way.
          // The message, not the object: a PostgrestError is an Error, and its
          // fields do not serialise, so logging it whole printed `{}`.
          console.error(`[supabase-sync] push failed: ${syncErrorMessage(error)}`, error);
          if (!cancelled) {
            setSyncStatus({ error: { stage: "push", message: syncErrorMessage(error) } });
          }
        });
    };

    // Attached before the read, not inside its `.then`. It used to live in the
    // callback, so a failed load meant this tab never pushed again for the rest
    // of its life — every set logged after it existed only on the device.
    const unsubscribe = store.subscribe(() => {
      clearTimeout(timer);
      timer = setTimeout(flush, DEBOUNCE_MS);
    });

    // The debounce loses the last set if the tab closes inside it. `pagehide`
    // is the one teardown event iOS Safari reliably fires — `beforeunload` does
    // not fire there at all. Best-effort: an interrupted push is recovered by
    // the reconcile on next launch, which is why this can stay a plain call.
    const flushNow = () => {
      clearTimeout(timer);
      flush();
    };
    window.addEventListener("pagehide", flushNow);

    void loadUserState()
      .then((remote) => {
        if (cancelled) {
          return;
        }

        store.getState().hydrateRemote(remote);
        syncedRef.current = snapshotState(store.getState());
        setSyncStatus({ lastSyncedAt: Date.now(), error: undefined });
      })
      .catch((error: unknown) => {
        // Recoverable now: the subscriber above is live and will push against an
        // empty base, so work still reaches the account. What is missing is
        // anything this account holds that this device has never seen.
        // The message, not the object: a PostgrestError is an Error, and its
          // fields do not serialise, so logging it whole printed `{}`.
          console.error(`[supabase-sync] load failed: ${syncErrorMessage(error)}`, error);
        loadFailedRef.current = true;
        if (!cancelled) {
          setSyncStatus({ error: { stage: "load", message: syncErrorMessage(error) } });
        }
      });

    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener("pagehide", flushNow);
      unsubscribe();
    };
  }, [attempt, store, userId]);

  return null;
}

"use client";

import { useEffect, useRef } from "react";

import { useAuth } from "@/features/auth/use-auth";
import { afterTour, isTouring } from "@/features/tour/tour-store";
import { setSyncStatus, useSyncStatus } from "@/features/workout/sync-status";
import { askGuestMerge } from "@/features/auth/guest-merge-prompt";
import {
  clearGuestCopy,
  guestDeclinedBy,
  readGuestCopy,
  useWorkoutStoreApi
} from "@/features/workout/workout-store";
import { countCopy, decideGuestMerge, describeCounts, guestAsIncoming } from "@/lib/guest-merge";
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
  const { user, loading } = useAuth();
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
      // Known to be signed out: the guest copy, never the last account's —
      // that one stays saved for the next sign-in. Not while sign-in is still
      // loading (a second of "no user" on every open), and not mid-tour.
      if (!loading) {
        afterTour(() => store.getState().switchToGuest());
      }
      return;
    }

    // Before anything is read or pushed: prove the persisted copy is this
    // user's, or drop it. Everything below may upload local state, and on a
    // shared device that state can be the previous account's.
    store.getState().switchToAccount(userId);

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

      // The tour's sample is on screen: it must never reach the account. The
      // restore at the end is a change too, and diffs to nothing.
      if (isTouring()) {
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

        // Mid-tour, the store holds the sample. Merged now, the account's data
        // would land in it and be thrown away at the end — so it waits, and
        // lands on the real data the tour gives back.
        afterTour(() => {
          if (cancelled) {
            return;
          }

          // Another device archived this account's data. The merge below never
          // deletes, so this device's old copy would sit on screen — and be
          // pushed back up with its next change. Empty it first.
          const archivedAt = remote.profile?.deletionRequestedAt;
          if (archivedAt && store.getState().profile.deletionRequestedAt !== archivedAt) {
            store.getState().archiveLocal(archivedAt);
          }

          store.getState().hydrateRemote(remote);
          syncedRef.current = snapshotState(store.getState());
          setSyncStatus({ lastSyncedAt: Date.now(), error: undefined });

          // Then the guest copy — after the baseline above, so moving it in is
          // a change, and the next push sends it to the account.
          const guest = readGuestCopy();
          const decision = decideGuestMerge({
            guest,
            account: snapshotState(store.getState()),
            declined: guestDeclinedBy(userId)
          });
          if (guest && decision === "move") {
            // An empty account: nothing to mix with, so no question.
            store.getState().hydrateRemote(guestAsIncoming(guest, store.getState().profile));
            clearGuestCopy();
          } else if (guest && decision === "ask") {
            askGuestMerge(userId, describeCounts(countCopy(guest)));
          }
        });
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
  }, [attempt, loading, store, userId]);

  return null;
}

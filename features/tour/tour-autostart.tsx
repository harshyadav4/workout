"use client";

import { useEffect, useRef } from "react";

import { useAuth } from "@/features/auth/use-auth";
import { hasOwnData, readTourSeen, shouldAutostart } from "@/features/tour/autostart-rule";
import { useStartTour } from "@/features/tour/tour";
import { useTour } from "@/features/tour/tour-store";
import { useSyncStatus } from "@/features/workout/sync-status";
import { useWorkoutStore } from "@/features/workout/workout-store";

/**
 * Starts the tour once, on a phone with no training of its own — the first
 * open of a new account today, and of a new phone once guest mode lands, with
 * no change here: signed out, there is no account to wait for.
 */
export function TourAutostart() {
  const { user, loading } = useAuth();
  const { lastSyncedAt, error } = useSyncStatus();
  const touring = useTour().active;
  const hasData = useWorkoutStore(hasOwnData);
  const startTour = useStartTour();
  const decided = useRef(false);

  // Signed in and not read yet, or the read failed: the account may hold data
  // this phone has not seen. A failed read never counts as "empty".
  const accountPending = loading || (Boolean(user) && (lastSyncedAt === undefined || Boolean(error)));

  useEffect(() => {
    if (decided.current || accountPending) {
      return;
    }
    // One decision per open, made as soon as the account is settled.
    decided.current = true;
    if (shouldAutostart({ hasData, seen: readTourSeen(), accountPending, touring })) {
      startTour();
    }
  }, [accountPending, hasData, startTour, touring]);

  return null;
}

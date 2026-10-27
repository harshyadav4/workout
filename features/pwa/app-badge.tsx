"use client";

import { useEffect } from "react";

import { useWorkoutStore } from "@/features/workout/workout-store";
import { isRecordingDue } from "@/lib/body-metrics";

/**
 * The number on the app icon: today's workout while it is not done, and a
 * measurement when one is due — the same two things the dock already marks.
 *
 * Android Chrome, and iPhone from iOS 16.4 when the app is on the home
 * screen. Anywhere else the API is absent and nothing happens. Renders
 * nothing; it is mounted once in AppProviders.
 */
export function AppBadge() {
  const count = useWorkoutStore((state) => {
    const workoutLeft = state.scheduledSessions.some(
      (session) =>
        session.date === state.activeDate && session.type === "workout" && session.status !== "completed"
    );
    return (workoutLeft ? 1 : 0) + (isRecordingDue(state.measurements, state.profile) ? 1 : 0);
  });

  useEffect(() => {
    const nav = navigator as Navigator & {
      setAppBadge?: (contents?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    try {
      if (count > 0) {
        void nav.setAppBadge?.(count).catch(() => undefined);
      } else {
        void nav.clearAppBadge?.().catch(() => undefined);
      }
    } catch {
      // Not supported, or refused: the icon simply carries no number.
    }
  }, [count]);

  return null;
}

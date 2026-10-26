"use client";

import { useMemo } from "react";

import { ExerciseDemoButton } from "@/features/workout/exercise-media-dialog";
import { useWorkoutStore } from "@/features/workout/workout-store";
import type { PlannedExercise, PlannedSet, ScheduledSession } from "@/lib/types";
import { lastPerformance } from "@/lib/workout-helpers";

// Date keys are plain YYYY-MM-DD days: format in UTC so the day never shifts.
function shortDate(key: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${key}T00:00:00Z`)
  );
}

/** "30 kg × 5", "12 reps", "45 s" — one set in the units it is done in. */
function setLabel(setItem: PlannedSet, exercise: PlannedExercise) {
  if (exercise.metric === "time") {
    const hold = `${setItem.durationSeconds ?? 0} s`;
    return setItem.weight > 0 ? `${setItem.weight} kg · ${hold}` : hold;
  }
  return setItem.weight > 0 ? `${setItem.weight} kg × ${setItem.reps}` : `${setItem.reps} reps`;
}

/**
 * What a scheduled day asks of you, so you can get ready for it: each
 * exercise, every set exactly as the day will open it — which, with no
 * progression rule, is set for set what you did last time (carriedSets) — and
 * when that was. A summary ("4 sets · 30–32.5 kg") hid the very numbers you
 * prepare for. "Last done" counts only days before this one, so a past day
 * shows what you were working from then.
 */
export function SessionPreview({ session }: { session: ScheduledSession }) {
  const logs = useWorkoutStore((state) => state.logs);
  const setLogs = useWorkoutStore((state) => state.setLogs);

  const rows = useMemo(() => {
    const before = {
      logs: logs.filter((log) => log.date < session.date),
      setLogs: setLogs.filter((row) => row.date < session.date)
    };
    return session.exercises.map((exercise) => ({
      exercise,
      lastDate: lastPerformance(exercise.workoutId, before.logs, before.setLogs)?.date
    }));
  }, [logs, setLogs, session]);

  if (rows.length === 0) {
    return null;
  }

  const setCount = session.exercises.reduce(
    (sum, exercise) => sum + exercise.sets.filter((setItem) => setItem.type !== "warmup").length,
    0
  );

  return (
    <div className="mt-1 pb-1 pl-[18px] pr-2">
      <p className="text-xs text-muted-foreground tabular-nums">
        {rows.length} {rows.length === 1 ? "workout" : "workouts"} · {setCount} sets
      </p>
      <ul className="mt-2 divide-y divide-border/60">
        {rows.map(({ exercise, lastDate }) => {
          const working = exercise.sets.filter((setItem) => setItem.type !== "warmup");
          return (
            <li key={exercise.id} className="py-2">
              <div className="flex items-center gap-2">
                <div className="flex min-w-0 flex-1 items-center">
                  <p className="min-w-0 truncate text-sm font-semibold">{exercise.templateName}</p>
                  <ExerciseDemoButton workoutId={exercise.workoutId} name={exercise.templateName} />
                </div>
                <p className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                  {lastDate ? `Last done ${shortDate(lastDate)}` : "First time"}
                </p>
              </div>
              <ol className="mt-1.5 space-y-1">
                {working.map((setItem, index) => (
                  <li
                    key={setItem.id}
                    className="well grid grid-cols-[1.5rem_1fr] items-center rounded-md px-2 py-1 text-xs tabular-nums"
                  >
                    <span className="font-bold text-muted-foreground">{index + 1}</span>
                    <span className="font-semibold">{setLabel(setItem, exercise)}</span>
                  </li>
                ))}
              </ol>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

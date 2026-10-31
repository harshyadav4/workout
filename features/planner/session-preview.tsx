"use client";

import { Fragment, useMemo, type ReactNode } from "react";

import { ExerciseDemoButton } from "@/features/workout/exercise-media-dialog";
import { useDetailedTiming } from "@/features/workout/use-detailed-timing";
import { useDistanceUnit } from "@/features/workout/use-distance-unit";
import { useWorkoutStore } from "@/features/workout/workout-store";
import { type DistanceUnit, formatDistance, formatPace } from "@/lib/cardio";
import { formatDayKey } from "@/lib/progress-metrics";
import { formatDuration, formatTimeOfDay, secondsBetween, sessionBreakdown } from "@/lib/session-time";
import { formatClock } from "@/lib/timer";
import type { PlannedExercise, PlannedSet, ScheduledSession } from "@/lib/types";
import { lastPerformance } from "@/lib/workout-helpers";

/** "30 kg × 5", "12 reps", "45 s" — one set in the units it is done in. */
function setLabel(setItem: PlannedSet, exercise: PlannedExercise, unit: DistanceUnit) {
  if (exercise.metric === "distance") {
    const km = setItem.distanceKm ?? 0;
    const seconds = setItem.durationSeconds ?? 0;
    return [formatDistance(km, unit), formatClock(seconds), formatPace(seconds, km, unit)].filter(Boolean).join(" · ");
  }
  if (exercise.metric === "time") {
    const hold = `${setItem.durationSeconds ?? 0} s`;
    return setItem.weight > 0 ? `${setItem.weight} kg · ${hold}` : hold;
  }
  return setItem.weight > 0 ? `${setItem.weight} kg × ${setItem.reps}` : `${setItem.reps} reps`;
}

/**
 * Every number the sets ask for, on one line: "3 × 10 · 45 kg" when the sets are
 * alike, "90 kg × 7, 7, 6" when only the reps move, each set in turn otherwise. A
 * range ("30–32.5 kg") would hide the very numbers you prepare for.
 */
function setsLine(sets: PlannedSet[], exercise: PlannedExercise, unit: DistanceUnit): ReactNode {
  const [first] = sets;
  const alike = sets.every(
    (item) =>
      item.weight === first.weight &&
      item.reps === first.reps &&
      item.durationSeconds === first.durationSeconds &&
      item.distanceKm === first.distanceKm
  );
  if (!alike && !exercise.metric?.match(/time|distance/) && sets.every((item) => item.weight === first.weight)) {
    const reps = sets.map((item) => item.reps).join(", ");
    return first.weight > 0 ? `${first.weight} kg × ${reps}` : `${reps} reps`;
  }
  if (!alike) {
    return sets.map((item, index) => (
      <Fragment key={item.id}>
        {index > 0 ? " · " : ""}
        <span className="whitespace-nowrap">{setLabel(item, exercise, unit)}</span>
      </Fragment>
    ));
  }
  const load = first.weight > 0 ? ` · ${first.weight} kg` : "";
  if (exercise.metric === "distance") {
    return `${sets.length} × ${setLabel(first, exercise, unit)}`;
  }
  return exercise.metric === "time"
    ? `${sets.length} × ${first.durationSeconds ?? 0} s${load}`
    : `${sets.length} × ${first.reps}${load}`;
}

/**
 * What a scheduled day asks of you, so you can get ready for it: its name, then
 * each exercise as the day will open it — which, with no progression rule, is
 * what you did last time (carriedSets) — and when that was. "Last done" counts
 * only days before this one, so a past day shows what you were working from then.
 *
 * Rows in the day's one surface, with nothing boxed inside them.
 */
export function SessionPreview({ session, action }: { session: ScheduledSession; action?: ReactNode }) {
  const logs = useWorkoutStore((state) => state.logs);
  const setLogs = useWorkoutStore((state) => state.setLogs);
  const unit = useDistanceUnit();
  const detailed = useDetailedTiming();
  const breakdown = useMemo(
    () => (detailed ? new Map(sessionBreakdown(session).map((item) => [item.exerciseId, item])) : undefined),
    [detailed, session]
  );

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

  const setCount = session.exercises.reduce(
    (sum, exercise) => sum + exercise.sets.filter((setItem) => setItem.type !== "warmup").length,
    0
  );

  return (
    <>
      <div className="list-row flex items-start gap-3 py-3.5 pl-4 pr-3.5">
        <div className="min-w-0 flex-1">
          <h3 className="break-words font-heading text-[28px] leading-[1.12]">
            {session.sessionName}
          </h3>
          {rows.length > 0 ? (
            <p className="mt-1 text-[13.5px] text-muted-foreground tabular-nums">
              {rows.length} {rows.length === 1 ? "exercise" : "exercises"} · {setCount} {setCount === 1 ? "set" : "sets"}
            </p>
          ) : null}
          {session.startedAt && session.finishedAt ? (
            <p className="mt-0.5 text-[13.5px] text-muted-foreground tabular-nums">
              {formatTimeOfDay(session.startedAt)} to {formatTimeOfDay(session.finishedAt)} ·{" "}
              {formatDuration(secondsBetween(session.startedAt, session.finishedAt))}
            </p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {rows.map(({ exercise, lastDate }) => {
        const working = exercise.sets.filter((setItem) => setItem.type !== "warmup");
        const timing = breakdown?.get(exercise.id);
        // With detailed timing on, a logged set has a clock time, so it needs its own line.
        const timed = Boolean(breakdown) && working.some((setItem) => setItem.completedAt);
        return (
          <div key={exercise.id} className="list-row flex items-start gap-1 py-2.5 pl-4 pr-1.5">
            <div className="min-w-0 flex-1">
              <p className="text-[15.5px] font-medium capitalize">{exercise.templateName}</p>
              <p className="mt-px text-[13px] text-muted-foreground tabular-nums">
                {!timed && working.length > 0 ? <>{setsLine(working, exercise, unit)} · </> : null}
                <span className="whitespace-nowrap">{lastDate ? `last done ${formatDayKey(lastDate)}` : "first time"}</span>
                {timing?.seconds ? ` · ${formatDuration(timing.seconds)}` : null}
              </p>
              {timed ? (
                <ol className="mt-1.5 space-y-0.5 text-[13px] tabular-nums">
                  {working.map((setItem, index) => (
                    <li key={setItem.id} className="flex gap-2">
                      <span className="w-4 shrink-0 text-muted-foreground">{index + 1}</span>
                      <span className="min-w-0">{setLabel(setItem, exercise, unit)}</span>
                      {setItem.completedAt ? (
                        <span className="ml-auto shrink-0 pr-2 text-muted-foreground">
                          {formatTimeOfDay(setItem.completedAt)} · +
                          {formatClock(timing?.sets.find((item) => item.setId === setItem.id)?.gap ?? 0)}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ol>
              ) : null}
            </div>
            <ExerciseDemoButton workoutId={exercise.workoutId} name={exercise.templateName} />
          </div>
        );
      })}
    </>
  );
}

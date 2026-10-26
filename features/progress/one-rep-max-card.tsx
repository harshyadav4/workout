"use client";

import { useState } from "react";

import { EmptyChart } from "@/features/progress/chart-theme";
import { Panel } from "@/features/progress/panel";
import { TopSetChart } from "@/features/progress/strength-cards";
import { bestEstimate, MAX_ELIGIBLE_REPS, oneRepMaxSeries, weightForReps } from "@/lib/one-rep-max";
import { formatDayKey, type ExerciseTotal } from "@/lib/progress-metrics";
import type { SetLog } from "@/lib/types";
import { cn } from "@/lib/utils";

/** The reps a calculator row is worth showing. Singles and doubles are the ask. */
const CALCULATOR_REPS = [1, 3, 5, 8, 10];

/**
 * Estimated 1RM per lift, from `set_logs` and nothing else.
 *
 * Every other strength card on this screen reads `workout_logs`, which stores
 * reps for the whole exercise — that is why they all say "top set lifted, not an
 * estimated 1RM", and they are still right to. This card sits on the per-set
 * grain, which is the only place the estimate can honestly come from.
 *
 * It shows *which set* produced the number. An estimate whose provenance is
 * hidden is a number people either trust too much or ignore entirely.
 */
export function OneRepMaxCard({
  setLogs,
  exercises
}: {
  setLogs: SetLog[];
  exercises: ExerciseTotal[];
}) {
  const [openId, setOpenId] = useState<string>();

  const rows = exercises
    .map((exercise) => ({ exercise, estimate: bestEstimate(setLogs, exercise.workoutId) }))
    .filter((row) => row.estimate)
    .sort((a, b) => (b.estimate?.value ?? 0) - (a.estimate?.value ?? 0));

  return (
    <Panel
      title="Your one-lift max (estimated)"
      caption="The most you could likely lift once, from your best set — tap a lift for its chart"
      note={
        <>
          Gym-goers call this a &ldquo;1RM&rdquo; (one-rep max): the heaviest weight you can lift
          one time. You do not need to test it. The app estimates it from your sets with a standard
          formula (Epley). 100 kg × 3 reps can beat 105 kg × 1, so the app uses the set with the
          best estimate, not only the heaviest one. Sets with more than {MAX_ELIGIBLE_REPS} reps are
          not used, because the estimate gets unreliable. Each row shows the set it came from. Tap a
          lift to see what weight to use for 3, 5, 8 or 10 reps.
        </>
      }
    >
      {rows.length === 0 ? (
        <EmptyChart>
          No set of {MAX_ELIGIBLE_REPS} reps or fewer in this time range, so there is nothing to
          estimate from.
        </EmptyChart>
      ) : (
        <ul className="space-y-1">
          {rows.map(({ exercise, estimate }) => {
            const open = openId === exercise.workoutId;
            return (
              <li key={exercise.workoutId}>
                <button
                  type="button"
                  onClick={() => setOpenId(open ? undefined : exercise.workoutId)}
                  className={cn(
                    "flex min-h-[44px] w-full items-baseline justify-between gap-3 rounded-lg px-2 text-left",
                    open && "bg-muted"
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{exercise.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      from {estimate?.fromWeight}kg × {estimate?.fromReps} on{" "}
                      {formatDayKey(estimate?.date ?? "")}
                    </span>
                  </span>
                  <span className="text-sm tabular-nums text-brand">
                    {estimate?.value}kg
                  </span>
                </button>

                {open ? (
                  <div className="px-2 pb-2">
                    <TopSetChart
                      points={oneRepMaxSeries(setLogs, exercise.workoutId).map((point) => ({
                        date: point.date,
                        weight: point.value
                      }))}
                    />
                    {/* The calculator half: what to load for a set you have not
                        done. Derived from the estimate above, so it moves with it. */}
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {CALCULATOR_REPS.map((reps) => (
                        <li
                          key={reps}
                          className="rounded-full bg-muted px-2.5 py-1 text-xs tabular-nums"
                        >
                          {weightForReps(estimate?.value ?? 0, reps)}kg × {reps}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

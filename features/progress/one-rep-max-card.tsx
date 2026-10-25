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
      title="Estimated 1RM"
      caption="Your best eligible set in this range, run through Epley — tap for the curve"
      note={
        <>
          Epley, from the per-set log rather than the session rollup — which is why this card can
          exist and the top-set cards above still cannot. It is the best <em>estimate</em>, not the
          heaviest set: 100 kg × 3 beats 105 kg × 1, and picking the heavier set would hide a real
          improvement. Nothing above {MAX_ELIGIBLE_REPS} reps is used — past that the formula is
          extrapolating, and a set of twenty says a great deal about work capacity and almost
          nothing about a single max. Every row names the set it came from so you can argue with it.
        </>
      }
    >
      {rows.length === 0 ? (
        <EmptyChart>
          No set at {MAX_ELIGIBLE_REPS} reps or fewer in this range — there is nothing to estimate
          from.
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
                    <span className="block text-[11px] text-muted-foreground">
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
                          className="rounded-full bg-muted px-2.5 py-1 text-[11px] tabular-nums"
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

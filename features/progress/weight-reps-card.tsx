"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type { TooltipContentProps } from "recharts";

import { CHART, EmptyChart, animationProps, axisProps, gridProps } from "@/features/progress/chart-theme";
import { Panel } from "@/features/progress/panel";
import { formatDayKey, type ExerciseTotal } from "@/lib/progress-metrics";
import { buildWeightRepsSeries, type WeightRepsPoint } from "@/lib/progress-scores";
import type { SetLog } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Weight and reps of one lift's best set, per session — two stacked charts
 * on one time axis.
 *
 * The weight line alone hides half of getting stronger: 60 × 8 → 60 × 10 is a
 * real gain that a weight-only chart draws as flat. The reps chart under it
 * shows "same weight, more reps" too.
 */
export function WeightRepsCard({
  setLogs,
  exercises,
  workoutId
}: {
  setLogs: SetLog[];
  exercises: ExerciseTotal[];
  /** The lift picked in the filter row, which wins over the card's own pick. */
  workoutId?: string;
}) {
  const lifts = exercises
    .map((exercise) => ({ exercise, points: buildWeightRepsSeries(setLogs, exercise.workoutId) }))
    .filter((row) => row.points.length >= 2);
  const [picked, setPicked] = useState<string>();

  const current =
    lifts.find((row) => row.exercise.workoutId === workoutId) ??
    lifts.find((row) => row.exercise.workoutId === picked) ??
    lifts[0];

  const first = current?.points[0];
  const last = current?.points[current.points.length - 1];

  return (
    <Panel
      title="Weight and reps"
      caption={
        first && last
          ? `${current.exercise.name}: ${setCopy(first)} at the start → ${setCopy(last)} now`
          : "Your best set in each session"
      }
      note={
        <>
          The top chart is the weight of your heaviest set in each session. The bottom chart is how
          many reps you did in that set. Two things mean you got stronger: the weight goes up, or
          the reps go up at the same weight.
        </>
      }
    >
      {!current ? (
        <EmptyChart>Do the same lift in two sessions, and its chart appears here.</EmptyChart>
      ) : (
        <>
          {workoutId ? null : (
            <div className="-mx-1 mb-2 overflow-x-auto px-1 scrollbar-hide">
              <div className="flex w-max gap-1.5">
                {lifts.map(({ exercise }) => {
                  const active = exercise.workoutId === current.exercise.workoutId;
                  return (
                    <button
                      key={exercise.workoutId}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setPicked(exercise.workoutId)}
                      className={cn(
                        "min-h-[44px] whitespace-nowrap rounded-full px-3.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        active ? "bg-brand/15 text-brand ring-1 ring-brand/40" : "bg-muted text-muted-foreground"
                      )}
                    >
                      {exercise.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Two charts on one time axis, never one chart with two scales: a
              second y-axis lets any two lines cross wherever the scales put
              them. `syncId` keeps the crosshair on the same session in both. */}
          <p className="text-xs font-semibold text-muted-foreground">Weight (kg)</p>
          <ResponsiveContainer width="100%" height={150}>
            <LineChart
              data={current.points}
              syncId="weight-reps"
              margin={{ top: 8, right: 0, bottom: 0, left: -4 }}
            >
              <CartesianGrid {...gridProps} />
              <XAxis {...axisProps} dataKey="date" tickFormatter={formatDayKey} hide />
              <YAxis
                {...axisProps}
                width={44}
                // Whole tens and four ticks, so the steps are even: 110, 130, 150, 170.
                domain={[
                  (dataMin: number) => Math.max(0, Math.floor((dataMin - 5) / 10) * 10),
                  (dataMax: number) => Math.ceil((dataMax + 5) / 10) * 10
                ]}
                tickCount={4}
                allowDecimals={false}
                tickFormatter={(value: number) => `${Math.round(value)}`}
              />
              <Tooltip cursor={{ stroke: CHART.axis, strokeWidth: 1 }} content={<SetTooltip />} />
              <Line
                {...animationProps}
                type="monotone"
                dataKey="weight"
                name="Weight"
                stroke={CHART.accent}
                strokeWidth={2}
                dot={{ r: 2.5, fill: CHART.accent, strokeWidth: 0 }}
                activeDot={{ r: 4, strokeWidth: 2, stroke: CHART.surface }}
              />
            </LineChart>
          </ResponsiveContainer>

          <p className="mt-3 text-xs font-semibold text-muted-foreground">Reps in that set</p>
          <ResponsiveContainer width="100%" height={100}>
            <BarChart
              data={current.points}
              syncId="weight-reps"
              margin={{ top: 4, right: 0, bottom: 0, left: -4 }}
            >
              <CartesianGrid {...gridProps} />
              <XAxis {...axisProps} dataKey="date" tickFormatter={formatDayKey} />
              <YAxis {...axisProps} width={44} allowDecimals={false} />
              <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} content={<SetTooltip />} />
              <Bar
                {...animationProps}
                dataKey="reps"
                name="Reps"
                fill={CHART.series[1]}
                radius={[3, 3, 0, 0]}
                maxBarSize={14}
              />
            </BarChart>
          </ResponsiveContainer>
        </>
      )}
    </Panel>
  );
}

function setCopy(point: WeightRepsPoint) {
  return `${point.weight} kg × ${point.reps}`;
}

/** "60 kg × 8 reps" — the way a lifter says a set, not two separate numbers. */
function SetTooltip({ active, payload, label }: Partial<TooltipContentProps<number, string>>) {
  const point = payload?.[0]?.payload as WeightRepsPoint | undefined;

  if (!active || !point) {
    return null;
  }

  return (
    <div className="plaque rounded-lg px-3 py-2">
      <p className="text-xs font-semibold text-muted-foreground">{formatDayKey(String(label ?? point.date))}</p>
      <p className="mt-1 text-sm font-semibold tabular-nums">
        {point.weight} kg × {point.reps} {point.reps === 1 ? "rep" : "reps"}
      </p>
    </div>
  );
}

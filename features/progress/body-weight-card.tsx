"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import {
  CHART,
  ChartTooltip,
  EmptyChart,
  animationProps,
  axisProps,
  gridProps
} from "@/features/progress/chart-theme";
import { Panel } from "@/features/progress/panel";
import { goalDomain, hasGoal, seriesFor, withMovingAverage } from "@/lib/body-metrics";
import { formatDayKey } from "@/lib/progress-metrics";
import type { BodyMeasurement } from "@/lib/types";

export function BodyWeightCard({
  measurements,
  goalWeightKg
}: {
  measurements: BodyMeasurement[];
  goalWeightKg?: number;
}) {
  const points = withMovingAverage(seriesFor(measurements, "weight"));

  return (
    <Panel
      title="Bodyweight"
      caption="Every weigh-in, with a 7-day average"
      note={
        <>
          The line is a trailing 7-day mean; the dots are what the scale actually said. Day-to-day
          bodyweight is mostly water, so the raw readings are noise you should not react to — the
          average is the part that trends. The axis deliberately does not start at zero: bodyweight
          moves 2–3%, and a zero-based axis renders a year of real change as a flat line. Set a
          goal on Profile and it is drawn as a dashed line the axis always makes room for — a
          target you are heading towards, not a prediction that you will.
        </>
      }
    >
      {points.length > 0 ? (
        <ResponsiveContainer width="100%" height={190}>
          <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid {...gridProps} />
            <XAxis {...axisProps} dataKey="date" tickFormatter={formatDayKey} />
            <YAxis
              {...axisProps}
              width={44}
              domain={goalDomain(points, goalWeightKg)}
              tickFormatter={(value: number) => value.toFixed(1)}
            />
            <Tooltip
              cursor={{ stroke: CHART.axis, strokeWidth: 1 }}
              content={
                <ChartTooltip
                  unit="kg"
                  format={(value) => value.toFixed(1)}
                  labelFormat={formatDayKey}
                />
              }
            />
            <Line
              {...animationProps}
              type="monotone"
              dataKey="value"
              name="Reading"
              stroke={CHART.quiet}
              strokeWidth={0}
              dot={{ r: 2, fill: CHART.quiet }}
            />
            <Line
              {...animationProps}
              type="monotone"
              dataKey="average"
              name="7-day average"
              stroke={CHART.accent}
              strokeWidth={2}
              dot={false}
            />
            {/* Annotation, not a series — so it takes the axis colour rather
                than a series one, and dashes to say it was never measured.
                `CHART.quiet` is already the weigh-in dots on this chart and
                would read as one of them. */}
            {hasGoal(goalWeightKg) ? (
              <ReferenceLine
                y={goalWeightKg}
                stroke={CHART.axis}
                strokeDasharray="4 4"
                label={{
                  // One decimal, like every tick on this axis — a goal typed
                  // as "75.55" next to ticks reading 79.0 looks like a bug.
                  value: `Goal ${goalWeightKg.toFixed(1)} kg`,
                  // Right, not left: the left edge is where the Y tick labels
                  // sit, and a goal near a tick would print on top of it.
                  position: "insideTopRight",
                  fill: CHART.axis,
                  fontSize: 10,
                  fontFamily: "var(--font-sans)"
                }}
              />
            ) : null}
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <EmptyChart>No weigh-ins yet. Record one on Profile.</EmptyChart>
      )}
    </Panel>
  );
}

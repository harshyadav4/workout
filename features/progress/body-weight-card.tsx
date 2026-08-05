"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
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
import { seriesFor, withMovingAverage } from "@/lib/body-metrics";
import { formatDayKey } from "@/lib/progress-metrics";
import type { BodyMeasurement } from "@/lib/types";

export function BodyWeightCard({ measurements }: { measurements: BodyMeasurement[] }) {
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
          moves 2–3%, and a zero-based axis renders a year of real change as a flat line.
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
              domain={["dataMin - 1", "dataMax + 1"]}
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
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <EmptyChart>No weigh-ins yet. Record one on Profile.</EmptyChart>
      )}
    </Panel>
  );
}

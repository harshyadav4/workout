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
  gridProps,
  useSection
} from "@/features/progress/chart-theme";
import type { GoalEta } from "@/lib/progress-extras";
import { Panel } from "@/features/progress/panel";
import { goalDomain, hasGoal, seriesFor, withMovingAverage } from "@/lib/body-metrics";
import { formatDayKey } from "@/lib/progress-metrics";
import type { BodyMeasurement } from "@/lib/types";

export function BodyWeightCard({
  measurements,
  goalWeightKg,
  eta
}: {
  measurements: BodyMeasurement[];
  goalWeightKg?: number;
  /** When the goal arrives at the recent pace, if it does. */
  eta?: GoalEta;
}) {
  const { accent } = useSection();
  const points = withMovingAverage(seriesFor(measurements, "weight"));

  return (
    <Panel
      title="Bodyweight"
      caption="Every weigh-in, with a 7-day average"
      note={
        <>
          The dots show what the scale said. The line shows your average of the last 7 days. Your
          weight changes from day to day, mostly because of water, so watch the line, not the dots.
          The chart does not start at zero, so small real changes are easy to see. Set a goal weight
          on Profile, and it shows as a dashed line.
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
              name="Weigh-in"
              stroke={CHART.quiet}
              strokeWidth={0}
              dot={{ r: 2, fill: CHART.quiet }}
            />
            <Line
              {...animationProps}
              type="monotone"
              dataKey="average"
              name="7-day average"
              stroke={accent}
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

      {/* An estimate, and it says so: a straight line through eight weeks
          knows nothing about holidays. */}
      {eta && goalWeightKg ? (
        <p
          className="mt-3 rounded-xl px-3 py-2 text-xs leading-relaxed ring-1"
          style={{ backgroundColor: `${accent}1a`, ["--tw-ring-color" as string]: `${accent}40` }}
        >
          <span className="font-semibold" style={{ color: accent }}>
            Goal date estimate: {formatLongDate(eta.date)}
          </span>{" "}
          <span className="text-muted-foreground">
            — at your pace of the last 8 weeks ({eta.perWeek > 0 ? "+" : ""}
            {eta.perWeek.toFixed(1)} kg a week), you reach {goalWeightKg.toFixed(1)} kg around then.
            It is an estimate, not a promise.
          </span>
        </p>
      ) : null}
    </Panel>
  );
}

function formatLongDate(key: string) {
  return new Date(`${key}T00:00:00Z`).toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  });
}

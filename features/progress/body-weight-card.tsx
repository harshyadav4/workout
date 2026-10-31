"use client";

import { useId } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
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
import { hasGoal, seriesFor, withMovingAverage } from "@/lib/body-metrics";
import { formatDayKey } from "@/lib/progress-metrics";
import type { BodyMeasurement } from "@/lib/types";

/** "76", not "76.0"; a typed "75.5" keeps its half. */
function shortKg(value: number) {
  return `${Number(value.toFixed(1))}`;
}

/** Whole kilos on the axis, holding every weigh-in and the goal. */
function weightScale(values: number[], goal?: number) {
  const all = hasGoal(goal) ? [...values, goal] : values;
  const low = Math.floor(Math.min(...all));
  const high = Math.ceil(Math.max(...all));
  const step = high - low > 12 ? 5 : high - low > 6 ? 2 : 1;
  const ticks: number[] = [];
  for (let tick = Math.ceil(low / step) * step; tick <= high; tick += step) {
    ticks.push(tick);
  }
  return { domain: [low - 1, high] as [number, number], ticks };
}

function goalLine(latest: number, goal: number) {
  const left = Math.abs(latest - goal);
  return left < 0.05 ? `At your goal of ${shortKg(goal)} kg` : `${left.toFixed(1)} kg to your goal of ${shortKg(goal)} kg`;
}

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
  const id = `area${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const points = withMovingAverage(seriesFor(measurements, "weight"));
  const latest = points[points.length - 1]?.value;
  const scale = weightScale(points.map((point) => point.value), goalWeightKg);

  return (
    <Panel
      title="Bodyweight"
      note={
        <>
          The dots are your weigh-ins. Daily weight moves with water, so trust the line: it is your
          7-day average. Set a goal weight on You to see it as a dashed line.
        </>
      }
    >
      {points.length > 0 ? (
        <>
          <p className="plot-n">
            {latest.toFixed(1)}
            <span className="ml-1.5 text-[15px] font-normal text-muted-foreground">kg</span>
          </p>
          {hasGoal(goalWeightKg) ? (
            <p className="mt-0.5 text-[13.5px] text-muted-foreground">{goalLine(latest, goalWeightKg)}</p>
          ) : null}

          <div className="mt-3">
            <ResponsiveContainer width="100%" height={170}>
              <ComposedChart data={points} margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" style={{ stopColor: accent, stopOpacity: 0.24 }} />
                    <stop offset="1" style={{ stopColor: accent, stopOpacity: 0 }} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...gridProps} />
                <XAxis {...axisProps} dataKey="date" tickFormatter={formatDayKey} />
                <YAxis
                  {...axisProps}
                  orientation="right"
                  width={34}
                  domain={scale.domain}
                  ticks={scale.ticks}
                  interval={0}
                />
                <Tooltip
                  cursor={{ stroke: CHART.axis, strokeWidth: 1 }}
                  content={
                    <ChartTooltip
                      unit=" kg"
                      format={(value) => value.toFixed(1)}
                      labelFormat={formatDayKey}
                    />
                  }
                />
                {/* Annotation, not a series — so it takes the axis colour rather
                    than a series one, and dashes to say it was never measured. */}
                {hasGoal(goalWeightKg) ? (
                  <ReferenceLine y={goalWeightKg} stroke={CHART.axis} strokeDasharray="2 4" />
                ) : null}
                <Line
                  {...animationProps}
                  type="monotone"
                  dataKey="value"
                  name="Weigh-in"
                  stroke={CHART.quiet}
                  strokeWidth={0}
                  dot={{ r: 1.5, fill: CHART.quiet, strokeWidth: 0 }}
                  activeDot={false}
                />
                <Area
                  {...animationProps}
                  type="monotone"
                  dataKey="average"
                  name="7-day average"
                  stroke={accent}
                  strokeWidth={2}
                  fill={`url(#${id})`}
                  // Where you are now: one dot, at the end of the line.
                  dot={({ index, cx, cy }: { index?: number; cx?: number; cy?: number }) =>
                    index === points.length - 1 ? (
                      <circle key="now" cx={cx} cy={cy} r={3.5} fill={accent} />
                    ) : (
                      <g key={index} />
                    )
                  }
                  activeDot={{ r: 3.5, fill: accent, strokeWidth: 0 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </>
      ) : (
        <EmptyChart>No weigh-ins yet. Add one on You.</EmptyChart>
      )}

      {/* An estimate, and it says so: a straight line through eight weeks
          knows nothing about holidays. */}
      {eta && goalWeightKg ? (
        <p className="mt-3 text-[13.5px] leading-snug">
          <span className="font-medium">Goal by about {formatLongDate(eta.date)}.</span>{" "}
          <span className="text-muted-foreground">
            At your 8-week pace of {eta.perWeek > 0 ? "+" : ""}
            {eta.perWeek.toFixed(1)} kg a week.
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

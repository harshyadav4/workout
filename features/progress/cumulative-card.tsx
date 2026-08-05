"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceArea,
  ReferenceDot,
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
  formatCompact,
  gridProps
} from "@/features/progress/chart-theme";
import { Panel } from "@/features/progress/panel";
import { formatDayKey, weekStartKey } from "@/lib/progress-metrics";
import type { CumulativePoint, Milestone } from "@/lib/progress-trends";
import { formatVolume } from "@/lib/utils";

/**
 * Every kilo you have ever moved, since the first log.
 *
 * The only figure on this page with any weight to it. "You have moved 1.2
 * million kilograms" is a sentence; "42,300 kg this month" is a measurement, and
 * the page was entirely measurements.
 *
 * A running total only goes up, so the curve's shape is never the reading — the
 * milestones and the total are, which is why the crossings are the only labelled
 * points. Lifetime, like everything else in this file: a cumulative total that
 * restarts at the left edge of a date picker is just the range's volume again,
 * and the hero already prints that.
 */
export function CumulativeCard({
  points,
  milestones,
  total
}: {
  points: CumulativePoint[];
  milestones: Milestone[];
  total: number;
}) {
  const highlight = points.filter((point) => point.inWindow);
  const last = milestones[milestones.length - 1];

  return (
    <Panel
      title="Everything you have lifted"
      caption={last ? `Past ${last.label} kg since you started` : "Since your first logged set"}
      note={
        <>
          The running total of every kilo in every set, from your first log to today. It ignores the
          range picker — a lifetime total that restarts when you drag a date is not a lifetime
          total. The shaded region is the range you picked. No previous-year line: there is one year
          of history here, so a comparison would be invented rather than measured.
        </>
      }
    >
      <p className="font-mono text-[2.5rem] font-bold leading-none tracking-tight tabular-nums">
        {formatVolume(total)}
        <span className="ml-1.5 align-baseline text-base font-medium text-muted-foreground">
          kg
        </span>
      </p>

      {points.length < 2 ? (
        <EmptyChart>Not enough history to draw a line yet.</EmptyChart>
      ) : (
        <ResponsiveContainer width="100%" height={150}>
          <AreaChart data={points} margin={{ top: 18, right: 10, bottom: 0, left: -14 }}>
            <defs>
              <linearGradient id="cumulative-wash" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART.accent} stopOpacity={0.26} />
                <stop offset="100%" stopColor={CHART.accent} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid {...gridProps} />
            <XAxis {...axisProps} dataKey="key" tickFormatter={formatDayKey} />
            <YAxis {...axisProps} width={40} tickFormatter={formatCompact} />

            {highlight.length > 0 ? (
              <ReferenceArea
                x1={highlight[0].key}
                x2={highlight[highlight.length - 1].key}
                fill="rgba(255,255,255,0.04)"
                stroke="none"
              />
            ) : null}

            <Tooltip
              cursor={{ stroke: CHART.axis, strokeWidth: 1 }}
              content={
                <ChartTooltip
                  labelFormat={(key) => `By ${formatDayKey(key)}`}
                  format={formatCompact}
                  unit=" kg"
                />
              }
            />
            <Area
              {...animationProps}
              type="monotone"
              dataKey="total"
              name="Lifetime"
              stroke={CHART.accent}
              strokeWidth={2}
              fill="url(#cumulative-wash)"
              activeDot={{ r: 4, strokeWidth: 2, stroke: CHART.surface }}
            />

            {/* Only the crossings get a label. A number on every week would be
                a table drawn badly. */}
            {milestones.map((milestone) => (
              <ReferenceDot
                key={milestone.label}
                x={weekStartKey(milestone.date)}
                y={milestone.value}
                r={3}
                fill={CHART.series[1]}
                stroke={CHART.surface}
                strokeWidth={2}
                label={{
                  value: milestone.label,
                  position: "top",
                  fill: "rgba(226,232,240,0.75)",
                  fontSize: 10,
                  fontFamily: "var(--font-mono)"
                }}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      )}
    </Panel>
  );
}

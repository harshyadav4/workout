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
      title="All-time weight lifted"
      caption={last ? `Over ${last.label} kg so far` : "Since your first set"}
      note={
        <>
          Every set since your first workout. The range does not change it; the light area marks
          the range you picked.
        </>
      }
    >
      <p className="plot-n">
        {formatVolume(total)}
        <span className="ml-1.5 text-[15px] font-normal text-muted-foreground">
          kg
        </span>
      </p>

      {points.length < 2 ? (
        <EmptyChart>Not enough data yet.</EmptyChart>
      ) : (
        <ResponsiveContainer width="100%" height={150}>
          <AreaChart data={points} margin={{ top: 18, right: 10, bottom: 0, left: -4 }}>
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
                fill={CHART.wash}
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
              name="All-time total"
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
                  fontFamily: "var(--font-sans)"
                }}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      )}
    </Panel>
  );
}

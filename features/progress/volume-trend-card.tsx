"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Panel } from "@/features/progress/panel";
import {
  CHART,
  ChartTooltip,
  EmptyChart,
  animationProps,
  axisProps,
  formatCompact,
  gridProps
} from "@/features/progress/chart-theme";
import { formatDayKey, type Bucket, type TrendPoint } from "@/lib/progress-metrics";

export function VolumeTrendCard({ points, bucket }: { points: TrendPoint[]; bucket: Bucket }) {
  const worked = points.some((point) => point.volume > 0);

  return (
    <Panel
      title="Weight lifted"
      caption={`Total kilos you lifted each ${bucket === "week" ? "week" : "day"} (weight × reps × sets)`}
      note={
        <>
          Every {bucket} in the range is on the chart, also the ones without training. So a break
          from training shows as a dip to zero. A line that goes up over time means you are doing
          more work.
        </>
      }
    >
      {worked ? (
          <ResponsiveContainer width="100%" height={190}>
            <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
              <defs>
                <linearGradient id="volume-wash" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CHART.accent} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={CHART.accent} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid {...gridProps} />
              <XAxis {...axisProps} dataKey="key" tickFormatter={formatDayKey} />
              <YAxis {...axisProps} width={44} tickFormatter={formatCompact} />
              <Tooltip
                cursor={{ stroke: CHART.axis, strokeWidth: 1 }}
                content={<ChartTooltip labelFormat={formatDayKey} unit=" kg" />}
              />
              <Area
                {...animationProps}
                type="monotone"
                dataKey="volume"
                name="Weight lifted"
                stroke={CHART.accent}
                strokeWidth={2}
                fill="url(#volume-wash)"
                activeDot={{ r: 4, strokeWidth: 2, stroke: CHART.surface }}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
        <EmptyChart>No sessions in this range. Pick a longer range, or go train.</EmptyChart>
      )}
    </Panel>
  );
}

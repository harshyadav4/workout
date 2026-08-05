"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
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
import { formatDayKey } from "@/lib/progress-metrics";
import { CHRONIC_WEEKS, LOAD_BAND, type LoadPoint } from "@/lib/progress-trends";

/**
 * How heavy this week was against your own last month.
 *
 * Lifetime, not scoped — the point needs the four weeks *behind* it, which at a
 * 4W range do not exist inside the slice. The selected window is drawn as a
 * shaded region instead of being used as a filter, so the baseline is always
 * real. That is the whole reason this card lives in `progress-trends.ts`.
 *
 * Two series on two scales: the ratio reads against the band, and the chronic
 * load sits behind it in teal so the number and the thing it is a ratio *of* are
 * on one card. Teal is the page's baseline colour everywhere, never a second
 * value.
 *
 * The first four weeks have no line at all. A ratio computed against a baseline
 * that includes its own numerator lands on 1.0 by construction, and a flat line
 * at 1.0 looks like a finding rather than an absence.
 */
export function LoadCard({ points }: { points: LoadPoint[] }) {
  const warm = points.filter((point) => point.ratio !== undefined);
  const latest = warm[warm.length - 1];
  const highlight = points.filter((point) => point.inWindow);

  return (
    <Panel
      title="Load spike"
      caption={
        latest
          ? `This week is ${latest.ratio!.toFixed(2)}× your ${CHRONIC_WEEKS}-week average`
          : "Needs a month of history"
      }
      note={
        <>
          Each point is one week&apos;s tonnage divided by the average of the {CHRONIC_WEEKS} weeks
          ending with it. Above the band the week was much heavier than you have been training;
          below it you are drifting down. The shaded region is the range you picked above — this
          chart always draws your whole history, because a ratio needs the weeks before the window
          to mean anything. <strong>Not an injury-risk score:</strong> the 0.8–1.3 figure comes from
          team-sport monitoring and the research on it is contested. It is a spike detector against
          your own baseline, nothing more.
        </>
      }
    >
      {warm.length < 2 ? (
        <EmptyChart>
          A month of logs is needed before a week can be compared to a baseline.
        </EmptyChart>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <ComposedChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
            <CartesianGrid {...gridProps} />
            <XAxis {...axisProps} dataKey="key" tickFormatter={formatDayKey} />
            <YAxis {...axisProps} yAxisId="ratio" width={34} domain={[0, "dataMax + 0.3"]} />
            {/* Function form: recharts only parses `dataMax + N` from a string,
                so `dataMax * 3` would have been dropped and the chronic area
                scaled to the ratio axis. Three times keeps it a low backdrop. */}
            <YAxis yAxisId="load" hide domain={[0, (dataMax: number) => dataMax * 3]} />

            {highlight.length > 0 ? (
              <ReferenceArea
                yAxisId="ratio"
                x1={highlight[0].key}
                x2={highlight[highlight.length - 1].key}
                fill="rgba(255,255,255,0.04)"
                stroke="none"
              />
            ) : null}

            <ReferenceArea
              yAxisId="ratio"
              y1={LOAD_BAND.low}
              y2={LOAD_BAND.high}
              fill="rgba(255,255,255,0.05)"
              stroke="rgba(255,255,255,0.10)"
            />
            <ReferenceLine
              yAxisId="ratio"
              y={1}
              stroke={CHART.series[1]}
              strokeDasharray="3 3"
              strokeWidth={1}
            />

            <Area
              {...animationProps}
              yAxisId="load"
              type="monotone"
              dataKey="chronic"
              name="4-week average"
              stroke="none"
              fill={CHART.series[1]}
              fillOpacity={0.1}
            />
            <Line
              {...animationProps}
              yAxisId="ratio"
              type="monotone"
              dataKey="ratio"
              name="vs baseline"
              stroke={CHART.accent}
              strokeWidth={2}
              dot={false}
              connectNulls={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: CHART.surface }}
            />

            <Tooltip
              cursor={{ stroke: CHART.axis, strokeWidth: 1 }}
              content={
                <ChartTooltip
                  labelFormat={(key) => `Week of ${formatDayKey(key)}`}
                  format={(value) => (value > 5 ? `${Math.round(value)} kg` : `${value.toFixed(2)}×`)}
                />
              }
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </Panel>
  );
}

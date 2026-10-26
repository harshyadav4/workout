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
      title="This week vs normal"
      caption={latest ? loadCopy(latest.ratio!) : undefined}
      note={
        <>
          1.0 is a normal week: your average over the last {CHRONIC_WEEKS} weeks. Above the grey
          band is a sudden jump; below it is a light week. The light area is the range you picked.{" "}
          <strong>This is not an injury score.</strong>
        </>
      }
    >
      {warm.length < 2 ? (
        <EmptyChart>Train for 1 month to see this.</EmptyChart>
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
              name="Normal week"
              stroke="none"
              fill={CHART.series[1]}
              fillOpacity={0.1}
            />
            <Line
              {...animationProps}
              yAxisId="ratio"
              type="monotone"
              dataKey="ratio"
              name="Vs normal"
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

/** The ratio in words: a number like 0.84× means nothing on its own. */
function loadCopy(ratio: number) {
  const percent = Math.round(Math.abs(ratio - 1) * 100);

  if (ratio > LOAD_BAND.high) {
    return `${percent}% harder than normal — a big jump`;
  }

  if (ratio < LOAD_BAND.low) {
    return `${percent}% lighter than normal`;
  }

  return "Close to your normal week";
}

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
  animationProps,
  axisProps,
  gridProps
} from "@/features/progress/chart-theme";
import { Panel } from "@/features/progress/panel";
import { hasAny, labelFor, mergeSeries, sitesForMuscle } from "@/lib/body-metrics";
import { formatDayKey } from "@/lib/progress-metrics";
import { buildGirthCallout } from "@/lib/progress-trends";
import type { BodyMeasurement, MuscleId, WorkoutLog } from "@/lib/types";

/**
 * The tape measurement for the muscle you drilled into — the physical answer to
 * the volume chart above it. Renders nothing at all when the muscle has no
 * measurable site (a tape around a lat is not a measurement anyone takes) or
 * when nothing has been recorded, rather than adding an empty card to a panel
 * whose whole design note is that four empty cards was the original complaint.
 */
export function MuscleGirthCard({
  name,
  muscleId,
  measurements,
  logs
}: {
  name: string;
  muscleId: MuscleId;
  measurements: BodyMeasurement[];
  /** Volume for this muscle, for the callout. Omitted, the callout is absent. */
  logs?: WorkoutLog[];
}) {
  const sites = sitesForMuscle(muscleId);

  if (sites.length === 0 || !hasAny(measurements, sites)) {
    return null;
  }

  const rows = mergeSeries(measurements, sites);
  // The loop no competitor closes. Absent entirely below the data threshold —
  // see buildGirthCallout for why that is a hard gate and not a hedge.
  const callout = logs
    ? buildGirthCallout(
        logs,
        measurements.filter((item) => sites.includes(item.metric))
      )
    : undefined;

  return (
    <Panel
      title="Measurements"
      caption={sites.length > 1 ? "Tape size, left and right, in cm" : "Tape size in cm"}
      note={
        <>
          Left and right have separate lines. The axis does not start at 0, so a 1 cm change is
          easy to see.
        </>
      }
    >
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
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
                unit="cm"
                format={(value) => value.toFixed(1)}
                labelFormat={formatDayKey}
              />
            }
          />
          {sites.map((site, index) => (
            <Line
              key={site}
              {...animationProps}
              type="monotone"
              dataKey={site}
              name={labelFor(site)}
              stroke={CHART.series[index % CHART.series.length]}
              strokeWidth={2}
              dot={{ r: 2 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      {callout ? (
        <p className="mt-3 text-[13px] leading-snug">
          <span className="font-medium">
            Over {callout.weeks} weeks: weight lifted {callout.volumeChangePct >= 0 ? "up" : "down"}{" "}
            {Math.abs(Math.round(callout.volumeChangePct))}%, {name.toLowerCase()}{" "}
            {callout.girthChangeCm >= 0 ? "up" : "down"}{" "}
            {Math.abs(callout.girthChangeCm).toFixed(1)}cm.
          </span>{" "}
          <span className="text-muted-foreground">
            This shows what changed, not why.
          </span>
        </p>
      ) : null}
    </Panel>
  );
}

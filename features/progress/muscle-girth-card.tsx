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
import type { BodyMeasurement, MuscleId } from "@/lib/types";

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
  measurements
}: {
  name: string;
  muscleId: MuscleId;
  measurements: BodyMeasurement[];
}) {
  const sites = sitesForMuscle(muscleId);

  if (sites.length === 0 || !hasAny(measurements, sites)) {
    return null;
  }

  const rows = mergeSeries(measurements, sites);

  return (
    <Panel
      title={`${name} — measured`}
      caption={sites.length > 1 ? "Left and right, in cm" : "Circumference in cm"}
      note={
        <>
          What the tape says, against the training above it. Left and right are plotted separately
          because averaging them hides the asymmetry that is the main thing a tape catches and a
          mirror doesn&apos;t. The axis does not start at zero — a limb gains a centimetre over
          months, which a zero-based axis would flatten into a straight line. A date where you
          measured one side and not the other is bridged rather than broken: tape readings are
          sparse enough that breaking the line would leave you reading loose dots.
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
    </Panel>
  );
}

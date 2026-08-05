"use client";

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import {
  CHART,
  ChartTooltip,
  EmptyChart,
  GROUP_COLORS,
  animationProps,
  axisProps
} from "@/features/progress/chart-theme";
import { Panel } from "@/features/progress/panel";
import { formatColumnKey, type SplitDrift } from "@/lib/progress-trends";

/**
 * How the split got to where it is.
 *
 * `MuscleSplitCard` answers "what is my split now" — one snapshot of the whole
 * range. This answers "what has it been doing all year", which is a different
 * question and the one that catches a programme quietly turning into
 * bench-and-curls, or a specialisation block you meant to end in March.
 *
 * Shares, not tonnage. Stacked raw volume makes a heavy month look like a change
 * of emphasis when the mix never moved at all; normalised to 100% the only thing
 * that can move the shape is the mix, which is the subject.
 *
 * This is the one chart on the page with six series, so it is the one place the
 * categorical palette earns its keep. The legend prints the current share
 * alongside each swatch, so no reading depends on telling two hues apart.
 */
export function SplitDriftCard({ drift }: { drift: SplitDrift }) {
  const worked = drift.rows.some((row) =>
    drift.groups.some((group) => row[group.group] > 0)
  );
  const last = drift.rows[drift.rows.length - 1];

  return (
    <Panel
      title="How the split drifted"
      caption={`Share of volume per ${drift.bucket}`}
      note={
        <>
          Each band is one muscle group&apos;s share of that {drift.bucket}&apos;s volume, weighted
          by how hard every lift works the group. Normalised to 100%, so a heavy month and a light
          month are the same height and the only thing that can change the shape is the mix itself.
          A {drift.bucket} you did not train sits at zero rather than being skipped — a gap is data.
        </>
      }
    >
      {!worked ? (
        <EmptyChart>Nothing logged in this range.</EmptyChart>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={170}>
            <AreaChart data={drift.rows} margin={{ top: 4, right: 6, bottom: 0, left: -26 }}>
              <XAxis
                {...axisProps}
                dataKey="key"
                tickFormatter={(key: string) => formatColumnKey(key, drift.bucket)}
              />
              <YAxis {...axisProps} width={34} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
              <Tooltip
                cursor={{ stroke: CHART.axis, strokeWidth: 1 }}
                content={
                  <ChartTooltip
                    labelFormat={(key) => formatColumnKey(key, drift.bucket)}
                    format={(value) => `${Math.round(value)}%`}
                  />
                }
              />
              {drift.groups.map((group) => (
                <Area
                  {...animationProps}
                  key={group.group}
                  type="monotone"
                  dataKey={group.group}
                  name={group.label}
                  stackId="split"
                  stroke={GROUP_COLORS[group.group]}
                  strokeWidth={1}
                  fill={GROUP_COLORS[group.group]}
                  fillOpacity={0.72}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>

          {/* Six hues need a key, and the key carries the number so nothing here
              is read by colour alone. */}
          <ul className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1">
            {drift.groups.map((group) => (
              <li key={group.group} className="flex items-center gap-1.5">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: GROUP_COLORS[group.group] }}
                  aria-hidden
                />
                <span className="truncate text-[11px] text-muted-foreground">{group.label}</span>
                <span className="ml-auto shrink-0 font-mono text-[10px] tabular-nums">
                  {Math.round(last?.[group.group] ?? 0)}%
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}

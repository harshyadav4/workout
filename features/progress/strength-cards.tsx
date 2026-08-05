"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
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
  formatKg,
  gridProps
} from "@/features/progress/chart-theme";
import {
  formatDayKey,
  type StrengthGrowth,
  type TopSetPoint
} from "@/lib/progress-metrics";
import { Panel } from "@/features/progress/panel";

const GROWTH_LIMIT = 8;

/**
 * First top set → latest top set, one row per lift: the *before → after per
 * item* form, which is what "am I getting stronger" actually asks.
 *
 * One shared 0→heaviest scale across every row, so a row's position says how
 * heavy the lift is and its span says how much it moved. A per-row scale would
 * make a 4 kg curl gain look like a 40 kg deadlift gain.
 */
export function StrengthGrowthCard({ growth }: { growth: StrengthGrowth[] }) {
  const rows = growth.slice(0, GROWTH_LIMIT);
  const ceiling = rows.reduce((peak, row) => Math.max(peak, row.first, row.last), 0);

  return (
    <Panel
      title="Strength growth"
      caption="First session to latest, per lift, steepest gain first"
      note={
        <>
          One shared 0-to-heaviest scale across every row, so a row&apos;s position says how heavy
          the lift is and its span says how far it moved — a per-row scale would make a 4 kg curl
          gain look like a 40 kg deadlift gain. Top set lifted, not an estimated 1RM: a log stores
          reps for the whole exercise rather than per set, so Epley here would be fiction dressed as
          precision.
        </>
      }
    >
      <div className="space-y-4">
        {rows.length === 0 ? (
          <EmptyChart>
            Two sessions of the same lift are needed before there is a trend to draw.
          </EmptyChart>
        ) : null}

        {rows.map((row) => {
          const gained = row.last >= row.first;
          const from = (Math.min(row.first, row.last) / ceiling) * 100;
          const to = (Math.max(row.first, row.last) / ceiling) * 100;

          return (
            <div key={row.workoutId}>
              <div className="flex items-baseline justify-between gap-3">
                <p className="truncate text-sm font-medium">{row.name}</p>
                <p
                  className={`font-mono text-xs tabular-nums ${
                    gained ? "text-[#3fbf6f]" : "text-[#e8785a]"
                  }`}
                >
                  {gained ? "+" : ""}
                  {row.changePercent.toFixed(0)}%
                </p>
              </div>

              <div className="relative mt-2 h-4">
                <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/5" />
                <div
                  className="absolute top-1/2 h-0.5 -translate-y-1/2 rounded-full"
                  style={{
                    left: `${from}%`,
                    width: `${Math.max(to - from, 0.5)}%`,
                    backgroundColor: gained ? CHART.accent : CHART.quiet
                  }}
                />
                <Knob position={(row.first / ceiling) * 100} color={CHART.quiet} label="first" />
                <Knob
                  position={(row.last / ceiling) * 100}
                  color={gained ? CHART.accent : CHART.quiet}
                  label="latest"
                />
              </div>

              <p className="mt-1.5 font-mono text-[11px] tabular-nums text-muted-foreground">
                {row.first} → {row.last} kg · {row.sessions} sessions
              </p>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

/** The 2px surface ring keeps the two knobs legible where they nearly overlap. */
function Knob({ position, color, label }: { position: number; color: string; label: string }) {
  return (
    <span
      className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2"
      style={{ left: `${position}%`, backgroundColor: color, "--tw-ring-color": CHART.surface } as React.CSSProperties}
      aria-label={label}
    />
  );
}

/**
 * The heaviest set of one lift over time. The personal best is the only
 * directly labelled point — a number on every dot goes unread.
 */
export function TopSetCard({
  points,
  name
}: {
  points: TopSetPoint[];
  name?: string;
}) {
  return (
    <Panel title={`Top set · ${name ?? "—"}`} caption="The heaviest set of every session">
      <TopSetChart points={points} />
    </Panel>
  );
}

/** The line on its own, so a card that already has a header can borrow it. */
export function TopSetChart({ points }: { points: TopSetPoint[] }) {
  const best = points.reduce<TopSetPoint | undefined>(
    (peak, point) => (point.weight > (peak?.weight ?? 0) ? point : peak),
    undefined
  );

  return (
    <>
      {points.length < 2 ? (
          <EmptyChart>Not enough sessions of this lift yet.</EmptyChart>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={points} margin={{ top: 16, right: 16, bottom: 0, left: -12 }}>
              <CartesianGrid {...gridProps} />
              <XAxis {...axisProps} dataKey="date" tickFormatter={formatDayKey} />
              <YAxis {...axisProps} width={40} domain={["dataMin - 5", "dataMax + 5"]} />
              <Tooltip
                cursor={{ stroke: CHART.axis, strokeWidth: 1 }}
                content={<ChartTooltip labelFormat={formatDayKey} format={formatKg} />}
              />
              <Line
                {...animationProps}
                type="monotone"
                dataKey="weight"
                name="Top set"
                stroke={CHART.accent}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: CHART.surface }}
              />
              {best ? (
                <ReferenceDot
                  x={best.date}
                  y={best.weight}
                  r={4}
                  fill={CHART.accent}
                  stroke={CHART.surface}
                  strokeWidth={2}
                  label={{
                    value: `PB ${best.weight} kg`,
                    position: "top",
                    fill: "rgba(226,232,240,0.75)",
                    fontSize: 10,
                    fontFamily: "var(--font-mono)"
                  }}
                />
              ) : null}
            </LineChart>
          </ResponsiveContainer>
        )}
    </>
  );
}

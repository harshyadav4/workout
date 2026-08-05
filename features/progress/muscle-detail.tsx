"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
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
import {
  WEEKLY_SET_TARGET,
  formatDayKey,
  type Bucket,
  type RestStats,
  type TrendPoint
} from "@/lib/progress-metrics";
import { Bullet } from "@/features/progress/bullet";
import { Panel } from "@/features/progress/panel";

export interface MuscleFacts {
  name: string;
  rank: number;
  total: number;
  share: number;
  setsPerWeek: number;
  sessions: number;
  rest: RestStats;
}

/**
 * The plaque under the figure: what you tapped, and the three numbers that
 * answer "am I training this enough, and when did I last touch it".
 */
export function MuscleHeroFooter({
  facts,
  onClear
}: {
  facts?: MuscleFacts;
  onClear: () => void;
}) {
  if (!facts) {
    return (
      <div className="mt-4 rounded-3xl bg-secondary/50 p-4 text-center">
        <p className="text-sm font-medium">Tap a muscle</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything below rebuilds around it — its lifts, its load, and the last time you
          trained it.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-3xl bg-secondary/50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xl font-semibold leading-tight">{facts.name}</p>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            #{facts.rank} of {facts.total} by volume · {facts.share.toFixed(1)}%
          </p>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="min-h-[44px] shrink-0 rounded-full bg-white/5 px-4 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Clear
        </button>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Figure
          label="Last trained"
          value={
            facts.rest.daysSinceLast === undefined
              ? "Never"
              : facts.rest.daysSinceLast === 0
                ? "Today"
                : `${facts.rest.daysSinceLast}d ago`
          }
        />
        <Figure label="Sessions" value={`${facts.sessions}`} />
        <Figure label="Sets / week" value={facts.setsPerWeek.toFixed(1)} />
      </div>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/[0.04] p-2.5">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 truncate text-base font-semibold leading-none">{value}</p>
    </div>
  );
}

/** Headroom past the band, so a muscle inside it never pins to the right edge. */
const DOSE_HEADROOM = 6;

/**
 * The dose: hard sets a week on this one muscle, against the 10–20 band.
 *
 * Was a 180px radial gauge. The group card below measures the identical thing
 * for six groups and now draws it as a bullet, and one measurement rendered as
 * two unrelated shapes reads as two measurements — you cannot tell at a glance
 * that the muscle's 6.4 and Legs' 14.2 are the same unit on the same scale. A
 * dial for a single number was also mostly circle.
 */
export function MuscleDoseCard({ name, setsPerWeek }: { name: string; setsPerWeek: number }) {
  const under = setsPerWeek < WEEKLY_SET_TARGET.low;
  const over = setsPerWeek > WEEKLY_SET_TARGET.high;

  return (
    <Panel
      title="The dose"
      caption={doseCopy(name, setsPerWeek, under, over)}
      note={
        <>
          Hard sets a week landing on {name}, counted the same way the group card counts them: a set
          counts fully at 50+ engagement and half at 25+. The band is the 10–20 hard sets a week most
          hypertrophy reviews converge on. This is the one figure in the drill-down you can act on
          next week.
        </>
      }
    >
      <p className="font-mono text-3xl font-semibold leading-none tabular-nums">
        {setsPerWeek.toFixed(1)}
        <span className="ml-2 align-baseline font-sans text-xs font-medium text-muted-foreground">
          sets / week
        </span>
      </p>

      <div className="mt-3">
        <Bullet
          label={name}
          value={setsPerWeek}
          band={WEEKLY_SET_TARGET}
          ceiling={WEEKLY_SET_TARGET.high + DOSE_HEADROOM}
        />
      </div>
    </Panel>
  );
}

function doseCopy(name: string, setsPerWeek: number, under: boolean, over: boolean) {
  if (setsPerWeek === 0) {
    return `Nothing in this range worked ${name} hard enough to count. The scale is the 10–20 hard sets a week most hypertrophy research lands on.`;
  }

  if (under) {
    return `${name} is under the band. Most hypertrophy research lands on 10–20 hard sets a week; you are averaging ${setsPerWeek.toFixed(1)}.`;
  }

  if (over) {
    return `${name} is past the band at ${setsPerWeek.toFixed(1)} sets a week — recovery you could spend on a muscle lower down the list.`;
  }

  return `${name} sits inside the 10–20 hard sets a week most hypertrophy research lands on. Keep it there.`;
}

/**
 * The volume that actually reached this muscle, over time.
 *
 * Not the session's tonnage: each lift's total is cut to the engagement share
 * this muscle got, so a bench press pays the pecs most of it and the triceps a
 * slice. Summing raw session volume onto every muscle it touches would count
 * the same kilo six times.
 */
export function MuscleVolumeCard({
  name,
  points,
  bucket
}: {
  name: string;
  points: TrendPoint[];
  bucket: Bucket;
}) {
  const worked = points.some((point) => point.volume > 0);

  return (
    <Panel
      title={`Load on ${name}`}
      caption={`Kilos that reached this muscle per ${bucket}`}
      note={
        <>
          Not the session&apos;s tonnage: each lift&apos;s total is cut to the engagement share this
          muscle got, so a bench press pays the pecs most of it and the triceps a slice. Summing raw
          session volume onto every muscle it touched would count the same kilo six times over. This
          is deliberately unfloored, so it reconciles with the percentage in the plaque above.
        </>
      }
    >
      {worked ? (
          <ResponsiveContainer width="100%" height={190}>
            <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -14 }}>
              <defs>
                <linearGradient id="muscleLoad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CHART.accent} stopOpacity={0.32} />
                  <stop offset="100%" stopColor={CHART.accent} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid {...gridProps} />
              <XAxis {...axisProps} dataKey="key" tickFormatter={formatDayKey} />
              <YAxis {...axisProps} width={44} tickFormatter={formatCompact} />
              <Tooltip
                cursor={{ stroke: CHART.axis, strokeWidth: 1 }}
                content={
                  <ChartTooltip labelFormat={formatDayKey} format={formatCompact} unit=" kg" />
                }
              />
              <Area
                {...animationProps}
                type="monotone"
                dataKey="volume"
                name="Load"
                stroke={CHART.accent}
                strokeWidth={2}
                fill="url(#muscleLoad)"
                activeDot={{ r: 4, strokeWidth: 2, stroke: CHART.surface }}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
        <EmptyChart>No lift in this range worked {name}.</EmptyChart>
      )}
    </Panel>
  );
}

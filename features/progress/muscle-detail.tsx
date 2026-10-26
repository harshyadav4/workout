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
  gridProps,
  useSection
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
      <div className="mt-4 rounded-xl bg-muted p-4 text-center">
        <p className="font-display text-lg font-bold tracking-tight">Tap a muscle</p>
        <p className="mt-1 text-sm text-muted-foreground">
          See its lifts, how much work it gets, and the last time you trained it.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-xl bg-muted p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-2xl font-extrabold leading-none tracking-tight">{facts.name}</p>
          <p className="mt-1 text-xs font-semibold text-muted-foreground">
            #{facts.rank} of {facts.total} by weight lifted · {facts.share.toFixed(1)}% of the total
          </p>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="key-quiet flex h-10 shrink-0 items-center rounded-full px-4 text-xs font-semibold text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                : `${facts.rest.daysSinceLast} ${facts.rest.daysSinceLast === 1 ? "day" : "days"} ago`
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
    <div className="well rounded-lg p-2.5">
      <p className="text-xs font-semibold text-muted-foreground">
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
      title="Sets per week"
      caption={doseCopy(name, setsPerWeek, under, over)}
      note={
        <>
          Hard sets a week for {name}. A set counts fully when the lift works {name} a lot, and as
          half a set when it helps a little. The goal of 10–20 hard sets a week comes from
          muscle-growth research. This is the one number here you can change next week.
        </>
      }
    >
      <p className="font-display text-3xl font-extrabold leading-none tracking-tight tabular-nums">
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
    return `No set in this range worked ${name} enough to count. The goal is 10–20 hard sets a week.`;
  }

  if (under) {
    return `${name} gets ${setsPerWeek.toFixed(1)} sets a week. The goal is 10–20, so add a few sets.`;
  }

  if (over) {
    return `${name} gets ${setsPerWeek.toFixed(1)} sets a week — more than the 10–20 goal. You can move some of those sets to a weaker muscle.`;
  }

  return `${name} is inside the goal of 10–20 hard sets a week. Keep it there.`;
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
  const { accent } = useSection();
  const worked = points.some((point) => point.volume > 0);

  return (
    <Panel
      title={`Weight lifted for ${name}`}
      caption={`The part of your lifting that worked ${name}, per ${bucket}`}
      note={
        <>
          Each lift shares its weight between the muscles it works. A bench press gives most of its
          weight to the chest and a small part to the triceps. This chart adds up only the part that
          went to {name}, so the same kilo is never counted twice.
        </>
      }
    >
      {worked ? (
          <ResponsiveContainer width="100%" height={190}>
            <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -14 }}>
              <defs>
                <linearGradient id="muscleLoad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={accent} stopOpacity={0.32} />
                  <stop offset="100%" stopColor={accent} stopOpacity={0} />
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
                name="Weight lifted"
                stroke={accent}
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

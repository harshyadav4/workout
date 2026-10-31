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
      <div className="mt-4 border-t border-sep pt-4">
        <p className="font-heading text-[26px] leading-tight">Tap a muscle</p>
        <p className="mt-1 text-sm text-muted-foreground">
          See its exercises, sets, and last workout.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 border-t border-sep pt-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-heading text-[26px] leading-tight">{facts.name}</p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            #{facts.rank} of {facts.total} by weight lifted · {facts.share.toFixed(1)}%
          </p>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="key-quiet flex h-11 shrink-0 items-center rounded-full px-4 text-xs font-semibold text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Clear
        </button>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3">
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
        <Figure label="Workouts" value={`${facts.sessions}`} />
        <Figure label="Sets / week" value={facts.setsPerWeek.toFixed(1)} />
      </div>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      {/* Two lines tall, so the values stay level when a long label wraps. */}
      <p className="min-h-8 text-[13px] leading-tight text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 truncate text-base font-medium tabular-nums leading-tight">{value}</p>
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
          Hard sets a week for {name}. A set counts fully when the exercise works {name} a lot, and
          half when it only helps. The 10–20 goal comes from muscle-growth research.
        </>
      }
    >
      <p className="plot-n">
        {setsPerWeek.toFixed(1)}
        <span className="ml-2 text-[13px] font-normal text-muted-foreground">
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
    return `No sets counted for ${name} in this range`;
  }

  if (under) {
    return `${setsPerWeek.toFixed(1)} sets a week — aim for 10–20`;
  }

  if (over) {
    return `${setsPerWeek.toFixed(1)} sets a week — over the 10–20 goal`;
  }

  return "In the 10–20 goal range";
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
      title="Weight lifted"
      caption={`For ${name}, per ${bucket}`}
      note={
        <>
          Each exercise splits its weight between the muscles it works. This counts only the part
          that went to {name}, so no kilo counts twice.
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
        <EmptyChart>No exercise in this range worked {name}.</EmptyChart>
      )}
    </Panel>
  );
}

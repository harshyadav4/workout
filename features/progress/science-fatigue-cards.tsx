"use client";

import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import { CHART, ChartTooltip, EmptyChart, animationProps, axisProps, formatCompact, gridProps, useSection } from "@/features/progress/chart-theme";
import { Panel, Reveal } from "@/features/progress/panel";
import {
  BANISTER_MIN_DAYS,
  DROPOFF_FLAG_PERCENT,
  FATIGUE_TAU,
  FITNESS_TAU,
  MONOTONY_MIN_WEEKS,
  MONOTONY_WARN,
  STIMULATING_REPS,
  formState,
  type BanisterPoint,
  type DensityPoint,
  type EffectiveReport,
  type LiftDropoff,
  type RestRow,
  type RirMax
} from "@/lib/fitness-fatigue";
import { formatDayKey } from "@/lib/progress-metrics";
import type { WeekLoad } from "@/lib/progress-trends";
import { cn } from "@/lib/utils";

/** m:ss — a rest is read off a timer, not described in words. */
function clock(seconds: number) {
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** The Fatigue group of the Science tab. All of it is lifting tonnage: holds and runs move no volume. */

const STATE_COPY: Record<ReturnType<typeof formState>, string> = {
  fresh: "Fresh: rested relative to what you are used to.",
  steady: "Steady: this week is about your normal.",
  loaded: "Loaded: a hard week, the kind that builds.",
  "run down": "Run down: well past your normal for a while now."
};

// -- fitness–fatigue --------------------------------------------------------------

export function FitnessFatigueCard({ points }: { points: BanisterPoint[] }) {
  const { accent } = useSection();
  const latest = points[points.length - 1];
  const state = latest ? formState(latest) : undefined;
  // Daily points for two years is too many dots for a phone; the line is what matters.
  const data = points.length > 180 ? points.filter((_, index) => index % Math.ceil(points.length / 180) === 0 || index === points.length - 1) : points;
  return (
    <Reveal ready={points.length >= BANISTER_MIN_DAYS} title="Fitness and fatigue" need="two weeks of training">
      <Panel
        title="Fitness and fatigue"
        caption={state ? STATE_COPY[state] : undefined}
        note={
          <>
            Banister&apos;s impulse–response model (1975), the one behind TrainingPeaks&apos; CTL / ATL / TSB:
            fitness is your daily lifting load averaged with a {FITNESS_TAU}-day memory, fatigue the same
            with a {FATIGUE_TAU}-day memory, form is the gap. A hard week pushes fatigue above fitness;
            a week off lets it fall back. Tonnage only — holds and runs do not count here.
          </>
        }
      >
        <ResponsiveContainer width="100%" height={180}>
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -6 }}>
            <CartesianGrid {...gridProps} />
            <XAxis {...axisProps} dataKey="key" tickFormatter={formatDayKey} minTickGap={40} />
            {/* Form goes negative, so the axis carries a minus sign and needs the room for it. */}
            <YAxis {...axisProps} width={46} tickFormatter={formatCompact} />
            <ReferenceLine y={0} stroke={CHART.grid} />
            <Area {...animationProps} type="monotone" dataKey="fitness" name="Fitness" stroke={accent} strokeWidth={2} fill={accent} fillOpacity={0.1} dot={false} />
            <Line {...animationProps} type="monotone" dataKey="fatigue" name="Fatigue" stroke={CHART.series[1]} strokeWidth={2} dot={false} />
            <Line {...animationProps} type="monotone" dataKey="form" name="Form" stroke={CHART.quiet} strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
            <Tooltip content={<ChartTooltip labelFormat={formatDayKey} format={(value) => `${formatCompact(value)} kg/day`} />} cursor={{ stroke: CHART.axis, strokeWidth: 1 }} />
          </ComposedChart>
        </ResponsiveContainer>
        <ul className="mt-1 flex gap-4 text-[11px] text-muted-foreground">
          <li className="flex items-center gap-1.5"><span className="h-1.5 w-4 rounded-full" style={{ backgroundColor: accent }} aria-hidden />Fitness</li>
          <li className="flex items-center gap-1.5"><span className="h-1.5 w-4 rounded-full" style={{ backgroundColor: CHART.series[1] }} aria-hidden />Fatigue</li>
          <li className="flex items-center gap-1.5"><span className="h-0.5 w-4 border-t border-dashed" style={{ borderColor: CHART.quiet }} aria-hidden />Form</li>
        </ul>
      </Panel>
    </Reveal>
  );
}

// -- monotony --------------------------------------------------------------------------

export function MonotonyCard({ weeks }: { weeks: WeekLoad[] }) {
  const { accent } = useSection();
  const rated = weeks.filter((week) => week.monotony !== undefined);
  const recent = rated.slice(-12);
  const latest = recent[recent.length - 1];
  return (
    <Reveal ready={rated.length >= MONOTONY_MIN_WEEKS} title="Monotony" need={`${MONOTONY_MIN_WEEKS} weeks of training`}>
      <Panel
        title="Monotony"
        caption={latest ? `${latest.monotony!.toFixed(2)} this week · strain ${formatCompact(latest.strain ?? 0)}` : undefined}
        note={
          <>
            Foster (1998): a week&apos;s mean daily load divided by its day-to-day spread. Rest days count
            as zero, so they are what creates the variation. A fixed weekly split scores about 1 by
            construction; over {MONOTONY_WARN} means every day looked the same, and strain (load ×
            monotony) is where Foster saw illness and overtraining cluster. It only says something when
            your weeks actually vary.
          </>
        }
      >
        <ResponsiveContainer width="100%" height={150}>
          <BarChart data={recent} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
            <CartesianGrid {...gridProps} />
            <XAxis {...axisProps} dataKey="key" tickFormatter={formatDayKey} minTickGap={30} />
            <YAxis {...axisProps} width={36} domain={[0, (max: number) => Math.max(MONOTONY_WARN + 0.5, max)]} tickFormatter={(value: number) => value.toFixed(1)} />
            <ReferenceLine y={MONOTONY_WARN} stroke={CHART.series[1]} strokeDasharray="3 3" />
            <Bar {...animationProps} dataKey="monotony" name="Monotony" radius={[4, 4, 0, 0]} maxBarSize={22}>
              {recent.map((week) => (
                <Cell key={week.key} fill={(week.monotony ?? 0) >= MONOTONY_WARN ? accent : CHART.quiet} />
              ))}
            </Bar>
            <Tooltip content={<ChartTooltip labelFormat={(label) => `Week of ${formatDayKey(label)}`} format={(value) => value.toFixed(2)} />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
          </BarChart>
        </ResponsiveContainer>
      </Panel>
    </Reveal>
  );
}

// -- rep drop-off ------------------------------------------------------------------------

/** The lifts that drop, worst first; past this many the list is a scroll. */
const DROPOFF_ROWS = 8;

export function DropoffCard({ rows: all }: { rows: LiftDropoff[] }) {
  const { accent } = useSection();
  const rows = all.filter((row) => row.medianPercent > 0).slice(0, DROPOFF_ROWS);
  const steady = all.length - rows.length;
  return (
    <Panel
      title="Rep drop-off"
      caption="First set to last, same weight, per lift"
      note={
        <>
          How many reps the last set loses against the first when the weight stayed the same —
          the median across sessions in this range. Up to about 20 % is normal fatigue; {DROPOFF_FLAG_PERCENT} %
          or more usually means the rest was too short or the first set was too close to failure. Only
          sessions with two or more sets at one weight; two sessions is the floor.
        </>
      }
    >
      {all.length === 0 ? (
        <EmptyChart>Two sessions of a lift with the same weight across its sets.</EmptyChart>
      ) : rows.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">
          No drop-off on {all.length} lift{all.length === 1 ? "" : "s"}: your last sets match your first.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((row) => (
            <li key={row.workoutId}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-sm">{row.name}</span>
                <span className={cn("shrink-0 text-sm font-semibold tabular-nums", row.flagged && "text-warning")}>
                  {Math.round(row.medianPercent) > 0 ? `−${Math.round(row.medianPercent)} %` : "0 %"}
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">{row.sessions} sessions</span>
                </span>
              </div>
              <div className="relative mt-1.5 h-2 rounded-full bg-muted">
                <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, Math.max(0, row.medianPercent))}%`, backgroundColor: row.flagged ? accent : CHART.quiet }} aria-hidden />
              </div>
            </li>
          ))}
          {steady > 0 ? (
            <li className="text-xs text-muted-foreground">
              {steady} other lift{steady === 1 ? "" : "s"} hold their reps to the last set.
            </li>
          ) : null}
        </ul>
      )}
    </Panel>
  );
}

// -- real rest --------------------------------------------------------------------------------

export function RestCard({ rows }: { rows: RestRow[] }) {
  return (
    <Panel
      title="Real rest"
      caption="Set to set, against the plan"
      note={
        <>
          The time between one set&apos;s Log tap and the next on the same exercise, median over this
          range — so it is the set itself plus the rest before it, which is what the plan&apos;s rest
          actually has to fit into. A gap well over plan is rest creeping; well under is a rest timer
          being skipped. Gaps over 15 minutes are dropped as interruptions.
        </>
      }
    >
      {rows.length === 0 ? (
        <EmptyChart>Finished sessions with a planned rest and logged sets.</EmptyChart>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((row) => {
            const over = row.medianGap - row.plannedSeconds;
            return (
              <li key={row.name} className="flex items-baseline justify-between gap-3 py-1.5">
                <span className="min-w-0">
                  <span className="block truncate text-sm">{row.name}</span>
                  <span className="block text-xs text-muted-foreground">plan {clock(row.plannedSeconds)} · {row.gaps} gaps</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-sm font-semibold tabular-nums">{clock(row.medianGap)}</span>
                  <span className={cn("block text-[11px] tabular-nums", Math.abs(over) > row.plannedSeconds * 0.5 ? "text-warning" : "text-muted-foreground")}>
                    {over >= 0 ? "+" : "−"}{clock(Math.abs(over))} vs plan
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

// -- density ----------------------------------------------------------------------------------

export function DensityCard({ points }: { points: DensityPoint[] }) {
  const { accent } = useSection();
  const latest = points[points.length - 1];
  return (
    <Panel
      title="Session density"
      caption={latest ? `${Math.round(latest.kgPerMin)} kg per minute last session` : "kg lifted per minute of session"}
      note={
        <>
          Tonnage ÷ minutes from Start to Finish, per timed session in this range. Density rising at
          the same tonnage means shorter rests or fewer wasted minutes; density falling with tonnage
          flat is the opposite. Two sessions on one day are counted together.
        </>
      }
    >
      {points.length < 2 ? (
        <EmptyChart>Two timed sessions in this range.</EmptyChart>
      ) : (
        <ResponsiveContainer width="100%" height={150}>
          <BarChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
            <CartesianGrid {...gridProps} />
            <XAxis {...axisProps} dataKey="date" tickFormatter={formatDayKey} minTickGap={30} />
            <YAxis {...axisProps} width={40} tickFormatter={formatCompact} />
            <Bar {...animationProps} dataKey="kgPerMin" name="kg/min" fill={accent} radius={[4, 4, 0, 0]} maxBarSize={22} />
            <Tooltip content={<ChartTooltip labelFormat={formatDayKey} format={(value) => `${Math.round(value)} kg/min`} />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </Panel>
  );
}

// -- effective reps and RIR-adjusted max -----------------------------------------------------

export function EffectiveRepsCard({ report, maxes }: { report: EffectiveReport; maxes: RirMax[] }) {
  const { accent } = useSection();
  const top = Math.max(1, ...report.rows.map((row) => row.effective));
  return (
    <Panel
      title="Effective reps"
      caption={report.rated > 0 ? `${report.rated} rated sets · ${report.unrated} unrated` : "From the reps-in-reserve you log"}
      note={
        <>
          Beardsley&apos;s stimulating-reps model: only the last {STIMULATING_REPS} reps before failure recruit
          the big, fast-growing fibres, so a set with 2 in the tank counts 3 and a set with 5 in the tank
          counts 0. Summed per muscle group over this range, from sets you rated. The RIR-adjusted max
          is Epley on the reps you had, not the reps you did — usually a little higher than the plain
          estimate.
        </>
      }
    >
      {report.rated === 0 ? (
        <EmptyChart>Rate sets with reps-in-reserve when you log them.</EmptyChart>
      ) : (
        <>
          <ul className="space-y-2.5">
            {report.rows.map((row) => (
              <li key={row.group}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm">{row.label}</span>
                  <span className="text-sm font-semibold tabular-nums">
                    {row.effective}
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">{row.rated} sets</span>
                  </span>
                </div>
                <div className="relative mt-1.5 h-2 rounded-full bg-muted">
                  <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(row.effective / top) * 100}%`, backgroundColor: accent }} aria-hidden />
                </div>
              </li>
            ))}
          </ul>
          {maxes.length > 0 ? (
            <ul className="mt-3 divide-y divide-border border-t border-border">
              <li className="pt-2 text-xs font-medium text-muted-foreground">RIR-adjusted max</li>
              {maxes.map((row) => (
                <li key={row.workoutId} className="flex items-baseline justify-between gap-3 py-1.5">
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{row.name}</span>
                    <span className="block text-xs text-muted-foreground">{row.fromWeight} kg × {row.fromReps} with {row.rir} left · {formatDayKey(row.date)}</span>
                  </span>
                  <span className="shrink-0 text-sm tabular-nums">
                    <span className="font-semibold">{row.adjusted} kg</span>
                    <span className="ml-1.5 text-xs text-muted-foreground">plain {row.plain}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </Panel>
  );
}

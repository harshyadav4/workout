"use client";

import { ArrowDownRight, ArrowRight, ArrowUpRight, CalendarCheck, Dumbbell, Flame, Medal } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
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
  GROUP_COLORS,
  SECTION_THEMES,
  animationProps,
  axisProps,
  gridProps,
  useSection
} from "@/features/progress/chart-theme";
import { Panel } from "@/features/progress/panel";
import type {
  Badge,
  BadgeKind,
  MonthCompareRow,
  RecordsMonth,
  StrengthRatio,
  WeekSessions,
  WeightChangeMonth
} from "@/lib/progress-extras";
import { GROUP_LABELS, GROUP_ORDER, formatDayKey } from "@/lib/progress-metrics";
import type { MuscleGroup } from "@/lib/types";
import { formatVolume } from "@/lib/utils";

// -- shared ---------------------------------------------------------------------

/**
 * The key for anything coloured by muscle group. Six hues need a key, and the
 * key is text in ink beside a swatch, so a colour is never the only clue.
 */
export function GroupLegend({ groups }: { groups: MuscleGroup[] }) {
  const shown = GROUP_ORDER.filter((group) => groups.includes(group));
  if (shown.length < 2) {
    return null;
  }

  return (
    <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5" aria-label="Colors by muscle group">
      {shown.map((group) => (
        <li key={group} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: GROUP_COLORS[group] }} aria-hidden />
          {GROUP_LABELS[group]}
        </li>
      ))}
    </ul>
  );
}

// -- milestones -----------------------------------------------------------------

/** One identity per badge kind, from the section trio, so a kind keeps its colour. */
const BADGE: Record<BadgeKind, { color: string; icon: typeof Medal }> = {
  weight: { color: SECTION_THEMES.strength.accent, icon: Dumbbell },
  sessions: { color: SECTION_THEMES.body.accent, icon: CalendarCheck },
  streak: { color: SECTION_THEMES.consistency.accent, icon: Flame }
};

export function MilestonesCard({ earned, next }: { earned: Badge[]; next: Badge[] }) {
  if (earned.length === 0 && next.length === 0) {
    return null;
  }

  return (
    <Panel
      title="Milestones"
      caption="Earned, and up next"
      note={
        <>
          Badges come from your total workouts, total weight lifted, and best week streak. Each
          bar shows how close the next badge is.
        </>
      }
    >
      {earned.length > 0 ? (
        <ul className="grid grid-cols-3 gap-2">
          {earned.map((badge) => {
            const { color, icon: Icon } = BADGE[badge.kind];
            return (
              <li key={badge.kind} className="well flex flex-col items-center rounded-lg px-2 py-3 text-center">
                <span
                  className="flex h-10 w-10 items-center justify-center rounded-full"
                  style={{ backgroundColor: `${color}26`, boxShadow: `inset 0 0 0 2px ${color}` }}
                >
                  <Icon className="h-5 w-5" style={{ color }} aria-hidden />
                </span>
                <span className="mt-2 text-xs font-semibold leading-tight">{badge.title}</span>
                <span className="mt-0.5 text-xs text-muted-foreground">{badge.detail}</span>
              </li>
            );
          })}
        </ul>
      ) : null}

      {next.length > 0 ? (
        <ul className="mt-3 space-y-2.5">
          {next.map((badge) => {
            const { color } = BADGE[badge.kind];
            return (
              <li key={badge.kind}>
                <div className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="font-semibold">Next: {badge.title}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{badge.detail}</span>
                </div>
                <div
                  className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-label={`Next: ${badge.title}`}
                  aria-valuenow={Math.round(badge.progress * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.max(badge.progress * 100, 2)}%`, backgroundColor: color }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </Panel>
  );
}

// -- this month vs last month ---------------------------------------------------------

export function MonthCompareCard({ rows }: { rows: MonthCompareRow[] }) {
  return (
    <Panel
      title="This month vs last"
      caption="Same days of each month"
      note={
        <>
          On the 12th, this compares the 1st–12th of both months. So the comparison is fair on
          any day.
        </>
      }
    >
      <div className="grid grid-cols-3 gap-2">
        {rows.map((row) => {
          const flat = row.change === undefined || Math.abs(row.change) < 1;
          const up = !flat && (row.change ?? 0) > 0;
          const Icon = flat ? ArrowRight : up ? ArrowUpRight : ArrowDownRight;
          const tone = flat ? "text-muted-foreground" : up ? "text-success" : "text-danger";

          return (
            <div key={row.label} className="well rounded-lg p-3">
              {/* Two lines tall, so the values stay level when a long label wraps. */}
              <p className="min-h-8 text-xs font-semibold text-muted-foreground">{row.label}</p>
              <p className="mt-1.5 font-display text-lg font-extrabold leading-none tabular-nums">
                {row.label === "Weight lifted" ? compactKg(row.now) : row.now}
              </p>
              <p className={`mt-1.5 flex items-center gap-1 text-xs tabular-nums ${tone}`}>
                <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {row.change === undefined
                  ? "new"
                  : `${row.change > 0 ? "+" : ""}${Math.round(row.change)}%`}
              </p>
              <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                was {row.label === "Weight lifted" ? compactKg(row.before) : row.before}
              </p>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function compactKg(kg: number) {
  return kg >= 10_000 ? `${(kg / 1000).toFixed(0)}k kg` : `${formatVolume(kg)} kg`;
}

// -- strength vs bodyweight ------------------------------------------------------------

/** The scale runs to at least 2× bodyweight, so a beginner's bars are not stretched to look elite. */
const RATIO_FLOOR = 2;

export function StrengthRatioCard({
  ratios,
  groupOf
}: {
  ratios: StrengthRatio[];
  groupOf: Map<string, MuscleGroup>;
}) {
  if (ratios.length === 0) {
    return (
      <Panel title="Strength vs bodyweight">
        <EmptyChart>Add a weigh-in to see this.</EmptyChart>
      </Panel>
    );
  }

  const ceiling = Math.max(RATIO_FLOOR, ...ratios.map((row) => row.ratio));
  const top = ratios[0];

  return (
    <Panel
      title="Strength vs bodyweight"
      caption={`${top.name}: ${top.ratio.toFixed(2)}× bodyweight`}
      note={
        <>
          Each bar is your heaviest set on a main exercise, divided by your latest weigh-in. 1×
          means you lift your own bodyweight.
        </>
      }
    >
      <ul className="space-y-3">
        {ratios.map((row) => {
          // A lift with no group (a template missing at finish time) is drawn
          // quiet, as the other cards do, not as Chest.
          const group = groupOf.get(row.workoutId);
          const color = group ? GROUP_COLORS[group] : CHART.quiet;
          return (
            <li key={row.workoutId}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-sm">{row.name}</span>
                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {row.ratio.toFixed(2)}×
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">{row.best} kg</span>
                </span>
              </div>
              <div className="relative mt-1.5 h-2.5 rounded-full bg-muted">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${(row.ratio / ceiling) * 100}%`, backgroundColor: color }}
                />
                {/* The 1× mark: lifting your own bodyweight. */}
                <span
                  className="absolute inset-y-[-3px] w-px bg-foreground/40"
                  style={{ left: `${(1 / ceiling) * 100}%` }}
                  aria-hidden
                />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">The thin line marks 1× bodyweight.</p>
      <GroupLegend
        groups={ratios.map((row) => groupOf.get(row.workoutId)).filter((group): group is MuscleGroup => Boolean(group))}
      />
    </Panel>
  );
}

// -- records per month -------------------------------------------------------------------

export function RecordsMonthCard({ months }: { months: RecordsMonth[] }) {
  const total = months.reduce((sum, month) => sum + month.total, 0);
  const groups = GROUP_ORDER.filter((group) => months.some((month) => month[group] > 0));
  const best = months.reduce<RecordsMonth | undefined>(
    (peak, month) => (month.total > (peak?.total ?? 0) ? month : peak),
    undefined
  );

  return (
    <Panel
      title="Records per month"
      caption={
        best
          ? `${total} records · most in ${best.label} (${best.total})`
          : `No records in the last ${months.length} months`
      }
      note={
        <>
          A record is your heaviest weight ever on an exercise. Colors show the muscle group.
        </>
      }
    >
      {total === 0 ? (
        <EmptyChart>Beat your heaviest weight to set a record.</EmptyChart>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={170}>
            <BarChart data={months} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis {...axisProps} dataKey="label" minTickGap={4} />
              <YAxis {...axisProps} width={28} allowDecimals={false} />
              <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} content={<ChartTooltip format={(v) => `${v}`} />} />
              {groups.map((group, index) => (
                <Bar
                  {...animationProps}
                  key={group}
                  dataKey={group}
                  name={GROUP_LABELS[group]}
                  stackId="records"
                  fill={GROUP_COLORS[group]}
                  // A surface gap between stacked segments, so neighbours never merge.
                  stroke={CHART.surface}
                  strokeWidth={1}
                  maxBarSize={18}
                  radius={index === groups.length - 1 ? [4, 4, 0, 0] : 0}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
          <GroupLegend groups={groups} />
        </>
      )}
    </Panel>
  );
}

// -- sessions per week vs goal -------------------------------------------------------------

export function WeeklyGoalCard({
  weeks,
  target,
  bestMonth
}: {
  weeks: WeekSessions[];
  target: number;
  bestMonth?: { label: string; sessions: number };
}) {
  const { accent } = useSection();
  const complete = weeks.filter((week) => !week.partial);
  const hits = complete.filter((week) => week.hit).length;
  const data = weeks.map((week) => ({ ...week, mark: week.hit ? "✓" : "" }));

  return (
    <Panel
      title="Workouts per week"
      caption={`Goal hit ${hits} of ${complete.length} weeks · ${target} a week`}
      note={
        <>
          Each bar is one week, Monday to Sunday. The dashed line is your goal, and ✓ marks a week
          that reached it. The last bar is this week.
        </>
      }
    >
      <ResponsiveContainer width="100%" height={170}>
        <BarChart data={data} margin={{ top: 16, right: 0, bottom: 0, left: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis {...axisProps} dataKey="start" tickFormatter={formatDayKey} />
          <YAxis {...axisProps} width={28} allowDecimals={false} domain={[0, (max: number) => Math.max(max, target) + 1]} />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.04)" }}
            content={
              <ChartTooltip
                labelFormat={(key) => `Week of ${formatDayKey(key)}`}
                format={(value) => `${value} ${value === 1 ? "workout" : "workouts"}`}
              />
            }
          />
          <ReferenceLine y={target} stroke={CHART.axis} strokeDasharray="4 4" />
          <Bar {...animationProps} dataKey="sessions" name="Workouts" radius={[4, 4, 0, 0]} maxBarSize={20}>
            {data.map((week) => (
              <Cell
                key={week.start}
                fill={week.hit ? accent : CHART.quiet}
                fillOpacity={week.partial ? 0.55 : 1}
              />
            ))}
            <LabelList dataKey="mark" position="top" fill="currentColor" fontSize={11} className="fill-foreground" />
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {bestMonth ? (
        <p className="mt-3 flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm">
          <Medal className="h-4 w-4 shrink-0" style={{ color: accent }} aria-hidden />
          <span>
            Best month: <span className="font-semibold">{bestMonth.label}</span>, {bestMonth.sessions}{" "}
            {bestMonth.sessions === 1 ? "workout" : "workouts"}
          </span>
        </p>
      ) : null}
    </Panel>
  );
}

// -- monthly weight change -------------------------------------------------------------------

export function WeightChangeCard({
  months,
  goalWeightKg,
  currentKg
}: {
  months: WeightChangeMonth[];
  goalWeightKg?: number;
  currentKg?: number;
}) {
  const { accent } = useSection();

  if (months.length === 0) {
    return null;
  }

  // Toward the goal is the good direction; without a goal, no month is judged.
  const wantDown = goalWeightKg !== undefined && currentKg !== undefined ? goalWeightKg < currentKg : undefined;

  return (
    <Panel
      title="Monthly weight change"
      caption="Average weight vs the month before"
      note={
        <>
          A bar below the line means you got lighter that month. A brighter bar is a move toward
          your goal weight.
        </>
      }
    >
      <ResponsiveContainer width="100%" height={170}>
        <BarChart data={months} margin={{ top: 16, right: 0, bottom: 0, left: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis {...axisProps} dataKey="label" minTickGap={4} />
          <YAxis {...axisProps} width={40} tickFormatter={(value: number) => `${value > 0 ? "+" : ""}${value}`} />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.04)" }}
            content={<ChartTooltip format={(value) => `${value > 0 ? "+" : ""}${value.toFixed(1)} kg`} />}
          />
          <ReferenceLine y={0} stroke={CHART.axis} />
          <Bar {...animationProps} dataKey="change" name="Change" radius={[3, 3, 3, 3]} maxBarSize={18}>
            {months.map((month) => {
              const toward = wantDown === undefined ? true : wantDown ? month.change < 0 : month.change > 0;
              return <Cell key={month.key} fill={toward ? accent : CHART.quiet} />;
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Panel>
  );
}

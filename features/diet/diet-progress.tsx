"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import { Segmented } from "@/components/ui/segmented";
import { useSwipeTabs } from "@/components/ui/use-swipe-tabs";
import { DietScience, Stat } from "@/features/diet/diet-science";
import { useDietStore } from "@/features/diet/diet-store";
import { CHART, ChartTooltip, EmptyChart, animationProps, axisProps, gridProps } from "@/features/progress/chart-theme";
import { Panel, Reveal, SectionRule } from "@/features/progress/panel";
import { ProgressFilters } from "@/features/progress/progress-filters";
import { useWorkoutStore } from "@/features/workout/workout-store";
import {
  FUEL_CALLOUT_WEEKS,
  adherence,
  averageIntake,
  dailyIntake,
  fuelVsWeight,
  intakeSeries,
  macroShare,
  proteinPerKg,
  spend,
  type Adherence,
  type DayIntake,
  type FuelVsWeight,
  type Spend
} from "@/lib/diet-metrics";
import { formatRupees } from "@/lib/meal-schedule";
import { formatDayKey, rangeWindow, type DateWindow, type ProgressRange } from "@/lib/progress-metrics";

type DietView = "intake" | "science";

const VIEWS: { id: DietView; label: string }[] = [
  { id: "intake", label: "Intake" },
  { id: "science", label: "Science" }
];

const margin = { top: 8, right: 8, bottom: 0, left: -12 };

function TargetLine({ value, unit }: { value?: number; unit: string }) {
  return value ? (
    <ReferenceLine
      y={value}
      stroke={CHART.axis}
      strokeDasharray="4 4"
      label={{
        value: `Target ${value} ${unit}`,
        position: "insideTopRight",
        fill: CHART.axis,
        fontSize: 10,
        fontFamily: "var(--font-sans)"
      }}
    />
  ) : null;
}

/** Dots for the days, a line for the 7-day average: one day of eating says little. */
function DailyCard({
  title,
  caption,
  note,
  rows,
  dataKey,
  unit,
  target,
  empty
}: {
  title: string;
  caption: string;
  note: string;
  rows: DayIntake[];
  dataKey: "kcal" | "proteinG";
  unit: string;
  target?: number;
  empty: string;
}) {
  const points = useMemo(() => intakeSeries(rows, dataKey), [rows, dataKey]);
  return (
    <Panel title={title} caption={caption} note={note}>
      {points.length > 0 ? (
        <ResponsiveContainer width="100%" height={190}>
          <LineChart data={points} margin={margin}>
            <CartesianGrid {...gridProps} />
            <XAxis {...axisProps} dataKey="date" tickFormatter={formatDayKey} />
            <YAxis {...axisProps} width={44} domain={[0, "auto"]} />
            <Tooltip
              cursor={{ stroke: CHART.axis, strokeWidth: 1 }}
              content={<ChartTooltip unit={unit} format={(value) => String(Math.round(value))} labelFormat={formatDayKey} />}
            />
            <Line {...animationProps} type="monotone" dataKey="value" name="Eaten" stroke={CHART.quiet} strokeWidth={0} dot={{ r: 2, fill: CHART.quiet }} />
            <Line {...animationProps} type="monotone" dataKey="average" name="7-day average" stroke={CHART.accent} strokeWidth={2} dot={false} />
            <TargetLine value={target} unit={unit} />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <EmptyChart>{empty}</EmptyChart>
      )}
    </Panel>
  );
}

function MacroCard({ rows }: { rows: DayIntake[] }) {
  const average = averageIntake(rows);
  const share = macroShare(average);
  const parts = [
    { label: "Protein", grams: average.proteinG, percent: share.protein, color: CHART.series[0] },
    { label: "Carbs", grams: average.carbsG, percent: share.carbs, color: CHART.series[1] },
    { label: "Fat", grams: average.fatG, percent: share.fat, color: CHART.series[2] }
  ];
  return (
    <Panel title="Protein, carbs and fat" caption="Share of your calories, on days you logged">
      {rows.length > 0 ? (
        <>
          <div className="flex h-3 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={parts.map((part) => `${part.label} ${part.percent}%`).join(", ")}>
            {parts.map((part) => (
              <span key={part.label} style={{ width: `${part.percent}%`, backgroundColor: part.color }} />
            ))}
          </div>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
            {parts.map((part) => (
              <div key={part.label}>
                <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: part.color }} aria-hidden />
                  {part.label}
                </dt>
                <dd className="mt-0.5 font-semibold tabular-nums">
                  {part.grams} g · {part.percent}%
                </dd>
              </div>
            ))}
          </dl>
        </>
      ) : (
        <EmptyChart>Tick a meal on the Meals tab to see this.</EmptyChart>
      )}
    </Panel>
  );
}

function AdherenceCard({ result }: { result: Adherence }) {
  return (
    <Panel
      title="Plan against eaten"
      caption="Meals that came due in this range"
      note="Missed means a past meal you did not tick or skip. It may be that you ate it and did not tick it. Extras are not on the plan, so they do not count here."
    >
      {result.rate !== undefined ? (
        <>
          <p className="font-display text-4xl font-extrabold tracking-tight tabular-nums">{Math.round(result.rate * 100)}%</p>
          <p className="mt-1 text-sm text-muted-foreground tabular-nums">
            {result.eaten} of {result.planned} planned meals eaten
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Stat label="Skipped" value={String(result.skipped)} />
            <Stat label="Missed" value={String(result.missed)} />
            <Stat label="Extras" value={String(result.extras)} />
          </div>
        </>
      ) : (
        <EmptyChart>Schedule a meal plan to see this.</EmptyChart>
      )}
    </Panel>
  );
}

function SpendCard({ result }: { result: Spend }) {
  return (
    <Panel title="Spend" caption="What the meals you ate cost" note="This is the cost you typed for each meal. Skipped meals cost nothing here.">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="This month" value={formatRupees(Math.round(result.thisMonth))} />
        <Stat label="In this range" value={formatRupees(Math.round(result.total))} />
        <Stat label="A day" value={formatRupees(Math.round(result.perDay))} />
      </div>
      {result.weeks.length > 0 ? (
        <div className="mt-3">
          <ResponsiveContainer width="100%" height={170}>
            <BarChart data={result.weeks} margin={margin}>
              <CartesianGrid {...gridProps} />
              <XAxis {...axisProps} dataKey="week" tickFormatter={formatDayKey} />
              <YAxis {...axisProps} width={44} />
              <Tooltip
                cursor={{ fill: CHART.grid }}
                content={<ChartTooltip format={(value) => formatRupees(Math.round(value))} labelFormat={(label) => `Week of ${formatDayKey(label)}`} />}
              />
              <Bar {...animationProps} dataKey="costInr" name="Spent" fill={CHART.accent} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="mt-3">
          <EmptyChart>Add a cost to your meals, then tick them.</EmptyChart>
        </div>
      )}
    </Panel>
  );
}

function FuelCard({ fuel }: { fuel: FuelVsWeight }) {
  const change = fuel.weightChange;
  return (
    <Panel
      title="Food and bodyweight"
      caption="7-day average calories, and your weigh-ins"
      note="This shows two things side by side. It does not show that one caused the other. Water, salt and training also move the scale, and the calories are estimates."
    >
      <ResponsiveContainer width="100%" height={190}>
        <LineChart data={fuel.rows} margin={{ ...margin, right: -8 }}>
          <CartesianGrid {...gridProps} />
          <XAxis {...axisProps} dataKey="date" tickFormatter={formatDayKey} />
          <YAxis {...axisProps} yAxisId="kcal" width={44} domain={["dataMin - 100", "dataMax + 100"]} tickFormatter={(value: number) => String(Math.round(value))} />
          <YAxis {...axisProps} yAxisId="kg" orientation="right" width={40} domain={["dataMin - 1", "dataMax + 1"]} tickFormatter={(value: number) => value.toFixed(0)} />
          <Tooltip
            cursor={{ stroke: CHART.axis, strokeWidth: 1 }}
            content={<ChartTooltip format={(value) => String(Math.round(value * 10) / 10)} labelFormat={formatDayKey} />}
          />
          <Line {...animationProps} yAxisId="kcal" type="monotone" dataKey="kcal" name="kcal" stroke={CHART.accent} strokeWidth={2} dot={false} />
          <Line {...animationProps} yAxisId="kg" type="monotone" dataKey="weight" name="kg" stroke={CHART.series[1]} strokeWidth={2} connectNulls dot={{ r: 2, fill: CHART.series[1] }} />
        </LineChart>
      </ResponsiveContainer>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        Over {fuel.weeks} weeks you logged about {fuel.averageKcal} kcal a day, and your weight went{" "}
        {change === 0 ? "nowhere" : change > 0 ? `up ${change} kg` : `down ${Math.abs(change)} kg`}.
      </p>
    </Panel>
  );
}

/** The Progress tab on the Diet side: what was eaten, and what it cost. */
export function DietProgress() {
  const days = useDietStore((state) => state.scheduledMealDays);
  const settings = useDietStore((state) => state.settings);
  const today = useDietStore((state) => state.activeDate);
  const measurements = useWorkoutStore((state) => state.measurements);
  const [range, setRange] = useState<ProgressRange>("12w");
  const [custom, setCustom] = useState<DateWindow>();
  const [view, setView] = useState<DietView>("intake");
  const swipe = useSwipeTabs((direction) => setView(direction === "left" ? "science" : "intake"));

  const window = useMemo(() => {
    const earliest = days.reduce<string | undefined>((first, day) => (!first || day.date < first ? day.date : first), undefined);
    return rangeWindow(range, today, earliest, custom);
  }, [custom, days, range, today]);

  const rows = useMemo(() => dailyIntake(days, window), [days, window]);
  const average = useMemo(() => averageIntake(rows), [rows]);
  const perKg = useMemo(() => proteinPerKg(rows, measurements), [measurements, rows]);
  const planned = useMemo(() => adherence(days, window, today), [days, today, window]);
  const money = useMemo(() => spend(days, window, today), [days, today, window]);
  const fuel = useMemo(() => fuelVsWeight(rows, measurements), [measurements, rows]);

  return (
    <section className="space-y-4" data-tour="diet-intake" {...swipe}>
      <Segmented role="tablist" aria-label="Diet progress view" options={VIEWS} value={view} onChange={setView} />

      <ProgressFilters
        range={range}
        onRangeChange={(next) => {
          if (next === "custom") {
            setCustom(window);
          }
          setRange(next);
        }}
        window={window}
        onWindowChange={setCustom}
        today={today}
        exercises={[]}
        onWorkoutChange={() => undefined}
      />

      {view === "science" ? <DietScience window={window} /> : null}

      {view === "intake" ? (
      <>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Calories a day" value={String(average.kcal)} />
        <Stat label="Protein a day" value={`${Math.round(average.proteinG)} g`} />
        <Stat label="Protein per kg" value={perKg !== undefined ? perKg.toFixed(1) : "–"} />
      </div>

      <SectionRule label="What you ate" />
      <DailyCard
        title="Calories"
        caption="Each day you logged, and the 7-day average"
        note="Only meals you ticked count. A day with no ticks is left out, so it does not pull the average down."
        rows={rows}
        dataKey="kcal"
        unit="kcal"
        target={settings.kcalTarget}
        empty="Tick a meal on the Meals tab to see this."
      />
      <DailyCard
        title="Protein"
        caption={perKg !== undefined ? `About ${perKg.toFixed(1)} g per kg of your bodyweight` : "Add a weigh-in on You to see grams per kg"}
        note="Grams per kg uses your weight on each day, from your weigh-ins on You."
        rows={rows}
        dataKey="proteinG"
        unit="g"
        target={settings.proteinTargetG}
        empty="Tick a meal on the Meals tab to see this."
      />
      <MacroCard rows={rows} />

      <SectionRule label="Your plan" />
      <AdherenceCard result={planned} />

      <SectionRule label="Your money" />
      <SpendCard result={money} />

      <SectionRule label="Over time" />
      <Reveal
        ready={Boolean(fuel)}
        title="Food and bodyweight"
        need={`${FUEL_CALLOUT_WEEKS} weeks of ticked meals, and a weigh-in at each end`}
      >
        {fuel ? <FuelCard fuel={fuel} /> : null}
      </Reveal>
      </>
      ) : null}
    </section>
  );
}

"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useDeferredValue, useEffect, useMemo, useState } from "react";
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

import { ListGroup, ListRow } from "@/components/ui/list";
import {
  BigNumber,
  BodyGoalCards,
  CoverageCard,
  EatingScience,
  EnergyCards,
  Facts,
  LineKey,
  MoneyScience,
  Row,
  useBodyGoal
} from "@/features/diet/diet-science";
import { useDietStore } from "@/features/diet/diet-store";
import { formatKcal } from "@/features/diet/meal-numbers";
import { CHART, ChartTooltip, EmptyChart, SECTION_THEMES, SectionColors, animationProps, axisProps, gridProps, useSection } from "@/features/progress/chart-theme";
import { Panel, Reveal } from "@/features/progress/panel";
import { RangeMenu } from "@/features/progress/progress-filters";
import { ProgressHero, RingCards, type RingCardMeta } from "@/features/progress/score-rings";
import { useWorkoutStore } from "@/features/workout/workout-store";
import { averageLine, bodyRing, dietHeadline, eatingRing, moneyRing, type DietCardId } from "@/lib/diet-cards";
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
import { formatDayKey, rangeWindow, windowDays, type DateWindow, type ProgressRange } from "@/lib/progress-metrics";
import { cn } from "@/lib/utils";

/** Each keeps the colour its place has on the workout side's Progress, so the trio stays one that reads apart. */
const CARDS: RingCardMeta<DietCardId>[] = [
  { id: "eating", label: "Eating", section: "strength" },
  { id: "money", label: "Money", section: "consistency" },
  { id: "body", label: "Body goals", section: "body" }
];

/** The open card, from the URL's `?view=`: none (or an unknown one) is the overview. */
function cardFromQuery(value: string | null): DietCardId | undefined {
  return CARDS.find((card) => card.id === value)?.id;
}

const margin = { top: 8, right: 8, bottom: 0, left: -12 };

/** Dots for the days, a line for the 7-day average: one day of eating says little. */
function DailyCard({
  title,
  line,
  note,
  rows,
  dataKey,
  unit,
  average,
  target,
  empty
}: {
  title: string;
  line?: string;
  note: string;
  rows: DayIntake[];
  dataKey: "kcal" | "proteinG";
  unit: string;
  average: number;
  target?: number;
  empty: string;
}) {
  const { accent } = useSection();
  const points = useMemo(() => intakeSeries(rows, dataKey), [rows, dataKey]);
  return (
    <Panel title={title} note={note}>
      {points.length > 0 ? (
        <>
          <BigNumber value={Math.round(average).toLocaleString("en-US")} unit={`${unit} a day`} />
          {line ? <p className="mt-0.5 text-[13.5px] text-muted-foreground">{line}</p> : null}
          <div className="mt-3">
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={points} margin={margin}>
                <CartesianGrid {...gridProps} />
                <XAxis {...axisProps} dataKey="date" tickFormatter={formatDayKey} />
                <YAxis {...axisProps} width={44} domain={[0, "auto"]} />
                <Tooltip
                  cursor={{ stroke: CHART.axis, strokeWidth: 1 }}
                  content={<ChartTooltip unit={` ${unit}`} format={(value) => String(Math.round(value))} labelFormat={formatDayKey} />}
                />
                <Line {...animationProps} type="monotone" dataKey="value" name="Eaten" stroke={CHART.quiet} strokeWidth={0} dot={{ r: 2, fill: CHART.quiet }} />
                <Line {...animationProps} type="monotone" dataKey="average" name="7-day average" stroke={accent} strokeWidth={2} dot={false} />
                {target ? <ReferenceLine y={target} stroke={CHART.axis} strokeDasharray="4 4" /> : null}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: CHART.quiet }} aria-hidden />
              Each day
            </span>
            <LineKey color={accent} label="7-day average" />
            {target ? <LineKey color={CHART.axis} label={`Target ${target.toLocaleString("en-US")} ${unit}`} dashed /> : null}
          </div>
        </>
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
          <div className="flex h-2 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={parts.map((part) => `${part.label} ${part.percent}%`).join(", ")}>
            {parts.map((part) => (
              <span key={part.label} style={{ width: `${part.percent}%`, backgroundColor: part.color }} />
            ))}
          </div>
          <dl className="mt-2.5 grid grid-cols-3 gap-2">
            {parts.map((part) => (
              <div key={part.label} className="min-w-0">
                <dt className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: part.color }} aria-hidden />
                  {part.label}
                </dt>
                <dd className="mt-0.5 text-[15.5px] font-semibold tabular-nums">{part.percent}%</dd>
                <dd className="text-[13px] text-muted-foreground tabular-nums">{part.grams} g</dd>
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
      note="Missed means a past meal you did not tick or skip. It may be that you ate it and did not tick it. Extras are not on the plan, so they do not count here."
    >
      {result.rate !== undefined ? (
        <>
          <BigNumber value={`${Math.round(result.rate * 100)}%`} unit="of your plan" />
          <p className="mt-0.5 text-[13.5px] text-muted-foreground tabular-nums">
            {result.eaten} of {result.planned} planned meals eaten
          </p>
          <div className="mt-3">
            <Facts
              items={[
                { label: "Skipped", value: String(result.skipped) },
                { label: "Missed", value: String(result.missed) },
                { label: "Extras", value: String(result.extras) }
              ]}
            />
          </div>
        </>
      ) : (
        <EmptyChart>Schedule a meal plan to see this.</EmptyChart>
      )}
    </Panel>
  );
}

function SpendCard({ result }: { result: Spend }) {
  const { accent } = useSection();
  return (
    <Panel title="Spend" note="This is the cost you typed for each meal. Skipped meals cost nothing here.">
      {result.weeks.length > 0 ? (
        <>
          <BigNumber value={formatRupees(Math.round(result.perDay))} unit="a day" />
          <p className="mt-0.5 text-[13.5px] text-muted-foreground">What the meals you ate cost, on the days you logged</p>
          <ul className="rows mt-2">
            <Row label="This month" value={formatRupees(Math.round(result.thisMonth))} />
            <Row label="In this range" value={formatRupees(Math.round(result.total))} />
          </ul>
          <div className="mt-2">
            <ResponsiveContainer width="100%" height={170}>
              <BarChart data={result.weeks} margin={margin}>
                <CartesianGrid {...gridProps} />
                <XAxis {...axisProps} dataKey="week" tickFormatter={formatDayKey} />
                <YAxis {...axisProps} width={44} />
                <Tooltip
                  cursor={{ fill: CHART.wash }}
                  content={<ChartTooltip format={(value) => formatRupees(Math.round(value))} labelFormat={(label) => `Week of ${formatDayKey(label)}`} />}
                />
                <Bar {...animationProps} dataKey="costInr" name="Spent" fill={accent} maxBarSize={14} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      ) : (
        <EmptyChart>Add a cost to your meals, then tick them.</EmptyChart>
      )}
    </Panel>
  );
}

/** Three round ticks that hold every value: 2,000, 2,500, 3,000, and never 2,281 or 2,873. */
function roundTicks(values: number[], step: number): number[] {
  const low = Math.floor(Math.min(...values) / step) * step;
  const every = Math.max(1, Math.ceil((Math.max(...values) - low) / 2 / step)) * step;
  return [low, low + every, low + every * 2];
}

/** One of the two lines below, on its own axis over the same days. */
function FuelLine({
  rows,
  dataKey,
  name,
  unit,
  color,
  step,
  dates
}: {
  rows: FuelVsWeight["rows"];
  dataKey: "kcal" | "weight";
  name: string;
  unit: string;
  color: string;
  /** What the axis's ticks round to. */
  step: number;
  /** Only the lower chart prints the dates. */
  dates?: boolean;
}) {
  const ticks = roundTicks(rows.flatMap((row) => row[dataKey] ?? []), step);
  return (
    <ResponsiveContainer width="100%" height={dates ? 124 : 104}>
      {/* With no dates under it, the lowest number needs room of its own. */}
      <LineChart data={rows} margin={{ ...margin, bottom: dates ? 0 : 8 }} syncId="diet-fuel">
        <CartesianGrid {...gridProps} />
        <XAxis {...axisProps} dataKey="date" tickFormatter={formatDayKey} hide={!dates} />
        <YAxis {...axisProps} width={44} domain={[ticks[0], ticks[2]]} ticks={ticks} interval={0} />
        <Tooltip
          cursor={{ stroke: CHART.axis, strokeWidth: 1 }}
          content={<ChartTooltip unit={` ${unit}`} format={(value) => String(Math.round(value * 10) / 10)} labelFormat={formatDayKey} />}
        />
        <Line {...animationProps} type="monotone" dataKey={dataKey} name={name} stroke={color} strokeWidth={2} connectNulls dot={dataKey === "weight" ? { r: 2, fill: color } : false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Two charts over one time axis, never two scales on one chart: where they would cross means nothing. */
function FuelCard({ fuel }: { fuel: FuelVsWeight }) {
  const { accent } = useSection();
  const change = fuel.weightChange;
  return (
    <Panel
      title="Food and bodyweight"
      note="This shows two things side by side. It does not show that one caused the other. Water, salt and training also move the scale, and the calories are estimates."
    >
      <p className="text-[13.5px] leading-snug text-muted-foreground">
        Over {fuel.weeks} weeks you logged about {fuel.averageKcal.toLocaleString("en-US")} kcal a day, and your weight went{" "}
        {change === 0 ? "nowhere" : change > 0 ? `up ${change} kg` : `down ${Math.abs(change)} kg`}.
      </p>
      <p className="mt-3 text-[12.5px] text-muted-foreground">Calories, 7-day average</p>
      <FuelLine rows={fuel.rows} dataKey="kcal" name="Calories" unit="kcal" color={accent} step={100} />
      <p className="mt-2 text-[12.5px] text-muted-foreground">Weight, kg</p>
      <FuelLine rows={fuel.rows} dataKey="weight" name="Weight" unit="kg" color={CHART.series[1]} step={1} dates />
    </Panel>
  );
}

/** The open card lives in the URL (`/progress?view=money`). Suspense: the search params are only known in the browser. */
export function DietProgress() {
  return (
    <Suspense>
      <DietProgressView />
    </Suspense>
  );
}

/**
 * The Progress tab on the Diet side: what you ate, what it cost, and where it is
 * taking you. The three cards are the only way in, as on the workout side, and the
 * science sits inside the card it is about.
 */
function DietProgressView() {
  const days = useDietStore((state) => state.scheduledMealDays);
  const settings = useDietStore((state) => state.settings);
  const today = useDietStore((state) => state.activeDate);
  const measurements = useWorkoutStore((state) => state.measurements);
  const [range, setRange] = useState<ProgressRange>("12w");
  const [custom, setCustom] = useState<DateWindow>();

  const params = useSearchParams();
  const urlCard = cardFromQuery(params.get("view"));
  // A tap answers in the same frame: the heading and the card change now, and the
  // charts behind them follow at low priority (`shownCard`).
  const [card, setCard] = useState(urlCard);
  useEffect(() => setCard(urlCard), [urlCard]);
  const shownCard = useDeferredValue(card);
  const openCard = (id?: DietCardId) => {
    setCard(id);
    // Not the router: this page reads the view in the browser, so there is nothing
    // to ask the server for.
    window.history.replaceState(null, "", id ? `/progress?view=${id}` : "/progress");
  };

  const dates = useMemo(() => {
    const earliest = days.reduce<string | undefined>((first, day) => (!first || day.date < first ? day.date : first), undefined);
    return rangeWindow(range, today, earliest, custom);
  }, [custom, days, range, today]);

  const rows = useMemo(() => dailyIntake(days, dates), [days, dates]);
  const average = useMemo(() => averageIntake(rows), [rows]);
  const perKg = useMemo(() => proteinPerKg(rows, measurements), [measurements, rows]);
  const planned = useMemo(() => adherence(days, dates, today), [dates, days, today]);
  const money = useMemo(() => spend(days, dates, today), [dates, days, today]);
  const fuel = useMemo(() => fuelVsWeight(rows, measurements), [measurements, rows]);
  const goal = useBodyGoal();

  const rings = useMemo(
    () => ({
      eating: eatingRing(planned, rows.length, windowDays(dates)),
      money: moneyRing(money, today),
      body: bodyRing(goal.path, goal.firstKg, goal.pathNeeds)
    }),
    [dates, goal.firstKg, goal.path, goal.pathNeeds, money, planned, rows.length, today]
  );

  // Built once per card and range, so a tap re-renders the heading and not this.
  const charts = useMemo(
    () =>
      shownCard === "eating" ? (
        <SectionColors section="strength">
          <DailyCard
            title="Calories"
            note="Only meals you ticked count. A day with no ticks is left out, so it does not pull the average down."
            rows={rows}
            dataKey="kcal"
            unit="kcal"
            average={average.kcal}
            target={settings.kcalTarget}
            empty="Tick a meal on the Meals tab to see this."
          />
          <DailyCard
            title="Protein"
            line={perKg !== undefined ? `About ${perKg.toFixed(1)} g per kg of your bodyweight` : "Add a weigh-in on You to see grams per kg"}
            note="Grams per kg uses your weight on each day, from your weigh-ins on You."
            rows={rows}
            dataKey="proteinG"
            unit="g"
            average={average.proteinG}
            target={settings.proteinTargetG}
            empty="Tick a meal on the Meals tab to see this."
          />
          <MacroCard rows={rows} />
          <AdherenceCard result={planned} />
          <EatingScience dates={dates} />
        </SectionColors>
      ) : shownCard === "money" ? (
        <SectionColors section="consistency">
          <SpendCard result={money} />
          <MoneyScience dates={dates} />
        </SectionColors>
      ) : shownCard === "body" ? (
        <SectionColors section="body">
          <BodyGoalCards goal={goal} />
          <Reveal
            ready={Boolean(fuel)}
            title="Food and bodyweight"
            need={`${FUEL_CALLOUT_WEEKS} weeks of ticked meals, and a weigh-in at each end`}
          >
            {fuel ? <FuelCard fuel={fuel} /> : null}
          </Reveal>
          <EnergyCards goal={goal} />
        </SectionColors>
      ) : // Nothing to average on a new account: the heading already says where to start.
      rows.length > 0 ? (
        <>
          <ListGroup title="Your average day" aside="On days you logged" className="pt-2">
            <ListRow label="Calories" hint={settings.kcalTarget ? `Target ${formatKcal(settings.kcalTarget)}` : undefined} value={formatKcal(average.kcal)} />
            <ListRow
              label="Protein"
              hint={[perKg !== undefined ? `${perKg.toFixed(1)} g per kg` : "", settings.proteinTargetG ? `Target ${settings.proteinTargetG} g` : ""].filter(Boolean).join(" · ") || undefined}
              value={`${Math.round(average.proteinG)} g`}
            />
            <ListRow label="Carbs" hint={settings.carbsTargetG ? `Target ${settings.carbsTargetG} g` : undefined} value={`${Math.round(average.carbsG)} g`} />
            <ListRow label="Fat" hint={settings.fatTargetG ? `Target ${settings.fatTargetG} g` : undefined} value={`${Math.round(average.fatG)} g`} />
            {average.costInr > 0 ? <ListRow label="Spend" value={formatRupees(Math.round(average.costInr))} /> : null}
          </ListGroup>
          <CoverageCard result={goal.energy.coverage} />
        </>
      ) : null,
    [average, dates, fuel, goal, money, perKg, planned, rows, settings, shownCard]
  );

  const open = CARDS.find((item) => item.id === card);

  return (
    <section className="space-y-3">
      {/* The same place as on the workout side, with the same one quiet button. */}
      <div className="flex justify-end">
        <RangeMenu
          range={range}
          // Opening the picker seeds it with whatever range you were already on,
          // so the first thing you see is the window you just left, editable.
          onRangeChange={(next) => {
            if (next === "custom") {
              setCustom(dates);
            }
            setRange(next);
          }}
          window={dates}
          onWindowChange={setCustom}
          today={today}
        />
      </div>

      {open ? (
        <ProgressHero title={open.label} sentence={rings[open.id].sentence} color={SECTION_THEMES[open.section].accent} />
      ) : (
        <ProgressHero title={dietHeadline(planned, rows.length, range)} sentence={averageLine(average, rows.length)} />
      )}

      <RingCards cards={CARDS} rings={rings} selected={card} onSelect={openCard} label="Diet progress cards" tour="diet-intake" />

      {/* Dimmed for the moment the old card's charts are still up. */}
      <div className={cn("space-y-3 transition-opacity duration-150", card !== shownCard && "opacity-50")}>{charts}</div>
    </section>
  );
}

"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { useDietStore } from "@/features/diet/diet-store";
import { MeterBar } from "@/features/diet/meter-bar";
import { CHART, ChartTooltip, EmptyChart, animationProps, axisProps, formatSigned, gridProps, useSection } from "@/features/progress/chart-theme";
import { Panel, SectionRule } from "@/features/progress/panel";
import { useWorkoutStore } from "@/features/workout/workout-store";
import { NAVY_ERROR_PERCENT, buildComposition, compositionNeeds } from "@/lib/body-composition";
import { cardioSessions } from "@/lib/cardio-metrics";
import { PATH_COPY } from "@/lib/diet-cards";
import { averageIntake, dailyIntake, weighInsOf } from "@/lib/diet-metrics";
import { BUILD_SURPLUS_SHARE, buildBodyRoadmap, currentStep, hasBodyGoal, pathMilestones, trainingMonths, type BodyRoadmap, type RoadmapPhase } from "@/lib/diet-body-goal";
import { MIN_COMPLETE_DAYS, buildMicroReport, type MicroReport } from "@/lib/diet-micros";
import {
  AVAILABILITY_BANDS,
  CARB_BAND,
  FAT_SHARE_BAND,
  MIN_LOGGED_DAYS,
  PROTEIN_BAND,
  PROTEIN_DOSE_G_PER_KG,
  PROTEIN_DOSE_MEALS,
  RECENT_DAYS,
  UNDER_LOGGING_SHARE,
  buildCarbSplit,
  buildCoverage,
  buildEnergyAvailability,
  buildFatFloor,
  buildGoalPath,
  buildProteinDays,
  buildProteinMeals,
  buildProteinValue,
  buildRealMaintenance,
  buildWeekendGap,
  looksUnderLogged,
  type CarbSplit,
  type Coverage,
  type EnergyAvailability,
  type FatFloor,
  type GoalPath,
  type ProteinDays,
  type ProteinMeals,
  type ProteinValue,
  type RealMaintenance,
  type WeekendGap
} from "@/lib/diet-science";
import { KCAL_PER_KG, activityFactor, bmr, buildSessionEnergy, tdee } from "@/lib/energy";
import { formatRupees } from "@/lib/meal-schedule";
import { earliestLogDate, formatDayKey, shiftKey, type DateWindow } from "@/lib/progress-metrics";
import type { RingTone } from "@/lib/progress-scores";
import { timedSessions } from "@/lib/session-time";
import { cn } from "@/lib/utils";

const dateOfDayNumber = (t: number) => new Date(t * 86_400_000).toISOString().slice(0, 10);

const kcal = (value: number) => `${Math.round(value).toLocaleString("en-US")} kcal`;

/** A few small numbers side by side, with nothing around them. Shared with the Intake charts. */
export function Facts({ items }: { items: { label: string; value: string }[] }) {
  return (
    <dl className="grid gap-2" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="truncate text-[12.5px] text-muted-foreground">{item.label}</dt>
          <dd className="mt-0.5 text-[15.5px] font-semibold tabular-nums">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The one big number on a card, with what it counts. Shared with the Intake charts. */
export function BigNumber({ value, unit }: { value: string; unit?: string }) {
  return (
    <p className="plot-n">
      {value}
      {unit ? <span className="ml-1.5 text-[15px] font-normal text-muted-foreground">{unit}</span> : null}
    </p>
  );
}

/** One fact on a line, inside `.rows`. Shared with the Intake charts. */
export function Row({ label, hint, value }: { label: string; hint?: string; value: string }) {
  return (
    <li className="flex items-baseline justify-between gap-3 py-2">
      <span className="min-w-0">
        <span className="block text-[15px]">{label}</span>
        {hint ? <span className="mt-px block text-[13px] text-muted-foreground">{hint}</span> : null}
      </span>
      <span className="shrink-0 text-[15px] font-medium tabular-nums">{value}</span>
    </li>
  );
}

/** A line's name, drawn as the line is. Shared with the Intake charts. */
export function LineKey({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={cn("w-4 border-t-2", dashed && "border-dashed")} style={{ borderColor: color }} aria-hidden />
      {label}
    </span>
  );
}

function ScienceNote() {
  return (
    <p className="px-1 pt-1 text-center text-xs leading-snug text-muted-foreground">
      Estimates from your own log, using published formulas. Not medical advice.
    </p>
  );
}

const TONE_CLASS: Record<RingTone, string> = {
  good: "text-success",
  steady: "text-warning",
  low: "text-danger"
};

/** Under, within and over a band, as one bar, with the counts spelled out under it. */
function BandBar({ under, within, over, days }: { under: number; within: number; over: number; days: number }) {
  const parts = [
    { label: "Under", count: under, color: "bg-warning" },
    { label: "In range", count: within, color: "bg-success" },
    { label: "Over", count: over, color: "bg-muted-foreground/50" }
  ];
  return (
    <>
      <div className="flex h-2 gap-0.5 overflow-hidden rounded-full" aria-hidden>
        {parts.map((part) =>
          part.count > 0 ? <span key={part.label} className={part.color} style={{ width: `${(part.count / days) * 100}%` }} /> : null
        )}
      </div>
      <dl className="mt-2.5 grid grid-cols-3 gap-2">
        {parts.map((part) => (
          <div key={part.label}>
            <dt className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
              <span className={cn("h-2 w-2 rounded-full", part.color)} aria-hidden />
              {part.label}
            </dt>
            <dd className="mt-0.5 text-[15.5px] font-semibold tabular-nums">
              {part.count} day{part.count === 1 ? "" : "s"}
            </dd>
          </div>
        ))}
      </dl>
    </>
  );
}

// -- the roadmap to a body goal ---------------------------------------------------

const PHASE_COPY: Record<RoadmapPhase["id"], { title: string; line: string }> = {
  cut: { title: "Lose fat, keep muscle", line: "Lift hard and eat your protein, so the weight you lose is fat." },
  build: { title: "Build muscle", line: "A small surplus. The scale also rises, because some fat comes with the muscle." },
  hold: { title: "Hold", line: "You are at your goal. Eat at maintenance and keep training." }
};

const LEVEL_LABEL: Record<BodyRoadmap["level"], string> = { beginner: "beginner", intermediate: "intermediate", advanced: "advanced" };

function monthsLabel(days: number) {
  const weeks = Math.round(days / 7);
  return weeks < 9 ? `${weeks} week${weeks === 1 ? "" : "s"}` : `${Math.round(days / 30.44)} months`;
}

function BodyRoadmapCard({ map, needs, hasGoal }: { map?: BodyRoadmap; needs: string[]; hasGoal: boolean }) {
  const { accent, tint } = useSection();
  return (
    <Panel
      title="Your muscle goal roadmap"
      caption={map ? `${map.goalLeanKg} kg lean at ${map.goalBodyFat} % fat, which is ${map.goalWeightKg} kg` : "A goal for muscle and fat, not only weight"}
      note={
        <>
          Goal weight = lean mass ÷ (1 − body fat share). Fat loss runs at 0.5 % of bodyweight a week, and the deficit never goes under your
          resting burn. Muscle gain is the low end of each tier of Alan Aragon&apos;s coaching model: 1 %, 0.5 % or 0.25 % of bodyweight a month for a
          beginner, intermediate or advanced lifter, and about half that for women. That model comes from experience, not a controlled
          study. The surplus is {Math.round(BUILD_SURPLUS_SHARE * 100)} % over maintenance, the low end of Iraki et al. (2019). The lifter level comes from your first logged workout.
          Lean mass is from the US Navy tape formula, which is about ±{NAVY_ERROR_PERCENT} % body fat, and it includes bone and water. The phases run one
          after the other, and a beginner can often do both at once. Measure every few weeks and the map updates.
        </>
      }
    >
      {!map ? (
        <EmptyChart>
          {hasGoal ? `Needs ${needs.join(", ")} on You.` : (
            <>
              <Link href="/profile" className="font-medium text-foreground underline underline-offset-2">
                Set a lean mass or body fat goal on You
              </Link>{" "}
              to see your roadmap.
            </>
          )}
        </EmptyChart>
      ) : (
        <>
          {map.phases[0].id === "hold" ? (
            <BigNumber value="You are there" />
          ) : (
            <BigNumber value={`${formatDayKey(map.finishDate)}, ${map.finishDate.slice(0, 4)}`} unit="goal date" />
          )}
          <div className="mt-3">
            <Facts
              items={[
                { label: "Lean mass", value: `${map.currentLeanKg} kg` },
                { label: "Body fat", value: `${map.currentBodyFat} %` },
                { label: "Weight", value: `${map.currentKg} kg` }
              ]}
            />
          </div>

          <ol className="mt-4">
            {map.phases.map((phase, index) => (
              <li key={phase.id} className="flex gap-3 pb-3">
                <span className="flex flex-col items-center" aria-hidden>
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12.5px] font-semibold tabular-nums"
                    style={{ backgroundColor: tint }}
                  >
                    {index + 1}
                  </span>
                  <span className="mt-1 w-px flex-1 bg-[var(--sep)]" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-medium">{PHASE_COPY[phase.id].title}</p>
                  {phase.id === "hold" ? null : (
                    <p className="text-[13px] text-muted-foreground tabular-nums">
                      {monthsLabel(phase.days)}, until {formatDayKey(phase.toDate)}
                    </p>
                  )}
                  <p className="mt-0.5 text-[13px] text-muted-foreground">{PHASE_COPY[phase.id].line}</p>
                  <ul className="rows mt-1">
                    {phase.id === "hold" ? null : <Row label="Weight" value={`${phase.fromKg} to ${phase.toKg} kg`} />}
                    <Row label="End of this step" value={`${phase.leanKg} kg lean, ${phase.bodyFatPercent} % fat`} />
                    {phase.kcalPerDay > 0 ? <Row label="Eat a day" value={kcal(phase.kcalPerDay)} /> : null}
                    <Row label="Protein a day" value={`${phase.proteinG.low} to ${phase.proteinG.high} g`} />
                  </ul>
                </div>
              </li>
            ))}
            {map.phases[0].id === "hold" ? null : (
              <li className="flex items-center gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: tint }} aria-hidden>
                  <Check className="h-3.5 w-3.5" strokeWidth={2.6} style={{ color: accent }} />
                </span>
                <p className="text-[15px] font-medium">
                  {map.goalWeightKg} kg, {map.goalLeanKg} kg lean, {map.goalBodyFat} % fat
                </p>
              </li>
            )}
          </ol>

          <div className="mt-3 space-y-1 text-[13px] leading-snug text-muted-foreground">
            <p>
              Based on a {LEVEL_LABEL[map.level]} lifter ({map.months} months logged), about {map.muscleKgPerMonth} kg of muscle a month. An estimate, so the date can move.
            </p>
            {map.gapKcal !== undefined && map.phases[0].kcalPerDay > 0 && Math.abs(map.gapKcal) >= 50 ? (
              <p>
                You eat about {kcal(Math.abs(map.gapKcal))} {map.gapKcal > 0 ? "more" : "less"} a day than step 1 takes.
              </p>
            ) : null}
            {map.pastNaturalCeiling ? <p className="text-warning">This lean mass is past what few drug-free men reach (Kouri et al., 1995). It may not be possible.</p> : null}
          </div>
        </>
      )}
    </Panel>
  );
}

// -- the path to the target weight ----------------------------------------------

/** Whole kilograms, no repeats: 78, 79, 80, 81 and not 78, 79, 80, 80, 81. */
function wholeTicks(low: number, high: number): number[] {
  const every = Math.max(1, Math.ceil((high - low) / 4));
  const ticks: number[] = [];
  for (let tick = low; tick <= high; tick += every) {
    ticks.push(tick);
  }
  return ticks;
}

function GoalPathCard({ path, needs, today }: { path?: GoalPath; needs: string[]; today: string }) {
  const { accent } = useSection();
  const paceName = path?.fromRoadmap ? "your roadmap's pace" : "the standard pace";
  const paceKey = path?.fromRoadmap ? "Roadmap pace" : "Standard pace";
  // Stops on the way: at what is eaten if that arrives, or else at the standard pace.
  const stopsEnd = path?.finishDate ?? path?.planFinishDate;
  const stops = path && stopsEnd ? pathMilestones(path.currentKg, path.goalKg, today, stopsEnd) : [];
  const food = CHART.series[1];
  const copy = path ? PATH_COPY[path.status] : undefined;
  const values = path
    ? [path.goalKg, ...path.rows.flatMap((row) => [row.actual, row.fromFood, row.plan].filter((value): value is number => value !== undefined))]
    : [];
  const axisLow = Math.floor(Math.min(...values) - 0.5);
  const axisHigh = Math.ceil(Math.max(...values) + 0.5);
  const todayT = path?.rows.find((row) => row.actual === path.currentKg && row.fromFood === path.currentKg)?.t;
  const windowing = path && path.direction !== "hold";
  return (
    <Panel
      title="Path to your target weight"
      caption={
        path
          ? `${path.currentKg} kg now, ${path.goalKg} kg target${path.fromRoadmap ? ", step 1 of your roadmap" : ""}`
          : "Where your food is taking your weight"
      }
      note={
        <>
          Your average calories over the last {RECENT_DAYS} days, less your maintenance, × 7 ÷{" "}
          {KCAL_PER_KG.toLocaleString("en-US")} kcal per kg (Wishnofsky, a rule of thumb) gives kg a week. The
          dashed line continues that from today. The dotted line is the standard pace, 0.5 % of bodyweight a
          week, from your first weigh-in in the last 8 weeks. With a muscle goal, the target is instead the end of
          your next roadmap step, at that step&apos;s pace. It is a straight line, and a real body slows as it
          adapts (Hall et al., 2011), so a date far away is only a rough guide.
        </>
      }
    >
      {!path || !copy ? (
        <EmptyChart>Needs {needs.join(", ")}.</EmptyChart>
      ) : (
        <>
          <p className={cn("text-[15px] font-medium", TONE_CLASS[copy.tone])}>{copy.headline}</p>
          <div className="mt-3">
            <Facts
              items={[
                { label: "You eat a day", value: Math.round(path.averageIntake).toLocaleString("en-US") },
                { label: windowing ? "Pace needs" : "To hold", value: path.neededKcal.toLocaleString("en-US") },
                { label: "A week", value: `${formatSigned(path.foodKgPerWeek, 2)} kg` }
              ]}
            />
          </div>
          <div className="mt-3">
            <ResponsiveContainer width="100%" height={210}>
              <LineChart data={path.rows} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                <CartesianGrid {...gridProps} />
                <XAxis
                  {...axisProps}
                  type="number"
                  dataKey="t"
                  domain={["dataMin", "dataMax"]}
                  tickCount={4}
                  tickFormatter={(t: number) => formatDayKey(dateOfDayNumber(t))}
                />
                <YAxis
                  {...axisProps}
                  width={44}
                  domain={[axisLow, axisHigh]}
                  ticks={wholeTicks(axisLow, axisHigh)}
                  tickFormatter={(value: number) => value.toFixed(0)}
                />
                <Tooltip
                  cursor={{ stroke: CHART.axis, strokeWidth: 1 }}
                  // The axis is a number so it is true to time; the tooltip wants the date back.
                  content={(props) => (
                    <ChartTooltip
                      {...(props as object)}
                      // Recharts also renders this with no label, before anything is hovered.
                      label={typeof props.label === "number" ? dateOfDayNumber(props.label) : undefined}
                      unit=" kg"
                      format={(value) => value.toFixed(1)}
                      labelFormat={formatDayKey}
                    />
                  )}
                />
                <ReferenceLine
                  y={path.goalKg}
                  stroke={CHART.axis}
                  strokeDasharray="4 4"
                  label={{ value: `Target ${path.goalKg} kg`, position: "insideBottomRight", fill: CHART.axis, fontSize: 10, fontFamily: "var(--font-sans)" }}
                />
                {todayT !== undefined ? <ReferenceLine x={todayT} stroke={CHART.grid} /> : null}
                <Line {...animationProps} type="linear" dataKey="plan" name={paceKey} stroke={CHART.quiet} strokeWidth={1.5} strokeDasharray="1 4" dot={false} connectNulls />
                <Line {...animationProps} type="linear" dataKey="fromFood" name="At what you eat" stroke={food} strokeWidth={2} strokeDasharray="6 4" dot={false} connectNulls />
                <Line {...animationProps} type="linear" dataKey="actual" name="Weigh-in" stroke={accent} strokeWidth={2} dot={{ r: 2, fill: accent }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
              <LineKey color={accent} label="Your weigh-ins" />
              <LineKey color={food} label="At what you eat" dashed />
              <LineKey color={CHART.quiet} label={paceKey} dashed />
            </div>
          </div>
          <ul className="rows mt-2">
            {windowing ? (
              <Row
                label="At what you eat"
                value={path.finishDate ? `Target by ${formatDayKey(path.finishDate)}` : "No date"}
                hint={path.finishDate ? undefined : "Your food does not reach the target in 2 years"}
              />
            ) : null}
            {path.againstPlanKg !== undefined && windowing ? (
              <Row
                label={`Against ${paceName}`}
                value={
                  Math.abs(path.againstPlanKg) < 0.1
                    ? "On the line"
                    : `${Math.abs(path.againstPlanKg)} kg ${(path.direction === "lose") === path.againstPlanKg < 0 ? "ahead" : "behind"}`
                }
              />
            ) : null}
            {windowing ? (
              <Row
                label={`${path.gapKcal >= 0 ? "Above" : "Below"} ${paceName}`}
                hint="Your calories a day, against what the pace takes"
                value={kcal(Math.abs(path.gapKcal))}
              />
            ) : null}
            {windowing && path.planFinishDate ? <Row label={`At ${paceName}`} value={`Target by ${formatDayKey(path.planFinishDate)}`} /> : null}
            <Row
              label="Maintenance used"
              hint={path.maintenanceSource === "measured" ? "From your food and your scale" : "From the formula, until your food and scale can measure it"}
              value={kcal(path.maintenance)}
            />
          </ul>
          {windowing && stops.length > 0 ? (
            <div className="mt-3">
              <p className="text-[12.5px] text-muted-foreground">
                On the way, {path.finishDate ? "at what you eat" : `at ${paceName}`}
              </p>
              <ol className="mt-1 grid grid-cols-4 gap-2">
                {stops.map((stop) => (
                  <li key={stop.date} className="min-w-0">
                    <p className="text-[15.5px] font-semibold tabular-nums">{stop.kg}</p>
                    <p className="text-[12px] text-muted-foreground">{formatDayKey(stop.date)}</p>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </>
      )}
    </Panel>
  );
}

// -- energy ---------------------------------------------------------------------

function RealMaintenanceCard({ real, formula }: { real?: RealMaintenance; formula?: number }) {
  const under = real ? looksUnderLogged(real.kcal, formula) : false;
  return (
    <Panel
      title="Your real maintenance"
      caption={real ? `From ${real.loggedDays} logged days and your scale` : "What your own body burns"}
      note={
        <>
          Your average calories, less the energy your scale says you stored: kg a week ×{" "}
          {KCAL_PER_KG.toLocaleString("en-US")} ÷ 7. This reads your own body, and the formula reads a
          population. It is only as true as your logging. People often log less than they eat, in one study by
          nearly half (Lichtman et al., 1992), so we flag a result under {Math.round(UNDER_LOGGING_SHARE * 100)} % of the formula.
        </>
      }
    >
      {!real ? (
        <EmptyChart>Needs {MIN_LOGGED_DAYS} logged days and 3 weigh-ins in the last {RECENT_DAYS} days.</EmptyChart>
      ) : (
        <>
          <BigNumber value={real.kcal.toLocaleString("en-US")} unit="kcal a day" />
          <ul className="rows mt-2">
            <Row label="You ate" value={kcal(real.averageIntake)} />
            <Row label="Your scale moved" value={`${formatSigned(real.kgPerWeek, 2)} kg a week`} />
            {formula !== undefined ? <Row label="The formula says" value={kcal(formula)} /> : null}
          </ul>
          {under ? (
            <p className="mt-2 text-[13px] leading-snug text-warning">
              This is far under the formula. You may eat more than you tick, so check for missing meals first.
            </p>
          ) : null}
        </>
      )}
    </Panel>
  );
}

const AVAILABILITY_COPY: Record<EnergyAvailability["band"], { label: string; tone: string }> = {
  low: { label: "Low. Your body may not have enough for recovery and health.", tone: "text-danger" },
  reduced: { label: "Reduced. This is usual during a cut, but not for a long time.", tone: "text-warning" },
  good: { label: "Good. You have enough for training and recovery.", tone: "text-success" }
};

function AvailabilityCard({ result, hasLean }: { result?: EnergyAvailability; hasLean: boolean }) {
  return (
    <Panel
      title="Energy availability"
      caption="What is left after training, per kg of lean mass"
      note={
        <>
          (Calories − training burn) ÷ lean mass. Under {AVAILABILITY_BANDS.low} kcal per kg of lean mass, hormones and
          recovery start to suffer. About {AVAILABILITY_BANDS.good} is balance (Loucks and Thuma, 2003; Loucks et al.,
          2011). Most of this research is on women. Lean mass comes from the US Navy tape formula. Not a medical
          test: if you stay low and feel unwell, see a doctor.
        </>
      }
    >
      {!result ? (
        <EmptyChart>
          {hasLean ? `Needs ${MIN_LOGGED_DAYS} logged days in the last ${RECENT_DAYS} days.` : "Needs your waist and neck on You, for lean mass."}
        </EmptyChart>
      ) : (
        <>
          <BigNumber value={String(result.value)} unit="kcal per kg of lean mass" />
          <p className={cn("mt-1 text-[15px] font-medium", AVAILABILITY_COPY[result.band].tone)}>{AVAILABILITY_COPY[result.band].label}</p>
          <ul className="rows mt-2">
            <Row label="You ate" value={kcal(result.intake)} />
            <Row label="Training burn" value={`${kcal(result.exercisePerDay)} a day`} />
            <Row label="Lean mass" value={`${result.leanKg} kg`} />
          </ul>
        </>
      )}
    </Panel>
  );
}

// -- protein --------------------------------------------------------------------

function ProteinDaysCard({ result }: { result?: ProteinDays }) {
  return (
    <Panel
      title="Protein for muscle"
      caption={result ? `${result.averagePerKg} g per kg a day, on average` : `Target: ${PROTEIN_BAND.low} to ${PROTEIN_BAND.high} g per kg`}
      note={
        <>
          A review of 49 studies found that muscle gain from protein levels off near 1.6 g per kg a day, and at most near 2.2
          (Morton et al., 2018). More is not harmful for healthy people, but it adds little. During a cut, the upper
          end helps keep muscle (Helms et al., 2014).
        </>
      }
    >
      {!result ? <EmptyChart>Tick a meal, and add a weigh-in on You.</EmptyChart> : <BandBar {...result} />}
    </Panel>
  );
}

function ProteinMealsCard({ result }: { result?: ProteinMeals }) {
  return (
    <Panel
      title="Protein per meal"
      caption={result ? `A helpful dose for you: ${result.doseG} g or more` : "How you spread it across the day"}
      note={
        <>
          About {PROTEIN_DOSE_G_PER_KG} g per kg in a meal gives the most muscle building for young adults (Moore et al.,
          2015). Spreading protein over at least {PROTEIN_DOSE_MEALS} meals is a practical way to reach the daily total
          (Schoenfeld and Aragon, 2018). In one study, 20 g every 3 hours beat larger, rarer doses (Areta et al., 2013). The
          daily total matters most, so treat this as fine tuning.
        </>
      }
    >
      {!result ? (
        <EmptyChart>Tick a meal, and add a weigh-in on You.</EmptyChart>
      ) : (
        <Facts
          items={[
            { label: "Doses a day", value: String(result.dosesPerDay) },
            { label: "Meals a day", value: String(result.mealsPerDay) },
            { label: "Hours apart", value: result.averageGapHours !== undefined ? String(result.averageGapHours) : "–" }
          ]}
        />
      )}
    </Panel>
  );
}

// -- carbs and fat --------------------------------------------------------------

function CarbSplitCard({ result }: { result?: CarbSplit }) {
  return (
    <Panel
      title="Carbs on training days"
      caption={`Strength athletes often eat ${CARB_BAND.low} to ${CARB_BAND.high} g per kg`}
      note={
        <>
          Carbs fuel hard sets. For strength athletes, a common range is {CARB_BAND.low} to {CARB_BAND.high} g per kg a day (Slater and
          Phillips, 2011). Many people eat more on training days and less on rest days. This is a guide, not a rule: during
          a cut you may be under it. A training day is a day with a logged workout.
        </>
      }
    >
      {!result ? (
        <EmptyChart>Tick a meal, and add a weigh-in on You.</EmptyChart>
      ) : (
        <ul className="rows">
          <Row
            label="Training days"
            hint={result.training ? `${result.training.days} days · ${kcal(result.training.kcal)}` : "No logged workouts in this range"}
            value={result.training ? `${result.training.carbsPerKg} g per kg` : "–"}
          />
          <Row
            label="Rest days"
            hint={result.rest ? `${result.rest.days} days · ${kcal(result.rest.kcal)}` : "None in this range"}
            value={result.rest ? `${result.rest.carbsPerKg} g per kg` : "–"}
          />
        </ul>
      )}
    </Panel>
  );
}

function FatFloorCard({ result }: { result?: FatFloor }) {
  return (
    <Panel
      title="Fat"
      caption={result ? `${result.averageShare} % of your calories, on average` : `Accepted range: ${FAT_SHARE_BAND.low} to ${FAT_SHARE_BAND.high} % of calories`}
      note={
        <>
          The accepted range for adults is {FAT_SHARE_BAND.low} to {FAT_SHARE_BAND.high} % of calories (Institute of Medicine, 2005).
          Lifters who cut often go a little lower for a short time, at 15 to 30 % (Helms et al., 2014). Very low fat for a
          long time can lower hormones.
        </>
      }
    >
      {!result ? <EmptyChart>Tick a meal to see this.</EmptyChart> : <BandBar {...result} />}
    </Panel>
  );
}

// -- micronutrients ---------------------------------------------------------------

const amount = (value: number) => (value >= 100 ? String(Math.round(value)) : String(Number(value.toFixed(1))));

const names = (list: readonly { label: string }[]) => list.map((item) => item.label).join(", ");

function MicronutrientCard({ report, hasSex }: { report?: MicroReport; hasSex: boolean }) {
  const { accent } = useSection();
  return (
    <Panel
      title="Each nutrient"
      caption={report?.haveEaten ? `Average on ${report.completeDays} days where every meal has its foods` : "Each nutrient against its daily target"}
      note={
        <>
          Targets for iron, calcium, magnesium, zinc, folate and vitamins A, B1, B2, C and D are the 2020 recommended amounts
          for Indians (ICMR-NIN). Potassium (at least 3,510 mg) and sodium (under 2,000 mg) are from the WHO (2012). Fibre is 14 g
          per 1,000 kcal (Institute of Medicine, 2005). Food values are from the Indian Food Composition Tables 2017, for raw food,
          and cooking can lower vitamins C and folate. The table has no salt, so salt you add in cooking is not counted, and real sodium is
          higher. Vitamin A counts plant β-carotene at 12:1 (Institute of Medicine, 2001). Vitamin D counts D3 and mushrooms only, because
          the table&apos;s D2 in cereals and vegetables is far above what other tables show. Your body also makes vitamin D from sunlight. Vitamin B12
          is not in that table, so it is not shown. A low number here is a possible gap in your food, not a deficiency. Only a blood test
          can show that.
        </>
      }
    >
      {!hasSex || !report ? (
        <EmptyChart>Needs your sex on You: the targets differ for men and women.</EmptyChart>
      ) : !report.haveEaten && !report.havePlanned ? (
        <EmptyChart>Build a meal from foods in the library, then tick it. A meal you only type has no micronutrients.</EmptyChart>
      ) : (
        <>
          {report.haveEaten ? (
            <p className="text-[15px] font-medium">
              Good on {report.good.length} of {report.rows.length}.
              {report.low.length > 0 ? <span className="font-normal text-muted-foreground"> Low on {names(report.low)}.</span> : null}
            </p>
          ) : (
            <p className="text-[13px] text-muted-foreground">
              Needs {MIN_COMPLETE_DAYS} ticked days where every meal has its foods. Until then this shows your plan only.
            </p>
          )}
          {report.havePlanned ? (
            <div className="mt-2 space-y-1 text-[13px] leading-snug">
              {report.fixedByPlan.length > 0 ? <p className="text-success">Eat every planned meal and you also reach {names(report.fixedByPlan)}.</p> : null}
              {report.shortInPlan.length > 0 ? <p className="text-warning">Your plan is low on {names(report.shortInPlan)} even if you eat it all. Add foods with more of these.</p> : null}
              {report.overInPlan.length > 0 ? <p className="text-danger">Your plan goes over the limit for {names(report.overInPlan)}.</p> : null}
              {report.haveEaten && report.fixedByPlan.length + report.shortInPlan.length + report.overInPlan.length === 0 ? <p className="text-success">Your plan covers every nutrient here if you eat it all.</p> : null}
            </div>
          ) : null}

          <ul className="rows mt-2">
            {report.rows.map((row) => {
              const shown = row.eaten ?? row.planned ?? 0;
              return (
                <li key={row.key} className="py-2.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[15px]">
                      {row.label}
                      {row.limit ? <span className="text-[13px] text-muted-foreground"> limit</span> : null}
                    </span>
                    <span className={cn("shrink-0 text-[13px] tabular-nums", row.tone === "over" ? "font-semibold text-danger" : "text-muted-foreground")}>
                      {row.eaten !== undefined ? amount(row.eaten) : "–"} / {amount(row.target)} {row.unit}
                      {row.tone === "over" ? " · over" : ""}
                    </span>
                  </div>
                  <MeterBar
                    className="mt-1.5"
                    label={`${row.label}, ${row.eaten !== undefined ? "eaten" : "planned"}`}
                    value={shown}
                    target={row.target}
                    percent={row.eaten !== undefined ? Math.min(100, (row.eaten / row.target) * 100) : 0}
                    tone={row.tone}
                    color={accent}
                    markerPercent={row.planned !== undefined ? Math.min(100, (row.planned / row.target) * 100) : undefined}
                  />
                  <p className="mt-1 text-[12.5px] text-muted-foreground tabular-nums">
                    {row.planned !== undefined ? `Full plan: ${amount(row.planned)} ${row.unit}` : "No plan data"}
                    {row.topMeal ? ` · Most from ${row.topMeal}` : ""}
                  </p>
                  {row.key === "sodiumMg" ? <p className="text-[12.5px] text-warning">Salt you add in cooking is not counted, so your real number is higher.</p> : null}
                </li>
              );
            })}
          </ul>
          <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
            <span className="h-2.5 w-0.5 shrink-0 rounded-full bg-foreground" aria-hidden />
            The mark on each bar is what you reach if you eat every planned meal.
          </p>
          <p className="mt-1 text-[12.5px] text-muted-foreground tabular-nums">
            Known for {report.knownMeals} of {report.eatenMeals} meals you ate. Meals you only typed are not counted as zero.
          </p>
        </>
      )}
    </Panel>
  );
}

// -- patterns and money ---------------------------------------------------------

function WeekendCard({ result }: { result?: WeekendGap }) {
  return (
    <Panel
      title="Weekdays and weekend"
      caption={result ? `${formatSigned(result.gapKcal)} kcal a day at the weekend` : "Where a week's deficit often goes"}
      note={<>In a controlled study, people ate more at weekends, enough to stop weight loss (Racette et al., 2008). Only days you ticked are counted, and untracked weekend meals hide this.</>}
    >
      {!result ? (
        <EmptyChart>Needs 2 weekdays and 2 weekend days logged.</EmptyChart>
      ) : (
        <ul className="rows">
          <Row label="Monday to Friday" hint={`${formatRupees(Math.round(result.weekdayCost))} a day`} value={kcal(result.weekdayKcal)} />
          <Row label="Saturday and Sunday" hint={`${formatRupees(Math.round(result.weekendCost))} a day`} value={kcal(result.weekendKcal)} />
        </ul>
      )}
    </Panel>
  );
}

const VALUE_ROWS = 5;

function ProteinValueCard({ result }: { result?: ProteinValue }) {
  return (
    <Panel
      title="What your protein costs"
      caption={result ? undefined : "Your cheapest protein, from your own prices"}
      note={<>The cost you typed, divided by the protein in each meal you ate. Meals with no cost are left out, and so are meals under 5 g of protein. Your prices, not market prices.</>}
    >
      {!result ? (
        <EmptyChart>Add a cost to your meals, then tick them.</EmptyChart>
      ) : (
        <>
          <BigNumber value={formatRupees(result.per100gProtein)} unit="for 100 g of protein" />
          <ul className="rows mt-2">
            <Row label="1,000 kcal costs" value={formatRupees(result.per1000Kcal)} />
            {result.meals.slice(0, VALUE_ROWS).map((meal) => (
              <Row key={meal.name} label={meal.name} hint={`Eaten ${meal.times} time${meal.times === 1 ? "" : "s"}`} value={`${formatRupees(meal.per100gProtein)} / 100 g`} />
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}

export function CoverageCard({ result }: { result: Coverage }) {
  const percent = Math.round(result.share * 100);
  return (
    <Panel
      title="How far to trust this page"
      caption={`${result.logged} of the last ${result.of} days have a ticked meal`}
      note={<>Every number here comes from the meals you tick. A skipped tick is missing data. Self-reported food is often too low (Lichtman et al., 1992). The scale is the only measurement here, so believe it first.</>}
    >
      <div className="h-1 w-full overflow-hidden rounded-full bg-track">
        <div className={cn("h-full rounded-full", percent >= 75 ? "bg-success" : percent >= 50 ? "bg-warning" : "bg-danger")} style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-2.5 text-[13.5px] leading-snug text-muted-foreground">
        {percent >= 75 ? "Good. These averages are based on most of your days." : percent >= 50 ? "Fair. Tick more days for better averages." : "Low. Treat these numbers as a rough guide until you tick more days."}
      </p>
    </Panel>
  );
}

// -- the three cards --------------------------------------------------------------

/**
 * What the Body goals card reads. Its ring is on the page all the time, so this
 * runs with the page. Published rules run over the meals you ticked, each with its
 * source behind the ⓘ. Body and training are read, not changed.
 */
export function useBodyGoal() {
  const days = useDietStore((state) => state.scheduledMealDays);
  const today = useDietStore((state) => state.activeDate);
  const settings = useDietStore((state) => state.settings);
  const measurements = useWorkoutStore((state) => state.measurements);
  const profile = useWorkoutStore((state) => state.profile);
  const logs = useWorkoutStore((state) => state.logs);
  const scheduled = useWorkoutStore((state) => state.scheduledSessions);

  const energy = useMemo(() => {
    const restingKcal = bmr(profile, today);
    return {
      restingKcal,
      formula: restingKcal !== undefined ? tdee(restingKcal, activityFactor(timedSessions(scheduled), today).factor) : undefined,
      real: buildRealMaintenance(days, measurements, today),
      coverage: buildCoverage(days, today)
    };
  }, [days, measurements, profile, scheduled, today]);

  const roadmap = useMemo(() => {
    const composition = buildComposition(measurements, profile);
    if (!composition) {
      return undefined;
    }
    const recent = dailyIntake(days, { start: shiftKey(today, -27), end: today });
    return buildBodyRoadmap({
      composition,
      currentKg: composition.leanMassKg + composition.fatMassKg,
      heightCm: profile.heightCm,
      sex: profile.sex,
      settings,
      months: trainingMonths(earliestLogDate(logs), today),
      maintenance: energy.real?.kcal ?? energy.formula,
      restingKcal: energy.restingKcal,
      averageIntake: recent.length > 0 ? averageIntake(recent).kcal : undefined,
      today
    });
  }, [days, energy.formula, energy.real, energy.restingKcal, logs, measurements, profile, settings, today]);

  const path = useMemo(
    () =>
      buildGoalPath({
        days,
        measurements,
        // With a muscle goal, the weight to aim for now is the end of its next step.
        // Its final weight can be where the user stands today, with a whole cut and
        // build between, and aiming straight at it would contradict the roadmap.
        goalKg: roadmap ? roadmap.phases[0].toKg : profile.goalWeightKg,
        step: roadmap ? currentStep(roadmap) : undefined,
        formulaMaintenance: energy.formula,
        restingKcal: energy.restingKcal,
        today
      }),
    [days, energy.formula, energy.restingKcal, measurements, profile.goalWeightKg, roadmap, today]
  );

  const pathNeeds = useMemo(() => {
    const needs: string[] = [];
    if (!profile.goalWeightKg && !roadmap) needs.push("a goal weight on You");
    if (!measurements.some((item) => item.metric === "weight")) needs.push("a weigh-in on You");
    if (energy.coverage.logged < 7) needs.push("7 days of ticked meals");
    if (!energy.real && energy.formula === undefined) needs.push("your birth year and sex on You, or 3 weigh-ins");
    return needs;
  }, [energy.coverage.logged, energy.formula, energy.real, measurements, profile.goalWeightKg, roadmap]);

  const firstKg = useMemo(() => weighInsOf(measurements)[0]?.value, [measurements]);

  return { energy, roadmap, path, pathNeeds, firstKg };
}

export type BodyGoal = ReturnType<typeof useBodyGoal>;

/** Body goals, first: the question most people bring here, where the food is taking them. */
export function BodyGoalCards({ goal }: { goal: BodyGoal }) {
  const today = useDietStore((state) => state.activeDate);
  const settings = useDietStore((state) => state.settings);
  const measurements = useWorkoutStore((state) => state.measurements);
  const profile = useWorkoutStore((state) => state.profile);
  const roadmapNeeds = useMemo(() => compositionNeeds(measurements, profile), [measurements, profile]);

  return (
    <>
      <BodyRoadmapCard map={goal.roadmap} needs={roadmapNeeds} hasGoal={hasBodyGoal(settings)} />
      <GoalPathCard path={goal.path} needs={goal.pathNeeds} today={today} />
      {profile.goalWeightKg || goal.roadmap ? null : (
        <p className="px-1 text-[13px] text-muted-foreground">
          <Link href="/profile" className="font-medium text-foreground underline underline-offset-2">
            Set a goal weight on You
          </Link>{" "}
          to see this path.
        </p>
      )}
    </>
  );
}

/** Body goals, then: what your body burns. Always the last 4 weeks, whichever range is open. */
export function EnergyCards({ goal }: { goal: BodyGoal }) {
  const days = useDietStore((state) => state.scheduledMealDays);
  const today = useDietStore((state) => state.activeDate);
  const measurements = useWorkoutStore((state) => state.measurements);
  const profile = useWorkoutStore((state) => state.profile);
  const logs = useWorkoutStore((state) => state.logs);
  const setLogs = useWorkoutStore((state) => state.setLogs);
  const scheduled = useWorkoutStore((state) => state.scheduledSessions);

  const availability = useMemo(() => {
    const composition = buildComposition(measurements, profile);
    const sessions = buildSessionEnergy(timedSessions(scheduled), logs, cardioSessions(setLogs, logs), profile.weightKg);
    return {
      hasLean: Boolean(composition),
      result: buildEnergyAvailability(days, sessions, composition?.leanMassKg, today)
    };
  }, [days, logs, measurements, profile, scheduled, setLogs, today]);

  return (
    <>
      <SectionRule label="Energy" hint="the last 4 weeks, whichever range is open" />
      <RealMaintenanceCard real={goal.energy.real} formula={goal.energy.formula} />
      <AvailabilityCard result={availability.result} hasLean={availability.hasLean} />
      <ScienceNote />
    </>
  );
}

/** Eating, after the charts: protein, fuel, micronutrients and the shape of your week, over the range. */
export function EatingScience({ dates }: { dates: DateWindow }) {
  const days = useDietStore((state) => state.scheduledMealDays);
  const today = useDietStore((state) => state.activeDate);
  const measurements = useWorkoutStore((state) => state.measurements);
  const sex = useWorkoutStore((state) => state.profile.sex);
  const logs = useWorkoutStore((state) => state.logs);

  const inRange = useMemo(() => {
    const rows = dailyIntake(days, dates);
    const trainingDates = new Set(logs.map((log) => log.date));
    return {
      protein: buildProteinDays(rows, measurements),
      meals: buildProteinMeals(days, dates, measurements),
      carbs: buildCarbSplit(rows, trainingDates, measurements),
      fat: buildFatFloor(rows, measurements),
      weekend: buildWeekendGap(rows),
      micros: buildMicroReport(days, dates, sex, today)
    };
  }, [dates, days, logs, measurements, sex, today]);

  return (
    <>
      <SectionRule label="Protein" hint="how much, and how you spread it" />
      <ProteinDaysCard result={inRange.protein} />
      <ProteinMealsCard result={inRange.meals} />

      <SectionRule label="Carbs and fat" hint="fuel and floors" />
      <CarbSplitCard result={inRange.carbs} />
      <FatFloorCard result={inRange.fat} />

      <SectionRule label="Micronutrients" hint="vitamins, minerals and fibre" />
      <MicronutrientCard report={inRange.micros} hasSex={sex === "male" || sex === "female"} />

      <SectionRule label="Your week" hint="where a week's food goes" />
      <WeekendCard result={inRange.weekend} />
      <ScienceNote />
    </>
  );
}

/** Money, after the spend: what your protein costs, from your own prices. */
export function MoneyScience({ dates }: { dates: DateWindow }) {
  const days = useDietStore((state) => state.scheduledMealDays);
  const value = useMemo(() => buildProteinValue(days, dates), [dates, days]);
  return <ProteinValueCard result={value} />;
}

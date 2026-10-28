"use client";

import Link from "next/link";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { CHART, ChartTooltip, EmptyChart, animationProps, axisProps, formatCompact, formatSigned, gridProps, useSection } from "@/features/progress/chart-theme";
import { Panel } from "@/features/progress/panel";
import { SAFE_BAND } from "@/lib/body-composition";
import {
  KCAL_PER_KG,
  LIFTING_METS,
  MAX_SURPLUS_KCAL,
  PROTEIN_G_PER_KG,
  type ActivityLevel,
  type EnergyBalance,
  type IntakeTarget,
  type SessionEnergy
} from "@/lib/energy";
import { formatDayKey } from "@/lib/progress-metrics";
import { cn } from "@/lib/utils";

/** The Calories group of the Science tab. Estimates from population formulas; the scale is the measurement. */

const kcal = (value: number) => `${Math.round(value).toLocaleString("en-US")} kcal`;

// -- BMR and TDEE ---------------------------------------------------------------------

export function MaintenanceCard({ restingKcal, maintenance, activity, needs }: { restingKcal?: number; maintenance?: number; activity: ActivityLevel; needs: string[] }) {
  return (
    <Panel
      title="Maintenance calories"
      caption={maintenance !== undefined ? `${kcal(maintenance)} a day · ${activity.label}, ${activity.hours} h/week logged` : "What you burn in a day"}
      note={
        <>
          Resting burn by Mifflin-St Jeor (1990): 10 × kg + 6.25 × cm − 5 × age, +5 for men or −161
          for women. The activity multiplier (1.2 to 1.9) is picked from your logged training hours over
          the last four weeks, a notch under the textbook levels because only the training is known. Most
          people land within ±10 % of this; the scale trend below is the correction.
        </>
      }
    >
      {restingKcal === undefined || maintenance === undefined ? (
        <EmptyChart>Needs {needs.join(", ")} on You.</EmptyChart>
      ) : (
        <ul className="divide-y divide-border">
          <li className="flex items-baseline justify-between gap-3 py-1.5">
            <span className="text-sm">At rest</span>
            <span className="text-sm font-semibold tabular-nums">{kcal(restingKcal)}</span>
          </li>
          <li className="flex items-baseline justify-between gap-3 py-1.5">
            <span className="text-sm">
              Activity <span className="text-xs text-muted-foreground">× {activity.factor}</span>
            </span>
            <span className="text-sm font-semibold tabular-nums">{formatSigned(maintenance - restingKcal)} kcal</span>
          </li>
          <li className="flex items-baseline justify-between gap-3 py-1.5">
            <span className="text-sm font-semibold">Maintenance</span>
            <span className="text-sm font-semibold tabular-nums">{kcal(maintenance)}</span>
          </li>
        </ul>
      )}
    </Panel>
  );
}

// -- calories per session ---------------------------------------------------------------

export function SessionEnergyCard({ rows, weeks }: { rows: SessionEnergy[]; weeks: { week: string; kcal: number }[] }) {
  const { accent } = useSection();
  const latest = rows[rows.length - 1];
  return (
    <Panel
      title="Training burn"
      caption={latest ? `${kcal(latest.kcal)} last session (${latest.name}, ${Math.round(latest.minutes)} min at ${latest.met.toFixed(1)} METs)` : "kcal per week of training"}
      note={
        <>
          MET × bodyweight × hours. Lifting is {LIFTING_METS.light} METs at an easy pace, {LIFTING_METS.vigorous} when
          the session is dense, {LIFTING_METS.circuit} for circuit-style work (Compendium of Physical
          Activities); runs use the ACSM running equation from your pace. Gym burn is smaller than people
          hope — the sessions&apos; real value is what they make the body keep.
        </>
      }
    >
      {rows.length === 0 ? (
        <EmptyChart>Timed sessions, or runs, and a weigh-in.</EmptyChart>
      ) : (
        <ResponsiveContainer width="100%" height={150}>
          <BarChart data={weeks} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
            <CartesianGrid {...gridProps} />
            <XAxis {...axisProps} dataKey="week" tickFormatter={formatDayKey} minTickGap={30} />
            <YAxis {...axisProps} width={40} tickFormatter={formatCompact} />
            <Bar {...animationProps} dataKey="kcal" name="kcal" fill={accent} radius={[4, 4, 0, 0]} maxBarSize={22} />
            <Tooltip content={<ChartTooltip labelFormat={(label) => `Week of ${formatDayKey(label)}`} format={kcal} />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </Panel>
  );
}

// -- what the scale says ---------------------------------------------------------------

export function EnergyBalanceCard({ balance }: { balance?: EnergyBalance }) {
  return (
    <Panel
      title="Balance from the scale"
      caption={balance ? `${formatSigned(balance.rate.kgPerWeek, 2)} kg a week over ${balance.rate.days} days` : "The one number that is measured"}
      note={
        <>
          Your weight trend over the last four weeks, turned into calories at {KCAL_PER_KG.toLocaleString("en-US")} kcal
          per kilogram (Wishnofsky&apos;s rule of thumb — real tissue varies, and water swings the first
          week of any change). This is the only measurement on the page: if it disagrees with the
          maintenance estimate above, the scale is right.
        </>
      }
    >
      {!balance ? (
        <EmptyChart>Three weigh-ins in the last four weeks.</EmptyChart>
      ) : (
        <div className="flex items-baseline gap-2">
          <span className={cn("font-display text-4xl font-bold tracking-tight tabular-nums", balance.dailyKcal < 0 ? "text-success" : balance.dailyKcal > 0 ? "text-warning" : "")}>
            {formatSigned(balance.dailyKcal)}
          </span>
          <span className="text-sm text-muted-foreground">kcal a day, {balance.dailyKcal < -25 ? "deficit" : balance.dailyKcal > 25 ? "surplus" : "about even"}</span>
        </div>
      )}
    </Panel>
  );
}

// -- the daily intake target -----------------------------------------------------------------

const CHECK_COPY: Record<IntakeTarget["check"], string> = {
  onPace: "Your scale trend is on pace. Keep eating what you are eating.",
  fast: `Your scale is moving faster than ${SAFE_BAND.high} % a week — on a cut that is muscle going too. Eat a little more.`,
  slow: "Your scale is moving, but under the slow pace. A small change will do.",
  stalled: "Your scale has been flat. Pick a pace above and hold it for three weeks before judging.",
  away: "Your scale is moving away from the goal. Start from the standard pace above.",
  noData: "Weigh in three times over the next weeks and the scale will check the plan."
};

export function IntakeTargetCard({ target }: { target: IntakeTarget }) {
  const { accent } = useSection();
  const hero = target.direction === "lose" || target.direction === "gain" ? target.paces.find((pace) => pace.id === "standard") : undefined;
  const heroKcal = hero?.kcalPerDay ?? target.maintenance;
  return (
    <Panel
      title="Daily calorie target"
      caption={
        target.direction === "noGoal"
          ? "Set a goal weight and this becomes a plan"
          : target.direction === "hold"
            ? "You are at your goal: hold maintenance"
            : `To ${target.direction} ${Math.abs((target.goalKg ?? 0) - (target.currentKg ?? 0)).toFixed(1)} kg, ${target.currentKg} → ${target.goalKg}`
      }
      note={
        <>
          Maintenance from the card above, then the deficit or surplus each pace needs: a share of
          bodyweight per week ({SAFE_BAND.low} % slow, {SAFE_BAND.high} % standard, the range most coaching
          guidance lands on) × {KCAL_PER_KG.toLocaleString("en-US")} kcal ÷ 7. Never under your resting burn;
          a surplus is capped at {MAX_SURPLUS_KCAL} kcal because past that the gain is fat. Protein{" "}
          {PROTEIN_G_PER_KG.low}–{PROTEIN_G_PER_KG.high} g per kg is Morton et al. (2018). An estimate: the
          scale trend is the feedback, and the check line reads it for you.
        </>
      }
    >
      {target.maintenance === undefined ? (
        <>
          <EmptyChart>Add your birth year and sex on You for a target.</EmptyChart>
          {target.proteinG ? <ProteinLine proteinG={target.proteinG} /> : null}
        </>
      ) : (
        <>
          {heroKcal !== undefined ? (
            <div className="flex items-baseline gap-2">
              <span className="font-display text-4xl font-bold tracking-tight tabular-nums" style={{ color: accent }}>
                {Math.round(heroKcal).toLocaleString("en-US")}
              </span>
              <span className="text-sm text-muted-foreground">kcal a day{hero ? ` · ${hero.label.toLowerCase()} pace` : " · maintenance"}</span>
            </div>
          ) : null}
          <ul className="mt-2 divide-y divide-border">
            <li className="flex items-baseline justify-between gap-3 py-1.5">
              <span className="text-sm">Maintenance</span>
              <span className="text-sm tabular-nums">{kcal(target.maintenance)}</span>
            </li>
            {target.paces.map((pace) => (
              <li key={pace.id} className="flex items-baseline justify-between gap-3 py-1.5">
                <span className="min-w-0">
                  <span className="block text-sm">{pace.label} pace</span>
                  <span className="block text-xs text-muted-foreground">
                    {formatSigned(target.direction === "lose" ? -pace.kgPerWeek : pace.kgPerWeek, 2)} kg a week ·{" "}
                    {pace.finishDate ? `goal by ${formatDayKey(pace.finishDate)}` : "over two years"}
                  </span>
                </span>
                <span className={cn("shrink-0 text-sm font-semibold tabular-nums", pace.id === "standard" && "text-foreground")}>{kcal(pace.kcalPerDay)}</span>
              </li>
            ))}
            {target.fromScale !== undefined ? (
              <li className="flex items-baseline justify-between gap-3 py-1.5">
                <span className="min-w-0">
                  <span className="block text-sm">What you have been eating</span>
                  <span className="block text-xs text-muted-foreground">maintenance plus the balance the scale shows</span>
                </span>
                <span className="shrink-0 text-sm tabular-nums text-muted-foreground">≈ {kcal(target.fromScale)}</span>
              </li>
            ) : null}
          </ul>
          {target.proteinG ? <ProteinLine proteinG={target.proteinG} /> : null}
          <p className="mt-2 text-xs leading-snug text-muted-foreground">
            {target.direction === "noGoal" ? (
              <>
                <Link href="/profile" className="text-brand underline-offset-2 hover:underline">
                  Set a goal weight on You
                </Link>{" "}
                to see the intake for a slow and a standard pace.
              </>
            ) : (
              CHECK_COPY[target.check]
            )}
          </p>
        </>
      )}
    </Panel>
  );
}

function ProteinLine({ proteinG }: { proteinG: { low: number; high: number } }) {
  return (
    <p className="mt-2 flex items-baseline justify-between gap-3 border-t border-border pt-2 text-sm">
      <span>Protein</span>
      <span className="font-semibold tabular-nums">
        {Math.round(proteinG.low)}–{Math.round(proteinG.high)} g <span className="text-xs font-normal text-muted-foreground">a day</span>
      </span>
    </p>
  );
}

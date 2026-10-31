"use client";

import { useState } from "react";

import { CHART, EmptyChart, formatSigned, useSection } from "@/features/progress/chart-theme";
import { Panel } from "@/features/progress/panel";
import { TopSetChart } from "@/features/progress/strength-cards";
import { MAX_ELIGIBLE_REPS } from "@/lib/one-rep-max";
import { formatDayKey } from "@/lib/progress-metrics";
import {
  BIG_LIFT_LABELS,
  DOTS_MARKS,
  PLATEAU_MIN_WEEKS,
  PLATEAU_PERCENT_PER_WEEK,
  REP_ZONES,
  TREND_MIN_POINTS,
  projectDate,
  type AllometricRow,
  type Dots,
  type E1rmTrend,
  type IntensityReport,
  type RepZoneRow,
  type StandardRow
} from "@/lib/strength-science";
import { cn } from "@/lib/utils";

/** The Strength group of the Progress science cards. */

// -- allometric ----------------------------------------------------------------

export function AllometricCard({ rows, bodyweightKg }: { rows: AllometricRow[]; bodyweightKg?: number }) {
  const { accent } = useSection();
  const max = Math.max(1, ...rows.map((row) => row.score));
  return (
    <Panel
      title="Relative strength"
      caption={rows.length > 0 ? `Best-ever max ÷ bodyweight to the ⅔ power, at ${bodyweightKg} kg` : "Best-ever max ÷ bodyweight to the ⅔ power"}
      note={
        <>
          Jaric (2002): strength scales with bodyweight to the power ⅔, because a muscle&apos;s
          cross-section grows with the square of a length and body mass with the cube. Dividing by
          plain bodyweight flatters light lifters and punishes heavy ones; this is the fair version.
          The plain multiple is shown alongside. Estimates are Epley from your best set of{" "}
          {MAX_ELIGIBLE_REPS} reps or fewer; bodyweight lifts at 0 kg have none.
        </>
      }
    >
      {rows.length === 0 ? (
        <EmptyChart>{bodyweightKg ? "Log a weighted set of 12 reps or fewer." : "Add a weigh-in on You."}</EmptyChart>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((row) => (
            <li key={row.workoutId}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-sm">{row.name}</span>
                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {row.score.toFixed(1)}
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                    {row.estimate.value} kg · {row.ratio.toFixed(2)}×
                  </span>
                </span>
              </div>
              <div className="relative mt-1.5 h-2 rounded-full bg-track">
                <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(row.score / max) * 100}%`, backgroundColor: row.lift ? accent : CHART.quiet }} aria-hidden />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

// -- standards -------------------------------------------------------------------

const LEVEL_STEP: Record<StandardRow["level"], number> = { beginner: 0, novice: 1, intermediate: 2, advanced: 3, elite: 4 };

export function StandardsCard({ rows, hasSex, bodyweightKg }: { rows: StandardRow[]; hasSex: boolean; bodyweightKg?: number }) {
  const { heat } = useSection();
  return (
    <Panel
      title="Strength standards"
      caption="Beginner → novice → intermediate → advanced → elite"
      note={
        <>
          Your best estimated max on each barbell lift as a multiple of bodyweight, against the usual
          community tables (strengthlevel and the like, by sex). Approximate by design — the tables
          are population averages, not a judgement. Incline, dumbbell and Romanian variants have no
          table and are left out.
        </>
      }
    >
      {!hasSex ? (
        <EmptyChart>Set your sex on You — the tables are published by sex.</EmptyChart>
      ) : !bodyweightKg ? (
        <EmptyChart>Add a weigh-in on You.</EmptyChart>
      ) : rows.length === 0 ? (
        <EmptyChart>Log a squat, bench press, deadlift or overhead press with weight.</EmptyChart>
      ) : (
        <ul className="rows">
          {rows.map((row) => (
            <li key={row.lift} className="py-2">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0">
                  <span className="block truncate text-sm">{BIG_LIFT_LABELS[row.lift]}</span>
                  <span className="block text-xs text-muted-foreground">
                    {row.estimate.value} kg · {row.ratio.toFixed(2)}× bodyweight
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-sm font-semibold capitalize">{row.level}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {row.next ? `${row.next.level} at ${row.next.kg} kg` : "top of the table"}
                  </span>
                </span>
              </div>
              <div className="mt-1.5 grid grid-cols-5 gap-1" aria-hidden>
                {[0, 1, 2, 3, 4].map((step) => (
                  <span key={step} className="h-1.5 rounded-full" style={{ backgroundColor: step <= LEVEL_STEP[row.level] ? heat[Math.min(3, Math.max(0, step - 1))] : "var(--track)" }} />
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

// -- DOTS -------------------------------------------------------------------------

export function DotsCard({ score, hasSex }: { score?: Dots; hasSex: boolean }) {
  const mark = score ? [...DOTS_MARKS].reverse().find((item) => score.score >= item.score) : undefined;
  const nextMark = score ? DOTS_MARKS.find((item) => score.score < item.score) : undefined;
  return (
    <Panel
      title="DOTS score"
      caption="Squat + bench + deadlift, scaled for bodyweight"
      note={
        <>
          The powerlifting formula that replaced Wilks (IPF, 2019): your three-lift total divided by
          a polynomial in bodyweight, so a 60 kg and a 100 kg lifter can be compared on one number.
          From estimated maxes, not tested ones. 300 reads as intermediate, 400 advanced, 500 elite.
        </>
      }
    >
      {!hasSex ? (
        <EmptyChart>Set your sex on You — the coefficients are published by sex.</EmptyChart>
      ) : !score ? (
        <EmptyChart>Needs an estimate on all three: squat, bench press and deadlift.</EmptyChart>
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <span className="plot-n">{Math.round(score.score)}</span>
            <span className="text-sm text-muted-foreground">
              {mark ? mark.label : "building"}
              {nextMark ? ` · ${nextMark.label} at ${nextMark.score}` : ""}
            </span>
          </div>
          <p className="mt-2 text-xs tabular-nums text-muted-foreground">
            {score.squat} + {score.bench} + {score.deadlift} = {Math.round(score.total)} kg total
          </p>
        </>
      )}
    </Panel>
  );
}

// -- e1RM trend -----------------------------------------------------------------------

export interface TrendLift {
  workoutId: string;
  name: string;
  trend?: E1rmTrend;
}

/** Plateaus first, then the fastest risers; past this many the list is a scroll, not a reading. */
const TREND_ROWS = 8;

export function E1rmTrendCard({ lifts, today }: { lifts: TrendLift[]; today: string }) {
  const [openId, setOpenId] = useState<string>();
  const rated = lifts
    .filter((lift) => lift.trend)
    .sort((a, b) => Number(b.trend!.plateau) - Number(a.trend!.plateau) || b.trend!.slopePerWeek - a.trend!.slopePerWeek)
    .slice(0, TREND_ROWS);
  return (
    <Panel
      title="Max trend"
      caption={`kg of estimated max per week · tap one for its line${lifts.filter((lift) => lift.trend).length > TREND_ROWS ? ` · ${TREND_ROWS} of ${lifts.filter((lift) => lift.trend).length} lifts` : ""}`}
      note={
        <>
          A straight line through your per-session estimated maxes in this range (least squares),
          read as kg per week. At least {TREND_MIN_POINTS} sessions. A plateau is {PLATEAU_MIN_WEEKS}{" "}
          weeks or more with the line moving under {PLATEAU_PERCENT_PER_WEEK} % of the lift&apos;s best a
          week either way — the sign to change something, not to push harder at the same thing. The dates are where the
          line reaches the next 5 and 10 kg if it keeps its slope; past a year it says nothing.
        </>
      }
    >
      {rated.length === 0 ? (
        <EmptyChart>{TREND_MIN_POINTS} sessions of one lift in this range.</EmptyChart>
      ) : (
        <ul className="space-y-1">
          {rated.map(({ workoutId, name, trend }) => {
            if (!trend) return null;
            const open = openId === workoutId;
            const nextFive = Math.ceil((trend.best + 0.01) / 5) * 5;
            const targets = [nextFive, nextFive + 5].map((kg) => ({ kg, date: projectDate(trend, kg, today) }));
            return (
              <li key={workoutId}>
                <button
                  type="button"
                  onClick={() => setOpenId(open ? undefined : workoutId)}
                  className="flex min-h-[44px] w-full items-baseline justify-between gap-3 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{name}</span>
                    <span className={cn("block text-xs", trend.plateau ? "text-warning" : "text-muted-foreground")}>
                      {trend.plateau ? `plateau · ${Math.round(trend.spanWeeks)} weeks flat` : `${trend.points.length} sessions over ${Math.round(trend.spanWeeks)} weeks`}
                    </span>
                  </span>
                  <span className={cn("text-sm tabular-nums", trend.slopePerWeek > 0 ? "text-brand" : "text-muted-foreground")}>
                    {formatSigned(trend.slopePerWeek, 2)} kg/wk
                  </span>
                </button>
                {open ? (
                  <div className="px-2 pb-2">
                    <TopSetChart points={trend.points.map((point) => ({ date: point.date, weight: point.value }))} />
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {targets.map((target) => (
                        <li key={target.kg} className="rounded-full bg-hi px-2.5 py-1 text-xs tabular-nums">
                          {target.kg} kg · {target.date ? formatDayKey(target.date) : "not on this line"}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

// -- intensity distribution -----------------------------------------------------------------

export function IntensityCard({ report }: { report: IntensityReport }) {
  const { heat } = useSection();
  const colors = [CHART.quiet, heat[0], heat[1], heat[2], heat[3]];
  return (
    <Panel
      title="Intensity"
      caption={report.rated > 0 ? `${report.rated} working sets, as % of each lift's best-ever max` : "Working sets as % of each lift's max"}
      note={
        <>
          Each working set in this range divided by that lift&apos;s best-ever estimated max. Under 60 %
          is warm-up territory; 60–80 % is where most muscle is built; 80 %+ is strength work; 90 %+
          is near-max and should be rare. Bodyweight sets and lifts with no eligible estimate are
          left out ({report.unrated} here).
        </>
      }
    >
      {report.rated === 0 ? (
        <EmptyChart>Weighted sets in this range, on a lift with an estimated max.</EmptyChart>
      ) : (
        <>
          <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label={report.buckets.map((bucket) => `${bucket.label}: ${bucket.sets} sets`).join(", ")}>
            {report.buckets.map((bucket, index) =>
              bucket.sets > 0 ? <span key={bucket.id} style={{ width: `${bucket.share * 100}%`, backgroundColor: colors[index] }} /> : null
            )}
          </div>
          <ul className="mt-2 grid grid-cols-5 gap-1 text-center">
            {report.buckets.map((bucket, index) => (
              <li key={bucket.id}>
                <span className="mx-auto block h-1.5 w-6 rounded-full" style={{ backgroundColor: colors[index] }} aria-hidden />
                <span className="mt-1 block text-sm font-semibold tabular-nums">{Math.round(bucket.share * 100)}%</span>
                <span className="block text-[11px] text-muted-foreground">{bucket.label}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}

// -- rep zones ------------------------------------------------------------------------------------

export function RepZonesCard({ rows }: { rows: RepZoneRow[] }) {
  const { heat } = useSection();
  const zones = [
    { key: "low" as const, label: `1–${REP_ZONES.lowMax}`, color: heat[1] },
    { key: "mid" as const, label: `${REP_ZONES.lowMax + 1}–${REP_ZONES.midMax}`, color: heat[3] },
    { key: "high" as const, label: `${REP_ZONES.midMax + 1}+`, color: CHART.quiet }
  ];
  return (
    <Panel
      title="Rep ranges"
      caption="Working sets per muscle group by rep count"
      note={
        <>
          1–{REP_ZONES.lowMax} reps trains strength most, {REP_ZONES.lowMax + 1}–{REP_ZONES.midMax} is
          the classic hypertrophy range, {REP_ZONES.midMax + 1}+ is endurance — though muscle grows
          across all three when sets are taken close to failure. A group living entirely in one zone
          is the thing to notice.
        </>
      }
    >
      {rows.length === 0 ? (
        <EmptyChart>Rep sets in this range.</EmptyChart>
      ) : (
        <>
          <ul className="space-y-2.5">
            {rows.map((row) => (
              <li key={row.group}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm">{row.label}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {row.low} · {row.mid} · {row.high}
                  </span>
                </div>
                <div className="mt-1.5 flex h-2 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label={`${row.label}: ${row.low} sets of 1–5, ${row.mid} of 6–12, ${row.high} of 13+`}>
                  {zones.map((zone) =>
                    row[zone.key] > 0 ? <span key={zone.key} style={{ width: `${(row[zone.key] / row.total) * 100}%`, backgroundColor: zone.color }} /> : null
                  )}
                </div>
              </li>
            ))}
          </ul>
          <ul className="mt-3 flex gap-4 text-[11px] text-muted-foreground">
            {zones.map((zone) => (
              <li key={zone.key} className="flex items-center gap-1.5">
                <span className="h-1.5 w-4 rounded-full" style={{ backgroundColor: zone.color }} aria-hidden />
                {zone.label} reps
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}

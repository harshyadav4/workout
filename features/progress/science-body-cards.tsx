"use client";

import { CHART, EmptyChart, formatSigned, useSection } from "@/features/progress/chart-theme";
import { Panel } from "@/features/progress/panel";
import {
  FFMI_NATURAL_CEILING,
  NAVY_ERROR_PERCENT,
  RECOMP_MIN_WEEKS,
  RECOMP_WAIST_CM,
  RECOMP_WEIGHT_PERCENT,
  SAFE_BAND,
  SYMMETRY_FLAG_PERCENT,
  SYMMETRY_STRONG_PERCENT,
  WAIST_HEIGHT_MAX,
  type Composition,
  type Recomposition,
  type ShapeRatio,
  type SymmetryRow,
  type Tone,
  type WeightRate
} from "@/lib/body-composition";
import { formatDayKey } from "@/lib/progress-metrics";
import { cn } from "@/lib/utils";

/**
 * The Body group of the Science tab. Numbers wear text tokens; a tone word
 * beside each one carries the reading, so nothing rests on colour alone.
 */

const TONE_CLASS: Record<Tone, string> = {
  good: "text-success",
  watch: "text-warning",
  neutral: "text-muted-foreground"
};

function Row({ label, value, verdict, tone = "neutral", date }: { label: string; value: string; verdict: string; tone?: Tone; date?: string }) {
  return (
    <li className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="min-w-0">
        <span className="block truncate text-sm">{label}</span>
        <span className={cn("block text-xs", TONE_CLASS[tone])}>{verdict}</span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-sm font-semibold tabular-nums">{value}</span>
        {date ? <span className="block text-[11px] text-muted-foreground">{formatDayKey(date)}</span> : null}
      </span>
    </li>
  );
}

// -- shape ratios --------------------------------------------------------------

export function ShapeRatiosCard({ ratios }: { ratios: ShapeRatio[] }) {
  return (
    <Panel
      title="Shape ratios"
      caption="From your latest tape and weigh-in"
      note={
        <>
          BMI is weight ÷ height² (WHO bands 18.5 / 25 / 30) — muscle reads as “over”, so it is
          context, not a verdict. Waist ÷ height under {WAIST_HEIGHT_MAX} is Ashwell&apos;s rule, the
          single best tape number for health. Waist ÷ hips uses the WHO cut-offs (0.90 men, 0.85 women).
          Shoulders ÷ waist is the “V-taper”; 1.618 is the classic aesthetic reference and says nothing
          about health.
        </>
      }
    >
      {ratios.length === 0 ? (
        <EmptyChart>Add your height, a weigh-in and a waist measurement on You.</EmptyChart>
      ) : (
        <ul className="divide-y divide-border">
          {ratios.map((row) => (
            <Row key={row.id} label={row.label} value={row.value.toFixed(row.digits)} verdict={row.verdict} tone={row.tone} date={row.date} />
          ))}
        </ul>
      )}
    </Panel>
  );
}

// -- left vs right ---------------------------------------------------------------

export function SymmetryCard({ rows }: { rows: SymmetryRow[] }) {
  const flagged = rows.filter((row) => row.flagged);
  return (
    <Panel
      title="Left vs right"
      caption={rows.length === 0 ? undefined : flagged.length === 0 ? "Even on every pair" : `${flagged.map((row) => row.label.toLowerCase()).join(", ")} differ`}
      note={
        <>
          |left − right| ÷ their mean, per pair. A gap over {SYMMETRY_FLAG_PERCENT} % is worth a look;
          over {SYMMETRY_STRONG_PERCENT} % is worth a few extra sets on the smaller side. The two sides
          may be from different days — the date shown is the newer one.
        </>
      }
    >
      {rows.length === 0 ? (
        <EmptyChart>Measure both arms, thighs or calves on You.</EmptyChart>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((row) => (
            <Row
              key={row.pair}
              label={row.label}
              value={`${row.left.toFixed(1)} / ${row.right.toFixed(1)} cm`}
              verdict={
                row.bigger === undefined
                  ? "even"
                  : `${row.diffPercent.toFixed(1)} % · ${row.bigger} is bigger${row.strong ? " — train the other side" : ""}`
              }
              tone={row.strong ? "watch" : row.flagged ? "neutral" : "good"}
              date={row.date}
            />
          ))}
        </ul>
      )}
    </Panel>
  );
}

// -- rate of change ------------------------------------------------------------------

const BAND_WORDS: Record<WeightRate["band"], string> = { flat: "holding", slow: "under the band", safe: "in the band", fast: "over the band" };
const RATE_CEILING = 1;

export function WeightRateCard({ rate, goalWeightKg, currentKg }: { rate?: WeightRate; goalWeightKg?: number; currentKg?: number }) {
  const { accent } = useSection();
  const towardGoal =
    rate && goalWeightKg && currentKg
      ? rate.direction === "flat"
        ? undefined
        : (goalWeightKg < currentKg) === (rate.direction === "down")
      : undefined;
  const verdict = !rate
    ? ""
    : rate.band === "flat"
      ? "The scale is holding."
      : `${rate.band === "safe" ? "A safe pace" : rate.band === "slow" ? "Slower than the usual target" : "Faster than muscle can follow"}${
          towardGoal === undefined ? "" : towardGoal ? ", toward your goal." : ", away from your goal."
        }`;

  return (
    <Panel
      title="Rate of change"
      caption={rate ? `${formatSigned(rate.kgPerWeek, 2)} kg a week over ${rate.days} days` : "Last four weeks of weigh-ins"}
      note={
        <>
          A straight line through your weigh-ins from the last four weeks, as a share of bodyweight per
          week. {SAFE_BAND.low}–{SAFE_BAND.high} % a week, up or down, is the pace most coaching guidance
          lands on: slower and the change is hard to see, faster and a cut takes muscle with it or a
          bulk brings fat. Needs three weigh-ins.
        </>
      }
    >
      {!rate ? (
        <EmptyChart>Three weigh-ins in the last four weeks.</EmptyChart>
      ) : (
        <>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs">Size of the move</span>
            <span className="text-xs tabular-nums text-muted-foreground">
              {Math.abs(rate.percentPerWeek).toFixed(2)} % of bodyweight a week · {BAND_WORDS[rate.band]}
            </span>
          </div>
          <div
            className="relative mt-1.5 h-2.5 rounded-full bg-muted"
            role="img"
            aria-label={`${Math.abs(rate.percentPerWeek).toFixed(2)} % a week, ${BAND_WORDS[rate.band]} (${SAFE_BAND.low} to ${SAFE_BAND.high})`}
          >
            <span className="absolute inset-y-0 rounded-full bg-foreground/10" style={{ left: `${(SAFE_BAND.low / RATE_CEILING) * 100}%`, width: `${((SAFE_BAND.high - SAFE_BAND.low) / RATE_CEILING) * 100}%` }} aria-hidden />
            <span className="absolute inset-y-0.5 left-0 rounded-full" style={{ width: `${Math.min(100, (Math.abs(rate.percentPerWeek) / RATE_CEILING) * 100)}%`, backgroundColor: rate.band === "safe" ? accent : CHART.quiet }} aria-hidden />
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">{verdict}</p>
        </>
      )}
    </Panel>
  );
}

// -- recomposition ----------------------------------------------------------------------

export function RecompCard({ recomp }: { recomp?: Recomposition }) {
  return (
    <Panel
      title="Recomposition"
      caption={recomp ? `${formatDayKey(recomp.from)} → ${formatDayKey(recomp.to)}, ${recomp.weeks} weeks` : "Waist against the scale"}
      note={
        <>
          Weight within ±{RECOMP_WEIGHT_PERCENT} % while the waist dropped {RECOMP_WAIST_CM} cm or more,
          over {RECOMP_MIN_WEEKS} weeks or longer: fat going out while something else came in. Two tape
          readings and the weigh-in nearest each — an observation, not a cause.
        </>
      }
    >
      {!recomp ? (
        <EmptyChart>Two waist measurements at least four weeks apart, each with a weigh-in that week.</EmptyChart>
      ) : (
        <ul className="divide-y divide-border">
          <Row label="Waist" value={`${formatSigned(recomp.waistChangeCm, 1)} cm`} verdict={recomp.waistChangeCm <= -RECOMP_WAIST_CM ? "down" : recomp.waistChangeCm >= RECOMP_WAIST_CM ? "up" : "about the same"} tone={recomp.waistChangeCm <= -RECOMP_WAIST_CM ? "good" : "neutral"} />
          <Row label="Weight" value={`${formatSigned(recomp.weightChangePercent, 1)} %`} verdict={Math.abs(recomp.weightChangePercent) <= RECOMP_WEIGHT_PERCENT ? "held" : recomp.weightChangePercent < 0 ? "down" : "up"} />
          <li className={cn("pt-2 text-xs", recomp.detected ? "text-success" : "text-muted-foreground")}>
            {recomp.detected
              ? "Waist down with the scale held: a recomposition signal."
              : "No recomposition signal in this span."}
          </li>
        </ul>
      )}
    </Panel>
  );
}

// -- body composition -----------------------------------------------------------------------

export function CompositionCard({ composition, needs }: { composition?: Composition; needs: string[] }) {
  return (
    <Panel
      title="Body composition"
      caption={composition ? `Measured ${formatDayKey(composition.date)}` : "US Navy tape estimate"}
      note={
        <>
          The US Navy formula (Hodgdon &amp; Beckett, 1984): body fat from height, neck and waist — plus hips
          for women — on a log scale. About ±{NAVY_ERROR_PERCENT} % against a DEXA scan, so read the
          trend, not the digit. Lean mass is the rest. FFMI is lean mass ÷ height², adjusted to 1.80 m
          (Kouri et al., 1995); {FFMI_NATURAL_CEILING} is about where drug-free lifters top out.
        </>
      }
    >
      {!composition ? (
        <EmptyChart>
          {needs.length > 0 ? `Needs ${needs.join(", ")} on You.` : "Not enough to estimate yet."}
        </EmptyChart>
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <span className="font-display text-4xl font-bold tracking-tight tabular-nums">{composition.bodyFatPercent.toFixed(1)}</span>
            <span className="text-sm text-muted-foreground">% body fat · ±{NAVY_ERROR_PERCENT}</span>
          </div>
          <ul className="mt-2 divide-y divide-border">
            <Row label="Lean mass" value={`${composition.leanMassKg.toFixed(1)} kg`} verdict="everything that is not fat" />
            <Row label="Fat mass" value={`${composition.fatMassKg.toFixed(1)} kg`} verdict="estimated" />
            <Row
              label="FFMI"
              value={composition.ffmiNormalized.toFixed(1)}
              verdict={
                composition.ffmiNormalized >= FFMI_NATURAL_CEILING
                  ? `at or past the ${FFMI_NATURAL_CEILING} natural ceiling`
                  : `${(FFMI_NATURAL_CEILING - composition.ffmiNormalized).toFixed(1)} under the ${FFMI_NATURAL_CEILING} natural ceiling`
              }
              tone={composition.ffmiNormalized >= 20 ? "good" : "neutral"}
            />
          </ul>
        </>
      )}
    </Panel>
  );
}

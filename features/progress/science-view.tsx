"use client";

import { useMemo } from "react";

import { SectionRule } from "@/features/progress/panel";
import {
  CompositionCard,
  RecompCard,
  ShapeRatiosCard,
  SymmetryCard,
  WeightRateCard
} from "@/features/progress/science-body-cards";
import {
  AllometricCard,
  DotsCard,
  E1rmTrendCard,
  IntensityCard,
  RepZonesCard,
  StandardsCard
} from "@/features/progress/science-strength-cards";
import {
  DensityCard,
  DropoffCard,
  EffectiveRepsCard,
  FitnessFatigueCard,
  MonotonyCard,
  RestCard
} from "@/features/progress/science-fatigue-cards";
import { PaceZonesCard, RacePredictorCard, VdotCard } from "@/features/progress/science-cardio-cards";
import { EnergyBalanceCard, IntakeTargetCard, MaintenanceCard, SessionEnergyCard } from "@/features/progress/science-energy-cards";
import { latestFor } from "@/lib/body-metrics";
import { activityFactor, bmr, bmrNeeds, buildEnergyBalance, buildIntakeTarget, buildSessionEnergy, buildWeeklyKcal, tdee } from "@/lib/energy";
import { bestVdot, buildRacePredictions, paceZones } from "@/lib/cardio-science";
import {
  buildBanister,
  buildEffectiveReps,
  buildRepDropoff,
  buildRestAdherence,
  buildRirMaxes,
  buildSessionDensity
} from "@/lib/fitness-fatigue";
import {
  buildComposition,
  buildRecomposition,
  buildShapeRatios,
  buildSymmetry,
  buildWeightRate,
  compositionNeeds
} from "@/lib/body-composition";
import { buildExerciseTotals, filterByWindow } from "@/lib/progress-metrics";
import { buildWeeklyLoadStats } from "@/lib/progress-trends";
import {
  buildAllometric,
  buildDots,
  buildE1rmTrend,
  buildIntensityDistribution,
  buildRepZones,
  buildStandards
} from "@/lib/strength-science";
import type { CardioSession } from "@/lib/cardio-metrics";
import type { DateWindow } from "@/lib/progress-metrics";
import type { TimedSession } from "@/lib/session-time";
import type {
  BodyMeasurement,
  MuscleGroup,
  ProfileInfo,
  ScheduledSession,
  SetLog,
  WorkoutLog
} from "@/lib/types";

/**
 * Published formulas run over the user's own log, each card with its formula and
 * source one tap behind the ⓘ. There is no page of them: each group sits inside
 * the card it is about, and only runs while that card is open.
 *
 * Every card hides behind a plain "what it needs" line until its inputs exist
 * (see `Reveal` / `EmptyChart`): a number computed from a guess is worse than
 * no number, and the page says so in its footer rather than in fine print.
 */
function ScienceNote() {
  return (
    <p className="px-1 pt-1 text-center text-xs leading-snug text-muted-foreground">
      Estimates from your own log, using published formulas. Not medical advice.
    </p>
  );
}

/** The latest scale reading, or the profile's until there is one. */
function currentKg(measurements: BodyMeasurement[], profile: ProfileInfo) {
  return latestFor(measurements, "weight")?.value ?? profile.weightKg;
}

// Standards, DOTS and relative strength are best-ever: a personal best does
// not expire with the range chip. The trend, intensity and rep-range cards
// are about this range, which is what a slope or a share means.
export function StrengthScience({
  logs,
  setLogs,
  measurements,
  profile,
  window,
  today,
  liftGroups
}: {
  logs: WorkoutLog[];
  setLogs: SetLog[];
  measurements: BodyMeasurement[];
  profile: ProfileInfo;
  /** The range's window. Lifetime cards ignore it and say so. */
  window: DateWindow;
  today: string;
  liftGroups: Map<string, MuscleGroup>;
}) {
  const hasSex = profile.sex === "male" || profile.sex === "female";
  const strength = useMemo(() => {
    const bodyweightKg = currentKg(measurements, profile);
    const scoped = filterByWindow(logs, window);
    const lifts = buildExerciseTotals(scoped).map((exercise) => ({
      workoutId: exercise.workoutId,
      name: exercise.name,
      trend: buildE1rmTrend(setLogs, exercise.workoutId, window, today)
    }));
    return {
      bodyweightKg,
      allometric: buildAllometric(setLogs, logs, bodyweightKg),
      standards: buildStandards(setLogs, logs, bodyweightKg, profile.sex),
      dots: buildDots(setLogs, logs, bodyweightKg, profile.sex),
      lifts: lifts.sort((a, b) => (b.trend?.slopePerWeek ?? -Infinity) - (a.trend?.slopePerWeek ?? -Infinity)),
      intensity: buildIntensityDistribution(setLogs, window),
      repZones: buildRepZones(setLogs, window, liftGroups)
    };
  }, [liftGroups, logs, measurements, profile, setLogs, today, window]);

  return (
    <>
      <SectionRule label="Standards" hint="relative strength, standards, trends" />
      <StandardsCard rows={strength.standards} hasSex={hasSex} bodyweightKg={strength.bodyweightKg} />
      <DotsCard score={strength.dots} hasSex={hasSex} />
      <AllometricCard rows={strength.allometric} bodyweightKg={strength.bodyweightKg} />
      <E1rmTrendCard lifts={strength.lifts} today={today} />
      <IntensityCard report={strength.intensity} />
      <RepZonesCard rows={strength.repZones} />
      <ScienceNote />
    </>
  );
}

// Fitness–fatigue and monotony are lifetime with the window shaded, like the
// load card they sit beside in spirit; the rest read this range.
export function FatigueScience({
  logs,
  setLogs,
  scheduled,
  window,
  today,
  liftGroups
}: {
  logs: WorkoutLog[];
  setLogs: SetLog[];
  scheduled: ScheduledSession[];
  window: DateWindow;
  today: string;
  liftGroups: Map<string, MuscleGroup>;
}) {
  const fatigue = useMemo(
    () => ({
      banister: buildBanister(logs, window, today),
      weeks: buildWeeklyLoadStats(logs, window),
      dropoff: buildRepDropoff(setLogs, logs, window),
      rest: buildRestAdherence(scheduled, window),
      density: buildSessionDensity(scheduled, logs, window),
      effective: buildEffectiveReps(setLogs, window, liftGroups),
      rirMaxes: buildRirMaxes(setLogs, logs)
    }),
    [liftGroups, logs, scheduled, setLogs, today, window]
  );

  return (
    <>
      <SectionRule label="Fatigue" hint="fitness–fatigue, monotony, rest" />
      <FitnessFatigueCard points={fatigue.banister} />
      <EffectiveRepsCard report={fatigue.effective} maxes={fatigue.rirMaxes} />
      <DropoffCard rows={fatigue.dropoff} />
      <RestCard rows={fatigue.rest} />
      <DensityCard points={fatigue.density} />
      <MonotonyCard weeks={fatigue.weeks} />
      <ScienceNote />
    </>
  );
}

// Body reads the whole history, never the range: the latest tape is the latest
// tape whichever window is open, and the rate card has its own four weeks.
// Calories too: maintenance is about today, the balance is the last four weeks of
// the scale, and the burn chart is the last twelve weeks.
export function BodyScience({
  logs,
  measurements,
  profile,
  cardio,
  timed,
  today
}: {
  logs: WorkoutLog[];
  measurements: BodyMeasurement[];
  profile: ProfileInfo;
  cardio: CardioSession[];
  timed: TimedSession[];
  today: string;
}) {
  const body = useMemo(
    () => ({
      ratios: buildShapeRatios(measurements, profile),
      symmetry: buildSymmetry(measurements),
      rate: buildWeightRate(measurements, today),
      recomp: buildRecomposition(measurements, today),
      composition: buildComposition(measurements, profile),
      needs: compositionNeeds(measurements, profile),
      currentKg: currentKg(measurements, profile)
    }),
    [measurements, profile, today]
  );

  const energy = useMemo(() => {
    const activity = activityFactor(timed, today);
    const restingKcal = bmr(profile, today, body.currentKg);
    const sessions = buildSessionEnergy(timed, logs, cardio, body.currentKg);
    return {
      activity,
      restingKcal,
      maintenance: restingKcal !== undefined ? tdee(restingKcal, activity.factor) : undefined,
      needs: bmrNeeds(profile, body.currentKg),
      sessions,
      weeks: buildWeeklyKcal(sessions, today),
      balance: buildEnergyBalance(measurements, today),
      target: buildIntakeTarget({ profile, measurements, timed, today })
    };
  }, [body.currentKg, cardio, logs, measurements, profile, timed, today]);

  return (
    <>
      <SectionRule label="Body" hint="shape, symmetry, composition" />
      <CompositionCard composition={body.composition} needs={body.needs} />
      <ShapeRatiosCard ratios={body.ratios} />
      <WeightRateCard rate={body.rate} goalWeightKg={profile.goalWeightKg} currentKg={body.currentKg} />
      <RecompCard recomp={body.recomp} />
      <SymmetryCard rows={body.symmetry} />

      <SectionRule label="Calories" hint="maintenance, burn, target intake" />
      <IntakeTargetCard target={energy.target} />
      <MaintenanceCard restingKcal={energy.restingKcal} maintenance={energy.maintenance} activity={energy.activity} needs={energy.needs} />
      <EnergyBalanceCard balance={energy.balance} />
      <SessionEnergyCard rows={energy.sessions} weeks={energy.weeks} />
      <ScienceNote />
    </>
  );
}

// Best run ever, not best in the range: a VDOT does not expire.
export function RunningScience({ cardio }: { cardio: CardioSession[] }) {
  const running = useMemo(() => {
    const best = bestVdot(cardio);
    return {
      best,
      predictions: best ? buildRacePredictions(best.session) : [],
      zones: best ? paceZones(best.vdot) : []
    };
  }, [cardio]);

  return (
    <>
      <SectionRule label="Race times" hint="VO₂max estimate, race times, zones" />
      <VdotCard best={running.best} />
      <RacePredictorCard best={running.best} predictions={running.predictions} />
      <PaceZonesCard zones={running.zones} />
      <ScienceNote />
    </>
  );
}

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
 * Everything the Science cards read. One bag, built once by the dashboard, so
 * adding a card never means threading a new prop through it.
 */
export interface ScienceInput {
  logs: WorkoutLog[];
  setLogs: SetLog[];
  scheduled: ScheduledSession[];
  measurements: BodyMeasurement[];
  profile: ProfileInfo;
  cardio: CardioSession[];
  timed: TimedSession[];
  /** The range chip's window. Lifetime cards ignore it and say so. */
  window: DateWindow;
  today: string;
  liftGroups: Map<string, MuscleGroup>;
}

/**
 * The Science view: published formulas run over the user's own log, each
 * card with its formula and source one tap behind the ⓘ.
 *
 * Every card hides behind a plain "what it needs" line until its inputs exist
 * (see `Reveal` / `EmptyChart`): a number computed from a guess is worse than
 * no number, and the page says so in its footer rather than in fine print.
 */
export function ScienceView(input: ScienceInput) {
  const { logs, setLogs, scheduled, measurements, profile, cardio, timed, window, today, liftGroups } = input;
  const hasSex = profile.sex === "male" || profile.sex === "female";

  // Body reads the whole history, never the range chip: the latest tape is the
  // latest tape whichever window is open, and the rate card has its own four weeks.
  const body = useMemo(
    () => ({
      ratios: buildShapeRatios(measurements, profile),
      symmetry: buildSymmetry(measurements),
      rate: buildWeightRate(measurements, today),
      recomp: buildRecomposition(measurements, today),
      composition: buildComposition(measurements, profile),
      needs: compositionNeeds(measurements, profile),
      currentKg: latestFor(measurements, "weight")?.value ?? profile.weightKg
    }),
    [measurements, profile, today]
  );

  // Standards, DOTS and relative strength are best-ever: a personal best does
  // not expire with the range chip. The trend, intensity and rep-range cards
  // are about this range, which is what a slope or a share means.
  const strength = useMemo(() => {
    const bodyweightKg = body.currentKg;
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
  }, [body.currentKg, liftGroups, logs, profile.sex, setLogs, today, window]);

  // Fitness–fatigue and monotony are lifetime with the window shaded, like the
  // load card they sit beside in spirit; the rest read this range.
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

  // Best run ever, not best in the range: a VDOT does not expire with the chip.
  const running = useMemo(() => {
    const best = bestVdot(cardio);
    return {
      best,
      predictions: best ? buildRacePredictions(best.session) : [],
      zones: best ? paceZones(best.vdot) : []
    };
  }, [cardio]);

  // Lifetime too: maintenance is about today, the balance is the last four
  // weeks of the scale, and the burn chart is the last twelve weeks.
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
      <div className="space-y-3">
        <SectionRule label="Body" hint="shape, symmetry, composition" />
        <CompositionCard composition={body.composition} needs={body.needs} />
        <ShapeRatiosCard ratios={body.ratios} />
        <WeightRateCard rate={body.rate} goalWeightKg={profile.goalWeightKg} currentKg={body.currentKg} />
        <RecompCard recomp={body.recomp} />
        <SymmetryCard rows={body.symmetry} />
      </div>

      <div className="space-y-3">
        <SectionRule label="Strength" hint="relative strength, standards, trends" />
        <StandardsCard rows={strength.standards} hasSex={hasSex} bodyweightKg={strength.bodyweightKg} />
        <DotsCard score={strength.dots} hasSex={hasSex} />
        <AllometricCard rows={strength.allometric} bodyweightKg={strength.bodyweightKg} />
        <E1rmTrendCard lifts={strength.lifts} today={today} />
        <IntensityCard report={strength.intensity} />
        <RepZonesCard rows={strength.repZones} />
      </div>

      <div className="space-y-3">
        <SectionRule label="Fatigue" hint="fitness–fatigue, monotony, rest" />
        <FitnessFatigueCard points={fatigue.banister} />
        <EffectiveRepsCard report={fatigue.effective} maxes={fatigue.rirMaxes} />
        <DropoffCard rows={fatigue.dropoff} />
        <RestCard rows={fatigue.rest} />
        <DensityCard points={fatigue.density} />
        <MonotonyCard weeks={fatigue.weeks} />
      </div>

      <div className="space-y-3">
        <SectionRule label="Cardio" hint="VO₂max estimate, race times, zones" />
        <VdotCard best={running.best} />
        <RacePredictorCard best={running.best} predictions={running.predictions} />
        <PaceZonesCard zones={running.zones} />
      </div>

      <div className="space-y-3">
        <SectionRule label="Calories" hint="maintenance, burn, target intake" />
        <IntakeTargetCard target={energy.target} />
        <MaintenanceCard restingKcal={energy.restingKcal} maintenance={energy.maintenance} activity={energy.activity} needs={energy.needs} />
        <EnergyBalanceCard balance={energy.balance} />
        <SessionEnergyCard rows={energy.sessions} weeks={energy.weeks} />
      </div>
      <p className="px-1 text-center text-xs leading-snug text-muted-foreground">
        Estimates from your own log, using published formulas. Not medical advice.
      </p>
    </>
  );
}

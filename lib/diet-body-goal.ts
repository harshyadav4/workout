/**
 * A body goal, not only a weight: how much lean mass and how lean, and the dated
 * roadmap to get there. Weight alone cannot tell these apart. 80 kg of fat gain
 * and 80 kg of muscle gain read the same on a scale. Pure, so it is tested.
 *
 * Everything here is an estimate, and the card says so:
 * - Lean mass is everything except fat, so it includes bone and water as well as
 *   muscle. It comes from the US Navy tape formula, which is about ±3.5 % body fat.
 * - Muscle gain rates are the low end of each tier of Alan Aragon's coaching model.
 *   That is experience, not a controlled study, and some coaches find it generous.
 * - The phases run one after the other, which is the simple and slow case. A
 *   beginner can often do both at once, so the real date may be sooner.
 */
import type { Composition } from "@/lib/body-composition";
import { FFMI_NATURAL_CEILING } from "@/lib/body-composition";
import type { PathStep } from "@/lib/diet-science";
import type { DietSettings } from "@/lib/diet-types";
import { KCAL_PER_KG, MAX_SURPLUS_KCAL, PACES } from "@/lib/energy";
import { shiftKey } from "@/lib/progress-metrics";
import type { Sex } from "@/lib/types";

const DAYS_PER_MONTH = 30.44;
/** Iraki et al. (2019): 10 to 20 % over maintenance. The low end, as muscle gain here is slow. */
export const BUILD_SURPLUS_SHARE = 0.1;
export const BODY_FAT_GOAL_RANGE = { low: 6, high: 35 };
/** Below this much change the phase is not worth a line on the map. */
const NOTHING_TO_DO_KG = 0.2;
const MAX_ROADMAP_DAYS = 3650;

const round1 = (value: number) => Math.round(value * 10) / 10;

export type TrainingLevel = "beginner" | "intermediate" | "advanced";

/** Share of bodyweight in muscle per month, for men. The low end of each tier. */
const MONTHLY_SHARE: Record<TrainingLevel, number> = { beginner: 1, intermediate: 0.5, advanced: 0.25 };
/** Women commonly gain about half the absolute amount. */
const FEMALE_FACTOR = 0.5;

export function trainingLevel(months: number): TrainingLevel {
  return months < 12 ? "beginner" : months < 36 ? "intermediate" : "advanced";
}

export function muscleKgPerMonth(weightKg: number, level: TrainingLevel, sex: Sex | undefined): number {
  return (MONTHLY_SHARE[level] / 100) * weightKg * (sex === "female" ? FEMALE_FACTOR : 1);
}

/** Whole months from the first logged workout. Zero with no history. */
export function trainingMonths(firstLogDate: string | undefined, today: string): number {
  if (!firstLogDate) {
    return 0;
  }
  const days = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${firstLogDate}T00:00:00Z`)) / 86_400_000;
  return Math.max(0, Math.floor(days / DAYS_PER_MONTH));
}

function normalizedFfmi(leanKg: number, heightCm: number): number {
  const metres = heightCm / 100;
  return leanKg / (metres * metres) + 6.1 * (1.8 - metres);
}

/** The lean mass where normalized FFMI reaches the natural ceiling. */
function ceilingLeanKg(heightCm: number): number {
  const metres = heightCm / 100;
  return (FFMI_NATURAL_CEILING - 6.1 * (1.8 - metres)) * metres * metres;
}

export interface SuggestedGoal {
  leanKg: number;
  /** What a year of training at this level adds. */
  kgPerYear: number;
  capped: boolean;
}

/** A goal worked out from your own body: a year of realistic gain, and never past the natural ceiling for men. */
export function suggestLeanGoal(input: {
  composition: Pick<Composition, "leanMassKg">;
  weightKg: number;
  heightCm: number;
  sex: Sex | undefined;
  months: number;
}): SuggestedGoal {
  const { composition, weightKg, heightCm, sex, months } = input;
  const kgPerYear = muscleKgPerMonth(weightKg, trainingLevel(months), sex) * 12;
  const raw = composition.leanMassKg + kgPerYear;
  const ceiling = ceilingLeanKg(heightCm);
  const capped = sex === "male" && raw > ceiling;
  return {
    leanKg: Math.round(capped ? Math.max(composition.leanMassKg, ceiling) : raw),
    kgPerYear: round1(kgPerYear),
    capped
  };
}

export interface RoadmapPhase {
  id: "cut" | "build" | "hold";
  fromDate: string;
  toDate: string;
  days: number;
  fromKg: number;
  toKg: number;
  /** Lean mass and body fat at the end of this phase. */
  leanKg: number;
  bodyFatPercent: number;
  kcalPerDay: number;
  proteinG: { low: number; high: number };
}

export interface BodyRoadmap {
  currentKg: number;
  currentLeanKg: number;
  currentBodyFat: number;
  goalLeanKg: number;
  goalBodyFat: number;
  /** The weight the two goals add up to. */
  goalWeightKg: number;
  level: TrainingLevel;
  months: number;
  muscleKgPerMonth: number;
  phases: RoadmapPhase[];
  finishDate: string;
  /** Past what few drug-free men reach (Kouri et al., 1995). */
  pastNaturalCeiling: boolean;
  /** Eaten a day, less what the first phase takes. Absent with no logged food. */
  gapKcal?: number;
}

export function hasBodyGoal(settings: DietSettings): boolean {
  return Boolean(settings.leanGoalKg || settings.bodyFatGoalPercent);
}

/**
 * Lose the fat first if there is any to lose, then build. On a cut, the pace is
 * the app's standard 0.5 % a week. On a build, muscle comes at its slow rate, with
 * weight rising at the goal's body fat, so the scale may rise more than the muscle.
 */
export function buildBodyRoadmap(input: {
  composition: Pick<Composition, "leanMassKg" | "bodyFatPercent">;
  currentKg: number;
  heightCm: number;
  sex: Sex | undefined;
  settings: DietSettings;
  months: number;
  maintenance?: number;
  restingKcal?: number;
  averageIntake?: number;
  today: string;
}): BodyRoadmap | undefined {
  const { composition, currentKg, heightCm, sex, settings, months, maintenance, restingKcal, averageIntake, today } = input;
  if (!hasBodyGoal(settings) || !(currentKg > 0)) {
    return undefined;
  }
  const lean = composition.leanMassKg;
  const bodyFat = composition.bodyFatPercent;
  const goalLeanKg = settings.leanGoalKg && settings.leanGoalKg > 0 ? settings.leanGoalKg : lean;
  const goalBodyFat = Math.min(
    BODY_FAT_GOAL_RANGE.high,
    Math.max(BODY_FAT_GOAL_RANGE.low, settings.bodyFatGoalPercent && settings.bodyFatGoalPercent > 0 ? settings.bodyFatGoalPercent : bodyFat)
  );
  // Muscle is kept, not given up: a goal under today's lean mass does not plan a loss.
  const targetLean = Math.max(lean, goalLeanKg);
  const goalWeightKg = round1(targetLean / (1 - goalBodyFat / 100));
  const level = trainingLevel(months);
  const proteinFor = (kg: number) => ({ low: Math.round(1.6 * kg), high: Math.round(2.2 * kg) });

  const phases: RoadmapPhase[] = [];
  let date = today;
  let weight = currentKg;

  const atGoalFat = lean / (1 - goalBodyFat / 100);
  if (currentKg - atGoalFat > NOTHING_TO_DO_KG) {
    const standard = PACES.find((pace) => pace.id === "standard");
    const kgPerWeek = ((standard?.percentPerWeek ?? 0.5) / 100) * currentKg;
    const days = Math.min(MAX_ROADMAP_DAYS, Math.ceil(((currentKg - atGoalFat) / kgPerWeek) * 7));
    const toDate = shiftKey(date, days);
    phases.push({
      id: "cut",
      fromDate: date,
      toDate,
      days,
      fromKg: round1(weight),
      toKg: round1(atGoalFat),
      leanKg: round1(lean),
      bodyFatPercent: round1(goalBodyFat),
      kcalPerDay: Math.round(
        maintenance !== undefined ? Math.max(restingKcal ?? 0, maintenance - (kgPerWeek * KCAL_PER_KG) / 7) : 0
      ),
      proteinG: proteinFor(currentKg)
    });
    date = toDate;
    weight = atGoalFat;
  }

  const perMonth = muscleKgPerMonth(weight, level, sex);
  if (targetLean - lean > NOTHING_TO_DO_KG) {
    const days = Math.min(MAX_ROADMAP_DAYS, Math.ceil(((targetLean - lean) / perMonth) * DAYS_PER_MONTH));
    const toDate = shiftKey(date, days);
    phases.push({
      id: "build",
      fromDate: date,
      toDate,
      days,
      fromKg: round1(weight),
      toKg: goalWeightKg,
      leanKg: round1(targetLean),
      bodyFatPercent: round1(goalBodyFat),
      kcalPerDay: Math.round(
        maintenance !== undefined ? maintenance + Math.min(MAX_SURPLUS_KCAL, maintenance * BUILD_SURPLUS_SHARE) : 0
      ),
      proteinG: proteinFor(goalWeightKg)
    });
    date = toDate;
    weight = goalWeightKg;
  }

  if (phases.length === 0) {
    phases.push({
      id: "hold",
      fromDate: today,
      toDate: today,
      days: 0,
      fromKg: round1(currentKg),
      toKg: round1(currentKg),
      leanKg: round1(lean),
      bodyFatPercent: round1(bodyFat),
      kcalPerDay: Math.round(maintenance ?? 0),
      proteinG: proteinFor(currentKg)
    });
  }

  const first = phases[0];
  // Goals already met: being leaner than a body fat goal is not a reason to gain fat.
  const done = first.id === "hold";
  return {
    currentKg: round1(currentKg),
    currentLeanKg: round1(lean),
    currentBodyFat: round1(bodyFat),
    goalLeanKg: round1(targetLean),
    goalBodyFat: round1(done ? bodyFat : goalBodyFat),
    goalWeightKg: done ? round1(currentKg) : goalWeightKg,
    level,
    months,
    muscleKgPerMonth: Math.round(perMonth * 100) / 100,
    phases,
    finishDate: date,
    pastNaturalCeiling: sex === "male" && normalizedFfmi(targetLean, heightCm) > FFMI_NATURAL_CEILING,
    gapKcal: averageIntake !== undefined && maintenance !== undefined ? Math.round(averageIntake) - first.kcalPerDay : undefined
  };
}

/** The step to follow now, for the weight path. Undefined once the goal is met, which is a plain hold. */
export function currentStep(map: BodyRoadmap): PathStep | undefined {
  const phase = map.phases[0];
  if (phase.id === "hold" || !(phase.days > 0)) {
    return undefined;
  }
  return {
    toKg: phase.toKg,
    toDate: phase.toDate,
    kgPerWeek: Math.abs(phase.toKg - phase.fromKg) / (phase.days / 7),
    kcalPerDay: phase.kcalPerDay
  };
}

export interface Milestone {
  date: string;
  kg: number;
}

/** Evenly spaced stops on the way to a weight: a straight line, so a guide and not a promise. */
export function pathMilestones(fromKg: number, toKg: number, fromDate: string, toDate: string, stops = 4): Milestone[] {
  const total = (Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / 86_400_000;
  if (!(total > 0) || Math.abs(toKg - fromKg) < NOTHING_TO_DO_KG) {
    return [];
  }
  return Array.from({ length: stops }, (_, index) => {
    const share = (index + 1) / stops;
    return { date: shiftKey(fromDate, Math.round(total * share)), kg: round1(fromKg + (toKg - fromKg) * share) };
  });
}

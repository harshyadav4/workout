import { buildWeightRate, type WeightRate } from "@/lib/body-composition";
import { latestFor } from "@/lib/body-metrics";
import type { CardioSession } from "@/lib/cardio-metrics";
import { shiftKey, weekStartKey } from "@/lib/progress-metrics";
import { weeklyHours, type TimedSession } from "@/lib/session-time";
import type { BodyMeasurement, ProfileInfo, WorkoutLog } from "@/lib/types";

/**
 * Calories: what the body burns at rest, what the training adds, what the
 * scale says the balance has actually been, and — the user's ask — what to
 * eat to reach the goal weight at a pace muscle can keep up with.
 *
 * Every number here is an estimate from population formulas. The scale trend
 * is the only measurement, and the intake card says so.
 */

// -- BMR and TDEE ------------------------------------------------------------------

export function ageOn(birthYear: number, today: string): number {
  return Number(today.slice(0, 4)) - birthYear;
}

export type EnergyProfile = Pick<ProfileInfo, "sex" | "weightKg" | "heightCm" | "birthYear">;

/**
 * Mifflin-St Jeor (1990): the resting formula the ADA found closest to
 * measured values in the general population. Needs a sex the formula has a
 * constant for; "other" and unset get no number rather than a guess.
 */
export function bmr(profile: EnergyProfile, today: string, weightKg = profile.weightKg): number | undefined {
  if ((profile.sex !== "male" && profile.sex !== "female") || !(weightKg > 0) || !(profile.heightCm > 0) || !profile.birthYear) {
    return undefined;
  }
  const base = 10 * weightKg + 6.25 * profile.heightCm - 5 * ageOn(profile.birthYear, today);
  return profile.sex === "male" ? base + 5 : base - 161;
}

/** What the BMR card still needs, in the user's terms. */
export function bmrNeeds(profile: EnergyProfile, weightKg = profile.weightKg): string[] {
  const needs: string[] = [];
  if (profile.sex !== "male" && profile.sex !== "female") {
    needs.push(profile.sex === "other" ? "a male or female formula — none is published for other" : "your sex");
  }
  if (!profile.birthYear) needs.push("your birth year");
  if (!(profile.heightCm > 0)) needs.push("your height");
  if (!(weightKg > 0)) needs.push("a weigh-in");
  return needs;
}

export interface ActivityLevel {
  factor: number;
  label: string;
  /** Average logged hours a week the level was read from. */
  hours: number;
}

/**
 * The usual multipliers, picked from logged training hours rather than asked
 * for — people overrate their own activity. Only the training is known, so
 * the levels sit a notch under the textbook ones: a desk job plus four hours
 * of lifting is "moderate", not "very active".
 */
export const ACTIVITY_LEVELS: { maxHours: number; factor: number; label: string }[] = [
  { maxHours: 1, factor: 1.2, label: "mostly sitting" },
  { maxHours: 3, factor: 1.375, label: "lightly active" },
  { maxHours: 5, factor: 1.55, label: "moderately active" },
  { maxHours: 8, factor: 1.725, label: "very active" },
  { maxHours: Infinity, factor: 1.9, label: "athlete" }
];

const ACTIVITY_WEEKS = 4;

export function activityFactor(timed: TimedSession[], today: string): ActivityLevel {
  const weeks = weeklyHours(timed, today, ACTIVITY_WEEKS);
  const hours = weeks.reduce((sum, week) => sum + week.hours, 0) / ACTIVITY_WEEKS;
  const level = ACTIVITY_LEVELS.find((item) => hours < item.maxHours) ?? ACTIVITY_LEVELS[ACTIVITY_LEVELS.length - 1];
  return { factor: level.factor, label: level.label, hours: Math.round(hours * 10) / 10 };
}

export function tdee(restingKcal: number, factor: number): number {
  return restingKcal * factor;
}

// -- calories per session --------------------------------------------------------------

/**
 * Compendium of Physical Activities codes 02050 / 02054: resistance training
 * is 3.5 METs at a light-moderate effort, 5.0 vigorous, 6.0 for a circuit with
 * little rest. Density (kg per minute) is the one thing the log knows about
 * effort, so it picks the row.
 */
export const LIFTING_METS = { light: 3.5, vigorous: 5, circuit: 6 };
export const DENSITY_CUTOFFS = { vigorous: 40, circuit: 90 };

export function liftingMet(kgPerMin: number | undefined): number {
  if (kgPerMin === undefined || kgPerMin < DENSITY_CUTOFFS.vigorous) return LIFTING_METS.light;
  return kgPerMin < DENSITY_CUTOFFS.circuit ? LIFTING_METS.vigorous : LIFTING_METS.circuit;
}

/** ACSM metabolic equations: walking under ~6.4 km/h, running above. MET = VO₂ ÷ 3.5. */
export function cardioMet(kmPerHour: number): number {
  const metresPerMinute = (kmPerHour * 1000) / 60;
  const vo2 = kmPerHour < 6.4 ? 0.1 * metresPerMinute + 3.5 : 0.2 * metresPerMinute + 3.5;
  return vo2 / 3.5;
}

/** kcal = MET × kg × hours. The definition of a MET. */
export function sessionKcal(met: number, weightKg: number, hours: number): number {
  return met * weightKg * hours;
}

export interface SessionEnergy {
  date: string;
  name: string;
  kind: "lifting" | "cardio";
  minutes: number;
  met: number;
  kcal: number;
}

/**
 * One row per timed lifting session and one per cardio session. A run logged
 * inside a timed session would be counted twice, so its minutes come off the
 * session's before the lifting MET is applied.
 */
export function buildSessionEnergy(timed: TimedSession[], logs: WorkoutLog[], cardio: CardioSession[], weightKg: number): SessionEnergy[] {
  if (!(weightKg > 0)) {
    return [];
  }
  const kgByDate = new Map<string, number>();
  logs.forEach((log) => kgByDate.set(log.date, (kgByDate.get(log.date) ?? 0) + log.totalVolume));
  const cardioSecondsByDate = new Map<string, number>();
  cardio.forEach((session) => cardioSecondsByDate.set(session.date, (cardioSecondsByDate.get(session.date) ?? 0) + session.seconds));

  const lifting = timed.flatMap((session) => {
    const seconds = Math.max(0, session.seconds - (cardioSecondsByDate.get(session.date) ?? 0));
    const minutes = seconds / 60;
    if (minutes <= 0) {
      return [];
    }
    const kg = kgByDate.get(session.date) ?? 0;
    const met = liftingMet(kg > 0 ? kg / minutes : undefined);
    return [{ date: session.date, name: session.name, kind: "lifting" as const, minutes, met, kcal: sessionKcal(met, weightKg, minutes / 60) }];
  });
  const runs = cardio.flatMap((session) => {
    if (!(session.seconds > 0) || !(session.km > 0)) {
      return [];
    }
    const hours = session.seconds / 3600;
    const met = cardioMet(session.km / hours);
    return [{ date: session.date, name: session.name, kind: "cardio" as const, minutes: session.seconds / 60, met, kcal: sessionKcal(met, weightKg, hours) }];
  });
  return [...lifting, ...runs].sort((a, b) => a.date.localeCompare(b.date));
}

export function buildWeeklyKcal(rows: SessionEnergy[], today: string, weeks = 12): { week: string; kcal: number }[] {
  const last = weekStartKey(today);
  const keys = Array.from({ length: weeks }, (_, index) => shiftKey(last, (index - weeks + 1) * 7));
  const totals = new Map(keys.map((key) => [key, 0]));
  rows.forEach((row) => {
    const key = weekStartKey(row.date);
    if (totals.has(key)) {
      totals.set(key, (totals.get(key) ?? 0) + row.kcal);
    }
  });
  return keys.map((week) => ({ week, kcal: Math.round(totals.get(week) ?? 0) }));
}

// -- what the scale says the balance has been --------------------------------------------

/** Wishnofsky (1958): a kilogram of body fat is about 7,700 kcal. A rule of thumb, and stated as one. */
export const KCAL_PER_KG = 7700;

export interface EnergyBalance {
  rate: WeightRate;
  /** Implied daily surplus (positive) or deficit (negative), kcal. */
  dailyKcal: number;
}

export function buildEnergyBalance(measurements: BodyMeasurement[], today: string): EnergyBalance | undefined {
  const rate = buildWeightRate(measurements, today);
  return rate ? { rate, dailyKcal: (rate.kgPerWeek * KCAL_PER_KG) / 7 } : undefined;
}

// -- the daily intake target --------------------------------------------------------------

/** Share of bodyweight per week; the same band the rate card judges by. */
export const PACES: { id: "slow" | "standard"; label: string; percentPerWeek: number }[] = [
  { id: "slow", label: "Slow", percentPerWeek: 0.25 },
  { id: "standard", label: "Standard", percentPerWeek: 0.5 }
];
/** A surplus past this is fat, not muscle, whatever the pace says. */
export const MAX_SURPLUS_KCAL = 500;
/** Morton et al. (2018): protein for lifters, g per kg of bodyweight per day. */
export const PROTEIN_G_PER_KG = { low: 1.6, high: 2.2 };
/** A goal this close is a hold. */
const HOLD_KG = 0.25;
const MAX_FINISH_DAYS = 730;

export type Direction = "lose" | "gain" | "hold" | "noGoal";
export type PaceCheck = "onPace" | "fast" | "slow" | "stalled" | "away" | "noData";

export interface IntakePace {
  id: "slow" | "standard";
  label: string;
  kgPerWeek: number;
  kcalPerDay: number;
  /** When the goal arrives at this pace; absent past two years. */
  finishDate?: string;
  weeks: number;
}

export interface IntakeTarget {
  direction: Direction;
  currentKg?: number;
  goalKg?: number;
  /** TDEE. Absent until birth year, sex, height and a weigh-in exist. */
  maintenance?: number;
  restingKcal?: number;
  paces: IntakePace[];
  /** Maintenance plus the balance the scale implies: what you have been eating, roughly. */
  fromScale?: number;
  proteinG?: { low: number; high: number };
  check: PaceCheck;
}

/**
 * Intake for each pace: maintenance minus the deficit that pace needs
 * (7,700 kcal per kg), never below resting, or plus a surplus capped at 500.
 */
export function buildIntakeTarget(input: {
  profile: EnergyProfile & Pick<ProfileInfo, "goalWeightKg">;
  measurements: BodyMeasurement[];
  timed: TimedSession[];
  today: string;
}): IntakeTarget {
  const { profile, measurements, timed, today } = input;
  const currentKg = latestFor(measurements, "weight")?.value ?? (profile.weightKg > 0 ? profile.weightKg : undefined);
  const goalKg = profile.goalWeightKg && profile.goalWeightKg > 0 ? profile.goalWeightKg : undefined;
  const direction: Direction = !goalKg || !currentKg ? "noGoal" : goalKg < currentKg - HOLD_KG ? "lose" : goalKg > currentKg + HOLD_KG ? "gain" : "hold";
  const restingKcal = bmr(profile, today, currentKg);
  const maintenance = restingKcal !== undefined ? tdee(restingKcal, activityFactor(timed, today).factor) : undefined;
  const balance = buildEnergyBalance(measurements, today);
  const proteinG = currentKg ? { low: PROTEIN_G_PER_KG.low * currentKg, high: PROTEIN_G_PER_KG.high * currentKg } : undefined;

  const paces: IntakePace[] =
    maintenance !== undefined && restingKcal !== undefined && currentKg && goalKg && (direction === "lose" || direction === "gain")
      ? PACES.map((pace) => {
          const kgPerWeek = (pace.percentPerWeek / 100) * currentKg;
          const dailyChange = (kgPerWeek * KCAL_PER_KG) / 7;
          const kcalPerDay = direction === "lose" ? Math.max(restingKcal, maintenance - dailyChange) : maintenance + Math.min(MAX_SURPLUS_KCAL, dailyChange);
          const weeks = Math.abs(goalKg - currentKg) / kgPerWeek;
          const days = Math.ceil(weeks * 7);
          return { id: pace.id, label: pace.label, kgPerWeek, kcalPerDay, weeks, finishDate: days <= MAX_FINISH_DAYS ? shiftKey(today, days) : undefined };
        })
      : [];

  let check: PaceCheck = "noData";
  if (balance && direction !== "noGoal") {
    const { rate } = balance;
    if (direction === "hold") {
      check = rate.band === "flat" ? "onPace" : "away";
    } else if (rate.band === "flat") {
      check = "stalled";
    } else if ((direction === "lose") !== (rate.direction === "down")) {
      check = "away";
    } else {
      check = rate.band === "fast" ? "fast" : rate.band === "slow" ? "slow" : "onPace";
    }
  }

  return {
    direction,
    currentKg,
    goalKg,
    maintenance,
    restingKcal,
    paces,
    fromScale: maintenance !== undefined && balance ? maintenance + balance.dailyKcal : undefined,
    proteinG,
    check
  };
}

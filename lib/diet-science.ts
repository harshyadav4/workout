/**
 * The Science tab on the Diet side: published rules of thumb run over what was
 * actually ticked, the twin of lib/energy.ts and friends on the workout side.
 * Pure, so every number here is tested.
 *
 * Two rules from the workout Science tab hold here too. A number computed from
 * a guess is worse than no number, so each builder returns undefined until its
 * inputs exist. And intake is self-reported, so nothing here claims to be exact
 * or to name a cause.
 *
 * It reads bodyweight and training from the workout side and never writes there.
 */
import { buildWeightRate } from "@/lib/body-composition";
import { dailyIntake, weighInsOf, weightOn, averageIntake, type DayIntake } from "@/lib/diet-metrics";
import type { ScheduledMealDay } from "@/lib/diet-types";
import { KCAL_PER_KG, MAX_SURPLUS_KCAL, PACES, type SessionEnergy } from "@/lib/energy";
import { shiftKey, type DateWindow } from "@/lib/progress-metrics";
import type { BodyMeasurement } from "@/lib/types";

/** How much recent history the energy cards read, whichever range is open. */
export const RECENT_DAYS = 28;
/** Under this many logged days in the last four weeks, an average of them says little. */
export const MIN_LOGGED_DAYS = 14;

const DAY_MS = 86_400_000;
const MAX_FINISH_DAYS = 730;
const PATH_HISTORY_DAYS = 56;
const PATH_HORIZON_WEEKS = 26;
/** A goal this close is a hold, the same as the workout side's target card. */
const HOLD_KG = 0.25;

/** Under this share of the standard pace, either way, the weight is holding and not going anywhere. */
const STALLED_SHARE = 0.25;

const round1 = (value: number) => Math.round(value * 10) / 10;
const round2 = (value: number) => Math.round(value * 100) / 100;
const dayNumber = (key: string) => Date.parse(`${key}T00:00:00Z`) / DAY_MS;

export function recentWindow(today: string): DateWindow {
  return { start: shiftKey(today, -(RECENT_DAYS - 1)), end: today };
}

// -- how far to trust the rest -------------------------------------------------

export interface Coverage {
  logged: number;
  of: number;
  share: number;
}

export function buildCoverage(days: readonly ScheduledMealDay[], today: string): Coverage {
  const logged = dailyIntake(days, recentWindow(today)).length;
  return { logged, of: RECENT_DAYS, share: logged / RECENT_DAYS };
}

// -- maintenance, measured -----------------------------------------------------

export interface RealMaintenance {
  kcal: number;
  averageIntake: number;
  kgPerWeek: number;
  loggedDays: number;
}

/**
 * Energy balance run backwards: what you ate, less what the scale says was
 * stored. It reads your own body, where the formula reads a population, but it
 * is only as true as the logging. A forgotten snack lowers it.
 */
export function buildRealMaintenance(
  days: readonly ScheduledMealDay[],
  measurements: BodyMeasurement[],
  today: string
): RealMaintenance | undefined {
  const intake = dailyIntake(days, recentWindow(today));
  const rate = buildWeightRate(measurements, today, RECENT_DAYS);
  if (intake.length < MIN_LOGGED_DAYS || !rate) {
    return undefined;
  }
  const average = averageIntake(intake).kcal;
  return {
    kcal: Math.round(average - (rate.kgPerWeek * KCAL_PER_KG) / 7),
    averageIntake: average,
    kgPerWeek: round2(rate.kgPerWeek),
    loggedDays: intake.length
  };
}

/** Well under the formula usually means meals went unlogged, not a slow body. */
export const UNDER_LOGGING_SHARE = 0.8;

export function looksUnderLogged(real: number, formula: number | undefined): boolean {
  return formula !== undefined && real < formula * UNDER_LOGGING_SHARE;
}

// -- the path to the target weight ---------------------------------------------

export type PathStatus = "atGoal" | "onPace" | "slow" | "fast" | "stalled" | "wrongWay";

export interface PathRow {
  /** Day number, so the chart's axis is true to time. */
  t: number;
  date: string;
  /** A real weigh-in. */
  actual?: number;
  /** Where the weight goes from today, at what has been eaten. */
  fromFood?: number;
  /** The pace: the standard one from the first weigh-in in the last eight weeks, or the roadmap step's from today. */
  plan?: number;
}

/**
 * The next step of a body goal's roadmap. With one, this path aims for the end of
 * that step at that step's pace, because the roadmap's final weight can be where
 * the user already stands: "lose 3.5 kg, then gain it back as muscle" must not read
 * as "gain 0.4 kg now".
 */
export interface PathStep {
  toKg: number;
  toDate: string;
  kgPerWeek: number;
  kcalPerDay: number;
}

export interface GoalPath {
  /** The target and pace come from a roadmap step, not the standard pace. */
  fromRoadmap: boolean;
  direction: "lose" | "gain" | "hold";
  currentKg: number;
  goalKg: number;
  averageIntake: number;
  maintenance: number;
  /** Measured from food and scale, or the population formula when it cannot be. */
  maintenanceSource: "measured" | "formula";
  /** Signed kg a week at what has been eaten. */
  foodKgPerWeek: number;
  /** Calories a day the pace takes: the standard one, or the roadmap step's. */
  neededKcal: number;
  /** Eaten less needed. On a cut a positive number is too much; on a bulk, too little is negative. */
  gapKcal: number;
  status: PathStatus;
  /** When the goal arrives at what has been eaten. Absent if it never does, or past two years. */
  finishDate?: string;
  /** When the goal arrives at the pace, whatever is being eaten. */
  planFinishDate?: string;
  /** Today's weight less where the standard pace says it should be. */
  againstPlanKg?: number;
  rows: PathRow[];
}

/** Standard pace in kg a week, for a given weight: the band the workout side's rate card uses. */
function standardKgPerWeek(weightKg: number): number {
  const standard = PACES.find((pace) => pace.id === "standard");
  return ((standard?.percentPerWeek ?? 0.5) / 100) * weightKg;
}

export function buildGoalPath(input: {
  days: readonly ScheduledMealDay[];
  measurements: BodyMeasurement[];
  goalKg?: number;
  /** The formula's estimate, used when food and scale cannot measure it yet. */
  formulaMaintenance?: number;
  restingKcal?: number;
  step?: PathStep;
  today: string;
}): GoalPath | undefined {
  const { days, measurements, goalKg, formulaMaintenance, restingKcal, step, today } = input;
  const weighIns = weighInsOf(measurements).filter((point) => point.date <= today);
  const intake = dailyIntake(days, recentWindow(today));
  const latest = weighIns[weighIns.length - 1];
  if (!goalKg || goalKg <= 0 || !latest || intake.length < 7) {
    return undefined;
  }
  const real = buildRealMaintenance(days, measurements, today);
  const maintenance = real?.kcal ?? formulaMaintenance;
  if (maintenance === undefined) {
    return undefined;
  }

  const currentKg = latest.value;
  const direction = goalKg < currentKg - HOLD_KG ? "lose" : goalKg > currentKg + HOLD_KG ? "gain" : "hold";
  const sign = direction === "lose" ? -1 : 1;
  const average = averageIntake(intake).kcal;
  const foodKgPerWeek = round2(((average - maintenance) * 7) / KCAL_PER_KG);

  const pace = step?.kgPerWeek || standardKgPerWeek(currentKg);
  const dailyChange = (pace * KCAL_PER_KG) / 7;
  const neededKcal =
    step && step.kcalPerDay > 0
      ? step.kcalPerDay
      : Math.round(
          direction === "hold"
            ? maintenance
            : direction === "lose"
              ? Math.max(restingKcal ?? 0, maintenance - dailyChange)
              : maintenance + Math.min(MAX_SURPLUS_KCAL, dailyChange)
        );

  let status: PathStatus;
  let finishDate: string | undefined;
  const toward = sign * foodKgPerWeek;
  if (direction === "hold") {
    status = Math.abs(foodKgPerWeek) < pace / 2 ? "atGoal" : "wrongWay";
  } else if (Math.abs(foodKgPerWeek) < pace * STALLED_SHARE) {
    status = "stalled";
  } else if (toward < 0) {
    status = "wrongWay";
  } else {
    status = toward < pace / 2 ? "slow" : toward > pace * 1.5 ? "fast" : "onPace";
    const finishDays = Math.ceil((Math.abs(goalKg - currentKg) / toward) * 7);
    finishDate = finishDays <= MAX_FINISH_DAYS ? shiftKey(today, finishDays) : undefined;
  }

  // The plan line starts where the last eight weeks started, so it can say how
  // far ahead or behind today's weight is.
  const history = weighIns.filter((point) => dayNumber(today) - dayNumber(point.date) <= PATH_HISTORY_DAYS);
  // A roadmap step starts today, so there is nothing yet to be ahead of or behind.
  const start = step ? latest : history[0] ?? latest;
  const planDirection = goalKg < start.value ? -1 : 1;
  const planPerDay = (planDirection * (step?.kgPerWeek || standardKgPerWeek(start.value))) / 7;
  const planAt = (date: string) => {
    const value = start.value + planPerDay * (dayNumber(date) - dayNumber(start.date));
    return planDirection < 0 ? Math.max(goalKg, value) : Math.min(goalKg, value);
  };

  const foodFrom = dayNumber(latest.date);
  const foodAt = (date: string) => currentKg + (foodKgPerWeek / 7) * (dayNumber(date) - foodFrom);

  const planDaysLeft = Math.ceil(Math.abs(goalKg - start.value) / (Math.abs(planPerDay) || 1));
  const planEnd = shiftKey(start.date, Math.min(planDaysLeft, MAX_FINISH_DAYS));
  const horizon = shiftKey(today, PATH_HORIZON_WEEKS * 7);
  const wanted = [finishDate, planEnd].filter((date): date is string => Boolean(date)).sort().pop() ?? horizon;
  const end = wanted > horizon ? horizon : wanted < shiftKey(today, 28) ? shiftKey(today, 28) : wanted;

  const rows = new Map<string, PathRow>();
  const rowFor = (date: string) => {
    const row = rows.get(date) ?? { t: dayNumber(date), date };
    rows.set(date, row);
    return row;
  };
  history.forEach((point) => {
    const row = rowFor(point.date);
    row.actual = point.value;
    if (point.date >= start.date) {
      row.plan = round2(planAt(point.date));
    }
  });
  // Weekly from the last weigh-in, so the two forward lines stay straight and light.
  for (let date = latest.date; date <= end; date = shiftKey(date, 7)) {
    const row = rowFor(date);
    row.fromFood = round2(foodAt(date));
    row.plan = round2(planAt(date));
  }
  rowFor(end).fromFood = round2(foodAt(end));
  rowFor(end).plan = round2(planAt(end));

  return {
    fromRoadmap: Boolean(step),
    direction,
    currentKg,
    goalKg,
    averageIntake: average,
    maintenance,
    maintenanceSource: real ? "measured" : "formula",
    foodKgPerWeek,
    neededKcal,
    gapKcal: average - neededKcal,
    status,
    finishDate,
    planFinishDate:
      direction === "hold"
        ? undefined
        : step?.toDate ?? shiftKey(today, Math.min(MAX_FINISH_DAYS, Math.ceil((Math.abs(goalKg - currentKg) / pace) * 7))),
    againstPlanKg: !step && history.length >= 2 ? round1(currentKg - planAt(latest.date)) : undefined,
    rows: [...rows.values()].sort((a, b) => a.t - b.t)
  };
}

// -- energy availability ---------------------------------------------------------

export const AVAILABILITY_BANDS = { low: 30, good: 45 };

export interface EnergyAvailability {
  value: number;
  band: "low" | "reduced" | "good";
  intake: number;
  exercisePerDay: number;
  leanKg: number;
}

/** What is left for the body after training, per kg of lean mass (Loucks). */
export function buildEnergyAvailability(
  days: readonly ScheduledMealDay[],
  sessions: readonly SessionEnergy[],
  leanKg: number | undefined,
  today: string
): EnergyAvailability | undefined {
  const window = recentWindow(today);
  const intake = dailyIntake(days, window);
  if (!leanKg || leanKg <= 0 || intake.length < MIN_LOGGED_DAYS) {
    return undefined;
  }
  const burned = sessions
    .filter((session) => session.date >= window.start && session.date <= window.end)
    .reduce((sum, session) => sum + session.kcal, 0);
  const average = averageIntake(intake).kcal;
  const exercisePerDay = Math.round(burned / RECENT_DAYS);
  const value = round1((average - exercisePerDay) / leanKg);
  return {
    value,
    band: value < AVAILABILITY_BANDS.low ? "low" : value < AVAILABILITY_BANDS.good ? "reduced" : "good",
    intake: average,
    exercisePerDay,
    leanKg: round1(leanKg)
  };
}

// -- protein ---------------------------------------------------------------------

/** Morton et al. (2018). */
export const PROTEIN_BAND = { low: 1.6, high: 2.2 };

export interface ProteinDays {
  averagePerKg: number;
  under: number;
  within: number;
  over: number;
  days: number;
}

export function buildProteinDays(
  rows: readonly DayIntake[],
  measurements: BodyMeasurement[]
): ProteinDays | undefined {
  const weighIns = weighInsOf(measurements);
  const ratios = rows.flatMap((row) => {
    const weight = weightOn(weighIns, row.date);
    return weight && weight > 0 ? [row.proteinG / weight] : [];
  });
  if (ratios.length === 0) {
    return undefined;
  }
  return {
    averagePerKg: round2(ratios.reduce((sum, value) => sum + value, 0) / ratios.length),
    under: ratios.filter((value) => value < PROTEIN_BAND.low).length,
    within: ratios.filter((value) => value >= PROTEIN_BAND.low && value <= PROTEIN_BAND.high).length,
    over: ratios.filter((value) => value > PROTEIN_BAND.high).length,
    days: ratios.length
  };
}

/** Moore et al. (2015): about what a young adult needs in one meal to switch muscle building on. */
export const PROTEIN_DOSE_G_PER_KG = 0.25;
/** Schoenfeld and Aragon (2018): spread over at least this many meals. */
export const PROTEIN_DOSE_MEALS = 4;

export interface ProteinMeals {
  /** Eaten meals a day that reached the dose. */
  dosesPerDay: number;
  mealsPerDay: number;
  /** Hours between doses, on days with two or more. */
  averageGapHours?: number;
  /** The dose in grams, at the latest weight. */
  doseG: number;
  days: number;
}

const minutesOf = (time: string) => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

export function buildProteinMeals(
  days: readonly ScheduledMealDay[],
  window: DateWindow,
  measurements: BodyMeasurement[]
): ProteinMeals | undefined {
  const weighIns = weighInsOf(measurements);
  const latest = weighIns[weighIns.length - 1]?.value;
  if (!latest) {
    return undefined;
  }
  let doses = 0;
  let meals = 0;
  let tracked = 0;
  const gaps: number[] = [];
  days
    .filter((day) => day.date >= window.start && day.date <= window.end)
    .forEach((day) => {
      const eaten = day.items.filter((item) => item.status === "eaten");
      if (eaten.length === 0) {
        return;
      }
      tracked += 1;
      meals += eaten.length;
      const weight = weightOn(weighIns, day.date) ?? latest;
      const dosed = eaten
        .filter((item) => item.proteinG >= PROTEIN_DOSE_G_PER_KG * weight)
        .map((item) => minutesOf(item.time))
        .sort((a, b) => a - b);
      doses += dosed.length;
      dosed.slice(1).forEach((minute, index) => gaps.push((minute - dosed[index]) / 60));
    });
  if (tracked === 0) {
    return undefined;
  }
  return {
    dosesPerDay: round1(doses / tracked),
    mealsPerDay: round1(meals / tracked),
    averageGapHours: gaps.length > 0 ? round1(gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length) : undefined,
    doseG: Math.round(PROTEIN_DOSE_G_PER_KG * latest),
    days: tracked
  };
}

// -- carbs and fat -----------------------------------------------------------------

/** Slater and Phillips (2011): strength athletes, g per kg per day. */
export const CARB_BAND = { low: 4, high: 7 };

export interface CarbSplit {
  training?: { carbsPerKg: number; kcal: number; days: number };
  rest?: { carbsPerKg: number; kcal: number; days: number };
}

/** A training day is any day with a logged workout. Nothing else on the workout side is read. */
export function buildCarbSplit(
  rows: readonly DayIntake[],
  trainingDates: ReadonlySet<string>,
  measurements: BodyMeasurement[]
): CarbSplit | undefined {
  const weighIns = weighInsOf(measurements);
  const summarize = (list: DayIntake[]) => {
    const perKg = list.flatMap((row) => {
      const weight = weightOn(weighIns, row.date);
      return weight && weight > 0 ? [row.carbsG / weight] : [];
    });
    return perKg.length === 0
      ? undefined
      : {
          carbsPerKg: round1(perKg.reduce((sum, value) => sum + value, 0) / perKg.length),
          kcal: averageIntake(list).kcal,
          days: list.length
        };
  };
  const training = summarize(rows.filter((row) => trainingDates.has(row.date)));
  const rest = summarize(rows.filter((row) => !trainingDates.has(row.date)));
  return training || rest ? { training, rest } : undefined;
}

/** IOM (2005): the accepted range for fat, as a share of calories. */
export const FAT_SHARE_BAND = { low: 20, high: 35 };

export interface FatFloor {
  averageShare: number;
  averagePerKg?: number;
  under: number;
  within: number;
  over: number;
  days: number;
}

export function buildFatFloor(rows: readonly DayIntake[], measurements: BodyMeasurement[]): FatFloor | undefined {
  const shares = rows.filter((row) => row.kcal > 0).map((row) => (row.fatG * 9 * 100) / row.kcal);
  if (shares.length === 0) {
    return undefined;
  }
  const weighIns = weighInsOf(measurements);
  const perKg = rows.flatMap((row) => {
    const weight = weightOn(weighIns, row.date);
    return weight && weight > 0 ? [row.fatG / weight] : [];
  });
  return {
    averageShare: Math.round(shares.reduce((sum, value) => sum + value, 0) / shares.length),
    averagePerKg: perKg.length > 0 ? round2(perKg.reduce((sum, value) => sum + value, 0) / perKg.length) : undefined,
    under: shares.filter((value) => value < FAT_SHARE_BAND.low).length,
    within: shares.filter((value) => value >= FAT_SHARE_BAND.low && value <= FAT_SHARE_BAND.high).length,
    over: shares.filter((value) => value > FAT_SHARE_BAND.high).length,
    days: shares.length
  };
}

// -- weekdays and weekend ------------------------------------------------------------

export interface WeekendGap {
  weekdayKcal: number;
  weekendKcal: number;
  gapKcal: number;
  weekdayCost: number;
  weekendCost: number;
}

/** Racette et al. (2008): weekends are where the week's deficit often goes. Needs both to compare. */
export function buildWeekendGap(rows: readonly DayIntake[]): WeekendGap | undefined {
  const isWeekend = (row: DayIntake) => {
    const day = new Date(`${row.date}T00:00:00Z`).getUTCDay();
    return day === 0 || day === 6;
  };
  const weekend = rows.filter(isWeekend);
  const weekday = rows.filter((row) => !isWeekend(row));
  if (weekend.length < 2 || weekday.length < 2) {
    return undefined;
  }
  const a = averageIntake(weekday);
  const b = averageIntake(weekend);
  return { weekdayKcal: a.kcal, weekendKcal: b.kcal, gapKcal: b.kcal - a.kcal, weekdayCost: a.costInr, weekendCost: b.costInr };
}

// -- what protein costs ---------------------------------------------------------------

/** Under this, a meal is not a protein source and its price per gram means nothing. */
const MIN_PROTEIN_FOR_VALUE = 5;

export interface MealValue {
  name: string;
  times: number;
  /** Rupees for 100 g of protein. */
  per100gProtein: number;
}

export interface ProteinValue {
  /** Rupees for 100 g of protein across everything eaten. */
  per100gProtein: number;
  /** Rupees for 1000 kcal across everything eaten. */
  per1000Kcal: number;
  /** Cheapest protein first. */
  meals: MealValue[];
}

/** Only meals with a cost count: a meal with no price would make protein look free. */
export function buildProteinValue(days: readonly ScheduledMealDay[], window: DateWindow): ProteinValue | undefined {
  const byName = new Map<string, { name: string; times: number; protein: number; cost: number; kcal: number }>();
  days
    .filter((day) => day.date >= window.start && day.date <= window.end)
    .flatMap((day) => day.items)
    .filter((item) => item.status === "eaten" && item.costInr > 0)
    .forEach((item) => {
      const key = item.name.trim().toLowerCase();
      const entry = byName.get(key) ?? { name: item.name, times: 0, protein: 0, cost: 0, kcal: 0 };
      entry.times += 1;
      entry.protein += item.proteinG;
      entry.cost += item.costInr;
      entry.kcal += item.kcal;
      byName.set(key, entry);
    });
  const entries = [...byName.values()];
  const protein = entries.reduce((sum, entry) => sum + entry.protein, 0);
  const kcal = entries.reduce((sum, entry) => sum + entry.kcal, 0);
  const cost = entries.reduce((sum, entry) => sum + entry.cost, 0);
  if (protein <= 0 || kcal <= 0) {
    return undefined;
  }
  return {
    per100gProtein: Math.round((cost / protein) * 100),
    per1000Kcal: Math.round((cost / kcal) * 1000),
    meals: entries
      .filter((entry) => entry.protein / entry.times >= MIN_PROTEIN_FOR_VALUE)
      .map((entry) => ({ name: entry.name, times: entry.times, per100gProtein: Math.round((entry.cost / entry.protein) * 100) }))
      .sort((a, b) => a.per100gProtein - b.per100gProtein)
  };
}

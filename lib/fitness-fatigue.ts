import { epley, MAX_ELIGIBLE_REPS } from "@/lib/one-rep-max";
import { GROUP_LABELS, GROUP_ORDER, daysBetween, filterByWindow, shiftKey, type DateWindow } from "@/lib/progress-metrics";
import { secondsBetween, sessionBreakdown, timedSessions } from "@/lib/session-time";
import type { MuscleGroup, ScheduledSession, SetLog, WorkoutLog } from "@/lib/types";

/**
 * How tired the training is making you, from the log alone.
 *
 * Load here is tonnage, so every model below is blind to holds and runs by
 * construction (`ExerciseMetric`: a plank moves no volume). The cards say
 * "lifting" rather than "training" for that reason.
 */

// -- Banister fitness–fatigue ------------------------------------------------------

/** Days. Banister (1975) used ~45 and ~15; TrainingPeaks settled on 42 and 7. */
export const FITNESS_TAU = 42;
export const FATIGUE_TAU = 7;
/** Two years of daily points is as far back as a 42-day constant can see anyway. */
const BANISTER_MAX_DAYS = 730;
/** Before this, the slow average is still filling up and form reads as fresh for no reason. */
export const BANISTER_MIN_DAYS = 14;

export interface BanisterPoint {
  key: string;
  /** Tonnage lifted that day. */
  load: number;
  /** Exponentially weighted daily load, 42-day constant: what you are used to. */
  fitness: number;
  /** The same with a 7-day constant: what this week has cost. */
  fatigue: number;
  /** fitness − fatigue. Negative after a hard week, positive after an easy one. */
  form: number;
  inWindow: boolean;
}

export type FormState = "fresh" | "steady" | "loaded" | "run down";

/**
 * Form as a share of fitness, so the words mean the same for a 2 t/week lifter
 * and a 20 t/week one. The cut-offs are the ones endurance coaches use for
 * TSB: a little negative is training, a lot negative is digging a hole.
 */
export function formState(point: Pick<BanisterPoint, "fitness" | "form">): FormState {
  if (point.fitness <= 0) {
    return "steady";
  }
  const ratio = point.form / point.fitness;
  return ratio > 0.1 ? "fresh" : ratio >= -0.1 ? "steady" : ratio >= -0.3 ? "loaded" : "run down";
}

/**
 * The exact exponential smoother: x_t = x_{t−1}·e^(−1/τ) + load_t·(1 − e^(−1/τ)).
 * A constant daily load converges to that load, so fitness and fatigue are
 * both in kg per day and can sit on one axis; and after τ days of rest a
 * value has decayed to 1/e of itself, which is what the constant promises.
 *
 * Lifetime, like everything in progress-trends: the window only shades.
 */
export function buildBanister(logs: WorkoutLog[], window: DateWindow, today: string): BanisterPoint[] {
  const daily = new Map<string, number>();
  logs.forEach((log) => daily.set(log.date, (daily.get(log.date) ?? 0) + log.totalVolume));
  const dates = [...daily.keys()].sort();
  if (dates.length === 0) {
    return [];
  }
  const start = daysBetween(dates[0], today) > BANISTER_MAX_DAYS ? shiftKey(today, -BANISTER_MAX_DAYS) : dates[0];
  const keepFitness = Math.exp(-1 / FITNESS_TAU);
  const keepFatigue = Math.exp(-1 / FATIGUE_TAU);
  const points: BanisterPoint[] = [];
  let fitness = 0;
  let fatigue = 0;
  for (let key = start; key <= today; key = shiftKey(key, 1)) {
    const load = daily.get(key) ?? 0;
    fitness = fitness * keepFitness + load * (1 - keepFitness);
    fatigue = fatigue * keepFatigue + load * (1 - keepFatigue);
    points.push({ key, load, fitness, fatigue, form: fitness - fatigue, inWindow: key >= window.start && key <= window.end });
  }
  return points;
}

// -- monotony: see lib/progress-trends buildWeeklyLoadStats ----------------------------

/** Foster's own guidance: over 2 is the warning; a fixed split sits near 1 by construction. */
export const MONOTONY_WARN = 2;
export const MONOTONY_MIN_WEEKS = 8;

// -- rep drop-off within a session ----------------------------------------------------

/** A last set this far under the first, at the same weight, is fatigue showing. */
export const DROPOFF_FLAG_PERCENT = 25;
const DROPOFF_MIN_SESSIONS = 2;

export interface LiftDropoff {
  workoutId: string;
  name: string;
  /** Median over sessions of (first reps − last reps) ÷ first reps, in %. */
  medianPercent: number;
  sessions: number;
  flagged: boolean;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * First working set against the last, per exercise per session, only when they
 * were at the same weight — a drop after adding load is the load, not fatigue.
 * Warm-ups never reach set_logs, so set 0 is the first working set.
 */
export function buildRepDropoff(setLogs: SetLog[], logs: WorkoutLog[], window: DateWindow): LiftDropoff[] {
  const names = new Map<string, string>();
  [...logs].sort((a, b) => a.date.localeCompare(b.date)).forEach((log) => names.set(log.workoutId, log.name));
  const byLog = new Map<string, SetLog[]>();
  filterByWindow(setLogs, window)
    .filter((row) => row.reps > 0)
    .forEach((row) => byLog.set(row.logId, [...(byLog.get(row.logId) ?? []), row]));
  const drops = new Map<string, number[]>();
  byLog.forEach((rows) => {
    const sorted = [...rows].sort((a, b) => a.setIndex - b.setIndex);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    if (sorted.length < 2 || first.weight !== last.weight || first.reps <= 0) {
      return;
    }
    const percent = ((first.reps - last.reps) / first.reps) * 100;
    drops.set(first.workoutId, [...(drops.get(first.workoutId) ?? []), percent]);
  });
  return [...drops.entries()]
    .filter(([, values]) => values.length >= DROPOFF_MIN_SESSIONS)
    .map(([workoutId, values]) => {
      const medianPercent = median(values);
      return { workoutId, name: names.get(workoutId) ?? workoutId, medianPercent, sessions: values.length, flagged: medianPercent >= DROPOFF_FLAG_PERCENT };
    })
    .sort((a, b) => b.medianPercent - a.medianPercent);
}

// -- real rest between sets -------------------------------------------------------------

export interface RestRow {
  name: string;
  plannedSeconds: number;
  /** Median seconds from one set's log to the next, same exercise: the set and the rest after it. */
  medianGap: number;
  gaps: number;
}

const REST_ROWS = 8;
/** A gap this long is a phone call or a forgotten set, not a rest. */
const MAX_GAP_SECONDS = 15 * 60;

/**
 * Set timestamps give when each set was *logged*; the gap between two sets of
 * one exercise is therefore the second set's work plus the rest before it,
 * which is the number a rest timer is actually competing with. Only exercises
 * with a planned rest, so there is a plan to compare against.
 */
export function buildRestAdherence(sessions: ScheduledSession[], window: DateWindow): RestRow[] {
  const byName = new Map<string, { plannedSeconds: number; gaps: number[] }>();
  sessions
    .filter((session) => session.status === "completed" && session.date >= window.start && session.date <= window.end)
    .forEach((session) => {
      const timing = new Map(sessionBreakdown(session).map((entry) => [entry.exerciseId, entry]));
      session.exercises.forEach((exercise) => {
        const planned = exercise.restSeconds;
        const sets = timing.get(exercise.id)?.sets ?? [];
        if (!planned || sets.length < 2) {
          return;
        }
        const entry = byName.get(exercise.templateName) ?? { plannedSeconds: planned, gaps: [] };
        for (let index = 1; index < sets.length; index += 1) {
          const gap = secondsBetween(sets[index - 1].at, sets[index].at);
          if (gap > 0 && gap <= MAX_GAP_SECONDS) {
            entry.gaps.push(gap);
          }
        }
        byName.set(exercise.templateName, entry);
      });
    });
  return [...byName.entries()]
    .filter(([, entry]) => entry.gaps.length > 0)
    .map(([name, entry]) => ({ name, plannedSeconds: entry.plannedSeconds, medianGap: median(entry.gaps), gaps: entry.gaps.length }))
    .sort((a, b) => b.gaps - a.gaps)
    .slice(0, REST_ROWS);
}

// -- session density --------------------------------------------------------------------

export interface DensityPoint {
  date: string;
  name: string;
  kg: number;
  minutes: number;
  kgPerMin: number;
}

const DENSITY_POINTS = 16;

/**
 * Tonnage per minute of session. Joined by date: a `WorkoutLog` names its
 * template, not its session, so two sessions on one day read as one.
 */
export function buildSessionDensity(sessions: ScheduledSession[], logs: WorkoutLog[], window: DateWindow): DensityPoint[] {
  const kgByDate = new Map<string, number>();
  logs.forEach((log) => kgByDate.set(log.date, (kgByDate.get(log.date) ?? 0) + log.totalVolume));
  return timedSessions(sessions)
    .filter((session) => session.date >= window.start && session.date <= window.end)
    .flatMap((session) => {
      const kg = kgByDate.get(session.date) ?? 0;
      const minutes = session.seconds / 60;
      return kg > 0 && minutes > 0 ? [{ date: session.date, name: session.name, kg, minutes, kgPerMin: kg / minutes }] : [];
    })
    .slice(-DENSITY_POINTS);
}

// -- effective reps and RIR-adjusted max -----------------------------------------------

/** Beardsley: the last five reps before failure are the ones that recruit the high-threshold fibres. */
export const STIMULATING_REPS = 5;

export function effectiveReps(reps: number, rir: number): number {
  const left = Math.max(0, Math.min(5, Math.round(rir)));
  return Math.max(0, Math.min(reps, STIMULATING_REPS - left));
}

export interface EffectiveRow {
  group: MuscleGroup;
  label: string;
  effective: number;
  /** Sets with an RIR on them. */
  rated: number;
}

export interface EffectiveReport {
  rows: EffectiveRow[];
  rated: number;
  /** Rep sets in the window with no RIR: what the lifter did not say. */
  unrated: number;
}

export function buildEffectiveReps(setLogs: SetLog[], window: DateWindow, groupOf: Map<string, MuscleGroup>): EffectiveReport {
  const rows = new Map<MuscleGroup, EffectiveRow>();
  let rated = 0;
  let unrated = 0;
  filterByWindow(setLogs, window)
    .filter((row) => row.reps > 0)
    .forEach((row) => {
      if (row.rir === undefined) {
        unrated += 1;
        return;
      }
      rated += 1;
      const group = groupOf.get(row.workoutId);
      if (!group) {
        return;
      }
      const entry = rows.get(group) ?? { group, label: GROUP_LABELS[group], effective: 0, rated: 0 };
      entry.effective += effectiveReps(row.reps, row.rir);
      entry.rated += 1;
      rows.set(group, entry);
    });
  return {
    rows: GROUP_ORDER.flatMap((group) => {
      const row = rows.get(group);
      return row ? [row] : [];
    }),
    rated,
    unrated
  };
}

/** Epley on the reps you *had*, not the reps you did: weight × (1 + (reps + RIR) ÷ 30). */
export function rirAdjustedE1rm(weight: number, reps: number, rir: number): number {
  return epley(weight, reps + Math.max(0, Math.round(rir)));
}

export interface RirMax {
  workoutId: string;
  name: string;
  adjusted: number;
  plain: number;
  fromWeight: number;
  fromReps: number;
  rir: number;
  date: string;
}

const RIR_MAX_ROWS = 5;

/** The best RIR-adjusted estimate per lift, where a rated set of 12 or fewer reps-to-failure exists. */
export function buildRirMaxes(setLogs: SetLog[], logs: WorkoutLog[]): RirMax[] {
  const names = new Map<string, string>();
  [...logs].sort((a, b) => a.date.localeCompare(b.date)).forEach((log) => names.set(log.workoutId, log.name));
  const best = new Map<string, RirMax>();
  setLogs.forEach((row) => {
    if (row.rir === undefined || row.weight <= 0 || row.reps <= 0 || row.reps + row.rir > MAX_ELIGIBLE_REPS) {
      return;
    }
    const adjusted = Math.round(rirAdjustedE1rm(row.weight, row.reps, row.rir) * 2) / 2;
    if (adjusted > (best.get(row.workoutId)?.adjusted ?? 0)) {
      best.set(row.workoutId, {
        workoutId: row.workoutId,
        name: names.get(row.workoutId) ?? row.workoutId,
        adjusted,
        plain: Math.round(epley(row.weight, row.reps) * 2) / 2,
        fromWeight: row.weight,
        fromReps: row.reps,
        rir: row.rir,
        date: row.date
      });
    }
  });
  return [...best.values()].sort((a, b) => b.adjusted - a.adjusted).slice(0, RIR_MAX_ROWS);
}

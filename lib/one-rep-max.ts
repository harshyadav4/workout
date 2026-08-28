import type { SetLog } from "@/lib/types";

/**
 * Estimated one-rep max, per exercise.
 *
 * `progress-metrics.ts` argued this away for good reason at the time:
 *
 * > *"Deliberately not an estimated 1RM: a log stores `totalReps` for the whole
 * > exercise, not reps per set, so Epley here would be a guess wearing a formula."*
 *
 * That was true of `WorkoutLog` and still is. It stopped being true of the app
 * when `set_logs` shipped — a `SetLog` is one performed set with its own reps
 * and weight, which is exactly and only what Epley needs. This file reads that
 * table and nothing else, which is why the old comment stays correct where it is.
 *
 * Its own honesty rule: **an estimate is refused rather than fudged.** Epley
 * drifts badly as reps climb, so past `MAX_ELIGIBLE_REPS` there is no number,
 * and every estimate names the set it came from so the user can judge it.
 */

/**
 * Above this, the formula is extrapolating rather than estimating. A 20-rep set
 * says a lot about work capacity and almost nothing about a single max.
 */
export const MAX_ELIGIBLE_REPS = 12;

/**
 * Epley. Chosen over Brzycki because it is the more conservative of the two in
 * the 6–12 range where most working sets actually live, and an estimate that
 * reads low is a smaller problem than one that sends someone under a bar.
 */
export function epley(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0 || reps > MAX_ELIGIBLE_REPS) {
    return 0;
  }
  // A single is not an estimate — it is the measurement. The formula would
  // inflate it by 3.3%, which is a worse answer than the one already in hand.
  if (reps === 1) {
    return weight;
  }
  return weight * (1 + reps / 30);
}

export interface OneRepMaxEstimate {
  /** Rounded to a half kilo — the precision the formula actually earns. */
  value: number;
  /** The set it came from, so the number can be argued with. */
  fromWeight: number;
  fromReps: number;
  date: string;
}

function round(value: number) {
  return Math.round(value * 2) / 2;
}

/**
 * The best estimate from any eligible set of this lift.
 *
 * Best *estimate*, not heaviest set: 100kg × 3 beats 105kg × 1, and picking the
 * heavier set would hide a genuine improvement.
 */
export function bestEstimate(setLogs: SetLog[], workoutId: string): OneRepMaxEstimate | undefined {
  return setLogs
    .filter((row) => row.workoutId === workoutId && row.reps <= MAX_ELIGIBLE_REPS)
    .reduce<OneRepMaxEstimate | undefined>((best, row) => {
      const value = round(epley(row.weight, row.reps));
      if (value <= 0 || (best && value <= best.value)) {
        return best;
      }
      return { value, fromWeight: row.weight, fromReps: row.reps, date: row.date };
    }, undefined);
}

export interface OneRepMaxPoint {
  date: string;
  value: number;
}

/**
 * The estimate per session, oldest first — the curve.
 *
 * One point per date, from that day's best eligible set. A session whose sets
 * were all above the rep ceiling contributes no point rather than a zero, which
 * would draw a cliff into the chart that never happened.
 */
export function oneRepMaxSeries(setLogs: SetLog[], workoutId: string): OneRepMaxPoint[] {
  const byDate = new Map<string, number>();

  setLogs
    .filter((row) => row.workoutId === workoutId && row.reps <= MAX_ELIGIBLE_REPS)
    .forEach((row) => {
      const value = round(epley(row.weight, row.reps));
      if (value > 0) {
        byDate.set(row.date, Math.max(byDate.get(row.date) ?? 0, value));
      }
    });

  return [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, value]) => ({ date, value }));
}

/**
 * What you could expect for a set you have not done, from a known estimate.
 *
 * The inverse of Epley, and the reason the calculator exists: "my estimated max
 * is 100 — what should I put on the bar for a set of 5".
 */
export function weightForReps(oneRepMax: number, reps: number): number {
  if (oneRepMax <= 0 || reps <= 0 || reps > MAX_ELIGIBLE_REPS) {
    return 0;
  }
  // Mirrors epley's single-rep case. Without this the pair does not round-trip:
  // a max of 110 would prescribe 106.5 for a set of one, which is not a set of
  // one, it is a different lift.
  if (reps === 1) {
    return round(oneRepMax);
  }
  return round(oneRepMax / (1 + reps / 30));
}

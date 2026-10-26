/**
 * Cardio: distance and time, not sets × reps × kg.
 *
 * Distance is always stored in km. Miles are a way of looking at it — a
 * per-device setting, like the theme — so switching units never rewrites a
 * single logged run, and a 5 km run is still 5 km in every sum and record.
 */

export type DistanceUnit = "km" | "mi";

export const UNIT_KEY = "arise.units";
const KM_PER_MILE = 1.609344;

export function readUnit(raw: string | null): DistanceUnit {
  return raw === "mi" ? "mi" : "km";
}

/** km → the unit on screen. */
export function toUnit(km: number, unit: DistanceUnit): number {
  return unit === "mi" ? km / KM_PER_MILE : km;
}

/** The unit on screen → km, the only thing ever stored. */
export function fromUnit(value: number, unit: DistanceUnit): number {
  return unit === "mi" ? value * KM_PER_MILE : value;
}

/** Two decimals at most, trailing zeros dropped: "5 km", "0.4 km", "3.11 mi". */
export function formatDistance(km: number, unit: DistanceUnit): string {
  const value = Math.round(toUnit(km, unit) * 100) / 100;
  return `${value} ${unit}`;
}

/**
 * Seconds per km (or mile) → "5:42 /km". Undefined when there is nothing to
 * divide by — a pace for a zero-distance row is not a pace, it is a bug.
 */
export function formatPace(seconds: number, km: number, unit: DistanceUnit): string | undefined {
  const distance = toUnit(km, unit);
  if (!(distance > 0) || !(seconds > 0)) {
    return undefined;
  }
  const perUnit = Math.round(seconds / distance);
  return `${Math.floor(perUnit / 60)}:${String(perUnit % 60).padStart(2, "0")} /${unit}`;
}

/** Seconds per km, for charts and records: lower is faster. */
export function paceSecondsPerKm(seconds: number, km: number): number | undefined {
  return km > 0 && seconds > 0 ? seconds / km : undefined;
}

/**
 * Library exercises that are a distance covered, so they start as distance +
 * time rather than reps. Named moves in the library's cardio group that stay
 * on the spot — burpees, jumping jacks, mountain climbers — are reps or time,
 * and are left as they are.
 */
const DISTANCE_WORDS = /\b(run|running|walk|walking|jog|sprint|bike|cycle|cycling|elliptical|stepmill|treadmill|rower|rowing machine|ski erg|swim)\b/i;
const ON_THE_SPOT = /\b(burpee|jack|climber|knee|hop|jump|lunge|crawl|squat|step)\b/i;

export function isDistanceExercise(name: string): boolean {
  return DISTANCE_WORDS.test(name) && !ON_THE_SPOT.test(name.replace(/\b(stepmill)\b/i, ""));
}

import type { CardioSession } from "@/lib/cardio-metrics";

/**
 * Running physiology from the best run in the log: Daniels' VDOT, Riegel's
 * race predictor, and the training paces Daniels hangs off a VDOT.
 *
 * A VDOT is only honest for an all-out effort. The log cannot know which runs
 * were, so the *best* run is taken — the one that produced the highest VDOT —
 * and the card names it so the reader can say "that was an easy jog".
 */

/** Below this a run says nothing about aerobic capacity; a 400 m repeat is not a race. */
export const VDOT_MIN_KM = 1.5;
/** Daniels' tables run from about 3.5 to 180 minutes; outside them the %VO2max curve is extrapolation. */
const VDOT_MIN_MINUTES = 3.5;
const VDOT_MAX_MINUTES = 180;

/** Daniels & Gilbert: oxygen cost of running at `metresPerMinute`, in ml/kg/min. */
export function vo2AtVelocity(metresPerMinute: number): number {
  return -4.6 + 0.182258 * metresPerMinute + 0.000104 * metresPerMinute ** 2;
}

/** Daniels & Gilbert: the share of VO2max a runner can hold for `minutes`. */
export function percentVo2max(minutes: number): number {
  return 0.8 + 0.1894393 * Math.exp(-0.012778 * minutes) + 0.2989558 * Math.exp(-0.1932605 * minutes);
}

/** The inverse of `vo2AtVelocity`: the speed (m/min) that costs `vo2`. */
export function velocityAtVo2(vo2: number): number {
  const a = 0.000104;
  const b = 0.182258;
  const c = -(4.6 + vo2);
  return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
}

/** VDOT for a run of `km` in `seconds`, or undefined when the run is outside what the tables cover. */
export function vdotFor(km: number, seconds: number): number | undefined {
  const minutes = seconds / 60;
  if (km < VDOT_MIN_KM || minutes < VDOT_MIN_MINUTES || minutes > VDOT_MAX_MINUTES) {
    return undefined;
  }
  const velocity = (km * 1000) / minutes;
  return vo2AtVelocity(velocity) / percentVo2max(minutes);
}

export interface BestVdot {
  vdot: number;
  session: CardioSession;
}

export function bestVdot(sessions: CardioSession[]): BestVdot | undefined {
  return sessions.reduce<BestVdot | undefined>((best, session) => {
    const vdot = vdotFor(session.km, session.seconds);
    return vdot !== undefined && vdot > (best?.vdot ?? 0) ? { vdot, session } : best;
  }, undefined);
}

// -- Riegel ----------------------------------------------------------------------

/** Riegel (1981): time scales with distance to the power 1.06. */
export const RIEGEL_EXPONENT = 1.06;

export function riegel(t1Seconds: number, d1Km: number, d2Km: number): number {
  return t1Seconds * (d2Km / d1Km) ** RIEGEL_EXPONENT;
}

export const RACES: { label: string; km: number }[] = [
  { label: "5 km", km: 5 },
  { label: "10 km", km: 10 },
  { label: "Half marathon", km: 21.0975 },
  { label: "Marathon", km: 42.195 }
];

export interface RacePrediction {
  label: string;
  km: number;
  seconds: number;
  /** More than about 3× the distance it came from: Riegel starts to flatter. */
  stretch: boolean;
}

const RIEGEL_STRETCH_RATIO = 3;

export function buildRacePredictions(session: CardioSession): RacePrediction[] {
  return RACES.map((race) => ({
    ...race,
    seconds: riegel(session.seconds, session.km, race.km),
    stretch: race.km / session.km > RIEGEL_STRETCH_RATIO
  }));
}

// -- pace zones -------------------------------------------------------------------

export type ZoneId = "E" | "M" | "T" | "I" | "R";

export interface PaceZone {
  id: ZoneId;
  label: string;
  /** Seconds per km at the zone's fast edge. */
  fast: number;
  /** Seconds per km at the zone's slow edge. */
  slow: number;
}

/** Daniels' training intensities as a share of VDOT. */
export const ZONES: { id: ZoneId; label: string; low: number; high: number }[] = [
  { id: "E", label: "Easy", low: 0.59, high: 0.74 },
  { id: "M", label: "Marathon", low: 0.75, high: 0.84 },
  { id: "T", label: "Threshold", low: 0.83, high: 0.88 },
  { id: "I", label: "Interval", low: 0.95, high: 1.0 },
  { id: "R", label: "Repetition", low: 1.05, high: 1.1 }
];

function secondsPerKm(metresPerMinute: number): number {
  return (1000 / metresPerMinute) * 60;
}

export function paceZones(vdot: number): PaceZone[] {
  return ZONES.map((zone) => ({
    id: zone.id,
    label: zone.label,
    fast: secondsPerKm(velocityAtVo2(vdot * zone.high)),
    slow: secondsPerKm(velocityAtVo2(vdot * zone.low))
  }));
}

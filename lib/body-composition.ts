import { latestFor, seriesFor } from "@/lib/body-metrics";
import { daysBetween } from "@/lib/progress-metrics";
import { leastSquares } from "@/lib/regression";
import type { BodyMeasurement, BodyMetric, ProfileInfo, Sex } from "@/lib/types";

/**
 * Body shape and composition from the tape and the scale: published ratios and
 * estimates, each with the input it needs named so the card can ask for it.
 *
 * Every function here returns undefined (or an empty list) rather than a
 * number built on a guess. The cards turn that into "add X on You".
 */

// -- BMI and the shape ratios ------------------------------------------------

export type BmiBand = "under" | "healthy" | "over" | "obese";

/** WHO cut-offs. Context only: a muscular person reads "over" with no fat to lose. */
export const BMI_BANDS = { under: 18.5, over: 25, obese: 30 };

export function bmi(weightKg: number, heightCm: number): number | undefined {
  if (weightKg <= 0 || heightCm <= 0) {
    return undefined;
  }
  const metres = heightCm / 100;
  return weightKg / (metres * metres);
}

export function bmiBand(value: number): BmiBand {
  return value < BMI_BANDS.under ? "under" : value < BMI_BANDS.over ? "healthy" : value < BMI_BANDS.obese ? "over" : "obese";
}

/** Ashwell: a waist under half your height. */
export const WAIST_HEIGHT_MAX = 0.5;
/** WHO waist-to-hip cut-offs for raised cardiometabolic risk. */
export const WAIST_HIP_MAX: Record<"male" | "female", number> = { male: 0.9, female: 0.85 };
/** The classic "V-taper" reference. An aesthetic, not a health number. */
export const GOLDEN_RATIO = 1.618;

export type ShapeRatioId = "bmi" | "waistHeight" | "waistHip" | "shoulderWaist";

/** Good, watch, or neutral when the number has no cut-off to judge it by. */
export type Tone = "good" | "watch" | "neutral";

export interface ShapeRatio {
  id: ShapeRatioId;
  label: string;
  value: number;
  /** Decimal places the number is shown to. */
  digits: number;
  /** The one-clause reading next to the number. */
  verdict: string;
  tone: Tone;
  /** The newest of the readings the ratio was built from. */
  date: string;
}

function newest(...dates: (string | undefined)[]): string {
  return dates.filter((date): date is string => Boolean(date)).sort().pop() ?? "";
}

/**
 * The ratios the latest readings allow. Each row appears only when both of its
 * inputs exist; a card with one row is still a card.
 */
export function buildShapeRatios(
  measurements: BodyMeasurement[],
  profile: Pick<ProfileInfo, "heightCm" | "weightKg" | "sex">
): ShapeRatio[] {
  const weight = latestFor(measurements, "weight");
  const waist = latestFor(measurements, "waist");
  const hips = latestFor(measurements, "hips");
  const shoulders = latestFor(measurements, "shoulders");
  const weightKg = weight?.value ?? profile.weightKg;
  const rows: ShapeRatio[] = [];

  const index = bmi(weightKg, profile.heightCm);
  if (index !== undefined) {
    const band = bmiBand(index);
    rows.push({
      id: "bmi",
      label: "BMI",
      value: index,
      digits: 1,
      verdict:
        band === "healthy"
          ? `${BMI_BANDS.under}–${BMI_BANDS.over} is the healthy band`
          : band === "under"
            ? `under ${BMI_BANDS.under}`
            : band === "over"
              ? `over ${BMI_BANDS.over} — muscle counts too`
              : `over ${BMI_BANDS.obese}`,
      tone: band === "healthy" ? "good" : "watch",
      date: newest(weight?.date)
    });
  }

  if (waist && profile.heightCm > 0) {
    const value = waist.value / profile.heightCm;
    rows.push({
      id: "waistHeight",
      label: "Waist ÷ height",
      value,
      digits: 2,
      verdict: value < WAIST_HEIGHT_MAX ? `under ${WAIST_HEIGHT_MAX}` : `over ${WAIST_HEIGHT_MAX}`,
      tone: value < WAIST_HEIGHT_MAX ? "good" : "watch",
      date: waist.date
    });
  }

  if (waist && hips) {
    const value = waist.value / hips.value;
    const cutoff = profile.sex === "male" || profile.sex === "female" ? WAIST_HIP_MAX[profile.sex] : undefined;
    rows.push({
      id: "waistHip",
      label: "Waist ÷ hips",
      value,
      digits: 2,
      verdict:
        cutoff === undefined
          ? "set your sex on You for a cut-off"
          : value < cutoff
            ? `under ${cutoff}`
            : `over ${cutoff}`,
      tone: cutoff === undefined ? "neutral" : value < cutoff ? "good" : "watch",
      date: newest(waist.date, hips.date)
    });
  }

  if (shoulders && waist) {
    const value = shoulders.value / waist.value;
    rows.push({
      id: "shoulderWaist",
      label: "Shoulders ÷ waist",
      value,
      digits: 2,
      verdict: `${GOLDEN_RATIO} is the classic V-taper`,
      tone: "neutral",
      date: newest(shoulders.date, waist.date)
    });
  }

  return rows;
}

// -- left vs right -------------------------------------------------------------

export type SymmetryPair = "arm" | "thigh" | "calf";

const PAIRS: { pair: SymmetryPair; label: string; left: BodyMetric; right: BodyMetric }[] = [
  { pair: "arm", label: "Arms", left: "armL", right: "armR" },
  { pair: "thigh", label: "Thighs", left: "thighL", right: "thighR" },
  { pair: "calf", label: "Calves", left: "calfL", right: "calfR" }
];

/** Past this the gap is worth a look; past `STRONG` it is worth training for. */
export const SYMMETRY_FLAG_PERCENT = 5;
export const SYMMETRY_STRONG_PERCENT = 10;

export interface SymmetryRow {
  pair: SymmetryPair;
  label: string;
  left: number;
  right: number;
  /** |L − R| as a share of their mean. */
  diffPercent: number;
  /** "left" or "right" is the bigger side; undefined when equal. */
  bigger?: "left" | "right";
  flagged: boolean;
  strong: boolean;
  date: string;
}

/**
 * The model keeps left and right apart for exactly this reading (see
 * `BodyMetric`). Latest of each side, which may be different days — the dates
 * are on the row, so the card can say so.
 */
export function buildSymmetry(measurements: BodyMeasurement[]): SymmetryRow[] {
  return PAIRS.flatMap(({ pair, label, left, right }) => {
    const l = latestFor(measurements, left);
    const r = latestFor(measurements, right);
    if (!l || !r || l.value <= 0 || r.value <= 0) {
      return [];
    }
    const diffPercent = (Math.abs(l.value - r.value) / ((l.value + r.value) / 2)) * 100;
    return [
      {
        pair,
        label,
        left: l.value,
        right: r.value,
        diffPercent,
        bigger: l.value === r.value ? undefined : l.value > r.value ? "left" : "right",
        flagged: diffPercent >= SYMMETRY_FLAG_PERCENT,
        strong: diffPercent >= SYMMETRY_STRONG_PERCENT,
        date: newest(l.date, r.date)
      }
    ];
  });
}

// -- rate of weight change -------------------------------------------------------

/**
 * A safe pace, up or down, as a share of bodyweight per week. Below the band
 * is "steady"; above it, the scale is moving faster than muscle can follow —
 * on a cut that is lean mass going, on a bulk it is fat.
 */
export const SAFE_BAND = { low: 0.25, high: 0.5 };
/** Below this the scale is flat for any practical purpose. */
const FLAT_PERCENT = 0.1;
export const RATE_DAYS = 28;
const RATE_MIN_POINTS = 3;

export type RateBand = "flat" | "slow" | "safe" | "fast";

export interface WeightRate {
  kgPerWeek: number;
  percentPerWeek: number;
  direction: "up" | "down" | "flat";
  /** Judged on the size of the move, whichever way it goes. */
  band: RateBand;
  points: number;
  days: number;
}

/**
 * A straight line through the last four weeks of weigh-ins. Three readings is
 * the floor: two is a line through any noise at all.
 */
export function buildWeightRate(
  measurements: BodyMeasurement[],
  today: string,
  days = RATE_DAYS
): WeightRate | undefined {
  const recent = seriesFor(measurements, "weight").filter(
    (point) => daysBetween(point.date, today) >= 0 && daysBetween(point.date, today) < days
  );
  if (recent.length < RATE_MIN_POINTS) {
    return undefined;
  }
  const fit = leastSquares(
    recent.map((point) => daysBetween(recent[0].date, point.date)),
    recent.map((point) => point.value)
  );
  if (!fit) {
    return undefined;
  }
  const mean = recent.reduce((sum, point) => sum + point.value, 0) / recent.length;
  const kgPerWeek = fit.slope * 7;
  const percentPerWeek = (kgPerWeek / mean) * 100;
  const size = Math.abs(percentPerWeek);
  return {
    kgPerWeek,
    percentPerWeek,
    direction: size < FLAT_PERCENT ? "flat" : kgPerWeek > 0 ? "up" : "down",
    band: size < FLAT_PERCENT ? "flat" : size < SAFE_BAND.low ? "slow" : size <= SAFE_BAND.high ? "safe" : "fast",
    points: recent.length,
    days: daysBetween(recent[0].date, recent[recent.length - 1].date)
  };
}

// -- recomposition ------------------------------------------------------------------

/** The scale held within this while the waist moved. */
export const RECOMP_WEIGHT_PERCENT = 0.5;
/** A waist drop this big over the span is a change, not tape slack. */
export const RECOMP_WAIST_CM = 1;
export const RECOMP_MIN_WEEKS = 4;
/** How far back the pair of waist readings may reach. */
const RECOMP_LOOKBACK_DAYS = 84;
/** A weigh-in this close to a tape day stands in for it. */
const NEAR_DAYS = 7;

export interface Recomposition {
  weeks: number;
  weightChangePercent: number;
  waistChangeCm: number;
  /** Weight held and waist dropped: the classic recomposition signal. */
  detected: boolean;
  from: string;
  to: string;
}

function weighInNear(points: { date: string; value: number }[], date: string): number | undefined {
  const near = points
    .map((point) => ({ point, gap: Math.abs(daysBetween(point.date, date)) }))
    .filter(({ gap }) => gap <= NEAR_DAYS)
    .sort((a, b) => a.gap - b.gap)[0];
  return near?.point.value;
}

/**
 * Oldest and newest waist readings in the last twelve weeks, at least four
 * weeks apart, each with a weigh-in within a week of it. Two readings and two
 * weigh-ins — not a regression; with a monthly tape there are three points at
 * best, and a slope through three points is the overclaim `buildGirthCallout`
 * already refuses.
 */
export function buildRecomposition(
  measurements: BodyMeasurement[],
  today: string,
  minWeeks = RECOMP_MIN_WEEKS
): Recomposition | undefined {
  const waist = seriesFor(measurements, "waist").filter(
    (point) => daysBetween(point.date, today) >= 0 && daysBetween(point.date, today) <= RECOMP_LOOKBACK_DAYS
  );
  if (waist.length < 2) {
    return undefined;
  }
  const first = waist[0];
  const last = waist[waist.length - 1];
  const span = daysBetween(first.date, last.date);
  if (span < minWeeks * 7) {
    return undefined;
  }
  const weights = seriesFor(measurements, "weight");
  const before = weighInNear(weights, first.date);
  const after = weighInNear(weights, last.date);
  if (before === undefined || after === undefined || before <= 0) {
    return undefined;
  }
  const weightChangePercent = ((after - before) / before) * 100;
  const waistChangeCm = last.value - first.value;
  return {
    weeks: Math.floor(span / 7),
    weightChangePercent,
    waistChangeCm,
    detected: Math.abs(weightChangePercent) <= RECOMP_WEIGHT_PERCENT && waistChangeCm <= -RECOMP_WAIST_CM,
    from: first.date,
    to: last.date
  };
}

// -- US Navy body fat, lean mass, FFMI ---------------------------------------------

/** Hodgdon & Beckett (1984). About ±3–4 % against a DEXA scan. */
export const NAVY_ERROR_PERCENT = 3.5;

/** Outside this the tape was misread, not the body. */
const BODY_FAT_RANGE = { low: 2, high: 60 };

export function navyBodyFat(input: {
  sex: Sex | undefined;
  heightCm: number;
  waistCm: number;
  neckCm: number;
  hipsCm?: number;
}): number | undefined {
  const { sex, heightCm, waistCm, neckCm, hipsCm } = input;
  if (heightCm <= 0 || waistCm <= 0 || neckCm <= 0) {
    return undefined;
  }
  let value: number;
  if (sex === "male") {
    if (waistCm <= neckCm) {
      return undefined;
    }
    value = 495 / (1.0324 - 0.19077 * Math.log10(waistCm - neckCm) + 0.15456 * Math.log10(heightCm)) - 450;
  } else if (sex === "female") {
    if (hipsCm === undefined || hipsCm <= 0 || waistCm + hipsCm <= neckCm) {
      return undefined;
    }
    value = 495 / (1.29579 - 0.35004 * Math.log10(waistCm + hipsCm - neckCm) + 0.221 * Math.log10(heightCm)) - 450;
  } else {
    // The published coefficients exist for two groups. "other" and unset get
    // no number rather than one of the two picked for them.
    return undefined;
  }
  return Number.isFinite(value) && value >= BODY_FAT_RANGE.low && value <= BODY_FAT_RANGE.high ? value : undefined;
}

/** Kouri et al. (1995): few drug-free men exceed a normalised FFMI of 25. */
export const FFMI_NATURAL_CEILING = 25;

export interface Composition {
  bodyFatPercent: number;
  fatMassKg: number;
  leanMassKg: number;
  /** Lean mass ÷ height², like BMI for the part that is not fat. */
  ffmi: number;
  /** Adjusted to 1.80 m, so tall and short people read on one scale. */
  ffmiNormalized: number;
  date: string;
}

/** What the composition card still needs, in the user's terms. */
export function compositionNeeds(
  measurements: BodyMeasurement[],
  profile: Pick<ProfileInfo, "heightCm" | "sex" | "weightKg">
): string[] {
  const needs: string[] = [];
  if (profile.sex !== "male" && profile.sex !== "female") {
    needs.push(profile.sex === "other" ? "a male or female formula — none is published for other" : "your sex");
  }
  if (profile.heightCm <= 0) needs.push("your height");
  if (!latestFor(measurements, "weight") && !(profile.weightKg > 0)) needs.push("a weigh-in");
  if (!latestFor(measurements, "waist")) needs.push("a waist measurement");
  if (!latestFor(measurements, "neck")) needs.push("a neck measurement");
  if (profile.sex === "female" && !latestFor(measurements, "hips")) needs.push("a hips measurement");
  return needs;
}

export function buildComposition(
  measurements: BodyMeasurement[],
  profile: Pick<ProfileInfo, "heightCm" | "sex" | "weightKg">
): Composition | undefined {
  const weight = latestFor(measurements, "weight");
  const waist = latestFor(measurements, "waist");
  const neck = latestFor(measurements, "neck");
  const hips = latestFor(measurements, "hips");
  const weightKg = weight?.value ?? profile.weightKg;
  if (!waist || !neck || !(weightKg > 0)) {
    return undefined;
  }
  const bodyFatPercent = navyBodyFat({
    sex: profile.sex,
    heightCm: profile.heightCm,
    waistCm: waist.value,
    neckCm: neck.value,
    hipsCm: hips?.value
  });
  if (bodyFatPercent === undefined) {
    return undefined;
  }
  const metres = profile.heightCm / 100;
  const fatMassKg = weightKg * (bodyFatPercent / 100);
  const leanMassKg = weightKg - fatMassKg;
  const ffmi = leanMassKg / (metres * metres);
  return {
    bodyFatPercent,
    fatMassKg,
    leanMassKg,
    ffmi,
    ffmiNormalized: ffmi + 6.1 * (1.8 - metres),
    date: newest(weight?.date, waist.date, neck.date, profile.sex === "female" ? hips?.date : undefined)
  };
}

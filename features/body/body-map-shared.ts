import type * as React from "react";

import type { MuscleId } from "@/lib/types";

export interface BodyMuscleHighlight {
  /** A current `MuscleId`, or one of the legacy ten off stored history. */
  muscleId?: MuscleId | string;
  muscleName?: string;
  intensity?: number;
}

export interface BodyMapProps extends React.SVGProps<SVGSVGElement> {
  highlights?: BodyMuscleHighlight[];
  selectedMuscleId?: MuscleId;
  onSelectMuscle?: (muscleId?: string) => void;
}

export const MUSCLE_IDS: MuscleId[] = [
  "pecUpper", "pecLower", "serratus",
  "deltFront", "deltSide", "deltRear",
  "traps", "rhomboids", "lats", "erectors",
  "biceps", "brachialis", "tricepsLong", "tricepsLateral",
  "forearmFlexors", "forearmExtensors",
  "abs", "obliques",
  "gluteMax", "gluteMed",
  "rectusFemoris", "vastusLateralis", "vastusMedialis", "sartorius", "adductors",
  "hamsOuter", "hamsInner",
  "gastrocnemius", "soleus", "tibialis"
];

/**
 * The ten coarse ids this app used before the anatomical split. Logged workouts,
 * saved session templates and the stored `selectedMuscleId` still carry them, so
 * they resolve forward to the heads they became — history keeps rendering
 * without a migration.
 */
const LEGACY_ALIASES: Record<string, MuscleId[]> = {
  chest: ["pecUpper", "pecLower"],
  back: ["lats", "traps", "rhomboids", "erectors"],
  shoulders: ["deltFront", "deltSide", "deltRear"],
  triceps: ["tricepsLong", "tricepsLateral"],
  quads: ["rectusFemoris", "vastusLateralis", "vastusMedialis"],
  hamstrings: ["hamsOuter", "hamsInner"],
  glutes: ["gluteMax", "gluteMed"],
  calves: ["gastrocnemius", "soleus"],
  core: ["abs", "obliques"],
  forearms: ["forearmFlexors", "forearmExtensors"]
};

const BY_NAME: Record<string, MuscleId[]> = {
  ...Object.fromEntries(MUSCLE_IDS.map((id) => [id.toLowerCase(), [id]])),
  ...Object.fromEntries(
    Object.entries(LEGACY_ALIASES).map(([name, ids]) => [name.toLowerCase(), ids])
  )
};


/**
 * Every muscle a name refers to. One for a current id, several for a legacy one
 * — `"shoulders"` off an old log lights all three delt heads.
 */
export function resolveMuscleIds(value?: string): MuscleId[] {
  if (!value) {
    return [];
  }

  return BY_NAME[value.trim().toLowerCase()] ?? [];
}

export function clampIntensity(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, value));
}

export function getIntensity(highlights: BodyMuscleHighlight[], muscleId: MuscleId) {
  return highlights.reduce((highest, highlight) => {
    // The id on a stored highlight can itself be legacy, so expand both sides.
    const resolved = resolveMuscleIds(highlight.muscleId ?? highlight.muscleName);

    if (!resolved.includes(muscleId)) {
      return highest;
    }

    return Math.max(highest, clampIntensity(highlight.intensity));
  }, 0);
}

/** Anything the day did not work at all — a body part at rest reads neutral. */
export const MUSCLE_IDLE_COLOR = "#b4aea3";

/**
 * A one-hue sequential ramp, light to dark, over the app's warm primary. Steps
 * rather than a gradient: five bands you can actually compare across the body
 * beat a smooth blend where "a bit more red" is unreadable.
 *
 * The bands are narrow at the bottom because engagement data is: a session's
 * primary lift lands near 100, but its supporting muscles sit in the teens, and
 * even splitting those apart is the point of the map.
 *
 * Validated against the map's `#F7ECD9` panel — monotone lightness, 9° of hue
 * spread, every gap visible, pale end clearing the surface at 2.01:1.
 */
export const MUSCLE_HEAT_STEPS = [
  { upTo: 15, color: "#e8956b" },
  { upTo: 30, color: "#de6c3c" },
  { upTo: 50, color: "#c94d20" },
  { upTo: 75, color: "#9e3a18" },
  { upTo: 100, color: "#722b12" }
] as const;

export function getHeatColor(intensity: number) {
  const value = clampIntensity(intensity);

  if (value === 0) {
    return MUSCLE_IDLE_COLOR;
  }

  return (MUSCLE_HEAT_STEPS.find((step) => value <= step.upTo) ?? MUSCLE_HEAT_STEPS[4]).color;
}

/**
 * One CSS custom property per muscle, read by the `[data-muscle]` rules in
 * globals.css. Painting from the `<svg>` root beats threading a fill onto each
 * of the ~120 paths.
 */
/** The halo on the muscle you are pointing at. Only ever one at a time. */
const GLOW = "drop-shadow(0 0 3px #fff) drop-shadow(0 0 7px currentColor)";

export function muscleHeatVars(highlights: BodyMuscleHighlight[], glowMuscleId?: MuscleId) {
  const lit = glowMuscleId ? resolveMuscleIds(glowMuscleId) : [];

  return Object.fromEntries([
    ["--muscle-idle", MUSCLE_IDLE_COLOR],
    ...MUSCLE_IDS.map((muscleId) => [
      `--m-${muscleId}`,
      getHeatColor(getIntensity(highlights, muscleId))
    ]),
    ...lit.map((muscleId) => [`--g-${muscleId}`, GLOW])
  ]) as React.CSSProperties;
}

/**
 * One delegated handler for the whole map. A tap that lands on the head, a
 * hand or the background is ignored rather than clearing the selection.
 */
export function selectFromTap(
  event: React.MouseEvent<SVGSVGElement>,
  onSelectMuscle: (muscleId?: string) => void
) {
  const muscleId = (event.target as SVGElement).getAttribute?.("data-muscle");

  if (muscleId) {
    onSelectMuscle(muscleId);
  }
}

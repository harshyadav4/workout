export type MuscleId =
  // chest
  | "pecUpper"
  | "pecLower"
  | "serratus"
  // shoulders
  | "deltFront"
  | "deltSide"
  | "deltRear"
  // back
  | "traps"
  | "rhomboids"
  | "lats"
  | "erectors"
  // arms
  | "biceps"
  | "brachialis"
  | "tricepsLong"
  | "tricepsLateral"
  | "forearmFlexors"
  | "forearmExtensors"
  // core
  | "abs"
  | "obliques"
  // legs
  | "gluteMax"
  | "gluteMed"
  | "rectusFemoris"
  | "vastusLateralis"
  | "vastusMedialis"
  | "sartorius"
  | "adductors"
  | "hamsOuter"
  | "hamsInner"
  | "gastrocnemius"
  | "soleus"
  | "tibialis";

/** The six groups the Build screen collapses the muscle list into. */
export type MuscleGroup =
  | "chest"
  | "shoulders"
  | "back"
  | "arms"
  | "core"
  | "legs";

export interface Muscle {
  id: MuscleId;
  name: string;
  /** The anatomical name, shown in the muscle reference popup. */
  scientific: string;
  group: MuscleGroup;
  description: string;
  intensityWeight: number;
}

export interface WorkoutMuscleTarget {
  muscleId: MuscleId;
  engagement: number;
}

export interface WorkoutTemplate {
  id: string;
  /** Source exercise id in public/exercises.json, when it came from the library. */
  dbId?: string;
  name: string;
  category: string;
  muscles: WorkoutMuscleTarget[];
  isPreset: boolean;
  searchTerms?: string[];
  defaultSets?: ExerciseSetTemplate[];
  equipment?: string;
}

/**
 * How an exercise is measured. Absent means `reps` — every record written
 * before duration existed stays valid, so there is no migration.
 *
 * A `time` set stores `reps: 0` on purpose. Volume is `reps × weight`, so a
 * plank scores zero volume, zero `totalReps` and zero `peakWeight` through
 * every existing sum without a single guard downstream.
 */
export type ExerciseMetric = "reps" | "time";

export interface PlannedSet {
  id: string;
  /** Always present. Zero for a `time` set — see ExerciseMetric. */
  reps: number;
  weight: number;
  /** Seconds held or run, when the parent exercise is `metric: "time"`. */
  durationSeconds?: number;
  type: "normal" | "drop";
  completed?: boolean;
  previousReps?: number;
  previousWeight?: number;
}

export interface PlannedExercise {
  id: string;
  workoutId: string;
  templateName: string;
  sets: PlannedSet[];
  restSeconds?: number;
  targetNotes?: string;
  metric?: ExerciseMetric;
}

export interface DailyPlan {
  dayIndex: number;
  exercises: PlannedExercise[];
}

export interface WorkoutLog {
  id?: string;
  date: string;
  sessionId?: string;
  workoutId: string;
  name: string;
  totalVolume: number;
  totalSets?: number;
  totalReps?: number;
  peakWeight?: number;
  muscles: WorkoutMuscleTarget[];
}

export interface ExerciseSetTemplate {
  sets: number;
  reps: number;
  weight: number;
  restSeconds: number;
}

export interface SessionTemplateExercise {
  id: string;
  workoutId: string;
  name: string;
  muscles: WorkoutMuscleTarget[];
  sets: number;
  reps: number; // zero when metric is "time"
  weight: number; // base weight; per-set overrides live in `weights`
  weights?: number[]; // optional per-set weights (index = set)
  restSeconds: number;
  notes?: string;
  metric?: ExerciseMetric;
  durationSeconds?: number; // seconds per set, when metric is "time"
}

export interface SessionTemplate {
  id: string;
  name: string;
  workoutIds: string[];
  exercises: SessionTemplateExercise[];
  summary: {
    totalSets: number;
    totalReps: number;
    totalWeight: number;
  };
}

export type ScheduleRepeatMode = "once" | "weekly" | "every_n_days";

export interface ScheduleRule {
  repeatMode: ScheduleRepeatMode;
  weekdays?: number[];
  intervalDays?: number;
  specificDates?: string[];
  restWeekdays?: number[];
  restDates?: string[];
  restEveryNDays?: number;
}

export interface ScheduledSession {
  id: string;
  date: string;
  dayIndex: number;
  sessionTemplateId?: string;
  sessionName: string;
  exercises: PlannedExercise[];
  type: "workout" | "rest";
  status: "planned" | "active" | "completed";
  source: "manual" | "repeat";
}

export type ScheduleMode = "weekly" | "rotation";

export interface ScheduleConfig {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  mode: ScheduleMode;
  weekly: Record<number, string>; // weekday 0-6 -> sessionTemplateId
  rotationOrder: string[]; // ordered sessionTemplateIds
  restWeekdays: number[]; // 0-6
}

/**
 * A tape site, or the scale. Left and right stay separate on purpose: arm and
 * leg asymmetry is real and is one of the few things a tape catches that a
 * mirror doesn't. Averaging at the model level throws it away permanently —
 * a chart can still average for display.
 */
export type BodyMetric =
  | "weight"
  | "shoulders"
  | "chest"
  | "waist"
  | "hips"
  | "armL"
  | "armR"
  | "thighL"
  | "thighR"
  | "calfL"
  | "calfR";

/**
 * Deliberately not part of WorkoutLog. Bodyweight is not training volume and
 * must never reach the volume, strength or muscle aggregations.
 */
export interface BodyMeasurement {
  id: string;
  date: string; // YYYY-MM-DD
  metric: BodyMetric;
  /** kg for "weight", cm for every circumference. */
  value: number;
}

/**
 * How often you intend to record. Weight and tape are separate settings because
 * the real-world rhythms differ — people weigh weekly and measure monthly.
 */
export type MeasurementCadence = "off" | "weekly" | "biweekly" | "monthly";

export interface ProfileInfo {
  name: string;
  email: string;
  heightCm: number;
  /** Derived from the newest "weight" measurement — never set on its own. */
  weightKg: number;
  weightCadence?: MeasurementCadence;
  measurementCadence?: MeasurementCadence;
}

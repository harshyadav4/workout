/** Which arithmetic decides the next weight. See `lib/progression`. */
export type ProgressionRule = "off" | "linear" | "double" | "time";

export interface ProgressionSettings {
  rule: ProgressionRule;
  /** kg added when the rule advances load. The calibration knob — plates differ. */
  incrementKg?: number;
  /** Seconds added when `time` advances the hold. The same knob, other axis. */
  incrementSeconds?: number;
  /** Top of the rep range for `double`. Ignored by `linear`. */
  repMax?: number;
}

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
  /**
   * A demo GIF stored in Supabase Storage, for an exercise the library lacks
   * (see app/api/media/route.ts). Library exercises use their bundled media.
   */
  mediaPath?: string;
}

/**
 * How an exercise is measured. Absent means `reps` — every record written
 * before duration existed stays valid, so there is no migration.
 *
 * A `time` set stores `reps: 0` on purpose. Volume is `reps × weight`, so a
 * plank scores zero volume, zero `totalReps` and zero `peakWeight` through
 * every existing sum without a single guard downstream.
 */
export type ExerciseMetric = "reps" | "time" | "distance";

export interface PlannedSet {
  id: string;
  /** Always present. Zero for a `time` set — see ExerciseMetric. */
  reps: number;
  weight: number;
  /** Seconds held or run, when the parent exercise is `metric: "time"` or `"distance"`. */
  durationSeconds?: number;
  /**
   * Kilometres covered, when the parent exercise is `metric: "distance"`.
   * Always km — miles are a view (lib/cardio). Reps are 0 on such a set, for
   * the same reason as a hold: volume stays zero with no guard downstream.
   */
  distanceKm?: number;
  /**
   * A warm-up is not working volume. It must never reach the weekly set count
   * the 10–20 band compares against, or the volume charts.
   *
   * This replaced `"drop"`, which `plannedExercisesFromTemplate` auto-assigned to
   * the last set of any exercise with more than three and which no UI ever read.
   */
  type: "normal" | "warmup";
  completed?: boolean;
  /** When Log set was first tapped for it (ISO). Kept on later corrections. */
  completedAt?: string;
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
  /**
   * Why the weight in the field is that number, from `lib/progression`.
   * Separate from `targetNotes`, which is the user's own text — a rule's
   * explanation is not a note the user wrote and must not overwrite one.
   */
  progressionNote?: string;
  /** Total reps across both sides, when the parent exercise is `perSide`. */
  perSide?: boolean;
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

/**
 * One performed set. `WorkoutLog` above stays the per-exercise rollup and every
 * aggregation still reads it; this is the grain underneath, and the only thing
 * that can answer "what did I actually lift last time".
 */
export interface SetLog {
  id: string;
  /** The `WorkoutLog` this set rolls up into. Cascades on delete. */
  logId: string;
  workoutId: string;
  date: string;
  /** Position within the exercise, 0-based. */
  setIndex: number;
  reps: number;
  weight: number;
  /** How long the set was held. Absent on a rep set, which lasted no time in particular. */
  durationSeconds?: number;
  /** Kilometres covered, on a distance set. Absent on everything else. */
  distanceKm?: number;
  completedAt?: string;
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
  durationSeconds?: number; // seconds per set, when metric is "time" or "distance"
  distanceKm?: number; // km per set, when metric is "distance"
  /** Overrides the session's rule for this lift alone. */
  progression?: ProgressionSettings;
  /**
   * Lunges, single-arm rows. The logged number is the total across both sides,
   * so the model stays one number and every existing sum keeps working — only
   * the display and the target stepping change. See `lib/per-side`.
   */
  perSide?: boolean;
}

export interface SessionTemplate {
  id: string;
  name: string;
  workoutIds: string[];
  exercises: SessionTemplateExercise[];
  /** The default rule for every exercise in the session. Overridable per lift. */
  progression?: ProgressionSettings;
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
  /** When Start was tapped (ISO). Absent on sessions from before timing existed. */
  startedAt?: string;
  /** When it really ended (lib/session-time finishTime) — not a Finish tapped hours late. */
  finishedAt?: string;
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
  /**
   * The bodyweight being aimed at, drawn as a line across the weigh-in chart.
   * Unlike `weightKg` — which is derived from the newest "weight" measurement
   * and is never set on its own — this is typed in by hand: a setting, not a
   * reading. Absent means no goal, which is why it is optional rather than 0.
   */
  goalWeightKg?: number;
  weightCadence?: MeasurementCadence;
  measurementCadence?: MeasurementCadence;
  /**
   * When "delete all my data" was asked for (ISO). Nothing is deleted until a
   * week after it — see lib/deletion.ts — and clearing it is the restore.
   */
  deletionRequestedAt?: string;
}

/**
 * One rung of a skill ladder: an exercise and the bar to clear on it — so many
 * sets of so many reps, or of a hold this long.
 */
export interface SkillLevel {
  /** The exercise, as logged. Library exercises are `db-<dataset id>`. */
  workoutId: string;
  name: string;
  metric: "reps" | "time";
  sets: number;
  /** Reps per set, or seconds per set for `time`. */
  target: number;
}

/**
 * A skill the user is working toward — Pull-up, Handstand, or their own. The
 * levels are copied onto the goal, so it never changes under you when the
 * ready-made ladders are tuned later. Progress is never stored: it is read off
 * the logged sets every time (lib/skills), so it cannot drift from the truth.
 */
export interface SkillGoal {
  id: string;
  name: string;
  /** The ready-made skill this started from, if any. */
  templateKey?: string;
  levels: SkillLevel[];
  createdAt: string;
}


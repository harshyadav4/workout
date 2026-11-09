import type { PlannedExercise, WorkoutSection } from "@/lib/types";

export const WORKOUT_SECTIONS: { id: WorkoutSection; label: string }[] = [
  { id: "warmup", label: "Warm-up" },
  { id: "skill", label: "Skill practice" },
  { id: "main", label: "Main work" },
  { id: "stretching", label: "Stretching" }
];

export function sectionLabel(section?: WorkoutSection) {
  return WORKOUT_SECTIONS.find((item) => item.id === section)?.label ?? "Main work";
}

/** Stable within each section, including older workouts without a section. */
export function orderExercises<T extends { section?: WorkoutSection }>(exercises: T[]): T[] {
  const rank = (section?: WorkoutSection) => WORKOUT_SECTIONS.findIndex((item) => item.id === (section ?? "main"));
  return [...exercises].sort((a, b) => rank(a.section) - rank(b.section));
}

export function isExerciseIncluded(exercise: Pick<PlannedExercise, "optional" | "included">) {
  return !exercise.optional || exercise.included === true;
}

/** Preparation and stretching stay in session history, outside strength stats. */
export function isTrainingExercise(exercise: { section?: WorkoutSection }) {
  return exercise.section !== "warmup" && exercise.section !== "stretching";
}

export function pendingExerciseSets(exercise: PlannedExercise) {
  return isExerciseIncluded(exercise) ? exercise.sets.filter((set) => !set.completed) : [];
}

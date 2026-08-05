import { muscles } from "@/lib/seed-data";
import type {
  DailyPlan,
  MuscleId,
  PlannedExercise,
  PlannedSet,
  ScheduledSession,
  SessionTemplate,
  SessionTemplateExercise,
  WorkoutLog,
  WorkoutTemplate
} from "@/lib/types";

/** The set Home opens by default: the first one not yet logged, in session order. */
export function firstPendingSetId(session?: ScheduledSession) {
  for (const exercise of session?.exercises ?? []) {
    const pending = exercise.sets.find((setItem) => !setItem.completed);
    if (pending) {
      return pending.id;
    }
  }
  return undefined;
}

/**
 * Drop one set from one exercise. The last set of an exercise is never removed:
 * a zero-set exercise reads as "finished" everywhere counts are compared, so an
 * exercise you no longer want goes away as an exercise, not by emptying it.
 */
export function removeSetFromExercises(
  exercises: PlannedExercise[],
  exerciseId: string,
  setId: string
): PlannedExercise[] {
  return exercises.map((exercise) =>
    exercise.id === exerciseId && exercise.sets.length > 1
      ? { ...exercise, sets: exercise.sets.filter((setItem) => setItem.id !== setId) }
      : exercise
  );
}

/**
 * Live counts for the day header. `done`/`volume` are what you have actually
 * logged; `logged*` is what Finish would record, and follows the same
 * nothing-ticked-means-all rule as buildLogFromSession.
 */
export function sessionTotals(session?: ScheduledSession) {
  const sets = (session?.exercises ?? []).flatMap((exercise) => exercise.sets);
  const completed = sets.filter((setItem) => setItem.completed);
  const counted = completed.length > 0 ? completed : sets;
  const volumeOf = (items: PlannedSet[]) =>
    items.reduce((sum, setItem) => sum + setItem.reps * setItem.weight, 0);

  return {
    done: completed.length,
    total: sets.length,
    volume: volumeOf(completed),
    loggedSets: counted.length,
    loggedVolume: volumeOf(counted)
  };
}

/**
 * Turn a finished session into logs — one per exercise.
 *
 * Home marks each set `completed` as it is logged, so a session you cut short
 * must not report the sets you never did. The rule: if anything in the session
 * was marked, only marked sets count and untouched exercises drop out. If
 * nothing was marked at all, the whole plan counts — that is a session finished
 * without tapping through set by set, and it is still work done.
 */
export function buildLogFromSession(
  session: ScheduledSession,
  templates: WorkoutTemplate[]
): WorkoutLog[] {
  const trackedSets = session.exercises.some((exercise) =>
    exercise.sets.some((setItem) => setItem.completed)
  );

  return session.exercises
    .map((exercise) => ({
      exercise,
      sets: trackedSets ? exercise.sets.filter((setItem) => setItem.completed) : exercise.sets
    }))
    .filter((item) => item.sets.length > 0)
    .map(({ exercise, sets }) => ({
      id: crypto.randomUUID(),
      date: session.date,
      sessionId: session.sessionTemplateId ?? session.id,
      workoutId: exercise.workoutId,
      name: exercise.templateName,
      totalVolume: sets.reduce((sum, setItem) => sum + setItem.reps * setItem.weight, 0),
      totalSets: sets.length,
      totalReps: sets.reduce((sum, setItem) => sum + setItem.reps, 0),
      peakWeight: sets.reduce((peak, setItem) => Math.max(peak, setItem.weight), 0),
      muscles: templates.find((item) => item.id === exercise.workoutId)?.muscles ?? []
    }));
}

export function getPlanByDay(planner: DailyPlan[], dayIndex: number) {
  return planner.find((item) => item.dayIndex === dayIndex)?.exercises ?? [];
}

export function dayLabel(dayIndex: number) {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dayIndex];
}

export function calculateExerciseMetrics(exercise: PlannedExercise) {
  const totalSets = exercise.sets.length;
  const totalReps = exercise.sets.reduce((sum, setItem) => sum + setItem.reps, 0);
  const totalWeight = exercise.sets.reduce((sum, setItem) => sum + setItem.weight, 0);
  const volume = exercise.sets.reduce((sum, setItem) => sum + setItem.reps * setItem.weight, 0);

  return {
    totalSets,
    totalReps,
    totalWeight,
    volume
  };
}

export function summarizeDay(
  dayIndex: number,
  planner: DailyPlan[],
  templates: WorkoutTemplate[]
) {
  const exercises = getPlanByDay(planner, dayIndex);
  const totalVolume = exercises.reduce(
    (sum, exercise) => sum + calculateExerciseMetrics(exercise).volume,
    0
  );
  const totalSets = exercises.reduce(
    (sum, exercise) => sum + calculateExerciseMetrics(exercise).totalSets,
    0
  );
  const totalReps = exercises.reduce(
    (sum, exercise) => sum + calculateExerciseMetrics(exercise).totalReps,
    0
  );
  const muscleTotals = new Map<string, number>();

  exercises.forEach((exercise) => {
    const template = templates.find((item) => item.id === exercise.workoutId);
    template?.muscles.forEach((muscle) => {
      muscleTotals.set(
        muscle.muscleId,
        (muscleTotals.get(muscle.muscleId) ?? 0) + muscle.engagement
      );
    });
  });

  return {
    exercises,
    totalVolume,
    totalSets,
    totalReps,
    targetMuscles: [...muscleTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([muscleId, value]) => ({
        muscleId,
        name: muscles.find((item) => item.id === muscleId)?.name ?? muscleId,
        value
      }))
  };
}

export function buildMuscleHeat(logs: WorkoutLog[]) {
  const intensity = new Map<string, number>();

  logs.forEach((log) => {
    log.muscles.forEach((muscle) => {
      intensity.set(
        muscle.muscleId,
        (intensity.get(muscle.muscleId) ?? 0) + muscle.engagement
      );
    });
  });

  return muscles.map((muscle) => ({
    muscleId: muscle.id,
    name: muscle.name,
    intensity: intensity.get(muscle.id) ?? 0
  }));
}

/**
 * Muscle heat as body-map intensities.
 *
 * `buildMuscleHeat` returns a running sum of engagement, so over any real range
 * every trained muscle clears 100 and a 0-100 map goes flat. Scale against the
 * hardest-hit muscle instead — the question a range answers is which muscle got
 * the most of it, not whether any of them crossed some absolute bar.
 */
export function normalizeMuscleHeat(heat: ReturnType<typeof buildMuscleHeat>) {
  const peak = Math.max(...heat.map((item) => item.intensity), 0);

  return heat.map((item) => ({
    muscleId: item.muscleId,
    muscleName: item.name,
    intensity: peak > 0 ? (item.intensity / peak) * 100 : 0
  }));
}

export function weightForSet(
  exercise: Pick<SessionTemplateExercise, "weights" | "weight">,
  index: number
): number {
  return exercise.weights?.[index] ?? exercise.weight;
}

export function plannedExercisesFromTemplate(template: SessionTemplate): PlannedExercise[] {
  return template.exercises.map((exercise) => {
    const isTime = exercise.metric === "time";
    return {
      id: crypto.randomUUID(),
      workoutId: exercise.workoutId,
      templateName: exercise.name,
      restSeconds: exercise.restSeconds,
      targetNotes: exercise.notes,
      metric: exercise.metric,
      sets: Array.from({ length: exercise.sets }).map((_, index) => {
        const weight = weightForSet(exercise, index);
        return {
          id: crypto.randomUUID(),
          // Zero reps for a held set — that is what keeps volume, totalReps and
          // peakWeight correct downstream without a guard at every consumer.
          reps: isTime ? 0 : exercise.reps,
          weight,
          durationSeconds: isTime ? exercise.durationSeconds ?? 0 : undefined,
          previousReps: isTime ? 0 : exercise.reps,
          previousWeight: weight,
          // A drop set is a load concept; it means nothing on a hold.
          type:
            !isTime && index === exercise.sets - 1 && exercise.sets > 3
              ? ("drop" as const)
              : ("normal" as const)
        };
      })
    };
  });
}

export function buildSessionSummary(template: SessionTemplate) {
  return template.exercises.reduce(
    (summary, exercise) => ({
      totalSets: summary.totalSets + exercise.sets,
      totalReps: summary.totalReps + exercise.sets * exercise.reps,
      totalWeight:
        summary.totalWeight +
        Array.from({ length: exercise.sets }, (_, index) => weightForSet(exercise, index)).reduce(
          (sum, value) => sum + value,
          0
        )
    }),
    { totalSets: 0, totalReps: 0, totalWeight: 0 }
  );
}

export function buildMuscleHighlightsFromWorkoutIds(
  workoutIds: string[],
  templates: WorkoutTemplate[]
) {
  const totals = new Map<MuscleId, number>();

  workoutIds.forEach((workoutId) => {
    const template = templates.find((item) => item.id === workoutId);
    template?.muscles.forEach((muscle) => {
      totals.set(
        muscle.muscleId,
        Math.min(100, (totals.get(muscle.muscleId) ?? 0) + muscle.engagement)
      );
    });
  });

  return muscles.map((muscle) => ({
    muscleId: muscle.id,
    muscleName: muscle.name,
    intensity: totals.get(muscle.id) ?? 0
  }));
}

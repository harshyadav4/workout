import { resolveMuscleIds } from "@/features/body/body-map-shared";
import { isDistanceExercise } from "@/lib/cardio";
import { muscles } from "@/lib/seed-data";
import { evenTarget } from "@/lib/per-side";
import { nextTarget } from "@/lib/progression";
import type {
  ExerciseSetTemplate,
  MuscleId,
  PlannedExercise,
  PlannedSet,
  ScheduledSession,
  SessionTemplate,
  SessionTemplateExercise,
  SetLog,
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
 * The set to open after `afterSetId` was logged: the next unlogged one *after*
 * it, wrapping to anything left behind once the session runs out.
 *
 * Home used to clear its pick and fall back to `firstPendingSetId`, which scans
 * from the top. Skip one set — a machine was taken, an exercise moved to the end
 * — and every following log snapped the open panel back up to that gap, so each
 * remaining set of the session cost a tap on its chip before the tap that logged
 * it. Going forward from where you are is the same one tap all session.
 *
 * The logged set is excluded from both halves of the scan, because the store has
 * not applied `completed` yet at the moment this is called.
 */
export function nextPendingSetId(
  session: ScheduledSession | undefined,
  afterSetId: string
): string | undefined {
  const sets = (session?.exercises ?? []).flatMap((exercise) => exercise.sets);
  const index = sets.findIndex((setItem) => setItem.id === afterSetId);

  if (index < 0) {
    return firstPendingSetId(session);
  }

  // Slicing around `index` is what drops the just-logged set from the wrap.
  return [...sets.slice(index + 1), ...sets.slice(0, index)].find(
    (setItem) => !setItem.completed
  )?.id;
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
 * Drop one exercise from today's session — the plan it came from is not
 * touched, so it is back next time. Logged sets go with it: removing it means
 * it did not happen today. The last exercise stays, so the session never
 * empties into a card with nowhere to add work back.
 */
export function removeExerciseFromExercises(
  exercises: PlannedExercise[],
  exerciseId: string
): PlannedExercise[] {
  return exercises.length > 1 ? exercises.filter((exercise) => exercise.id !== exerciseId) : exercises;
}

/**
 * The set to open when an exercise is picked by name: its first unlogged one,
 * or its first set when everything is logged — tapping a finished exercise is
 * a request to correct it, not a no-op.
 */
export function exerciseEntrySetId(exercise: PlannedExercise): string | undefined {
  return (exercise.sets.find((setItem) => !setItem.completed) ?? exercise.sets[0])?.id;
}

/**
 * Re-plan every session not started yet — today's and the days ahead — from
 * what has been logged since it was scheduled. A session's numbers were fixed
 * the day it was put on the calendar, so a lift logged at 30 kg × 5 this
 * morning still showed next week at the 40 kg it was created with.
 *
 * Only sessions with nothing in them yet are touched: started, finished,
 * rest, or a session with a set ticked off are left exactly as they are.
 * Ids are kept where the shape still matches, and a session whose numbers did
 * not move is returned as the same object — sync uploads changed rows only, so
 * opening the app does not re-send the whole calendar.
 */
export function refreshUpcomingSessions(
  sessions: ScheduledSession[],
  templates: SessionTemplate[],
  history: PerformanceHistory,
  today: string
): ScheduledSession[] {
  let changed = false;

  const next = sessions.map((session) => {
    const template = templates.find((item) => item.id === session.sessionTemplateId);
    const untouched = session.exercises.every((exercise) => exercise.sets.every((setItem) => !setItem.completed));
    if (
      !template ||
      session.type !== "workout" ||
      session.status !== "planned" ||
      session.date < today ||
      !untouched
    ) {
      return session;
    }

    const fresh = plannedExercisesFromTemplate(template, history).map((exercise, index) => {
      const before = session.exercises[index];
      if (!before || before.workoutId !== exercise.workoutId) {
        return exercise;
      }
      return {
        ...exercise,
        id: before.id,
        sets: exercise.sets.map((setItem, setIndex) => ({ ...setItem, id: before.sets[setIndex]?.id ?? setItem.id }))
      };
    });

    if (JSON.stringify(fresh) === JSON.stringify(session.exercises)) {
      return session;
    }
    changed = true;
    return { ...session, exercises: fresh };
  });

  return changed ? next : sessions;
}

/**
 * Live counts for the day header. `done`/`volume` are what you have actually
 * logged; `logged*` is what Finish would record — the same completed-only
 * sets as buildLogFromSession, never the plan.
 */
export function sessionTotals(
  session?: ScheduledSession,
  // Optional so the callers that only want counts stay one argument. Passing
  // them is what makes the live tally agree with what Finish actually records.
  templates: WorkoutTemplate[] = [],
  bodyweightKg = 0
) {
  const pairs = (session?.exercises ?? []).flatMap((exercise) =>
    exercise.sets.map((setItem) => ({
      setItem,
      bodyweight: usesBodyweight(templates.find((item) => item.id === exercise.workoutId))
    }))
  );
  // Warm-ups are shown in the ledger and counted nowhere, exactly as at Finish.
  const working = pairs.filter(({ setItem }) => setItem.type !== "warmup");
  const completed = working.filter(({ setItem }) => setItem.completed);
  const volumeOf = (items: typeof pairs) =>
    items.reduce(
      (sum, { setItem, bodyweight }) => sum + setVolume(setItem, { bodyweightKg, bodyweight }),
      0
    );

  return {
    done: completed.length,
    total: working.length,
    volume: volumeOf(completed),
    /** Every working set at the weight written on it — what the day asks for. */
    planned: volumeOf(working),
    loggedSets: completed.length,
    loggedVolume: volumeOf(completed)
  };
}

/**
 * Whether the lifter's own mass is the load.
 *
 * Derived from `equipment` rather than stored: the preset library and
 * `exercises.json` both already carry a "body weight" class, and a second flag
 * that has to be kept in step with it is a flag that eventually disagrees.
 */
const BODYWEIGHT_EQUIPMENT = /body\s*weight/i;

export function usesBodyweight(template?: Pick<WorkoutTemplate, "equipment">): boolean {
  return BODYWEIGHT_EQUIPMENT.test(template?.equipment ?? "");
}

/**
 * What one set actually moved.
 *
 * A pull-up entered as 0 kg scored zero — against every volume chart, every
 * muscle attribution and the streak card's tonnage — so the people training
 * hardest on calisthenics registered as having done nothing.
 *
 * Only volume is adjusted. `peakWeight` stays as entered, because `set_logs`
 * records the weight you typed and the two must not disagree about what the
 * number on the screen meant.
 */
export function setVolume(
  setItem: Pick<PlannedSet, "reps" | "weight">,
  options: { bodyweightKg?: number; bodyweight?: boolean } = {}
): number {
  const { bodyweightKg = 0, bodyweight = false } = options;
  // Falls back to the old formula when the profile has no weight — an invented
  // body mass would be worse than a low number.
  const load = bodyweight && bodyweightKg > 0 ? bodyweightKg + setItem.weight : setItem.weight;

  return setItem.reps * load;
}

/**
 * Turn a finished session into logs — one per exercise.
 *
 * Home marks each set `completed` as it is logged via its own Log set button.
 * Finish must not credit sets that button was never tapped for — only
 * completed sets count, and an exercise with none of them drops out entirely
 * rather than logging a zero.
 */
export function buildLogFromSession(
  session: ScheduledSession,
  templates: WorkoutTemplate[],
  bodyweightKg = 0
): { logs: WorkoutLog[]; setLogs: SetLog[] } {
  // Both come out of one pass because the rollup's id is minted here and is
  // what every set row points at. Deriving the sets separately would have to
  // re-correlate them by `workoutId`, which is not unique within a session.
  const performed = session.exercises
    .map((exercise) => ({
      exercise,
      // Completed *and* working. A warm-up happened, but it is scaffolding for
      // the set that counts, not a record of work — counting it inflates the
      // weekly set totals the whole per-muscle comparison rests on.
      sets: exercise.sets.filter((setItem) => setItem.completed && setItem.type !== "warmup")
    }))
    .filter((item) => item.sets.length > 0)
    .map((item) => ({ ...item, id: crypto.randomUUID() }));

  const logs = performed.map(({ exercise, sets, id }) => {
    const template = templates.find((item) => item.id === exercise.workoutId);
    const bodyweight = usesBodyweight(template);

    return {
      id,
      date: session.date,
      sessionId: session.sessionTemplateId ?? session.id,
      workoutId: exercise.workoutId,
      name: exercise.templateName,
      totalVolume: sets.reduce(
        (sum, setItem) => sum + setVolume(setItem, { bodyweightKg, bodyweight }),
        0
      ),
      totalSets: sets.length,
      totalReps: sets.reduce((sum, setItem) => sum + setItem.reps, 0),
      peakWeight: sets.reduce((peak, setItem) => Math.max(peak, setItem.weight), 0),
      muscles: template?.muscles ?? []
    };
  });

  const setLogs = performed.flatMap(({ exercise, sets, id }) =>
    sets.map((setItem, index) => ({
      id: crypto.randomUUID(),
      logId: id,
      workoutId: exercise.workoutId,
      date: session.date,
      setIndex: index,
      reps: setItem.reps,
      weight: setItem.weight,
      // The rollup above deliberately stays blind to this: a hold moves no
      // volume and no reps (see `ExerciseMetric`). The seconds live at the
      // grain, which is the only place they were ever true.
      durationSeconds: setItem.durationSeconds,
      distanceKm: setItem.distanceKm,
      completedAt: setItem.completedAt
    }))
  );

  return { logs, setLogs };
}

export function buildMuscleHeat(logs: WorkoutLog[]) {
  const intensity = new Map<string, number>();

  logs.forEach((log) => {
    log.muscles.forEach((muscle) => {
      // Through the alias table: a log from before the anatomical split says
      // "chest", and summed by that raw id it lit nothing on the map while
      // every chart still counted it.
      resolveMuscleIds(muscle.muscleId).forEach((muscleId) => {
        intensity.set(muscleId, (intensity.get(muscleId) ?? 0) + muscle.engagement);
      });
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

/**
 * What you actually lifted last time.
 *
 * `plannedExercisesFromTemplate` used to write the *template's* own numbers into
 * `previousWeight`/`previousReps`, so the most-glanced-at element in the app —
 * "last 60kg × 8" above the stepper — was the plan repeated back to you and
 * never a record of anything performed.
 *
 * The rollup fallback is not throwaway. Every session logged before `set_logs`
 * existed will only ever have that, and a peak weight without its reps is
 * genuinely all a rollup knows — which is why `reps` is optional here rather
 * than defaulted, and why the copy changes when it is missing.
 */
export interface LastPerformance {
  weight: number;
  /** Absent when this came from a rollup, which records no reps for the peak. */
  reps?: number;
  date: string;
  source: "sets" | "rollup";
}

export function lastPerformance(
  workoutId: string,
  logs: WorkoutLog[],
  setLogs: SetLog[]
): LastPerformance | undefined {
  const rows = setLogs.filter((row) => row.workoutId === workoutId);

  if (rows.length > 0) {
    const latestDate = rows.reduce((newest, row) => (row.date > newest ? row.date : newest), "");
    // The top set of that day, not the last one — a back-off set is not the
    // number you are trying to beat.
    const top = rows
      .filter((row) => row.date === latestDate)
      .reduce((best, row) =>
        row.weight > best.weight || (row.weight === best.weight && row.reps > best.reps)
          ? row
          : best
      );

    return { weight: top.weight, reps: top.reps, date: top.date, source: "sets" };
  }

  const newest = logs
    .filter((item) => item.workoutId === workoutId && item.peakWeight !== undefined)
    .reduce<WorkoutLog | undefined>(
      (best, item) => (!best || item.date > best.date ? item : best),
      undefined
    );

  if (newest?.peakWeight === undefined) {
    return undefined;
  }

  return { weight: newest.peakWeight, date: newest.date, source: "rollup" };
}

/** One set as it was last done — what `carriedSets` hands to the next plan. */
export interface CarriedSet {
  weight: number;
  reps: number;
  durationSeconds?: number;
  distanceKm?: number;
}

/**
 * Every session that logged this lift, newest first, each as its set rows.
 * Sessions are told apart by their log, not their date — the same lift twice
 * in one day is two sessions. Newest by date, then store order, which puts the
 * latest finish first (logs are prepended). A session where the lift was
 * skipped or removed logged nothing for it, so it is simply not here.
 */
function loggedSessions(workoutId: string, setLogs: SetLog[]): SetLog[][] {
  const sessions = new Map<string, SetLog[]>();
  setLogs
    .filter((row) => row.workoutId === workoutId)
    // Stable, so rows of one date keep store order.
    .sort((a, b) => (a.date === b.date ? 0 : a.date > b.date ? -1 : 1))
    .forEach((row) => sessions.set(row.logId, [...(sessions.get(row.logId) ?? []), row]));
  return [...sessions.values()];
}

const carry = (row: SetLog): CarriedSet => ({
  weight: row.weight,
  reps: row.reps,
  durationSeconds: row.durationSeconds,
  distanceKm: row.distanceKm
});

/** How many sets the latest session that did this lift logged; 0 if none ever did. */
export function lastSessionSetCount(workoutId: string, setLogs: SetLog[]): number {
  return loggedSessions(workoutId, setLogs)[0]?.length ?? 0;
}

/**
 * Set `index` (0-based, working sets only) as the latest session that reached
 * it did it. Undefined when no session ever got that far — no fallback here;
 * the caller decides what a set nobody has done starts at.
 */
export function loggedSetAt(workoutId: string, setLogs: SetLog[], index: number): CarriedSet | undefined {
  for (const session of loggedSessions(workoutId, setLogs)) {
    const found = session.find((row) => row.setIndex === index);
    if (found) {
      return carry(found);
    }
  }
  return undefined;
}

/**
 * Where each set of the next session starts, when no progression rule is set:
 * what you actually did, not what the session was typed with months ago.
 *
 * Set by set, looking back: set N comes from the most recent session that
 * logged a set N of this lift (`loggedSetAt`). A skipped session is passed
 * over on its own; a session that stopped at 2 of 4 leaves sets 3 and 4 to an
 * earlier one. A set no session ever reached copies the last set of the latest
 * session. Nothing logged at all is `undefined`, and the plan's numbers stand.
 */
export function carriedSets(
  workoutId: string,
  setLogs: SetLog[],
  count: number
): (CarriedSet | undefined)[] {
  const latest = loggedSessions(workoutId, setLogs)[0];
  if (!latest) {
    return Array.from({ length: count }, () => undefined);
  }
  const lastSet = latest.reduce((last, row) => (row.setIndex > last.setIndex ? row : last));
  return Array.from({ length: count }, (_, index) => loggedSetAt(workoutId, setLogs, index) ?? carry(lastSet));
}

/** Everything `lastPerformance` needs, as the store holds it. */
export interface PerformanceHistory {
  logs: WorkoutLog[];
  setLogs: SetLog[];
}

export function plannedExercisesFromTemplate(
  template: SessionTemplate,
  // Defaults to no history, which reads as "first time" rather than as the
  // template's own numbers dressed up as a record.
  history: PerformanceHistory = { logs: [], setLogs: [] }
): PlannedExercise[] {
  return template.exercises.map((exercise) => {
    // A hold and a run both carry seconds and no reps; only a run has distance.
    const isTimed = exercise.metric === "time" || exercise.metric === "distance";
    const isDistance = exercise.metric === "distance";
    const last = lastPerformance(exercise.workoutId, history.logs, history.setLogs);

    // Per-exercise beats per-session, and the whole thing is optional — a
    // template with no rule set behaves exactly as it did before this existed.
    const settings = exercise.progression ?? template.progression;

    // The *heaviest* planned set, not set 0. A rule judges the top set (see
    // `sessionTops`), so the number it returns is a top-set number and has to be
    // compared against one. Basing this on set 0 turned a 40/50/60 ramp into
    // 62.5/72.5/82.5 — it added the whole gap between the warm-up and the top
    // set to every set in the exercise.
    const plannedWeights = Array.from({ length: exercise.sets }, (_, index) =>
      weightForSet(exercise, index)
    );
    const plannedTop = Math.max(...plannedWeights, 0);

    const target = nextTarget({
      settings,
      plannedWeight: plannedTop,
      plannedReps: isTimed ? 0 : exercise.reps,
      plannedDurationSeconds: exercise.durationSeconds,
      setLogs: history.setLogs,
      workoutId: exercise.workoutId
    });

    // Moved as a block, so a ramp or a top-set-plus-back-offs keeps its shape.
    // The first version let the rule overwrite every set with one number, which
    // silently threw away per-set weights the user had typed by hand.
    // Zero when no rule ran, so `weights` passes through untouched.
    const shift = target.weight - plannedTop;

    // No rule: each set starts where you actually left it (see carriedSets).
    // A rule reads the same history its own way, so it keeps the final say.
    //
    // The count follows last time too: did 10, plan 10; trimmed back to 3,
    // plan 3. Never below the session's own count — one short day does not
    // shrink the plan; editing it in Build does.
    const setCount = settings?.rule
      ? exercise.sets
      : Math.max(exercise.sets, lastSessionSetCount(exercise.workoutId, history.setLogs));
    const carried = settings?.rule ? [] : carriedSets(exercise.workoutId, history.setLogs, setCount);

    return {
      id: crypto.randomUUID(),
      workoutId: exercise.workoutId,
      templateName: exercise.name,
      restSeconds: exercise.restSeconds,
      targetNotes: exercise.notes,
      metric: exercise.metric,
      perSide: exercise.perSide,
      progressionNote: target.reason || undefined,
      sets: Array.from({ length: setCount }).map((_, index) => {
        const from = carried[index];
        if (from) {
          return {
            id: crypto.randomUUID(),
            reps: isTimed ? 0 : from.reps,
            weight: from.weight,
            durationSeconds: isTimed ? from.durationSeconds ?? exercise.durationSeconds ?? 0 : undefined,
            distanceKm: isDistance ? from.distanceKm ?? exercise.distanceKm ?? 0 : undefined,
            previousReps: last?.reps,
            previousWeight: last?.weight,
            type: "normal" as const
          };
        }
        return {
          id: crypto.randomUUID(),
          // Zero reps for a held set — that is what keeps volume, totalReps and
          // peakWeight correct downstream without a guard at every consumer.
          // The rule counts reps; it does not know a lift is unilateral. Double
          // progression adds one, which on a per-side lift is half a rep on one
          // side — a set that cannot be performed. Rounded here, at the seam
          // that knows both facts, rather than teaching either lib the other.
          reps: isTimed ? 0 : evenTarget(target.reps, exercise.perSide),
          weight: Math.max(0, plannedWeights[index] + shift),
          // The rule's hold when one ran, the template's otherwise — the same
          // fallback `shift` gives the weight when no rule touched it.
          durationSeconds: isTimed
            ? target.durationSeconds ?? exercise.durationSeconds ?? 0
            : undefined,
          distanceKm: isDistance ? exercise.distanceKm ?? 0 : undefined,
          previousReps: last?.reps,
          previousWeight: last?.weight,
          type: "normal" as const
        };
      })
    };
  });
}

/** When a preset carries no `defaultSets`. Conservative on purpose. */
const FALLBACK_SETS: ExerciseSetTemplate = { sets: 3, reps: 10, weight: 20, restSeconds: 90 };

/** A run with no history behind it: the same first guess Build makes. */
const QUICK_RUN_KM = 5;
const QUICK_RUN_SECONDS = 1800;

/** The newest distance set of a workout — what the next run starts from. */
function lastDistanceSet(workoutId: string, setLogs: SetLog[]): SetLog | undefined {
  return setLogs
    .filter((row) => row.workoutId === workoutId && row.distanceKm !== undefined)
    .reduce<SetLog | undefined>((best, row) => (!best || row.date > best.date ? row : best), undefined);
}

/**
 * Exercises for a session that has no session behind it.
 *
 * `plannedExercisesFromTemplate` builds from a saved `SessionTemplate`. Quick-log
 * has no such thing — you picked four movements off a list — so this builds from
 * the bare workouts and their library defaults.
 */
export function plannedExercisesFromWorkouts(
  workouts: WorkoutTemplate[],
  history: PerformanceHistory = { logs: [], setLogs: [] }
): PlannedExercise[] {
  return workouts.map((workout) => {
    const defaults = workout.defaultSets?.[0] ?? FALLBACK_SETS;

    // A run or a bike is distance + time, as Build makes it. Built as rep sets
    // it was "3 × 10 @ 20 kg" for a run, logged as sets with no distance, and
    // invisible to every cardio chart.
    if (isDistanceExercise(workout.name)) {
      const lastRun = lastDistanceSet(workout.id, history.setLogs);
      return {
        id: crypto.randomUUID(),
        workoutId: workout.id,
        templateName: workout.name,
        restSeconds: defaults.restSeconds,
        metric: "distance" as const,
        sets: [
          {
            id: crypto.randomUUID(),
            reps: 0,
            weight: 0,
            distanceKm: lastRun?.distanceKm ?? QUICK_RUN_KM,
            durationSeconds: lastRun?.durationSeconds ?? QUICK_RUN_SECONDS,
            type: "normal" as const
          }
        ]
      };
    }

    const last = lastPerformance(workout.id, history.logs, history.setLogs);

    return {
      id: crypto.randomUUID(),
      workoutId: workout.id,
      templateName: workout.name,
      restSeconds: defaults.restSeconds,
      sets: Array.from({ length: defaults.sets }).map(() => ({
        id: crypto.randomUUID(),
        // What you last lifted beats the library's suggestion — the library
        // does not know you. It falls back per field, because a rollup can
        // supply a weight without the reps that went with it.
        reps: last?.reps ?? defaults.reps,
        weight: last?.weight ?? defaults.weight,
        previousReps: last?.reps,
        previousWeight: last?.weight,
        type: "normal" as const
      }))
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

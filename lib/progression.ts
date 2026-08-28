import type { ProgressionRule, ProgressionSettings, SetLog } from "@/lib/types";

/**
 * What decides the number in the weight field when a session opens.
 *
 * Until this file existed the app was descriptive: it showed you what you lifted
 * last time and handed you a blank stepper. Every session, every exercise, you
 * did the arithmetic yourself. This is that arithmetic, written down.
 *
 * Three constraints, and none of them is a preference:
 *
 * **A missed set never advances the load.** This is the whole reason a rule beats
 * "add 2.5kg every time". Progression that ignores whether you actually hit the
 * reps is just a countdown to a weight you cannot lift.
 *
 * **Every target carries its reason.** A number that appears without explanation
 * is a number people override on instinct, which is the same as not having a
 * rule. `reason` is shown, not logged.
 *
 * **Bodyweight lifts progress in reps.** Adding 2.5kg to a pull-up is not a
 * thing that can happen. See `advanceBodyweight`.
 *
 * **Held lifts progress in seconds.** A plank gets longer, not heavier. See
 * `nextHoldTarget`.
 */

export type { ProgressionRule, ProgressionSettings };

/** Smallest jump most gyms can actually make. Overridable per exercise. */
export const DEFAULT_INCREMENT_KG = 2.5;

/** Seconds added to a hold that was reached. The calibration knob, in the other unit. */
export const DEFAULT_INCREMENT_SECONDS = 5;

/** Consecutive missed sessions at one weight before the load comes down. */
export const STALL_LIMIT = 2;

/** How much comes off on a deload. The conventional 10%. */
export const DELOAD_FACTOR = 0.9;

/** Nothing lands between plates. Half a kilo is the finest most racks go. */
const WEIGHT_STEP = 0.5;

function roundToStep(weight: number) {
  return Math.round(weight / WEIGHT_STEP) * WEIGHT_STEP;
}

export interface ProgressionTarget {
  weight: number;
  reps: number;
  /** Seconds to hold. Only the `time` rule sets it; a rep lift never reads it. */
  durationSeconds?: number;
  /** Why it is that number. Empty when no rule ran and the plan stands. */
  reason: string;
}

/** The heaviest set of one session, which is the set a rule judges. */
interface SessionTop {
  date: string;
  weight: number;
  reps: number;
  /** Absent on a rep set, and on every hold logged before the column existed. */
  durationSeconds?: number;
}

/**
 * One row per session, newest first.
 *
 * The *top* set, not the last one: a back-off set is not the number you were
 * trying to beat, and reading it as the session's result would stall a lifter
 * who was progressing fine.
 */
export function sessionTops(setLogs: SetLog[], workoutId: string): SessionTop[] {
  const byDate = new Map<string, SessionTop>();

  setLogs
    .filter((row) => row.workoutId === workoutId)
    .forEach((row) => {
      const current = byDate.get(row.date);
      // Duration breaks the tie last, so nothing about rep sets changes: on a
      // hold every set is 0 reps at 0 kg, and the longest one is the top set.
      const better =
        !current ||
        row.weight > current.weight ||
        (row.weight === current.weight && row.reps > current.reps) ||
        (row.weight === current.weight &&
          row.reps === current.reps &&
          (row.durationSeconds ?? 0) > (current.durationSeconds ?? 0));

      if (better) {
        byDate.set(row.date, {
          date: row.date,
          weight: row.weight,
          reps: row.reps,
          durationSeconds: row.durationSeconds
        });
      }
    });

  return [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * How many sessions in a row fell short at this exact weight.
 *
 * Counts back from the newest and stops at the first session that either moved
 * the weight or hit the target — a stall is consecutive by definition, and a
 * successful session in between means the lifter is not stuck, they had one bad day.
 */
function stallCount(tops: SessionTop[], weight: number, targetReps: number) {
  let count = 0;

  for (const top of tops) {
    if (top.weight !== weight || top.reps >= targetReps) {
      break;
    }
    count += 1;
  }

  return count;
}

/**
 * Bodyweight progression: reps climb, load does not.
 *
 * A dip belt reads as weight and takes the normal path — this only fires when
 * the lift is genuinely carrying nothing.
 */
function advanceBodyweight(last: SessionTop, targetReps: number): ProgressionTarget {
  if (last.reps >= targetReps) {
    return {
      weight: 0,
      reps: last.reps + 1,
      reason: `bodyweight — ${last.reps} last time, go for ${last.reps + 1}`
    };
  }

  return {
    weight: 0,
    reps: targetReps,
    reason: `${last.reps} of ${targetReps} last time — same target again`
  };
}

/** Hold or deload, depending on how long this weight has been stuck. */
function holdOrDeload(
  tops: SessionTop[],
  last: SessionTop,
  targetReps: number
): ProgressionTarget {
  const stalls = stallCount(tops, last.weight, targetReps);

  if (stalls >= STALL_LIMIT) {
    const deloaded = roundToStep(last.weight * DELOAD_FACTOR);
    return {
      weight: deloaded,
      reps: targetReps,
      reason: `stalled ${stalls} sessions at ${last.weight}kg — down to ${deloaded}kg`
    };
  }

  return {
    weight: last.weight,
    reps: targetReps,
    reason: `${last.reps} of ${targetReps} at ${last.weight}kg — same weight again`
  };
}

/**
 * The hold a session should open with, replayed over the whole history.
 *
 * Every other rule reads last session's *target* straight out of the data: the
 * bar records what you loaded, so `last.weight` is what you were aiming at. A
 * hold records only how long you lasted, which after a miss is short of the
 * target — so judging it against the template's own number would clear it
 * forever, and the stall and deload branches below could never fire at all.
 * Running the rule forward from the template, oldest session first, is the only
 * way to recover the number that was actually on the screen.
 */
function nextHoldTarget(
  tops: SessionTop[],
  plannedSeconds: number,
  increment: number
): Pick<ProgressionTarget, "durationSeconds" | "reason"> {
  let target = plannedSeconds;
  let stalls = 0;
  let reason = "";

  for (const top of [...tops].reverse()) {
    // Every hold logged before `duration_seconds` existed is a row of 0 reps at
    // 0 kg. That is a session with no verdict in it, not a hold that failed —
    // counted as a miss it would deload a lifter on the day they turn the rule on.
    if (top.durationSeconds === undefined) {
      continue;
    }

    const held = top.durationSeconds;

    if (held >= target) {
      target = held + increment;
      stalls = 0;
      reason = `held ${held}s — go for ${target}s`;
      continue;
    }

    stalls += 1;

    if (stalls >= STALL_LIMIT) {
      // Whole seconds. Nobody holds a plank for 40.5.
      const eased = Math.round(target * DELOAD_FACTOR);
      reason = `stalled ${stalls} sessions at ${target}s — down to ${eased}s`;
      target = eased;
      stalls = 0;
      continue;
    }

    reason = `${held}s of ${target}s — same target again`;
  }

  return { durationSeconds: target, reason };
}

export interface NextTargetInput {
  settings?: ProgressionSettings;
  /** The template's own numbers: the starting point, and the rep target. */
  plannedWeight: number;
  plannedReps: number;
  /** Where a held lift starts. Only the `time` rule reads it. */
  plannedDurationSeconds?: number;
  /** Every set ever logged for this lift. Filtered here, not by the caller. */
  setLogs: SetLog[];
  workoutId: string;
}

/**
 * The weight and reps a session should open with.
 *
 * Falls back to the plan's own numbers whenever a rule cannot honestly run —
 * no rule set, no history, or a held lift under a rule that counts reps. A
 * silent fallback is correct here: the plan is what the user typed, and it is
 * never wrong to show it back.
 */
export function nextTarget({
  settings,
  plannedWeight,
  plannedReps,
  plannedDurationSeconds = 0,
  setLogs,
  workoutId
}: NextTargetInput): ProgressionTarget {
  const plan: ProgressionTarget = { weight: plannedWeight, reps: plannedReps, reason: "" };

  if (!settings || settings.rule === "off") {
    return plan;
  }

  const tops = sessionTops(setLogs, workoutId);
  const last = tops[0];

  if (!last) {
    return { ...plan, reason: "first time — the plan's own numbers" };
  }

  // Above the rep guard, because it is the one rule that can read a held set —
  // below it, every timed lift would fall straight back out to the plan.
  if (settings.rule === "time") {
    return {
      ...plan,
      ...nextHoldTarget(
        tops,
        plannedDurationSeconds,
        settings.incrementSeconds ?? DEFAULT_INCREMENT_SECONDS
      )
    };
  }

  // A time-held set stores reps: 0 by design (see ExerciseMetric). Judging it
  // against a rep target would read every plank as a failed session.
  if (plannedReps <= 0) {
    return plan;
  }

  if (last.weight <= 0) {
    return advanceBodyweight(last, plannedReps);
  }

  const increment = settings.incrementKg ?? DEFAULT_INCREMENT_KG;

  if (settings.rule === "double") {
    const repMax = settings.repMax ?? plannedReps;

    if (last.reps >= repMax) {
      const next = roundToStep(last.weight + increment);
      return {
        weight: next,
        reps: plannedReps,
        reason: `topped ${repMax} reps at ${last.weight}kg — ${next}kg, back to ${plannedReps}`
      };
    }

    if (last.reps >= plannedReps) {
      return {
        weight: last.weight,
        reps: last.reps + 1,
        reason: `${last.reps} reps at ${last.weight}kg — one more before the weight moves`
      };
    }

    return holdOrDeload(tops, last, plannedReps);
  }

  if (last.reps >= plannedReps) {
    const next = roundToStep(last.weight + increment);
    return {
      weight: next,
      reps: plannedReps,
      reason: `hit ${plannedReps} at ${last.weight}kg — up to ${next}kg`
    };
  }

  return holdOrDeload(tops, last, plannedReps);
}

export const PROGRESSION_LABELS: Record<ProgressionRule, string> = {
  off: "Off — my own numbers",
  linear: "Linear — add weight when I hit the reps",
  double: "Double — reps first, then weight",
  time: "Time — hold longer when I hit the target"
};

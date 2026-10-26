"use client";

import { ArrowDownRight, ArrowUpRight, ChevronRight, Info, Trophy } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

import { LevelUpGem, QuestScroll } from "@/features/home/artifacts";
import { ExerciseDemoButton } from "@/features/workout/exercise-media-dialog";
import { useDistanceUnit } from "@/features/workout/use-distance-unit";
import { useWorkoutStore } from "@/features/workout/workout-store";
import { levelTarget, levelUps } from "@/lib/skills";
import { type DistanceUnit, formatDistance, formatPace } from "@/lib/cardio";
import type { SessionSummary } from "@/lib/progress-metrics";
import type { PlannedExercise, PlannedSet, WorkoutLog } from "@/lib/types";
import { formatClock } from "@/lib/timer";
import { cn, formatVolume } from "@/lib/utils";

/** "62.5 kg × 8", "45 s", "5 km · 28:30 · 5:42 /km" — the set, in the units it was done in. */
function setLabel(setItem: PlannedSet, isTime: boolean, isDistance: boolean, unit: DistanceUnit) {
  if (isDistance) {
    const km = setItem.distanceKm ?? 0;
    const seconds = setItem.durationSeconds ?? 0;
    const pace = formatPace(seconds, km, unit);
    return [formatDistance(km, unit), formatClock(seconds), pace].filter(Boolean).join(" · ");
  }
  if (isTime) {
    const hold = `${setItem.durationSeconds ?? 0} s`;
    return setItem.weight > 0 ? `${setItem.weight} kg · ${hold}` : hold;
  }
  return setItem.weight > 0 ? `${setItem.weight} kg × ${setItem.reps}` : `${setItem.reps} reps`;
}

/**
 * The heaviest working set — heaviest weight, then most reps, then longest
 * hold. Warm-ups never qualify. One set only: a tie marks the first set that
 * reached it.
 */
function topSetId(sets: PlannedSet[]) {
  let top: PlannedSet | undefined;
  for (const setItem of sets) {
    if (setItem.type === "warmup") {
      continue;
    }
    const beats =
      !top ||
      setItem.weight > top.weight ||
      (setItem.weight === top.weight && setItem.reps > top.reps) ||
      (setItem.weight === top.weight &&
        setItem.reps === top.reps &&
        (setItem.durationSeconds ?? 0) > (top.durationSeconds ?? 0));
    if (beats) {
      top = setItem;
    }
  }
  // Only a set that beat another one is "top". One working set, or a straight
  // 4 × 5 at one weight, has no top set — the label there would be noise.
  const same = (a: PlannedSet, b: PlannedSet) =>
    a.weight === b.weight && a.reps === b.reps && (a.durationSeconds ?? 0) === (b.durationSeconds ?? 0);
  const working = sets.filter((item) => item.type !== "warmup");
  return top && working.some((item) => !same(item, top!)) ? top.id : undefined;
}

function ExerciseRecap({
  exercise,
  volume,
  isRecord
}: {
  exercise: PlannedExercise;
  /** From the log Finish wrote, so it agrees with the totals above. */
  volume?: number;
  isRecord: boolean;
}) {
  const done = exercise.sets.filter((setItem) => setItem.completed);
  const isTime = exercise.metric === "time";
  const isDistance = exercise.metric === "distance";
  const unit = useDistanceUnit();
  // "Top set" is a lifting idea; a run's rows are read by pace, shown on each.
  const top = isDistance ? undefined : topSetId(done);
  const skipped = exercise.sets.length - done.length;

  if (done.length === 0) {
    return (
      <div className="flex items-center justify-between gap-3 py-3">
        <div className="flex min-w-0 items-center">
          <p className="truncate text-[15px] font-semibold text-muted-foreground">{exercise.templateName}</p>
          <ExerciseDemoButton workoutId={exercise.workoutId} name={exercise.templateName} />
        </div>
        <p className="shrink-0 text-xs text-muted-foreground">Skipped</p>
      </div>
    );
  }

  const working = done.filter((setItem) => setItem.type !== "warmup").length;
  // Working sets are numbered 1, 2, 3 with warm-ups skipped, so "set 2" means
  // the second set that counted — the same numbers the totals add up.
  let workingNumber = 0;

  return (
    <div className="py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center">
            <p className="truncate text-[15px] font-semibold leading-tight">{exercise.templateName}</p>
            <ExerciseDemoButton workoutId={exercise.workoutId} name={exercise.templateName} />
          </div>
          {/* Icon and words, not colour alone — the record has to read without the blue. */}
          {isRecord ? (
            <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-brand/15 px-2 py-0.5 text-[11px] font-bold text-brand">
              <Trophy className="h-3 w-3" aria-hidden />
              New best
            </p>
          ) : null}
        </div>
        <p className="shrink-0 text-right text-xs text-muted-foreground tabular-nums">
          {isDistance ? (
            formatDistance(done.reduce((sum, setItem) => sum + (setItem.distanceKm ?? 0), 0), unit)
          ) : (
            <>
              {working} {working === 1 ? "set" : "sets"}
              {volume ? <> · {formatVolume(volume)} kg</> : null}
            </>
          )}
        </p>
      </div>

      <ol className="mt-2 space-y-1">
        {done.map((setItem) => {
          const isWarmup = setItem.type === "warmup";
          const number = isWarmup ? 0 : ++workingNumber;
          const isTop = setItem.id === top;
          return (
            <li
              key={setItem.id}
              className={cn(
                "grid grid-cols-[1.75rem_1fr_auto] items-center rounded-lg px-2 py-1.5 text-sm tabular-nums",
                isTop ? "bg-brand/10" : "well"
              )}
            >
              <span
                className={cn(
                  "text-xs font-bold",
                  isWarmup ? "text-warning" : "text-muted-foreground"
                )}
                aria-label={isWarmup ? "Warm-up" : `Set ${number}`}
              >
                {isWarmup ? "W" : number}
              </span>
              <span className={cn("font-semibold", isWarmup && "text-muted-foreground")}>
                {setLabel(setItem, isTime, isDistance, unit)}
              </span>
              {isTop ? (
                <span className="text-[11px] font-bold text-brand">Top set</span>
              ) : isWarmup ? (
                <span className="text-[11px] font-semibold text-warning">Warm-up</span>
              ) : (
                <span />
              )}
            </li>
          );
        })}
      </ol>

      {skipped > 0 ? (
        <p className="mt-1.5 text-xs text-muted-foreground">
          {skipped} planned {skipped === 1 ? "set" : "sets"} not done
        </p>
      ) : null}
    </div>
  );
}

/**
 * "Skill level up!": a rung this session cleared, on the card that reports the
 * session. Judged by replaying the skills without this session's sets and with
 * them, so it names exactly what today earned and nothing cleared before.
 */
function SkillLevelUps({ written }: { written: WorkoutLog[] }) {
  const goals = useWorkoutStore((state) => state.skillGoals);
  const setLogs = useWorkoutStore((state) => state.setLogs);
  const ups = useMemo(() => {
    const ids = new Set(written.map((log) => log.id));
    return levelUps(goals, setLogs.filter((row) => !ids.has(row.logId)), setLogs);
  }, [goals, setLogs, written]);

  if (ups.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 space-y-2">
      {ups.map((up) => (
        <Link
          key={up.goal.id}
          href="/skills"
          className="flex min-h-14 items-center gap-3 rounded-xl bg-brand/10 px-3 py-2.5 ring-1 ring-brand/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <LevelUpGem className="h-9 w-9 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block font-display text-base font-extrabold leading-tight tracking-tight text-brand">
              {up.mastered ? "Skill mastered!" : "Skill level up!"}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {up.goal.name} · Level {up.to} of {up.goal.levels.length}
              {up.next ? ` · next: ${up.next.name} ${levelTarget(up.next)}` : ""}
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        </Link>
      ))}
    </div>
  );
}

/**
 * The finish screen, in one card: what the session added up to, then every
 * set you actually did, exercise by exercise. It replaces a "Daily quest
 * cleared" banner that said nothing, over a list of pills with no numbers in it.
 *
 * Nothing here is rendered when it is not known: a first run of a session shows
 * no comparison rather than +0%, and a first-ever lift is a baseline, not a PR.
 */
export function SessionRecap({
  summary,
  exercises,
  logs
}: {
  summary?: SessionSummary;
  exercises: PlannedExercise[];
  /** The logs this session just wrote — one per exercise with work in it. */
  logs: WorkoutLog[];
}) {
  const unit = useDistanceUnit();
  if (!summary) {
    return (
      <div className="mt-4 flex items-center gap-3 rounded-lg bg-muted px-4 py-3 text-sm">
        <Info className="h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="text-muted-foreground">
          Finished with nothing logged — no sets were ticked off, so there is nothing to save.
        </p>
      </div>
    );
  }

  const change = summary.volumeChange;
  const records = new Set(summary.personalRecords.map((record) => record.workoutId));
  const volumeByWorkout = new Map(logs.map((log) => [log.workoutId, log.totalVolume]));
  const doneCount = exercises.filter((exercise) => exercise.sets.some((setItem) => setItem.completed)).length;
  const distanceKm = exercises
    .filter((exercise) => exercise.metric === "distance")
    .flatMap((exercise) => exercise.sets.filter((setItem) => setItem.completed))
    .reduce((sum, setItem) => sum + (setItem.distanceKm ?? 0), 0);
  const lifted = summary.volume > 0 || summary.reps > 0;
  // Only the numbers this session has: a run day is not "0 reps, 0 kg".
  const stats = [
    { label: "Sets", value: String(summary.sets) },
    ...(lifted
      ? [
          { label: "Reps", value: String(summary.reps) },
          { label: "kg lifted", value: formatVolume(summary.volume) }
        ]
      : []),
    ...(distanceKm > 0 ? [{ label: "Distance", value: formatDistance(distanceKm, unit) }] : [])
  ];

  return (
    // Part of the day card, not a box inside it: a card in a card spent the
    // width on a second border and repeated the header's numbers.
    <div className="system-pop mt-4">
      <div className="flex items-center gap-2.5">
        <QuestScroll className="h-9 w-[42px]" />
        <div className="min-w-0">
          <p className="font-display text-lg font-bold leading-tight tracking-tight">Session done</p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {doneCount} {doneCount === 1 ? "exercise" : "exercises"} · saved to your progress
          </p>
        </div>
      </div>

      <div
        className={cn("mt-3 grid gap-2 text-center", stats.length >= 4 ? "grid-cols-4" : stats.length === 3 ? "grid-cols-3" : "grid-cols-2")}
      >
        {stats.map((stat) => (
          <div key={stat.label} className="well rounded-lg px-2 py-2.5">
            <p className="font-display text-xl font-extrabold tabular-nums tracking-tight">{stat.value}</p>
            <p className="mt-0.5 text-[11px] font-semibold text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Weight lifted against last time means nothing on a day with none. */}
      {change === undefined || !lifted ? null : (
        <p className="mt-3 flex items-center gap-1.5 text-sm">
          {change >= 0 ? (
            <ArrowUpRight className="h-4 w-4 shrink-0 text-success" aria-hidden />
          ) : (
            <ArrowDownRight className="h-4 w-4 shrink-0 text-warning" aria-hidden />
          )}
          <span>
            <span className={change >= 0 ? "font-semibold text-success" : "font-semibold text-warning"}>
              {Math.abs(Math.round(change))}% {change >= 0 ? "more" : "less"}
            </span>{" "}
            <span className="text-muted-foreground">weight lifted than last time</span>
          </span>
        </p>
      )}

      <div className="mt-4 divide-y divide-border border-t border-border">
        {exercises.map((exercise) => (
          <ExerciseRecap
            key={exercise.id}
            exercise={exercise}
            volume={volumeByWorkout.get(exercise.workoutId)}
            isRecord={records.has(exercise.workoutId)}
          />
        ))}
      </div>

      <SkillLevelUps written={logs} />

      {summary.muscles.length > 0 ? (
        <div className="border-t border-border pt-3">
          <p className="text-xs font-semibold text-muted-foreground">What you hit</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {summary.muscles.map((muscle) => (
              <span
                key={muscle.muscleId}
                className="rounded-full bg-muted px-3 py-1 text-xs font-medium tabular-nums"
              >
                {muscle.name} {Math.round(muscle.share)}%
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

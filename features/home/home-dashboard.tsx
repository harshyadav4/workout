"use client";

import { CalendarPlus, Info, PlayCircle, Plus, Timer } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SignInNudge } from "@/features/auth/sign-in-nudge";
import { LevelUpGem } from "@/features/home/artifacts";
import { ExerciseLedger } from "@/features/home/exercise-ledger";
import { FinishConfirm } from "@/features/home/finish-confirm";
import { useLiveTimer } from "@/features/home/live-timer";
import { MuscleMapCard } from "@/features/home/muscle-map-card";
import { MeasurementPrompt } from "@/features/home/measurement-prompt";
import { QuickStart, WorkoutPicker } from "@/features/home/quick-start";
import { useScreenWakeLock } from "@/features/home/use-wake-lock";
import { RestDial, useRestTimer } from "@/features/home/rest-timer";
import { SessionRecap } from "@/features/home/session-recap";
import { SessionRing } from "@/features/home/session-ring";
import { StreakCard } from "@/features/home/streak-card";
import { InstallCard } from "@/features/pwa/install-card";
import {
  useSelectedTodaySession,
  useTodaySessions,
  useWorkoutStore
} from "@/features/workout/workout-store";
import { logSetFeedback } from "@/lib/feedback";
import { isLevelUp, previousBest } from "@/lib/hunter";
import { summarizeSession } from "@/lib/progress-metrics";
import { resolveDayState } from "@/lib/schedule";
import { formatTimeOfDay } from "@/lib/session-time";
import { elapsedSeconds, formatClock } from "@/lib/timer";
import type { PlannedSet, ScheduledSession } from "@/lib/types";
import { cn, formatVolume } from "@/lib/utils";
import {
  buildMuscleHighlightsFromWorkoutIds,
  exerciseEntrySetId,
  firstPendingSetId,
  nextPendingSetId,
  sessionTotals
} from "@/lib/workout-helpers";

// Date keys are plain YYYY-MM-DD days, so parse and format them in UTC — the
// day never shifts under a timezone that way.
function formatDay(key: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC"
  }).format(new Date(`${key}T00:00:00Z`));
}

/** One tone per day state: orange is go, amber needs you, green is done, blue is recovery. */
type DayTone = "default" | "accent" | "success" | "warning" | "secondary";

/**
 * The day plaque's top half: a state word, the session's name as big as the
 * screen allows, one line of numbers, and the ring when there is work to count.
 * The date is not here — it is in the page header, with the greeting.
 */
function DayHeader({
  tag,
  tone,
  title,
  detail,
  progress
}: {
  tag: string;
  tone: DayTone;
  title: string;
  /** One line of numbers. Omit where the body below already carries them. */
  detail?: string;
  /** Sets done out of planned. Renders the ring; omit where there is no work. */
  progress?: { done: number; total: number };
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <Badge variant={tone}>{tag}</Badge>
        {/* "Upper · Heavy" is two words with a dot between them, and at this
            size the dot lands on the line break. Each part gets its own line. */}
        <h2 className="mt-2.5 break-words font-display text-[40px] font-extrabold leading-[0.98] tracking-[-0.025em]">
          {title.split(" · ").map((part, index) => (
            <span key={index} className="block">
              {part}
            </span>
          ))}
        </h2>
        {detail ? <p className="mt-2 text-sm text-muted-foreground tabular-nums">{detail}</p> : null}
      </div>
      {progress && progress.total > 0 ? (
        <SessionRing
          value={progress.done / progress.total}
          label={`${progress.done} of ${progress.total} sets logged`}
        >
          <span className="font-display text-[26px] font-extrabold tracking-tight">{progress.done}</span>
          <span className="mt-0.5 text-[11px] font-semibold text-muted-foreground">of {progress.total}</span>
        </SessionRing>
      ) : null}
    </div>
  );
}

/**
 * Mid-session the plaque collapses to a strip and sticks to the top: the ring,
 * the name, and the rest dial. Everything else on the screen is the work.
 */
/** The session clock: "Started 6:10 PM · 0:42:10", ticking. Hidden until there is a start. */
function SessionClock({ startedAt }: { startedAt?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) {
      return;
    }
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);
  if (!startedAt) {
    return null;
  }
  return (
    <p className="mt-0.5 truncate text-xs text-brand tabular-nums" role="timer" aria-label="Workout time">
      Started {formatTimeOfDay(startedAt)} · {formatClock(elapsedSeconds(Date.parse(startedAt), now))}
    </p>
  );
}

function SessionStrip({
  title,
  detail,
  done,
  total,
  rest,
  startedAt
}: {
  title: string;
  detail: string;
  done: number;
  total: number;
  rest: ReturnType<typeof useRestTimer>;
  startedAt?: string;
}) {
  return (
    <Card className="sticky top-[calc(env(safe-area-inset-top)+0.5rem)] z-30 grid grid-cols-[auto_1fr_auto] items-center gap-3 p-3">
      <SessionRing value={total > 0 ? done / total : 0} size={56} stroke={8} label={`${done} of ${total} sets logged`}>
        <span className="font-display text-[17px] font-extrabold tracking-tight">{done}</span>
      </SessionRing>
      <div className="min-w-0">
        <p className="truncate font-display text-[22px] font-extrabold leading-none tracking-tight">{title}</p>
        <p className="mt-1 truncate text-xs text-muted-foreground tabular-nums">{detail}</p>
        <SessionClock startedAt={startedAt} />
      </div>
      {rest.active ? (
        <RestDial remaining={rest.remaining} total={rest.total} onExtend={rest.extend} onSkip={rest.skip} />
      ) : (
        <span className="w-0" aria-hidden />
      )}
    </Card>
  );
}

function NextUp({ session }: { session?: ScheduledSession }) {
  if (!session) {
    return <p className="text-sm text-muted-foreground">No workout is scheduled.</p>;
  }

  return (
    <Link
      href="/plan"
      className="flex min-h-12 items-center justify-between gap-3 rounded-lg bg-muted px-4 py-3 transition-colors hover:bg-secondary active:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="text-xs font-semibold text-muted-foreground">Next</span>
      <span className="min-w-0 flex-1 truncate text-right text-sm font-semibold">
        {session.sessionName}
      </span>
      <span className="text-xs font-semibold text-brand tabular-nums">{formatDay(session.date)}</span>
    </Link>
  );
}

/**
 * "Level up!": a new best, caught on the set that made it, instead of only in
 * the summary at the end. Sits just above the tab bar for a moment and goes —
 * low, so it never covers the strip with the rest timer, or the set being logged.
 * The `key` replays the arrival when a second record lands before it leaves.
 */
function LevelUpNotice({ name, weight }: { name: string; weight: number }) {
  return (
    <div
      role="status"
      className="system-pop pointer-events-none fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+6.75rem)] z-40 mx-auto flex max-w-sm items-center gap-3 rounded-2xl border border-brand/40 bg-card/95 px-4 py-3 shadow-dock backdrop-blur"
    >
      <LevelUpGem className="h-9 w-9" />
      <div className="min-w-0">
        <p className="font-display text-base font-extrabold leading-tight tracking-tight text-brand">Level up!</p>
        <p className="truncate text-xs text-muted-foreground">
          New record on <span className="capitalize">{name}</span>: {weight} kg
        </p>
      </div>
    </div>
  );
}

export function HomeDashboard() {
  const todaySessions = useTodaySessions();
  const selectedSession = useSelectedTodaySession();
  const scheduledSessions = useWorkoutStore((state) => state.scheduledSessions);
  const sessionTemplates = useWorkoutStore((state) => state.sessionTemplates);
  const activeDate = useWorkoutStore((state) => state.activeDate);
  const templates = useWorkoutStore((state) => state.templates);
  const bodyweightKg = useWorkoutStore((state) => state.profile.weightKg);
  const muscles = useWorkoutStore((state) => state.muscles);
  const selectedMuscleId = useWorkoutStore((state) => state.selectedMuscleId);
  const setSelectedMuscle = useWorkoutStore((state) => state.setSelectedMuscle);
  const selectSession = useWorkoutStore((state) => state.selectSession);
  const startSession = useWorkoutStore((state) => state.startSession);
  const updateSessionSet = useWorkoutStore((state) => state.updateSessionSet);
  const addSetToSession = useWorkoutStore((state) => state.addSetToSession);
  const logs = useWorkoutStore((state) => state.logs);
  const addExerciseToSession = useWorkoutStore((state) => state.addExerciseToSession);
  const removeSetFromSession = useWorkoutStore((state) => state.removeSetFromSession);
  const removeExerciseFromSession = useWorkoutStore((state) => state.removeExerciseFromSession);
  const logTodayWorkout = useWorkoutStore((state) => state.logTodayWorkout);
  const rest = useRestTimer();
  const live = useLiveTimer();
  const [addingExercise, setAddingExercise] = useState(false);
  const [confirmingFinish, setConfirmingFinish] = useState(false);

  const [pickedSetId, setPickedSetId] = useState<string>();
  // ponytail: the stamp replays only when this id changes, so re-logging the
  // same set does not re-animate. Clear it on a timer if that ever matters.
  const [stampedSetId, setStampedSetId] = useState<string>();
  const [levelUp, setLevelUp] = useState<{ id: string; name: string; weight: number }>();

  useEffect(() => {
    if (!levelUp) {
      return;
    }
    const id = window.setTimeout(() => setLevelUp(undefined), 2800);
    return () => window.clearTimeout(id);
  }, [levelUp]);

  const day = useMemo(
    () =>
      resolveDayState({
        today: activeDate,
        session: selectedSession,
        sessions: scheduledSessions,
        hasPlan: sessionTemplates.length > 0 || scheduledSessions.length > 0
      }),
    [activeDate, scheduledSessions, selectedSession, sessionTemplates.length]
  );

  // Before the early returns below, because hooks cannot live after one. The
  // lock is dropped the moment the session is finished or the tab backgrounds.
  useScreenWakeLock(day.kind === "logging");

  // The logs this session just wrote, against everything logged before today.
  const writtenLogs = useMemo(
    () =>
      day.kind === "done"
        ? logs.filter(
            (log) =>
              log.date === activeDate &&
              (log.sessionId ?? "") === (day.session.sessionTemplateId ?? day.session.id)
          )
        : [],
    [activeDate, day, logs]
  );
  const sessionSummary = useMemo(() => summarizeSession(writtenLogs, logs), [writtenLogs, logs]);

  const session = day.kind === "setup" || day.kind === "open" ? undefined : day.session;
  const next = day.kind === "setup" ? undefined : day.next;
  const totals = sessionTotals(session, templates, bodyweightKg);

  // A picked set only survives while it still exists in today's session.
  const pickedExists = session?.exercises.some((exercise) =>
    exercise.sets.some((setItem) => setItem.id === pickedSetId)
  );
  const openSetId = pickedExists ? pickedSetId : firstPendingSetId(session);

  // Mid-session the map follows the lift in front of you. Every other state
  // shows the whole session — or what is coming next on a day with nothing to do.
  const focusedSetId = day.kind === "logging" ? openSetId : undefined;
  const highlightWorkoutIds = useMemo(() => {
    // Rest sessions carry `exercises: []`, so test for work, not for a session —
    // `??` would stop at the empty array and leave the rest-day map blank while
    // the card promises the next session's muscles.
    const exercises = session?.exercises.length ? session.exercises : (next?.exercises ?? []);
    const focused = exercises.find((exercise) =>
      exercise.sets.some((setItem) => setItem.id === focusedSetId)
    );
    return focused ? [focused.workoutId] : exercises.map((exercise) => exercise.workoutId);
  }, [focusedSetId, next, session]);

  const muscleHighlights = useMemo(
    () => buildMuscleHighlightsFromWorkoutIds(highlightWorkoutIds, templates),
    [highlightWorkoutIds, templates]
  );
  const selectedMuscle =
    muscles.find((muscle) => muscle.id === selectedMuscleId) ??
    muscles.find(
      (muscle) => muscle.id === muscleHighlights.find((item) => item.intensity > 0)?.muscleId
    ) ??
    muscles[0];

  const patchSet = (exerciseId: string, setId: string, patch: Partial<PlannedSet>) => {
    if (session) {
      updateSessionSet(session.id, exerciseId, setId, patch);
    }
  };

  const logSet = (exerciseId: string, setId: string) => {
    if (!session) {
      return;
    }
    const exercise = session.exercises.find((item) => item.id === exerciseId);
    const alreadyLogged = exercise?.sets.find((item) => item.id === setId)?.completed;

    // Logging the set the clock is running for stops it, and its seconds count.
    const timed = live.setId === setId ? { durationSeconds: Math.max(1, live.stop()) } : {};
    updateSessionSet(session.id, exerciseId, setId, { ...timed, completed: true });
    setStampedSetId(setId);
    // Forward from the set just logged, not back to the first gap in the
    // session — see `nextPendingSetId`. Correcting a set already logged keeps
    // the panel where it is: you tapped back to it on purpose.
    setPickedSetId(alreadyLogged ? setId : nextPendingSetId(session, setId));

    // Only a newly logged set starts the clock — and earns the click. "Update
    // set" is a correction to something already done, and restarting rest on
    // it would be wrong.
    if (!alreadyLogged) {
      logSetFeedback();
      rest.start(exercise?.restSeconds);

      const setItem = exercise?.sets.find((item) => item.id === setId);
      if (exercise && setItem && setItem.type !== "warmup") {
        const todayBest = exercise.sets
          .filter((item) => item.completed && item.id !== setId && item.type !== "warmup")
          .reduce((peak, item) => Math.max(peak, item.weight), 0);
        if (isLevelUp(setItem.weight, previousBest(logs, exercise.workoutId, activeDate), todayBest)) {
          setLevelUp({ id: setId, name: exercise.templateName, weight: setItem.weight });
        }
      }
    }
  };

  /** Gone from today. If it was the one open, the panel moves on to what comes after it. */
  const removeExercise = (exerciseId: string) => {
    if (!session) {
      return;
    }
    const index = session.exercises.findIndex((item) => item.id === exerciseId);
    const wasOpen = session.exercises[index]?.sets.some((item) => item.id === openSetId);
    removeExerciseFromSession(session.id, exerciseId);

    if (wasOpen) {
      const rest = session.exercises.filter((item) => item.id !== exerciseId);
      const order = [...rest.slice(index), ...rest.slice(0, index)];
      setPickedSetId(order.flatMap((item) => item.sets).find((item) => !item.completed)?.id);
    }
  };

  /** Finish on the live clock: its seconds become the set's hold. */
  const finishLive = () => {
    const setId = live.setId;
    const seconds = live.stop();
    const exercise = session?.exercises.find((item) => item.sets.some((setItem) => setItem.id === setId));
    if (session && exercise && setId) {
      updateSessionSet(session.id, exercise.id, setId, { durationSeconds: Math.max(1, seconds) });
    }
  };

  const finishSession = () => {
    live.cancel();
    setConfirmingFinish(false);
    rest.skip();
    logTodayWorkout();
  };

  // With every set logged there is nothing to lose, so no question.
  const requestFinish = () => {
    if (totals.done < totals.total) {
      setConfirmingFinish(true);
    } else {
      finishSession();
    }
  };

  const exerciseCount = (count: number) => `${count} exercise${count === 1 ? "" : "s"}`;

  if (day.kind === "setup") {
    return (
      <section className="space-y-4">
        <Card>
          <DayHeader
            tag="Setup"
            tone="warning"
            title="Make your first workout"
            detail="No workouts scheduled"
          />
          <p className="mt-4 max-w-[20rem] text-sm text-muted-foreground">
            Build a workout once, then schedule it on your training days.
          </p>
          <Button asChild size="lg" className="mt-5 w-full">
            <Link href="/plan?mode=build">Add workout</Link>
          </Button>
        </Card>
        {/* Above the map, below the pitch: the fastest path from install to a
            logged set, for someone who is already at the gym. */}
        <QuickStart />
        <MuscleMapCard
          title="Muscle map"
          description="Schedule a workout to see the muscles it uses."
          highlights={muscleHighlights}
          selectedMuscleId={selectedMuscle.id}
          selectedMuscleName={selectedMuscle.name}
          selectedMuscleDescription={selectedMuscle.description}
          onSelectMuscle={setSelectedMuscle}
        />
      </section>
    );
  }

  if (day.kind === "open" || day.kind === "rest") {
    const isRest = day.kind === "rest";

    return (
      <section className="space-y-4">
        <Card>
          <DayHeader
            tag={isRest ? "Rest" : "Open"}
            tone={isRest ? "accent" : "secondary"}
            title={isRest ? "Rest day" : "No workout today"}
            detail={
              isRest
                ? "Your muscles recover today."
                : "No workout is set for this day."
            }
          />
          <div className="mt-4">
            <NextUp session={next} />
          </div>
          {isRest ? null : (
            <Button asChild variant="secondary" className="mt-3 w-full">
              <Link href="/plan">
                <CalendarPlus className="h-4 w-4" />
                Schedule workout
              </Link>
            </Button>
          )}
        </Card>
        {/* Not on a rest day — the plan says recover, and offering a session
            there argues with it. */}
        {isRest ? null : <QuickStart />}
        <StreakCard />
        <InstallCard dismissible />
        <MuscleMapCard
          title="Muscle map"
          description={
            next
              ? `The muscles that ${next.sessionName} uses.`
              : "Schedule a workout to see the muscles it uses."
          }
          highlights={muscleHighlights}
          selectedMuscleId={selectedMuscle.id}
          selectedMuscleName={selectedMuscle.name}
          selectedMuscleDescription={selectedMuscle.description}
          onSelectMuscle={setSelectedMuscle}
        />
      </section>
    );
  }

  const isLogging = day.kind === "logging";
  const isDone = day.kind === "done";
  const sessionPicker =
    todaySessions.length > 1 ? (
      <div className="mt-4 flex gap-2 overflow-x-auto scrollbar-hide">
        {todaySessions.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={item.id === day.session.id}
            className={cn(
              "min-h-11 shrink-0 rounded-full px-4 text-xs font-semibold transition-colors",
              item.id === day.session.id ? "key" : "key-quiet text-muted-foreground"
            )}
            onClick={() => selectSession(item.id)}
          >
            {item.sessionName}
          </button>
        ))}
      </div>
    ) : null;

  return (
    <section className="space-y-4">
      {levelUp ? <LevelUpNotice key={levelUp.id} name={levelUp.name} weight={levelUp.weight} /> : null}
      {isLogging ? (
        <>
          <SessionStrip
            title={day.session.sessionName}
            detail={`${totals.done} of ${totals.total} sets · ${formatVolume(totals.loggedVolume)} kg`}
            done={totals.done}
            total={totals.total}
            rest={rest}
            startedAt={day.session.startedAt}
          />
          {/* Said once, plainly, while nothing is logged yet: the clock is on. */}
          {day.session.startedAt && totals.done === 0 ? (
            <p className="flex items-center gap-2 rounded-xl bg-brand/10 px-4 py-2.5 text-xs ring-1 ring-brand/25">
              <Timer className="h-4 w-4 shrink-0 text-brand" aria-hidden />
              <span>
                Clock started at {formatTimeOfDay(day.session.startedAt)}. Finish workout stops it.
              </span>
            </p>
          ) : null}
          {sessionPicker}
        </>
      ) : (
        <Card data-tour="home-today">
          <DayHeader
            tag={isDone ? "Cleared" : "Daily quest"}
            tone={isDone ? "success" : "default"}
            title={day.session.sessionName}
            detail={
              // Done: the recap's stat tiles say it; a line here only repeated them.
              isDone
                ? undefined
                : `${exerciseCount(day.session.exercises.length)} · ${totals.total} sets · ${formatVolume(totals.planned)} kg planned`
            }
            // Done says its piece in the green banner below; a full ring there
            // would only repeat it.
            progress={isDone ? undefined : { done: totals.done, total: totals.total }}
          />

          {sessionPicker}

          {day.kind === "ready" ? (
            <Button size="lg" className="mt-5 w-full" onClick={() => startSession(day.session.id)}>
              <PlayCircle className="h-5 w-5" />
              Start workout
            </Button>
          ) : null}

          {isDone ? (
            <>
              <SessionRecap summary={sessionSummary} session={day.session} logs={writtenLogs} />
              {/* A guest's first finished session: the moment an account is worth it. */}
              <SignInNudge place="finish-card" />
              {/* Below the payoff, never above it. The reward comes first. */}
              <MeasurementPrompt />
            </>
          ) : null}
        </Card>
      )}

      {/* Once done, the recap above lists every set with its numbers; this
          ledger would only repeat it as pills. */}
      {day.session.exercises.length > 0 && !isDone ? (
        <Card className="pb-2 pt-2" data-tour="home-work">
          <div className="flex items-baseline justify-between py-2">
            <h3 className="text-[15px] font-bold tracking-tight">
              Today's exercises
            </h3>
            <p className="text-xs text-muted-foreground tabular-nums">
              {exerciseCount(day.session.exercises.length)}
            </p>
          </div>
          <div>
            {day.session.exercises.map((exercise) => (
              <ExerciseLedger
                key={exercise.id}
                exercise={exercise}
                openSetId={openSetId}
                stampedSetId={stampedSetId}
                interactive={isLogging}
                onOpenSet={setPickedSetId}
                onPatchSet={(setId, patch) => patchSet(exercise.id, setId, patch)}
                onLogSet={(setId) => logSet(exercise.id, setId)}
                onAddSet={() => addSetToSession(day.session.id, exercise.id)}
                onRemoveSet={(setId) => removeSetFromSession(day.session.id, exercise.id, setId)}
                onPick={() => setPickedSetId(exerciseEntrySetId(exercise))}
                onRemove={
                  day.session.exercises.length > 1 ? () => removeExercise(exercise.id) : undefined
                }
                timer={{
                  setId: live.setId,
                  elapsed: live.elapsed,
                  onStart: live.start,
                  onFinish: finishLive,
                  onCancel: live.cancel
                }}
              />
            ))}
          </div>

          {/* The rack was taken, or you felt like one more. Without this the
              only options were skip it or leave the app. */}
          {isLogging ? (
            <div className="mt-2 border-t border-border pt-3 pb-2">
              {addingExercise ? (
                <WorkoutPicker
                  confirmLabel="Add exercises"
                  onConfirm={(exercises) => {
                    addExerciseToSession(day.session.id, exercises);
                    setAddingExercise(false);
                  }}
                />
              ) : (
                <Button variant="ghost" className="w-full" onClick={() => setAddingExercise(true)}>
                  <Plus className="h-4 w-4" />
                  Add exercise
                </Button>
              )}
            </div>
          ) : null}
        </Card>
      ) : null}

      {isLogging && totals.done < totals.total && !confirmingFinish ? (
        <div className="flex items-start gap-2.5 rounded-xl bg-warning/10 px-4 py-3 text-sm ring-1 ring-warning/25">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <p className="text-muted-foreground">
            {totals.done === 0
              ? "No sets logged. Finishing now saves nothing."
              : `Only your ${totals.done} of ${totals.total} logged sets get saved.`}
          </p>
        </div>
      ) : null}

      {isLogging ? (
        confirmingFinish ? (
          <FinishConfirm
            exercises={day.session.exercises}
            onCancel={() => setConfirmingFinish(false)}
            onFinish={finishSession}
            onPick={(exercise) => {
              setConfirmingFinish(false);
              setPickedSetId(exerciseEntrySetId(exercise));
            }}
          />
        ) : (
          <Button size="lg" className="w-full" onClick={requestFinish}>
            Finish workout
          </Button>
        )
      ) : null}

      {isDone ? <NextUp session={next} /> : null}

      {/* Not mid-session: a card between the day card and the ledger pushes the
          thing you are tapping down the screen, and a session in progress does
          not need a nudge to start. */}
      {isLogging ? null : <StreakCard />}

      {isLogging ? null : <InstallCard dismissible />}

      <MuscleMapCard
        tourId="home-muscles"
        title="Muscle map"
        description={
          isLogging
            ? "Muscles for your current set."
            : isDone
              ? "The muscles today's workout used."
              : "The muscles today's workout uses."
        }
        highlights={muscleHighlights}
        selectedMuscleId={selectedMuscle.id}
        selectedMuscleName={selectedMuscle.name}
        selectedMuscleDescription={selectedMuscle.description}
        onSelectMuscle={setSelectedMuscle}
      />
    </section>
  );
}

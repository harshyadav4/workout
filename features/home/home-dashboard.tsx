"use client";

import { CalendarPlus, Play, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { usePendingRemoval } from "@/components/ui/use-pending-removal";
import { Card } from "@/components/ui/card";
import { ListSheet } from "@/components/ui/list";
import { HORIZON_WIDTH, HorizonArc } from "@/components/ui/progress-arc";
import { SignInNudge } from "@/features/auth/sign-in-nudge";
import { ExerciseLedger } from "@/features/home/exercise-ledger";
import { FinishConfirm } from "@/features/home/finish-confirm";
import { useLiveTimer } from "@/features/home/live-timer";
import { MuscleMapCard } from "@/features/home/muscle-map-card";
import { MeasurementPrompt } from "@/features/home/measurement-prompt";
import { QuickStart, WorkoutPicker } from "@/features/home/quick-start";
import { useScreenWakeLock } from "@/features/home/use-wake-lock";
import { RestDial, useRestTimer } from "@/features/home/rest-timer";
import { SessionRecap } from "@/features/home/session-recap";
import { InjuryWorkoutRows } from "@/features/injuries/injury-workout-rows";
import { injuriesLoadedBy, injuryWorkoutIds, isInjurySession, mayLoadLine } from "@/lib/injuries";
import { StreakCard, WeekArc } from "@/features/home/streak-card";
import { InstallCard } from "@/features/pwa/install-card";
import { RemindersPrompt } from "@/features/pwa/reminders-prompt";
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
import type { PlannedExercise, PlannedSet, ScheduledSession } from "@/lib/types";
import { cn, formatVolume } from "@/lib/utils";
import {
  buildMuscleHighlightsFromWorkoutIds,
  exerciseEntrySetId,
  firstPendingSetId,
  nextPendingSetId,
  nextSetSummary,
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

/** As big as the words allow: a short name is the screen's one large thing, a long one must still fit. */
function titleSize(title: string) {
  const longest = Math.max(...title.split(" · ").map((part) => part.length));
  if (longest <= 8) {
    return "text-[84px] leading-[1.14]";
  }
  return longest <= 12 ? "text-[60px] leading-[1.12]" : "text-[42px] leading-[1.12]";
}

/**
 * The top of the day, on the sky itself: the week as the horizon, a state word,
 * the session's name as big as the screen allows, one line of numbers, and
 * whatever the day asks of you. The date is not here — it is in the page header,
 * with the greeting.
 */
function DayHero({
  tag,
  title,
  detail,
  tourId,
  children
}: {
  tag: string;
  title: string;
  /** One line of numbers. Omit where the body below already carries them. */
  detail?: string;
  tourId?: string;
  children?: React.ReactNode;
}) {
  return (
    <div data-tour={tourId}>
      <div className="-mx-4">
        <WeekArc />
      </div>
      <div className="px-1">
        <p className="text-[13.5px] text-muted-foreground">{tag}</p>
        {/* "Upper · Heavy" is two words with a dot between them, and at this
            size the dot lands on the line break. Each part gets its own line. */}
        <h2 className={cn("break-words font-heading", titleSize(title))}>
          {title.split(" · ").map((part, index) => (
            <span key={index} className="block">
              {part}
            </span>
          ))}
        </h2>
        {detail ? <p className="text-[13.5px] text-muted-foreground tabular-nums">{detail}</p> : null}
      </div>
      {children}
    </div>
  );
}

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
    <p className="truncate text-[12.5px] text-muted-foreground tabular-nums" role="timer" aria-label="Workout time">
      Started {formatTimeOfDay(startedAt)} · {formatClock(elapsedSeconds(Date.parse(startedAt), now))}
    </p>
  );
}

/**
 * Mid-session the top of the day collapses to a strip and sticks to the top: the
 * name, the numbers, the rest dial and a thin line of progress. Solid, because
 * the work scrolls under it. Everything else on the screen is the work.
 */
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
    <div className="plaque-solid sticky top-[calc(env(safe-area-inset-top)+var(--titlebar)+0.5rem)] z-30 overflow-hidden rounded-3xl">
      <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 px-4 py-2.5">
        <div className="min-w-0">
          <p className="truncate font-heading text-[24px] leading-tight">{title}</p>
          <p className="truncate text-[12.5px] text-muted-foreground tabular-nums">{detail}</p>
          <SessionClock startedAt={startedAt} />
        </div>
        {rest.endsAt !== undefined ? (
          <RestDial endsAt={rest.endsAt} total={rest.total} onExtend={rest.extend} onSkip={rest.skip} />
        ) : (
          <span className="w-0" aria-hidden />
        )}
      </div>
      <div className="h-0.5 bg-track" aria-hidden>
        <div className="mana-fill h-full" style={{ width: `${total > 0 ? (done / total) * 100 : 0}%` }} />
      </div>
    </div>
  );
}

/** The sets as the horizon, with the count under it. It scrolls away; the strip stays. */
function SetsArc({ done, total }: { done: number; total: number }) {
  return (
    <div>
      <div className="-mx-4">
        <HorizonArc
          litTo={total > 0 ? (done / total) * HORIZON_WIDTH : 0}
          height={68}
          label={`${done} of ${total} sets logged`}
        />
      </div>
      <p className="-mt-5 text-center text-[13.5px] text-muted-foreground tabular-nums" aria-hidden>
        <span className="block text-[40px] font-medium leading-none tracking-[-0.03em] text-foreground">{done}</span>
        of {total} sets
      </p>
    </div>
  );
}

function NextUp({ session }: { session?: ScheduledSession }) {
  if (!session) {
    return <p className="text-sm text-muted-foreground">No workout is scheduled.</p>;
  }

  return (
    <Link
      href="/plan"
      className="plaque flex min-h-[54px] items-center justify-between gap-3 rounded-3xl px-4 py-3 transition-colors active:bg-hi focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="text-[13.5px] text-muted-foreground">Next</span>
      <span className="min-w-0 flex-1 truncate text-right text-[15.5px] font-medium">
        {session.sessionName}
      </span>
      <span className="text-[13.5px] text-muted-foreground tabular-nums">{formatDay(session.date)}</span>
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
      className="plaque-solid system-pop pointer-events-none fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+6.75rem)] z-40 mx-auto max-w-sm rounded-2xl px-4 py-3"
    >
      <p className="font-heading text-[22px] leading-tight">Level up!</p>
      <p className="truncate text-[13px] text-muted-foreground">
        New record on <span className="capitalize">{name}</span>: {weight} kg
      </p>
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
  const swapSessionExercise = useWorkoutStore((state) => state.swapSessionExercise);
  const injuries = useWorkoutStore((state) => state.injuries);
  // Removals hide at once and commit after the Undo bar (components/ui/undo-bar).
  const removal = usePendingRemoval();
  const logTodayWorkout = useWorkoutStore((state) => state.logTodayWorkout);
  const rest = useRestTimer();
  const live = useLiveTimer();
  const [addingExercise, setAddingExercise] = useState(false);
  const [swapping, setSwapping] = useState<PlannedExercise>();
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
        // "Next" means the next normal workout, not tomorrow's injury exercises.
        sessions: scheduledSessions.filter((item) => !isInjurySession(item, injuryWorkoutIds(injuries))),
        hasPlan: sessionTemplates.length > 0 || scheduledSessions.length > 0
      }),
    [activeDate, injuries, scheduledSessions, selectedSession, sessionTemplates.length]
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

  // What is on screen: anything removed waits behind the Undo bar before it is
  // really gone, but the open panel must already have moved off it, or the
  // exercise collapses the moment Remove is tapped.
  const visibleSession = session
    ? {
        ...session,
        exercises: session.exercises
          .filter((exercise) => !removal.hidden.has(exercise.id))
          .map((exercise) => ({ ...exercise, sets: exercise.sets.filter((setItem) => !removal.hidden.has(setItem.id)) }))
      }
    : undefined;

  // A picked set only survives while it still exists in today's session.
  const pickedExists = visibleSession?.exercises.some((exercise) =>
    exercise.sets.some((setItem) => setItem.id === pickedSetId)
  );
  const openSetId = pickedExists ? pickedSetId : firstPendingSetId(visibleSession);

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
    setPickedSetId(alreadyLogged ? setId : nextPendingSetId(visibleSession ?? session, setId));

    // Only a newly logged set starts the clock — and earns the click. "Update
    // set" is a correction to something already done, and restarting rest on
    // it would be wrong.
    if (!alreadyLogged) {
      logSetFeedback();
      // The notification at the end says what is next, from the same pick
      // the ledger will open.
      rest.start(exercise?.restSeconds, nextSetSummary(visibleSession ?? session, setId));

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

  /**
   * The panel stays on this exercise: the next set still to log, an earlier one
   * if there is none after it, or the nearest set if all are logged. Only the set
   * that is open moves it; removing another leaves you where you are.
   */
  const removeSet = (exercise: PlannedExercise, setId: string) => {
    if (!session) {
      return;
    }
    const sessionId = session.id;
    if (setId === openSetId) {
      const index = exercise.sets.findIndex((item) => item.id === setId);
      const after = exercise.sets.slice(index + 1);
      const before = exercise.sets.slice(0, index);
      const next = after.find((item) => !item.completed) ?? before.find((item) => !item.completed) ?? after[0] ?? before[before.length - 1];
      if (next) {
        setPickedSetId(next.id);
      }
    }
    removal.remove(setId, "Set removed", () => removeSetFromSession(sessionId, exercise.id, setId));
  };

  /** Gone from today. If it was the one open, the panel moves on to what comes after it at once. */
  const removeExercise = (exercise: PlannedExercise) => {
    if (!session || !visibleSession) {
      return;
    }
    const sessionId = session.id;
    const index = visibleSession.exercises.findIndex((item) => item.id === exercise.id);

    if (exercise.sets.some((item) => item.id === openSetId)) {
      const others = visibleSession.exercises.filter((item) => item.id !== exercise.id);
      const order = [...others.slice(index), ...others.slice(0, index)];
      setPickedSetId(order.flatMap((item) => item.sets).find((item) => !item.completed)?.id);
    }
    removal.remove(exercise.id, `${exercise.templateName} removed from today`, () => removeExerciseFromSession(sessionId, exercise.id));
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

  /** A hint on the row and a way to swap for today. It never blocks the workout. */
  const loadWarning = (exercise: PlannedExercise, sessionTemplateId?: string) => {
    const muscles = templates.find((item) => item.id === exercise.workoutId)?.muscles ?? [];
    const [loaded] = injuriesLoadedBy(muscles, injuries, sessionTemplateId);
    return loaded ? { warning: mayLoadLine(loaded), onSwap: () => setSwapping(exercise) } : {};
  };

  if (day.kind === "setup") {
    return (
      <section className="space-y-4">
        <DayHero tag="Setup" title="Make your first workout" detail="No workouts scheduled">
          <p className="mt-2 max-w-[20rem] px-1 text-sm text-muted-foreground">
            Build a workout once, then schedule it on your training days.
          </p>
          <Button asChild size="lg" className="mt-4 w-full">
            <Link href="/plan?mode=build">Add workout</Link>
          </Button>
        </DayHero>
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
        <DayHero
          tag={isRest ? "Rest" : "Open"}
          title={isRest ? "Rest day" : "No workout today"}
          detail={isRest ? "Your muscles recover today." : "No workout is set for this day."}
        >
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
        </DayHero>
        <InjuryWorkoutRows />
        {/* Not on a rest day — the plan says recover, and offering a session
            there argues with it. */}
        {isRest ? null : <QuickStart />}
        <StreakCard />
        <RemindersPrompt />
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
          <SetsArc done={totals.done} total={totals.total} />
          {/* Said once, plainly, while nothing is logged yet: the clock is on. */}
          {day.session.startedAt && totals.done === 0 ? (
            <p className="px-1 text-center text-[13px] text-muted-foreground">
              Clock started at {formatTimeOfDay(day.session.startedAt)}. Finish workout stops it.
            </p>
          ) : null}
          {sessionPicker}
        </>
      ) : (
        <DayHero
          tourId="home-today"
          tag={isDone ? "Cleared" : "Daily quest"}
          title={day.session.sessionName}
          detail={
            // Done: the recap's numbers say it; a line here only repeated them.
            isDone
              ? undefined
              : `${exerciseCount(day.session.exercises.length)} · ${totals.total} sets · ${formatVolume(totals.planned)} kg planned`
          }
        >
          {sessionPicker}

          {day.kind === "ready" ? (
            <Button size="lg" className="mt-4 h-[58px] w-full text-base" onClick={() => startSession(day.session.id)}>
              <Play className="h-4 w-4 fill-current" />
              Start workout
            </Button>
          ) : null}

          {isDone ? (
            <Card className="mt-4">
              <SessionRecap summary={sessionSummary} session={day.session} logs={writtenLogs} />
              {/* A guest's first finished session: the moment an account is worth it. */}
              <SignInNudge place="finish-card" />
              {/* Below the payoff, never above it. The reward comes first. */}
              <MeasurementPrompt />
            </Card>
          ) : null}
        </DayHero>
      )}

      {isLogging ? null : <InjuryWorkoutRows />}

      {/* Once done, the recap above lists every set with its numbers; this
          ledger would only repeat it as pills. */}
      {day.session.exercises.length > 0 && !isDone ? (
        <section className="space-y-2" data-tour="home-work">
          <h3 className="px-1 text-[13.5px] font-semibold text-muted-foreground">Today's exercises</h3>
          <div className="plaque overflow-hidden rounded-3xl">
            {(visibleSession ?? day.session).exercises.map((exercise) => (
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
                onRemoveSet={(setId) => removeSet(exercise, setId)}
                onPick={() => setPickedSetId(exerciseEntrySetId(exercise))}
                onRemove={
                  (visibleSession ?? day.session).exercises.length > 1
                    ? () => removeExercise(exercise)
                    : undefined
                }
                {...(day.kind === "ready" ? loadWarning(exercise, day.session.sessionTemplateId) : {})}
                timer={{
                  setId: live.setId,
                  startedAt: live.startedAt,
                  onStart: live.start,
                  onFinish: finishLive,
                  onCancel: live.cancel
                }}
              />
            ))}

          {/* The rack was taken, or you felt like one more. Without this the
              only options were skip it or leave the app. */}
          {isLogging ? (
            <div className="border-t border-sep px-4 py-2">
              {addingExercise ? (
                <div className="py-1">
                  <WorkoutPicker
                    confirmLabel="Add exercises"
                    onConfirm={(exercises) => {
                      addExerciseToSession(day.session.id, exercises);
                      setAddingExercise(false);
                    }}
                  />
                </div>
              ) : (
                <Button variant="ghost" className="w-full" onClick={() => setAddingExercise(true)}>
                  <Plus className="h-4 w-4" />
                  Add exercise
                </Button>
              )}
            </div>
          ) : null}
          </div>
        </section>
      ) : null}

      {isLogging && totals.done < totals.total && !confirmingFinish ? (
        <p className="px-1 text-center text-[13px] text-muted-foreground">
          {totals.done === 0
            ? "No sets logged. Finishing now saves nothing."
            : `Only your ${totals.done} of ${totals.total} logged sets get saved.`}
        </p>
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
          // Quiet while there are sets to log, so Log set stays the one main
          // button; the main button once there is nothing left but this.
          <Button
            size="lg"
            variant={totals.done === totals.total ? "default" : "secondary"}
            className="w-full"
            onClick={requestFinish}
          >
            Finish workout
          </Button>
        )
      ) : null}

      {isDone ? <NextUp session={next} /> : null}

      <ListSheet
        open={Boolean(swapping)}
        onOpenChange={(open) => {
          if (!open) {
            setSwapping(undefined);
          }
        }}
        title={swapping ? `Swap ${swapping.templateName}` : ""}
        description="For today only. Your workout stays as it is."
      >
        {swapping ? (
          <WorkoutPicker
            confirmLabel="Swap"
            onConfirm={(exercises) => {
              swapSessionExercise(day.session.id, swapping.id, exercises);
              setSwapping(undefined);
            }}
          />
        ) : null}
      </ListSheet>

      {/* Not mid-session: a card between the day card and the ledger pushes the
          thing you are tapping down the screen, and a session in progress does
          not need a nudge to start. */}
      {isLogging ? null : <StreakCard />}

      {isLogging ? null : <RemindersPrompt />}
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

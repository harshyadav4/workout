"use client";

import { CalendarPlus, Check, Info, PlayCircle, Plus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ExerciseLedger } from "@/features/home/exercise-ledger";
import { MuscleMapCard } from "@/features/home/muscle-map-card";
import { MeasurementPrompt } from "@/features/home/measurement-prompt";
import { QuickStart, WorkoutPicker } from "@/features/home/quick-start";
import { useScreenWakeLock } from "@/features/home/use-wake-lock";
import { RestDial, useRestTimer } from "@/features/home/rest-timer";
import { SessionRing } from "@/features/home/session-ring";
import { StreakCard } from "@/features/home/streak-card";
import { InstallCard } from "@/features/pwa/install-card";
import {
  useSelectedTodaySession,
  useTodaySessions,
  useWorkoutStore
} from "@/features/workout/workout-store";
import { logSetFeedback } from "@/lib/feedback";
import { summarizeSession, type SessionSummary } from "@/lib/progress-metrics";
import { resolveDayState } from "@/lib/schedule";
import type { PlannedSet, ScheduledSession } from "@/lib/types";
import { cn, formatVolume } from "@/lib/utils";
import {
  buildMuscleHighlightsFromWorkoutIds,
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
  detail: string;
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
        <p className="mt-2 text-sm text-muted-foreground tabular-nums">{detail}</p>
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
function SessionStrip({
  title,
  detail,
  done,
  total,
  rest
}: {
  title: string;
  detail: string;
  done: number;
  total: number;
  rest: ReturnType<typeof useRestTimer>;
}) {
  return (
    <Card className="sticky top-[calc(env(safe-area-inset-top)+0.5rem)] z-30 grid grid-cols-[auto_1fr_auto] items-center gap-3 p-3">
      <SessionRing value={total > 0 ? done / total : 0} size={56} stroke={8} label={`${done} of ${total} sets logged`}>
        <span className="font-display text-[17px] font-extrabold tracking-tight">{done}</span>
      </SessionRing>
      <div className="min-w-0">
        <p className="truncate font-display text-[22px] font-extrabold leading-none tracking-tight">{title}</p>
        <p className="mt-1 truncate text-xs text-muted-foreground tabular-nums">{detail}</p>
      </div>
      {rest.active ? (
        <RestDial remaining={rest.remaining} onExtend={rest.extend} onSkip={rest.skip} />
      ) : (
        <span className="w-0" aria-hidden />
      )}
    </Card>
  );
}

function NextUp({ session }: { session?: ScheduledSession }) {
  if (!session) {
    return <p className="text-sm text-muted-foreground">Nothing scheduled ahead.</p>;
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
 * What the session earned, in place of "Logged. It is on your progress charts."
 *
 * Nothing here is rendered when it is not known: a first run of a session shows
 * no comparison rather than +0%, and a first-ever lift is a baseline, not a PR.
 */
function FinishSummary({ summary }: { summary?: SessionSummary }) {
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

  return (
    <div className="mt-4 space-y-3 rounded-xl bg-success/10 p-4 ring-1 ring-success/25">
      <div className="flex items-center gap-2.5">
        <Check className="h-5 w-5 shrink-0 text-success" strokeWidth={3} />
        <p className="font-display text-lg font-bold tracking-tight">Session logged</p>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          { label: "Sets", value: String(summary.sets) },
          { label: "Reps", value: String(summary.reps) },
          { label: "Volume", value: `${formatVolume(summary.volume)} kg` }
        ].map((stat) => (
          <div key={stat.label} className="well rounded-lg px-2 py-2.5">
            <p className="font-display text-xl font-extrabold tabular-nums tracking-tight">{stat.value}</p>
            <p className="mt-0.5 text-[11px] font-semibold text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </div>

      {change === undefined ? null : (
        <p className="text-sm">
          <span className={change >= 0 ? "font-semibold text-success" : "font-semibold text-warning"}>
            {change >= 0 ? "+" : ""}
            {Math.round(change)}%
          </span>{" "}
          <span className="text-muted-foreground">volume against the last time you ran this</span>
        </p>
      )}

      {summary.personalRecords.length > 0 ? (
        <p className="text-sm">
          <span className="font-semibold text-brand">
            {summary.personalRecords.length === 1 ? "New best" : "New bests"}
          </span>{" "}
          <span className="text-muted-foreground">
            {summary.personalRecords
              .map((record) => `${record.name} at ${record.weight} kg`)
              .join(", ")}
          </span>
        </p>
      ) : null}

      {summary.muscles.length > 0 ? (
        <div>
          <p className="text-xs font-semibold text-muted-foreground">What you hit</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {summary.muscles.map((muscle) => (
              <span
                key={muscle.muscleId}
                className="rounded-full bg-card px-3 py-1 text-xs font-medium tabular-nums"
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
  const logTodayWorkout = useWorkoutStore((state) => state.logTodayWorkout);
  const rest = useRestTimer();
  const [addingExercise, setAddingExercise] = useState(false);

  const [pickedSetId, setPickedSetId] = useState<string>();
  // ponytail: the stamp replays only when this id changes, so re-logging the
  // same set does not re-animate. Clear it on a timer if that ever matters.
  const [stampedSetId, setStampedSetId] = useState<string>();

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
  const sessionSummary = useMemo(() => {
    if (day.kind !== "done") {
      return undefined;
    }
    const written = logs.filter(
      (log) => log.date === activeDate && (log.sessionId ?? "") === (day.session.sessionTemplateId ?? day.session.id)
    );
    return summarizeSession(written, logs);
  }, [activeDate, day, logs]);

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

    updateSessionSet(session.id, exerciseId, setId, { completed: true });
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
    }
  };

  const finishSession = () => {
    rest.skip();
    logTodayWorkout();
  };

  const exerciseCount = (count: number) => `${count} exercise${count === 1 ? "" : "s"}`;

  if (day.kind === "setup") {
    return (
      <section className="space-y-4">
        <Card>
          <DayHeader
            tag="Setup"
            tone="warning"
            title="Build your first session"
            detail="Nothing scheduled yet"
          />
          <p className="mt-4 max-w-[20rem] text-sm text-muted-foreground">
            Put a session together once — exercises, sets, weights — then schedule it across the
            weeks. This screen becomes your logbook.
          </p>
          <Button asChild size="lg" className="mt-5 w-full">
            <Link href="/plan?mode=build">Create a session</Link>
          </Button>
        </Card>
        {/* Above the map, below the pitch: the fastest path from install to a
            logged set, for someone who is already at the gym. */}
        <QuickStart />
        <MuscleMapCard
          title="Muscle map"
          description="Once a session is scheduled, the muscles it works light up here."
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
            title={isRest ? "Rest day" : "No session today"}
            detail={
              isRest
                ? "Recovery is when the work sticks. Nothing to log."
                : "This weekday has nothing assigned."
            }
          />
          <div className="mt-4">
            <NextUp session={next} />
          </div>
          {isRest ? null : (
            <Button asChild variant="secondary" className="mt-3 w-full">
              <Link href="/plan">
                <CalendarPlus className="h-4 w-4" />
                Schedule a session
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
              ? `What ${next.sessionName} works when it comes around.`
              : "Schedule a session to see the muscles it works."
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
      {isLogging ? (
        <>
          <SessionStrip
            title={day.session.sessionName}
            detail={`${totals.done} of ${totals.total} sets · ${formatVolume(totals.loggedVolume)} kg`}
            done={totals.done}
            total={totals.total}
            rest={rest}
          />
          {sessionPicker}
        </>
      ) : (
        <Card>
          <DayHeader
            tag={isDone ? "Done" : "Today"}
            tone={isDone ? "success" : "default"}
            title={day.session.sessionName}
            detail={
              isDone
                ? `${totals.loggedSets} sets · ${formatVolume(totals.loggedVolume)} kg logged`
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
              Start session
            </Button>
          ) : null}

          {isDone ? (
            <>
              <FinishSummary summary={sessionSummary} />
              {/* Below the payoff, never above it. The reward comes first. */}
              <MeasurementPrompt />
            </>
          ) : null}
        </Card>
      )}

      {day.session.exercises.length > 0 ? (
        <Card className="pb-2 pt-2">
          <div className="flex items-baseline justify-between py-2">
            <h3 className="text-[15px] font-bold tracking-tight">
              {isDone ? "What you did" : "The work"}
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
              />
            ))}
          </div>

          {/* The rack was taken, or you felt like one more. Without this the
              only options were skip it or leave the app. */}
          {isLogging ? (
            <div className="mt-2 border-t border-border pt-3 pb-2">
              {addingExercise ? (
                <WorkoutPicker
                  confirmLabel="Add"
                  onConfirm={(exercises) => {
                    addExerciseToSession(day.session.id, exercises);
                    setAddingExercise(false);
                  }}
                />
              ) : (
                <Button variant="ghost" className="w-full" onClick={() => setAddingExercise(true)}>
                  <Plus className="h-4 w-4" />
                  Add an exercise
                </Button>
              )}
            </div>
          ) : null}
        </Card>
      ) : null}

      {isLogging && totals.done < totals.total ? (
        <div className="flex items-start gap-2.5 rounded-xl bg-warning/10 px-4 py-3 text-sm ring-1 ring-warning/25">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <p className="text-muted-foreground">
            {totals.done === 0
              ? "No sets logged yet — Finish now and nothing from this session is saved."
              : `Only the ${totals.done} of ${totals.total} sets you logged will be saved. The rest won't count.`}
          </p>
        </div>
      ) : null}

      {isLogging ? (
        <Button size="lg" className="w-full" onClick={finishSession}>
          Finish session
        </Button>
      ) : null}

      {isDone ? <NextUp session={next} /> : null}

      {/* Not mid-session: a card between the day card and the ledger pushes the
          thing you are tapping down the screen, and a session in progress does
          not need a nudge to start. */}
      {isLogging ? null : <StreakCard />}

      {isLogging ? null : <InstallCard dismissible />}

      <MuscleMapCard
        title="Muscle map"
        description={
          isLogging
            ? "Following the set you are on. Tap another set to move the highlight."
            : isDone
              ? "What today's session worked."
              : "Everything today's session covers."
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

"use client";

import { CalendarPlus, Check, Info, Moon, PlayCircle } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ExerciseLedger } from "@/features/home/exercise-ledger";
import { MuscleMapCard } from "@/features/home/muscle-map-card";
import { StreakCard } from "@/features/home/streak-card";
import {
  useSelectedTodaySession,
  useTodaySessions,
  useWorkoutStore
} from "@/features/workout/workout-store";
import { resolveDayState } from "@/lib/schedule";
import type { PlannedSet, ScheduledSession } from "@/lib/types";
import { formatVolume } from "@/lib/utils";
import {
  buildMuscleHighlightsFromWorkoutIds,
  firstPendingSetId,
  sessionTotals
} from "@/lib/workout-helpers";

// Date keys are plain YYYY-MM-DD days, so parse and format them in UTC — the
// day never shifts under a timezone that way.
function formatDay(key: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC"
  })
    .format(new Date(`${key}T00:00:00Z`))
    .toUpperCase();
}

/**
 * One hue per day state, so the tag carries the state before you read it:
 * amber needs you, orange is go, cyan is recovery, green is done. Tints and
 * text on the dark card — never a solid fill, which would need its own
 * foreground token to stay legible. Written out in full because Tailwind
 * only sees literal class strings.
 */
const DAY_TONES = {
  primary: "bg-primary/15 text-primary ring-primary/30",
  accent: "bg-accent/15 text-accent ring-accent/30",
  success: "bg-success/15 text-success ring-success/30",
  warning: "bg-warning/15 text-warning ring-warning/30",
  muted: "bg-secondary text-muted-foreground ring-white/10"
} as const;

type DayTone = keyof typeof DAY_TONES;

function DayHeader({
  dateKey,
  tag,
  tone,
  title,
  detail,
  progress
}: {
  dateKey: string;
  tag: string;
  tone: DayTone;
  title: string;
  detail: string;
  /** Sets done out of planned. Renders the fill bar; omit where there is no work. */
  progress?: { done: number; total: number };
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-xs tracking-[0.22em] text-muted-foreground">
          {formatDay(dateKey)}
        </p>
        {/* 11px at 0.14em, not 10px at 0.22em: this carries state you read at
            arm's length, so it stops being a poster label. */}
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.14em] ring-1 ${DAY_TONES[tone]}`}
        >
          {tag}
        </span>
      </div>
      <h2 className="mt-2 break-words text-[2rem] font-bold leading-none tracking-tight">{title}</h2>
      <p className="mt-2 font-mono text-sm tabular-nums text-muted-foreground">{detail}</p>
      {progress && progress.total > 0 ? (
        <Progress
          value={Math.round((progress.done / progress.total) * 100)}
          className="mt-3 h-2 bg-secondary"
          aria-label={`${progress.done} of ${progress.total} sets logged`}
        />
      ) : null}
    </div>
  );
}

function NextUp({ session }: { session?: ScheduledSession }) {
  if (!session) {
    return (
      <p className="font-mono text-xs tracking-[0.18em] text-muted-foreground">
        NOTHING SCHEDULED AHEAD
      </p>
    );
  }

  return (
    <Link
      href="/plan"
      className="flex min-h-12 items-center justify-between gap-3 rounded-2xl bg-secondary/40 px-4 py-3 transition-colors hover:bg-secondary/60 active:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
        Next
      </span>
      <span className="min-w-0 flex-1 truncate text-right text-sm font-semibold">
        {session.sessionName}
      </span>
      <span className="font-mono text-xs tabular-nums text-primary">{formatDay(session.date)}</span>
    </Link>
  );
}

export function HomeDashboard() {
  const todaySessions = useTodaySessions();
  const selectedSession = useSelectedTodaySession();
  const scheduledSessions = useWorkoutStore((state) => state.scheduledSessions);
  const sessionTemplates = useWorkoutStore((state) => state.sessionTemplates);
  const activeDate = useWorkoutStore((state) => state.activeDate);
  const templates = useWorkoutStore((state) => state.templates);
  const muscles = useWorkoutStore((state) => state.muscles);
  const selectedMuscleId = useWorkoutStore((state) => state.selectedMuscleId);
  const setSelectedMuscle = useWorkoutStore((state) => state.setSelectedMuscle);
  const selectSession = useWorkoutStore((state) => state.selectSession);
  const startSession = useWorkoutStore((state) => state.startSession);
  const updateSessionSet = useWorkoutStore((state) => state.updateSessionSet);
  const addSetToSession = useWorkoutStore((state) => state.addSetToSession);
  const removeSetFromSession = useWorkoutStore((state) => state.removeSetFromSession);
  const logTodayWorkout = useWorkoutStore((state) => state.logTodayWorkout);

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

  const session = day.kind === "setup" || day.kind === "open" ? undefined : day.session;
  const next = day.kind === "setup" ? undefined : day.next;
  const totals = sessionTotals(session);

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
    updateSessionSet(session.id, exerciseId, setId, { completed: true });
    setStampedSetId(setId);
    setPickedSetId(undefined); // fall back to the next pending set
  };

  if (day.kind === "setup") {
    return (
      <section className="space-y-4">
        <Card>
          <DayHeader
            dateKey={activeDate}
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
            dateKey={activeDate}
            tag={isRest ? "Rest" : "Open"}
            tone={isRest ? "accent" : "muted"}
            title={isRest ? "Rest day" : "No session today"}
            detail={isRest ? "Recovery is on the plan" : "This weekday has nothing assigned"}
          />
          <div
            className={`mt-4 flex items-center gap-3 rounded-2xl px-4 py-3 text-sm text-muted-foreground ring-1 ${
              isRest ? "bg-accent/10 ring-accent/25" : "bg-secondary/40 ring-white/5"
            }`}
          >
            <Moon className="h-4 w-4 shrink-0 text-accent" />
            <p>
              {isRest
                ? "Recovery is when the work sticks. Nothing to log today."
                : "Add a session to today from the Plan tab, or leave the day open."}
            </p>
          </div>
          <div className="mt-3">
            <NextUp session={next} />
          </div>
          {isRest ? null : (
            <Button asChild variant="secondary" className="mt-3 w-full">
              <Link href="/plan">
                <CalendarPlus className="mr-2 h-4 w-4" />
                Schedule a session
              </Link>
            </Button>
          )}
        </Card>
        <StreakCard />
        <MuscleMapCard
          title="Muscle map"
          description={
            next
              ? `Highlighted: what ${next.sessionName} works when it comes around.`
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

  return (
    <section className="space-y-4">
      <Card>
        <DayHeader
          dateKey={activeDate}
          tag={isDone ? "Complete" : isLogging ? "In progress" : "Ready"}
          tone={isDone ? "success" : isLogging ? "warning" : "primary"}
          title={day.session.sessionName}
          detail={
            isDone
              ? `${totals.loggedSets} sets · ${formatVolume(totals.loggedVolume)} kg logged`
              : `${totals.done} of ${totals.total} sets · ${formatVolume(totals.volume)} kg`
          }
          // Done says its piece in the green banner below; a full bar there
          // would only repeat it.
          progress={isDone ? undefined : { done: totals.done, total: totals.total }}
        />

        {todaySessions.length > 1 ? (
          <div className="mt-4 flex gap-2 overflow-x-auto scrollbar-hide">
            {todaySessions.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={item.id === day.session.id}
                className={`min-h-11 shrink-0 rounded-full px-4 text-xs font-medium transition-colors active:scale-95 ${
                  item.id === day.session.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground active:bg-secondary/70"
                }`}
                onClick={() => selectSession(item.id)}
              >
                {item.sessionName}
              </button>
            ))}
          </div>
        ) : null}

        {day.kind === "ready" ? (
          <Button size="lg" className="mt-4 w-full" onClick={() => startSession(day.session.id)}>
            <PlayCircle className="mr-2 h-5 w-5" />
            Start session
          </Button>
        ) : null}

        {isDone ? (
          <div className="mt-4 flex items-center gap-3 rounded-2xl bg-success/10 px-4 py-3 text-sm ring-1 ring-success/25">
            <Check className="h-4 w-4 shrink-0 text-success" />
            <p className="text-muted-foreground">Logged. It is on your progress charts.</p>
          </div>
        ) : null}
      </Card>

      {day.session.exercises.length > 0 ? (
        <Card>
          <div className="flex items-baseline justify-between">
            <h3 className="text-lg font-semibold tracking-tight">
              {isDone ? "What you did" : "The work"}
            </h3>
            <p className="font-mono text-xs tabular-nums text-muted-foreground">
              {day.session.exercises.length} exercises
            </p>
          </div>
          <div className="mt-1">
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
        </Card>
      ) : null}

      {isLogging && totals.done < totals.total ? (
        <div className="flex items-start gap-2.5 rounded-2xl bg-warning/10 px-4 py-3 text-sm ring-1 ring-warning/25">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <p className="text-muted-foreground">
            {totals.done === 0
              ? "No sets logged yet — Finish now and nothing from this session is saved."
              : `Only the ${totals.done} of ${totals.total} sets you logged will be saved. The rest won't count.`}
          </p>
        </div>
      ) : null}

      {isLogging ? (
        <Button size="lg" className="w-full" onClick={logTodayWorkout}>
          Finish session
        </Button>
      ) : null}

      {isDone ? <NextUp session={next} /> : null}

      {/* Not mid-session: a card between the day card and the ledger pushes the
          thing you are tapping down the screen, and a session in progress does
          not need a nudge to start. */}
      {isLogging ? null : <StreakCard />}

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

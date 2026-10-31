"use client";

import { Check, ChevronLeft, ChevronRight, Plus, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DRAWER_CONTENT,
  SHEET_FOOT
} from "@/components/ui/dialog";
import { InfoNote } from "@/components/ui/info-note";
import { Input } from "@/components/ui/input";
import { ListGroup, ListRow, ListSheet, SheetRows } from "@/components/ui/list";
import { Segmented } from "@/components/ui/segmented";
import { ThemedSelect } from "@/components/ui/select";
import { usePendingRemoval } from "@/components/ui/use-pending-removal";
import { SessionPreview } from "@/features/planner/session-preview";
import { MuscleMapCard } from "@/features/home/muscle-map-card";
import { useExercisesFromSessionTemplate, useWorkoutStore } from "@/features/workout/workout-store";
import { activeInjuries, injuryWorkoutIds, injuryWorkoutLine, isInjurySession } from "@/lib/injuries";
import { formatDayKey } from "@/lib/progress-metrics";
import { REST_SLOT, buildScheduleSessions, daysOfScheduleLeft, maxScheduleEnd } from "@/lib/schedule";
import { muscles } from "@/lib/seed-data";
import type { MuscleId, ScheduleConfig, ScheduleMode, ScheduledSession } from "@/lib/types";
import { addDays, buildWeekDates, cn, dateKey, todayKey } from "@/lib/utils";
import { buildMuscleHighlightsFromWorkoutIds } from "@/lib/workout-helpers";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DEFAULT_WEEKS = 8;
// Two weeks' notice: long enough to act on, short enough not to nag from week
// three of eight.
const HORIZON_WARNING_DAYS = 14;
const UPCOMING_ROWS = 10;

const MONTH = new Intl.DateTimeFormat("en-US", { month: "long" });
const WEEKDAY = new Intl.DateTimeFormat("en-US", { weekday: "short" });

function weekLabel(offset: number) {
  if (offset === 0) {
    return "this week";
  }
  if (offset === 1) {
    return "next week";
  }
  if (offset === -1) {
    return "last week";
  }
  return offset > 0 ? `in ${offset} weeks` : `${Math.abs(offset)} weeks ago`;
}

interface PlanScheduleProps {
  onGoBuild: () => void;
}

export function PlanSchedule({ onGoBuild }: PlanScheduleProps) {
  const sessionTemplates = useWorkoutStore((state) => state.sessionTemplates);
  const scheduledSessions = useWorkoutStore((state) => state.scheduledSessions);
  const injuries = useWorkoutStore((state) => state.injuries);
  const scheduleConfig = useWorkoutStore((state) => state.scheduleConfig);
  const generateSchedule = useWorkoutStore((state) => state.generateSchedule);
  const removeScheduledSession = useWorkoutStore((state) => state.removeScheduledSession);
  const moveScheduledSession = useWorkoutStore((state) => state.moveScheduledSession);
  const scheduleSession = useWorkoutStore((state) => state.scheduleSession);
  const buildExercises = useExercisesFromSessionTemplate();
  const templates = useWorkoutStore((state) => state.templates);

  const [weekOffset, setWeekOffset] = useState(0);
  const [sessionToChange, setSessionToChange] = useState<ScheduledSession | null>(null);
  const [moveTo, setMoveTo] = useState("");
  const [moveError, setMoveError] = useState<string | null>(null);
  const [confirmGenerate, setConfirmGenerate] = useState(false);
  // The schedule form lives behind one row. The week is what you look at;
  // the form is what you touch twice a season.
  const [editOpen, setEditOpen] = useState(false);
  const [startDate, setStartDate] = useState(todayKey);
  const [endDate, setEndDate] = useState(() => dateKey(addDays(new Date(), DEFAULT_WEEKS * 7)));
  const [mode, setMode] = useState<ScheduleMode>("weekly");
  const [weekly, setWeekly] = useState<Record<number, string>>({});
  const [rotationOrder, setRotationOrder] = useState<string[]>([]);
  const [restWeekdays, setRestWeekdays] = useState<number[]>([]);
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  // Own selection, not Home's global `selectedMuscleId` — this previews a
  // possibly-future day, so picking a muscle here must not also change what
  // Home highlights for today.
  const [dayMuscleId, setDayMuscleId] = useState<MuscleId>();
  // Removed days hide at once and commit after the Undo bar.
  const removal = usePendingRemoval();

  // Seed the form from a saved config once, after the store hydrates.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || !scheduleConfig) {
      return;
    }
    seeded.current = true;
    setStartDate(scheduleConfig.startDate);
    setEndDate(scheduleConfig.endDate);
    setMode(scheduleConfig.mode);
    setWeekly(scheduleConfig.weekly);
    setRotationOrder(scheduleConfig.rotationOrder);
    setRestWeekdays(scheduleConfig.restWeekdays);
  }, [scheduleConfig]);

  const weekDates = buildWeekDates(weekOffset);
  const today = todayKey();
  const shownSessions = useMemo(
    () => scheduledSessions.filter((session) => !removal.hidden.has(session.id)),
    [scheduledSessions, removal.hidden]
  );
  const sessionsForDay = shownSessions.filter((session) => session.date === selectedDate);
  // An injury's workout runs beside the plan. A day lists it, but it does not make
  // a rest day look like a training day, and it is not offered as a plan workout.
  const ownWorkouts = useMemo(() => injuryWorkoutIds(injuries), [injuries]);
  const planTemplates = sessionTemplates.filter((template) => !ownWorkouts.has(template.id));
  // A past day is history: what you did (or skipped) stays as it was. Adding,
  // moving or removing there would rewrite the record the charts read from.
  const isPastDay = selectedDate < today;
  const selectedDay = weekDates.find((item) => item.key === selectedDate) ?? weekDates[0];

  const dayWorkoutIds = useMemo(
    () =>
      sessionsForDay
        .filter((session) => session.type === "workout" && !isInjurySession(session, ownWorkouts))
        .flatMap((session) => session.exercises.map((exercise) => exercise.workoutId)),
    [ownWorkouts, sessionsForDay]
  );
  const dayHighlights = useMemo(
    () => buildMuscleHighlightsFromWorkoutIds(dayWorkoutIds, templates),
    [dayWorkoutIds, templates]
  );
  const dayMuscle = muscles.find((muscle) => muscle.id === dayMuscleId);

  // Keep the selected day inside the visible week, landing on today whenever
  // that week contains it so stepping away and back returns where you started.
  const changeWeek = (offset: number) => {
    const dates = buildWeekDates(offset);
    setWeekOffset(offset);
    setSelectedDate(dates.some((item) => item.key === today) ? today : dates[0].key);
    setConfirmation(null);
  };

  const addSessionToDay = (templateId: string) => {
    const template = sessionTemplates.find((item) => item.id === templateId);
    if (!template) {
      return;
    }
    scheduleSession({
      date: selectedDate,
      sessionTemplateId: template.id,
      sessionName: template.name,
      exercises: buildExercises(template)
    });
    setConfirmation(null);
    setAdding(false);
  };

  const closeChange = () => {
    setSessionToChange(null);
    setMoveTo("");
    setMoveError(null);
  };

  const dotFor = (key: string) => {
    const forDay = shownSessions.filter((session) => session.date === key && !isInjurySession(session, ownWorkouts));
    return forDay.find((session) => session.type === "workout") ?? forDay[0];
  };

  const setWeekdayAssignment = (day: number, value: string) => {
    setWeekly((current) => {
      const next = { ...current };
      delete next[day];
      if (value && value !== "rest") {
        next[day] = value;
      }
      return next;
    });
    setRestWeekdays((current) =>
      value === "rest" ? [...new Set([...current, day])] : current.filter((item) => item !== day)
    );
    setConfirmation(null);
  };

  const toggleRotation = (id: string) => {
    setRotationOrder((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
    setConfirmation(null);
  };

  const toggleRestWeekday = (day: number) => {
    setRestWeekdays((current) =>
      current.includes(day) ? current.filter((item) => item !== day) : [...current, day]
    );
    setConfirmation(null);
  };

  const rotationEffective = rotationOrder.length ? rotationOrder : sessionTemplates.map((item) => item.id);
  const hasWorkouts = mode === "weekly" ? Object.keys(weekly).length > 0 : rotationEffective.length > 0;
  const validRange = Boolean(startDate) && Boolean(endDate) && startDate <= endDate;
  const canGenerate = hasWorkouts && validRange;

  // A disabled button with no stated reason is a dead end — say which of the
  // two conditions is missing, in place of the generic helper line.
  const blockedReason = !hasWorkouts
    ? mode === "weekly"
      ? "Put a workout on a weekday first."
      : "Add a workout to the rotation first."
    : !startDate || !endDate
      ? "Set a start and an end date."
      : !validRange
        ? "The end date is before the start date."
        : null;

  // Only days the new plan actually covers get replaced — planned days outside
  // [startDate, endDate] are left alone, so they must not be counted here.
  const plannedCount = scheduledSessions.filter(
    (session) =>
      session.status === "planned" && session.date >= startDate && session.date <= endDate
  ).length;
  const keptCount = scheduledSessions.filter((session) => session.status !== "planned").length;

  const handleGenerate = () => {
    setConfirmGenerate(false);
    if (!canGenerate) {
      return;
    }
    setEditOpen(false);
    const config: ScheduleConfig = {
      startDate,
      endDate,
      mode,
      weekly: mode === "weekly" ? weekly : {},
      rotationOrder: mode === "rotation" ? rotationEffective : [],
      restWeekdays
    };
    const workouts = buildScheduleSessions(config, sessionTemplates, () => []).filter(
      (session) => session.type === "workout"
    ).length;
    generateSchedule(config);
    setConfirmation(
      `Added ${workouts} workout${workouts === 1 ? "" : "s"} until ${formatDayKey(endDate)}.`
    );
  };

  // Nothing regenerates the schedule, so this is the only thing between the user
  // and a calendar that empties mid-week without explanation.
  const daysLeft = daysOfScheduleLeft(scheduleConfig, todayKey());
  const horizonRunningOut = Boolean(scheduleConfig) && daysLeft <= HORIZON_WARNING_DAYS;

  const extendHorizon = () => {
    if (!scheduleConfig) {
      return;
    }
    // From today, not from the old end date — an already-expired schedule should
    // come back covering now, not covering the fortnight you missed.
    const from = scheduleConfig.endDate > todayKey() ? scheduleConfig.endDate : todayKey();
    const next = dateKey(addDays(new Date(`${from}T00:00:00`), DEFAULT_WEEKS * 7));

    setEndDate(next);
    generateSchedule({ ...scheduleConfig, endDate: next });
    setConfirmation(`Schedule extended to ${formatDayKey(next)}.`);
  };

  if (sessionTemplates.length === 0) {
    return (
      <div className="px-1 pt-3">
        <h2 className="font-heading text-[34px] leading-[1.08]">Nothing to schedule yet</h2>
        <p className="mt-2.5 text-[15px] text-muted-foreground">Build a workout first. Then plan your weeks here.</p>
        <Button className="mt-5 w-full" size="lg" onClick={onGoBuild}>
          Go to Build
        </Button>
      </div>
    );
  }

  const upcoming = shownSessions.filter((session) => session.date >= today && !isInjurySession(session, ownWorkouts));
  // Once each: a daily one would otherwise fill the list with the same row.
  const runningWorkouts = activeInjuries(injuries).flatMap((injury) => {
    const workout = injury.workout;
    const template = workout && sessionTemplates.find((item) => item.id === workout.sessionTemplateId);
    return workout && template && workout.endDate >= today ? [{ name: template.name, workout }] : [];
  });

  return (
    <div className="space-y-5">
      {horizonRunningOut ? (
        <div className="notice-line">
          <p className="min-w-0 flex-1">
            {daysLeft === 0
              ? "Your schedule has ended."
              : `Your schedule ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}.`}
          </p>
          <button
            type="button"
            onClick={extendHorizon}
            className="h-11 shrink-0 rounded-full px-2.5 font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Add {DEFAULT_WEEKS} weeks
          </button>
        </div>
      ) : null}

      <section data-tour="plan-week">
        <div className="flex items-center justify-between gap-2 pl-1">
          <h2 className="min-w-0 truncate font-heading text-[30px] leading-tight">
            {MONTH.format(selectedDay.date)}
            <span className="ml-2 font-sans text-[13.5px] tracking-normal text-muted-foreground">{weekLabel(weekOffset)}</span>
          </h2>
          <div className="flex shrink-0 items-center">
            {weekOffset !== 0 ? (
              <button
                type="button"
                className="flex h-11 items-center rounded-full px-3 text-[13.5px] font-semibold active:bg-hi"
                onClick={() => changeWeek(0)}
              >
                Today
              </button>
            ) : null}
            <button
              type="button"
              aria-label="Previous week"
              className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground active:bg-hi"
              onClick={() => changeWeek(weekOffset - 1)}
            >
              <ChevronLeft className="h-5 w-5" strokeWidth={1.8} />
            </button>
            <button
              type="button"
              aria-label="Next week"
              className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground active:bg-hi"
              onClick={() => changeWeek(weekOffset + 1)}
            >
              <ChevronRight className="h-5 w-5" strokeWidth={1.8} />
            </button>
          </div>
        </div>

        {/* Seven days and no boxes: the chosen day is the only one with a shape.
            The name of a day's session is read off the surface below, because at
            48px a column it truncated to "Up…". One dot says what the day is:
            bright for a workout, faint for rest, warm once it is done. */}
        <div className="mt-2.5 grid grid-cols-7 gap-0.5">
          {weekDates.map((item) => {
            const session = dotFor(item.key);
            const isSelected = item.key === selectedDate;
            const isToday = item.key === today;
            return (
              <button
                key={item.key}
                type="button"
                aria-current={isSelected ? "date" : undefined}
                aria-label={`${item.dayLabel} ${item.dayNumber}${session ? `, ${session.type === "rest" ? "rest" : session.sessionName}${session.status === "completed" ? ", done" : ""}` : ""}`}
                onClick={() => setSelectedDate(item.key)}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-2xl pb-2 pt-2 transition-colors",
                  isSelected && "bg-hi"
                )}
              >
                <span className={cn("text-[11.5px] font-medium", isToday ? "text-brand" : "text-muted-foreground")}>
                  {item.dayLabel}
                </span>
                <span className={cn("text-[18px] font-semibold leading-none tabular-nums", isToday && "text-brand")}>
                  {item.dayNumber}
                </span>
                <span
                  aria-hidden
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    !session
                      ? "bg-transparent"
                      : session.status === "completed"
                        ? "bg-[var(--l2)]"
                        : session.type === "rest"
                          ? "bg-track"
                          : "bg-foreground/75"
                  )}
                />
              </button>
            );
          })}
        </div>
      </section>

      <ListGroup title={`${selectedDate === today ? "Today · " : ""}${selectedDay.dayLabel} ${selectedDay.dayNumber}`}>
        {sessionsForDay.map((session) => (
          <SessionPreview
            key={session.id}
            session={session}
            // Only a session still ahead of you can move or go. A finished one
            // owns logged sets; one under way is the workout you are in; a past
            // day is history.
            action={
              session.status === "completed" ? (
                <span className="flex h-10 items-center gap-1 text-[13.5px] font-medium">
                  <Check className="h-4 w-4 text-[var(--l2)]" strokeWidth={2.4} aria-hidden />
                  Done
                </span>
              ) : session.status === "active" ? (
                <span className="flex h-10 items-center text-[13.5px] font-medium text-brand">In progress</span>
              ) : isPastDay ? null : (
                <button
                  type="button"
                  aria-label={`Move or remove ${session.sessionName}`}
                  className="key-quiet h-11 rounded-full px-4 text-[13.5px] font-semibold"
                  onClick={() => setSessionToChange(session)}
                >
                  Move
                </button>
              )
            }
          />
        ))}
        {sessionsForDay.length === 0 ? (
          <p className="list-row flex min-h-[54px] items-center pl-4 pr-3.5 text-[15px] text-muted-foreground">
            No workouts this day.
          </p>
        ) : null}
        {isPastDay ? null : <ListRow icon={Plus} label="Add workout" noChevron onClick={() => setAdding(true)} />}
      </ListGroup>

      {isPastDay ? <p className="-mt-3 px-1 text-[13px] text-muted-foreground">Past days stay as your history.</p> : null}

      {confirmation ? (
        <p className="-mt-2 flex items-center gap-1.5 px-1 text-[13.5px]" role="status">
          <Check className="h-4 w-4 shrink-0 text-[var(--l2)]" strokeWidth={2.4} aria-hidden />
          {confirmation}
        </p>
      ) : null}

      {/* The first thing to do with a workout, until it is done. After that the
          form is a row at the foot of the page. */}
      {scheduleConfig ? null : (
        <Button className="w-full" size="lg" onClick={() => setEditOpen(true)}>
          Set up schedule
        </Button>
      )}

      {dayWorkoutIds.length > 0 ? (
        <MuscleMapCard
          title="Muscles worked"
          description={`From the workouts on ${selectedDay.dayLabel} ${selectedDay.dayNumber}.`}
          highlights={dayHighlights}
          selectedMuscleId={dayMuscleId}
          selectedMuscleName={dayMuscle?.name}
          selectedMuscleDescription={dayMuscle?.description}
          onSelectMuscle={(muscleId) => setDayMuscleId(muscleId as MuscleId | undefined)}
        />
      ) : null}

      {upcoming.length + runningWorkouts.length > 0 ? (
        <ListGroup
          title="Upcoming"
          aside={upcoming.length > UPCOMING_ROWS ? `Next ${UPCOMING_ROWS} of ${upcoming.length}` : undefined}
        >
          {runningWorkouts.map(({ name, workout }) => (
            <ListRow key={workout.sessionTemplateId} label={name} value={injuryWorkoutLine(workout)} />
          ))}
          {upcoming.slice(0, UPCOMING_ROWS).map((session) => (
            <ListRow
              key={session.id}
              label={
                session.type === "rest" ? (
                  <span className="text-muted-foreground">{session.sessionName}</span>
                ) : (
                  session.sessionName
                )
              }
              // "Planned" would be on every row, so it says nothing. Only the
              // exceptions are named.
              hint={session.status === "completed" ? "Done" : session.status === "active" ? "In progress" : undefined}
              value={`${WEEKDAY.format(new Date(`${session.date}T00:00:00`))}, ${formatDayKey(session.date)}`}
            />
          ))}
        </ListGroup>
      ) : null}

      {scheduleConfig ? (
        <ListGroup>
          <ListRow
            icon={SlidersHorizontal}
            label="Edit schedule"
            hint={`${scheduleConfig.mode === "rotation" ? "Rotation" : "Weekly"} · until ${formatDayKey(scheduleConfig.endDate)}`}
            onClick={() => setEditOpen(true)}
          />
        </ListGroup>
      ) : null}

      <ListSheet
        open={adding}
        onOpenChange={setAdding}
        title="Add workout"
        description={`To ${selectedDay.dayLabel} ${selectedDay.dayNumber}.`}
      >
        <SheetRows>
          {sessionTemplates.map((template) => {
            // The store refuses a second one of the same name on a day.
            const onDay = scheduledSessions.some(
              (session) => session.date === selectedDate && session.sessionName === template.name
            );
            return (
              <ListRow
                key={template.id}
                label={template.name}
                hint={`${template.exercises.length} exercise${template.exercises.length === 1 ? "" : "s"} · ${template.summary.totalSets} set${template.summary.totalSets === 1 ? "" : "s"}`}
                value={onDay ? "On this day" : undefined}
                disabled={onDay}
                noChevron
                onClick={() => addSessionToDay(template.id)}
              />
            );
          })}
        </SheetRows>
      </ListSheet>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className={`${DRAWER_CONTENT} max-h-[88dvh] overflow-y-auto`}>
          <DialogHeader>
            <DialogTitle>Your schedule</DialogTitle>
            <DialogDescription>
              Choose dates, then weekdays or a rotation.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Stacked, not side-by-side: iOS Safari renders type="date" as full
                text ("7 Oct 2026") and won't shrink it to fit a half-width column
                no matter what min-width the wrapper gets. */}
            <div className="space-y-3">
              <label className="block text-xs font-medium text-muted-foreground">
                Start
                <Input
                  type="date"
                  value={startDate}
                  onChange={(event) => {
                    setStartDate(event.target.value);
                    setConfirmation(null);
                  }}
                  className="mt-1"
                />
              </label>
              <label className="block text-xs font-medium text-muted-foreground">
                End
                <Input
                  type="date"
                  value={endDate}
                  min={startDate}
                  // The generator fills at most 400 days; past that the
                  // calendar went empty while "days left" counted on.
                  max={startDate ? maxScheduleEnd(startDate) : undefined}
                  onChange={(event) => {
                    setEndDate(event.target.value);
                    setConfirmation(null);
                  }}
                  className="mt-1"
                />
              </label>
            </div>

            <Segmented
              aria-label="Schedule kind"
              options={[
                { id: "weekly", label: "Weekly" },
                { id: "rotation", label: "Rotation" }
              ]}
              value={mode}
              onChange={(item) => {
                setMode(item);
                setConfirmation(null);
              }}
            />

            {mode === "weekly" ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Choose a workout for each day.</p>
                {WEEKDAY_LABELS.map((label, day) => (
                  <div key={label} className="flex items-center gap-3">
                    <span className="w-10 shrink-0 text-sm font-medium text-muted-foreground" aria-hidden="true">
                      {label}
                    </span>
                    <ThemedSelect
                      aria-label={`Workout for ${label}`}
                      value={restWeekdays.includes(day) ? "rest" : weekly[day] ?? ""}
                      onValueChange={(next) => setWeekdayAssignment(day, next)}
                      options={[
                        { value: "", label: "Off" },
                        { value: "rest", label: "Rest day" },
                        ...planTemplates.map((template) => ({
                          value: template.id,
                          label: template.name
                        }))
                      ]}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Workouts repeat in this order, 1 each day.
                </p>
                {rotationOrder.length > 0 ? (
                  <SheetRows>
                    {rotationOrder.map((id, index) => {
                      const template = sessionTemplates.find((item) => item.id === id);
                      // A rest slot (from an AI plan's 3-on-1-off split) has no template.
                      if (!template && id !== REST_SLOT) {
                        return null;
                      }
                      const name = template?.name ?? "Rest";
                      return (
                        <div key={id} className="list-row flex min-h-[54px] items-center gap-3 pl-4 pr-1.5">
                          <span className="w-4 shrink-0 text-[13.5px] text-muted-foreground tabular-nums">{index + 1}</span>
                          <span className="min-w-0 flex-1 truncate text-[15.5px] font-medium">{name}</span>
                          <button
                            type="button"
                            aria-label={`Remove ${name}`}
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground active:bg-hi"
                            onClick={() => toggleRotation(id)}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      );
                    })}
                  </SheetRows>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    All workouts repeat in their current order.
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {sessionTemplates
                    .filter((template) => !rotationOrder.includes(template.id))
                    .map((template) => (
                      <button
                        key={template.id}
                        type="button"
                        onClick={() => toggleRotation(template.id)}
                        className="key-quiet flex h-11 items-center gap-1 rounded-full pl-3 pr-3.5 text-sm font-semibold"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        {template.name}
                      </button>
                    ))}
                </div>

                <div>
                  <p className="mb-2 text-xs text-muted-foreground">Rest days</p>
                  <div className="flex flex-wrap gap-2">
                    {WEEKDAY_LABELS.map((label, day) => (
                      <button
                        key={`rest-${label}`}
                        type="button"
                        aria-pressed={restWeekdays.includes(day)}
                        onClick={() => toggleRestWeekday(day)}
                        className={cn(
                          "h-11 rounded-full px-3.5 text-xs font-semibold",
                          restWeekdays.includes(day) ? "key" : "key-quiet text-muted-foreground"
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className={SHEET_FOOT}>
              <Button
                className="w-full"
                size="lg"
                onClick={() => (plannedCount > 0 ? setConfirmGenerate(true) : handleGenerate())}
                disabled={!canGenerate}
              >
                Generate schedule
              </Button>
              <p className={`mt-2 text-center text-xs ${blockedReason ? "text-warning" : "text-muted-foreground"}`}>
                {blockedReason ?? "Replaces planned days only."}
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!sessionToChange}
        onOpenChange={(open) => {
          if (!open) {
            closeChange();
          }
        }}
      >
        <DialogContent className={DRAWER_CONTENT}>
          <DialogHeader className="pr-9">
            <DialogTitle>Move {sessionToChange?.sessionName}</DialogTitle>
            <DialogDescription>
              It is on {sessionToChange ? formatDayKey(sessionToChange.date) : ""}.
            </DialogDescription>
          </DialogHeader>

          {/* Moving is the common edit — sick, travelling, gym shut — and until
              now the only thing on offer was losing the session entirely. Native
              date input: it is a date picker on every phone, with no library. */}
          <InfoNote
            heading={<p className="text-xs font-medium text-muted-foreground">Move to</p>}
            note={
              <>
                <p>The old day becomes a rest day.</p>
                <p>If the new day has a workout, the 2 days swap.</p>
                <p>The workout in Build does not change.</p>
              </>
            }
          />
          <Input
            type="date"
            aria-label="Move to"
            value={moveTo}
            min={today}
            onChange={(event) => {
              setMoveTo(event.target.value);
              setMoveError(null);
            }}
          />
          <Button
            className="mt-3 w-full"
            disabled={!moveTo}
            onClick={() => {
              if (!sessionToChange || !moveTo) {
                return;
              }
              const result = moveScheduledSession(sessionToChange.id, moveTo);
              if (result.ok) {
                closeChange();
              } else {
                setMoveError(result.reason);
              }
            }}
          >
            Move workout
          </Button>
          {moveError ? <p className="mt-2 text-sm text-danger">{moveError}</p> : null}

          {/* The rare one: quiet, under the common one, and it can be undone. */}
          <button
            type="button"
            className="mt-2 h-11 w-full rounded-full text-sm font-medium text-danger active:bg-hi"
            onClick={() => {
              if (sessionToChange) {
                const { id, sessionName } = sessionToChange;
                removal.remove(id, `${sessionName} removed`, () => removeScheduledSession(id));
                closeChange();
              }
            }}
          >
            Remove from schedule
          </button>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmGenerate} onOpenChange={setConfirmGenerate}>
        <DialogContent className={DRAWER_CONTENT}>
          <DialogHeader className="pr-9">
            <DialogTitle>Replace your schedule?</DialogTitle>
            <DialogDescription>
              {plannedCount} planned day{plannedCount === 1 ? "" : "s"} change.
              {keptCount > 0 ? " Started and finished workouts stay." : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setConfirmGenerate(false)}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={handleGenerate}>
              Replace
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

"use client";

import { CalendarDays, Check, ChevronLeft, ChevronRight, Plus, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DRAWER_CONTENT
} from "@/components/ui/dialog";
import { InfoNote } from "@/components/ui/info-note";
import { Input } from "@/components/ui/input";
import { ThemedSelect } from "@/components/ui/select";
import { SessionPreview } from "@/features/planner/session-preview";
import { MuscleMapCard } from "@/features/home/muscle-map-card";
import { useExercisesFromSessionTemplate, useWorkoutStore } from "@/features/workout/workout-store";
import { formatDayKey } from "@/lib/progress-metrics";
import { REST_SLOT, buildScheduleSessions, daysOfScheduleLeft, maxScheduleEnd } from "@/lib/schedule";
import { muscles } from "@/lib/seed-data";
import type { MuscleId, ScheduleConfig, ScheduleMode, ScheduledSession } from "@/lib/types";
import { addDays, buildWeekDates, dateKey, todayKey } from "@/lib/utils";
import { buildMuscleHighlightsFromWorkoutIds } from "@/lib/workout-helpers";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DEFAULT_WEEKS = 8;
// Two weeks' notice: long enough to act on, short enough not to nag from week
// three of eight.
const HORIZON_WARNING_DAYS = 14;

// `planned` / `completed` are the store's names for these, not the user's.
const STATUS_LABELS: Record<string, string> = {
  planned: "Planned",
  active: "In progress",
  completed: "Done"
};

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
  const scheduleConfig = useWorkoutStore((state) => state.scheduleConfig);
  const generateSchedule = useWorkoutStore((state) => state.generateSchedule);
  const removeScheduledSession = useWorkoutStore((state) => state.removeScheduledSession);
  const moveScheduledSession = useWorkoutStore((state) => state.moveScheduledSession);
  const scheduleSession = useWorkoutStore((state) => state.scheduleSession);
  const buildExercises = useExercisesFromSessionTemplate();
  const templates = useWorkoutStore((state) => state.templates);

  const [weekOffset, setWeekOffset] = useState(0);
  const [sessionToRemove, setSessionToRemove] = useState<ScheduledSession | null>(null);
  const [moveTo, setMoveTo] = useState("");
  const [moveError, setMoveError] = useState<string | null>(null);
  const [confirmGenerate, setConfirmGenerate] = useState(false);
  // The schedule form lives behind one key. The week is what you look at;
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
  // The session chips wait behind one button: a day is for reading what is on
  // it, and a row of "+ Upper · Pump" keys under it read as more of the plan.
  const [adding, setAdding] = useState(false);
  // Own selection, not Home's global `selectedMuscleId` — this previews a
  // possibly-future day, so picking a muscle here must not also change what
  // Home highlights for today.
  const [dayMuscleId, setDayMuscleId] = useState<MuscleId>();

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
  const sessionsForDay = scheduledSessions.filter((session) => session.date === selectedDate);
  // A past day is history: what you did (or skipped) stays as it was. Adding,
  // moving or removing there would rewrite the record the charts read from.
  const isPastDay = selectedDate < today;
  const selectedDay = weekDates.find((item) => item.key === selectedDate) ?? weekDates[0];

  const dayWorkoutIds = useMemo(
    () =>
      sessionsForDay
        .filter((session) => session.type === "workout")
        .flatMap((session) => session.exercises.map((exercise) => exercise.workoutId)),
    [sessionsForDay]
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
    setAdding(false);
  };

  const addSessionToDay = (templateId: string) => {
    const template = sessionTemplates.find((item) => item.id === templateId);
    if (!template) {
      return;
    }
    // scheduleSession dedupes on date + name, so a repeat add is a silent
    // no-op — say so instead of looking broken.
    if (sessionsForDay.some((session) => session.sessionName === template.name)) {
      setConfirmation(`${template.name} is already on this day.`);
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

  const pillFor = (key: string) => {
    const forDay = scheduledSessions.filter((session) => session.date === key);
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
      <Card>
        <CardContent className="space-y-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">
            Build a workout first. Then plan your weeks here.
          </p>
          <Button onClick={onGoBuild}>Go to Build</Button>
        </CardContent>
      </Card>
    );
  }

  const upcoming = scheduledSessions.filter((session) => session.date >= today);

  return (
    <div className="space-y-4">
      {horizonRunningOut ? (
        <div className="rounded-xl bg-warning/10 p-4 ring-1 ring-warning/25">
          <div className="flex items-start gap-3">
            <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">
                {daysLeft === 0
                  ? "Your schedule has ended"
                  : `Your schedule ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {daysLeft === 0
                  ? "The calendar is empty after today."
                  : "After that, the calendar is empty."}
              </p>
              <Button variant="secondary" className="mt-3 w-full" onClick={extendHorizon}>
                Add {DEFAULT_WEEKS} weeks
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <Card data-tour="plan-week">
        <div className="flex items-center justify-between gap-2">
          <h3 className="min-w-0 truncate font-display text-[22px] font-extrabold leading-none tracking-tight">
            {selectedDay.monthLabel}
            <span className="text-muted-foreground"> · {weekLabel(weekOffset)}</span>
          </h3>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              aria-label="Previous week"
              className="key-quiet flex h-10 w-10 items-center justify-center rounded-full"
              onClick={() => changeWeek(weekOffset - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            {weekOffset !== 0 ? (
              <button
                type="button"
                className="key-quiet flex h-10 items-center justify-center rounded-full px-3 text-xs font-semibold"
                onClick={() => changeWeek(0)}
              >
                Today
              </button>
            ) : null}
            <button
              type="button"
              aria-label="Next week"
              className="key-quiet flex h-10 w-10 items-center justify-center rounded-full"
              onClick={() => changeWeek(weekOffset + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Seven keys. The name of the day's session is not squeezed in here —
            at 44px a column it truncated to "Up…" — it is read off the list
            under the strip. The key carries the day, the number, and one bar:
            orange for a workout, quiet for rest, nothing for an empty day. */}
        <div className="mt-4 grid grid-cols-7 gap-1.5">
          {weekDates.map((item) => {
            const pill = pillFor(item.key);
            const isSelected = item.key === selectedDate;
            const isToday = item.key === today;
            return (
              <button
                key={item.key}
                type="button"
                aria-current={isSelected ? "date" : undefined}
                aria-label={`${item.dayLabel} ${item.dayNumber}${pill ? `, ${pill.type === "rest" ? "rest" : pill.sessionName}` : ""}`}
                onClick={() => {
                  setSelectedDate(item.key);
                  setAdding(false);
                }}
                className={`flex flex-col items-center gap-1.5 rounded-lg px-0.5 pb-2 pt-2 transition-colors ${
                  isSelected ? "key-quiet ring-2 ring-brand" : "well"
                }`}
              >
                <span
                  className={`text-[10px] font-semibold ${
                    isToday ? "text-brand" : "text-muted-foreground"
                  }`}
                >
                  {item.dayLabel}
                </span>
                <span className="font-display text-lg font-extrabold leading-none tracking-tight">
                  {item.dayNumber}
                </span>
                <span
                  aria-hidden
                  className={`h-1.5 w-6 rounded-full ${
                    !pill
                      ? "bg-transparent"
                      : pill.type === "rest"
                        ? "bg-muted-foreground/40"
                        : "bg-primary"
                  }`}
                />
              </button>
            );
          })}
        </div>

        <div className="mt-4">
          <p className="mb-2 text-sm font-semibold">
            {selectedDay.dayLabel} {selectedDay.dayNumber}
          </p>
          {sessionsForDay.length > 0 ? (
            <div className="space-y-2">
              {sessionsForDay.map((session) => (
                <div key={session.id} className="rounded-lg bg-muted py-1.5 pl-4 pr-1.5">
                  <div className="flex min-h-10 items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${
                          session.type === "rest" ? "bg-muted-foreground/50" : "bg-primary"
                        }`}
                      />
                      <span className="truncate text-sm font-semibold">{session.sessionName}</span>
                    </div>
                    {/* Only a session still ahead of you can move or go. A
                        finished one owns logged sets; one under way is the
                        workout you are in; a past day is history. */}
                    {session.status === "completed" ? (
                      <span className="shrink-0 pr-2.5 text-xs font-semibold text-success">Done</span>
                    ) : session.status === "active" ? (
                      <span className="shrink-0 pr-2.5 text-xs font-semibold text-brand">In progress</span>
                    ) : isPastDay ? null : (
                      <button
                        type="button"
                        aria-label={`Move or remove ${session.sessionName}`}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground active:bg-secondary"
                        onClick={() => setSessionToRemove(session)}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  {/* What the day asks, so you can get ready for it. */}
                  {session.type === "workout" ? <SessionPreview session={session} /> : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No workouts this day.</p>
          )}

          {/* Buttons, not a <select>: this performs an action, it does not pick
              a value — the select's own first option was a no-op instruction. */}
          {isPastDay ? (
            <p className="mt-3 text-xs text-muted-foreground">Past days stay as your history.</p>
          ) : adding ? (
            <div className="mt-3">
              <p className="mb-2 text-xs text-muted-foreground">
                Add to {selectedDay.dayLabel} {selectedDay.dayNumber}
              </p>
              <div className="flex flex-wrap gap-2">
                {sessionTemplates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => addSessionToDay(template.id)}
                    className="key-quiet flex h-10 items-center gap-1 rounded-full pl-3 pr-3.5 text-sm font-semibold"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {template.name}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setAdding(false);
                    setConfirmation(null);
                  }}
                  className="flex h-10 items-center rounded-full px-3.5 text-sm font-semibold text-muted-foreground"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : sessionTemplates.length > 0 ? (
            <Button variant="ghost" className="mt-2 w-full" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" />
              Add workout
            </Button>
          ) : null}
          {confirmation ? (
            <p className="mt-3 flex items-center gap-1.5 text-sm text-success">
              <Check className="h-4 w-4" />
              {confirmation}
            </p>
          ) : null}
        </div>
      </Card>

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

      {/* The whole generator behind one key. It used to sit open under the
          calendar on every visit — nine controls you touch twice a season. */}
      <Button variant="secondary" size="lg" className="w-full" onClick={() => setEditOpen(true)}>
        <SlidersHorizontal className="h-4 w-4" />
        {scheduleConfig ? "Edit schedule" : "Set up schedule"}
      </Button>

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
              <label className="text-xs font-medium text-muted-foreground">
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
              <label className="text-xs font-medium text-muted-foreground">
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

            <div className="well grid grid-cols-2 gap-1 rounded-xl p-1">
              {(["weekly", "rotation"] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={mode === item}
                  onClick={() => {
                    setMode(item);
                    setConfirmation(null);
                  }}
                  className={`h-11 rounded-lg text-sm font-semibold transition-colors ${
                    mode === item ? "key" : "text-muted-foreground"
                  }`}
                >
                  {item === "weekly" ? "Weekly" : "Rotation"}
                </button>
              ))}
            </div>

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
                        ...sessionTemplates.map((template) => ({
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
                  <div className="space-y-2">
                    {rotationOrder.map((id, index) => {
                      const template = sessionTemplates.find((item) => item.id === id);
                      // A rest slot (from an AI plan's 3-on-1-off split) has no template.
                      if (!template && id !== REST_SLOT) {
                        return null;
                      }
                      const name = template?.name ?? "Rest";
                      return (
                        <div
                          key={id}
                          className="flex items-center justify-between gap-3 rounded-lg bg-muted py-1.5 pl-3 pr-1.5"
                        >
                          <span className="flex items-center gap-2.5 text-sm font-semibold">
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand/15 text-xs font-bold text-brand">
                              {index + 1}
                            </span>
                            {name}
                          </span>
                          <button
                            type="button"
                            aria-label={`Remove ${name}`}
                            className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground active:bg-secondary"
                            onClick={() => toggleRotation(id)}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
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
                        className="key-quiet flex h-10 items-center gap-1 rounded-full pl-3 pr-3.5 text-sm font-semibold"
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
                        className={`h-10 rounded-full px-3.5 text-xs font-semibold transition-colors ${
                          restWeekdays.includes(day) ? "bg-accent/15 text-accent ring-1 ring-accent/40" : "key-quiet text-muted-foreground"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="sticky bottom-0 border-t border-border bg-card pt-3">
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

      {upcoming.length > 0 ? (
        <Card>
          <div className="flex items-baseline justify-between">
            <CardTitle>Upcoming</CardTitle>
            <span className="text-xs text-muted-foreground tabular-nums">Next 10 of {upcoming.length}</span>
          </div>
          <CardContent className="mt-3 space-y-2">
            {upcoming.slice(0, 10).map((session) => (
              <div
                key={session.id}
                className="flex items-center justify-between gap-3 rounded-lg bg-muted px-4 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{session.sessionName}</p>
                  <p className="text-xs text-muted-foreground">{formatDayKey(session.date)}</p>
                </div>
                <Badge
                  variant={
                    session.type === "rest"
                      ? "secondary"
                      : session.status === "completed"
                        ? "success"
                        : session.status === "active"
                          ? "warning"
                          : "default"
                  }
                >
                  {session.type === "rest" ? "Rest" : STATUS_LABELS[session.status] ?? session.status}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Dialog
        open={!!sessionToRemove}
        onOpenChange={(open) => {
          if (!open) {
            setSessionToRemove(null);
            setMoveTo("");
            setMoveError(null);
          }
        }}
      >
        <DialogContent className={DRAWER_CONTENT}>
          <DialogHeader>
            <DialogTitle>Move or remove workout?</DialogTitle>
            <DialogDescription>
              &quot;{sessionToRemove?.sessionName}&quot; is on{" "}
              {sessionToRemove ? formatDayKey(sessionToRemove.date) : ""}.
            </DialogDescription>
          </DialogHeader>

          {/* Moving is the common edit — sick, travelling, gym shut — and until
              now the only thing on offer was losing the session entirely. Native
              date input: it is a date picker on every phone, with no library. */}
          <div className="mt-4 rounded-xl bg-muted p-3">
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
                className="mt-1"
                value={moveTo}
                min={today}
                onChange={(event) => {
                  setMoveTo(event.target.value);
                  setMoveError(null);
                }}
              />
            <Button
              className="mt-2 w-full"
              disabled={!moveTo}
              onClick={() => {
                if (!sessionToRemove || !moveTo) {
                  return;
                }
                const result = moveScheduledSession(sessionToRemove.id, moveTo);
                if (result.ok) {
                  setSessionToRemove(null);
                  setMoveTo("");
                  setMoveError(null);
                } else {
                  setMoveError(result.reason);
                }
              }}
            >
              Move workout
            </Button>
            {moveError ? <p className="mt-2 text-sm text-danger">{moveError}</p> : null}
          </div>

          <div className="mt-4 flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setSessionToRemove(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (sessionToRemove) {
                  removeScheduledSession(sessionToRemove.id);
                  setSessionToRemove(null);
                }
              }}
            >
              Remove
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmGenerate} onOpenChange={setConfirmGenerate}>
        <DialogContent className={DRAWER_CONTENT}>
          <DialogHeader>
            <DialogTitle>Replace your schedule?</DialogTitle>
            <DialogDescription>
              {plannedCount} planned day{plannedCount === 1 ? "" : "s"} change.
              {keptCount > 0 ? " Started and finished workouts stay." : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setConfirmGenerate(false)}>
              Cancel
            </Button>
            <Button onClick={handleGenerate}>Replace</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

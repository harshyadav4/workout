"use client";

import { CalendarDays, Check, ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

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
import { Input } from "@/components/ui/input";
import { buildExercisesFromSessionTemplate, useWorkoutStore } from "@/features/workout/workout-store";
import { formatDayKey } from "@/lib/progress-metrics";
import { buildScheduleSessions } from "@/lib/schedule";
import type { ScheduleConfig, ScheduleMode, ScheduledSession } from "@/lib/types";
import { addDays, buildWeekDates, dateKey, todayKey } from "@/lib/utils";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DEFAULT_WEEKS = 8;

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
  const scheduleSession = useWorkoutStore((state) => state.scheduleSession);

  const [weekOffset, setWeekOffset] = useState(0);
  const [sessionToRemove, setSessionToRemove] = useState<ScheduledSession | null>(null);
  const [confirmGenerate, setConfirmGenerate] = useState(false);
  const [startDate, setStartDate] = useState(todayKey);
  const [endDate, setEndDate] = useState(() => dateKey(addDays(new Date(), DEFAULT_WEEKS * 7)));
  const [mode, setMode] = useState<ScheduleMode>("weekly");
  const [weekly, setWeekly] = useState<Record<number, string>>({});
  const [rotationOrder, setRotationOrder] = useState<string[]>([]);
  const [restWeekdays, setRestWeekdays] = useState<number[]>([]);
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [confirmation, setConfirmation] = useState<string | null>(null);

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
  const selectedDay = weekDates.find((item) => item.key === selectedDate) ?? weekDates[0];

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
    // scheduleSession dedupes on date + name, so a repeat add is a silent
    // no-op — say so instead of looking broken.
    if (sessionsForDay.some((session) => session.sessionName === template.name)) {
      setConfirmation(`${template.name} is already on this day`);
      return;
    }
    scheduleSession({
      date: selectedDate,
      sessionTemplateId: template.id,
      sessionName: template.name,
      exercises: buildExercisesFromSessionTemplate(template)
    });
    setConfirmation(null);
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
      ? "Assign a workout to at least one weekday first."
      : "Add at least one workout to the rotation first."
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
      `Scheduled ${workouts} workout${workouts === 1 ? "" : "s"} through ${formatDayKey(endDate)}`
    );
  };

  if (sessionTemplates.length === 0) {
    return (
      <Card>
        <CardContent className="space-y-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">
            Nothing to schedule yet. Build a session first, then plan your weeks here.
          </p>
          <Button onClick={onGoBuild}>Go to Build</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="h-5 w-5 text-primary" />
              {selectedDay.monthLabel} — {weekLabel(weekOffset)}
            </CardTitle>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                aria-label="Previous week"
                className="rounded-full bg-secondary p-3.5 transition active:scale-95 active:bg-secondary/60"
                onClick={() => changeWeek(weekOffset - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {weekOffset !== 0 ? (
                <button
                  type="button"
                  className="rounded-full bg-secondary px-3 py-3.5 text-xs transition active:scale-95 active:bg-secondary/60"
                  onClick={() => changeWeek(0)}
                >
                  Today
                </button>
              ) : null}
              <button
                type="button"
                aria-label="Next week"
                className="rounded-full bg-secondary p-3.5 transition active:scale-95 active:bg-secondary/60"
                onClick={() => changeWeek(weekOffset + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-7 gap-1.5">
            {weekDates.map((item) => {
              const pill = pillFor(item.key);
              const isSelected = item.key === selectedDate;
              const isToday = item.key === today;
              return (
                <button
                  key={item.key}
                  type="button"
                  aria-current={isSelected ? "date" : undefined}
                  onClick={() => setSelectedDate(item.key)}
                  className={`flex flex-col items-center gap-1.5 rounded-2xl px-0.5 py-2 transition active:bg-secondary/70 ${
                    isSelected ? "bg-secondary ring-2 ring-primary" : "bg-secondary/40"
                  }`}
                >
                  <span
                    className={`text-[10px] uppercase tracking-wide ${
                      isToday ? "font-semibold text-primary" : "text-muted-foreground"
                    }`}
                  >
                    {item.dayLabel}
                  </span>
                  <span className="text-base font-semibold leading-none">{item.dayNumber}</span>
                  {pill ? (
                    pill.type === "rest" ? (
                      <span className="w-full truncate rounded-md bg-muted px-1 py-0.5 text-center text-[11px] text-muted-foreground">
                        Rest
                      </span>
                    ) : (
                      <span className="w-full truncate rounded-md border border-primary/30 bg-primary/15 px-1 py-0.5 text-center text-[11px] font-medium text-primary">
                        {pill.sessionName}
                      </span>
                    )
                  ) : (
                    <span className="text-[11px] leading-none text-muted-foreground/30">·</span>
                  )}
                </button>
              );
            })}
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">
              {selectedDay.dayLabel} {selectedDay.dayNumber}
            </p>
            {sessionsForDay.length > 0 ? (
              <div className="space-y-2">
                {sessionsForDay.map((session) => (
                  <div
                    key={session.id}
                    className="flex items-center justify-between gap-3 rounded-2xl bg-secondary/50 px-3 py-2.5"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          session.type === "rest" ? "bg-muted-foreground" : "bg-primary"
                        }`}
                      />
                      <span className="text-sm font-medium">{session.sessionName}</span>
                    </div>
                    <button
                      type="button"
                      aria-label={`Remove ${session.sessionName}`}
                      className="rounded-full p-3.5 text-muted-foreground transition active:scale-95 active:bg-background active:text-danger"
                      onClick={() => setSessionToRemove(session)}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nothing scheduled this day.</p>
            )}

            {/* Buttons, not a <select>: this performs an action, it does not pick
                a value — the select's own first option was a no-op instruction. */}
            <div className="mt-3">
              <p className="mb-2 text-xs text-muted-foreground">
                Add a session to {selectedDay.dayLabel} {selectedDay.dayNumber}
              </p>
              <div className="flex flex-wrap gap-2">
                {sessionTemplates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => addSessionToDay(template.id)}
                    className="flex items-center gap-1 rounded-full bg-background px-3 py-3 text-sm transition active:scale-95 active:bg-secondary/60"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {template.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Plan your schedule</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-muted-foreground">
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
            <label className="text-xs text-muted-foreground">
              End
              <Input
                type="date"
                value={endDate}
                min={startDate}
                onChange={(event) => {
                  setEndDate(event.target.value);
                  setConfirmation(null);
                }}
                className="mt-1"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-1 rounded-full bg-secondary/50 p-1">
            {(["weekly", "rotation"] as const).map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={mode === item}
                onClick={() => {
                  setMode(item);
                  setConfirmation(null);
                }}
                className={`rounded-full py-3 text-sm font-medium capitalize transition active:scale-[0.98] ${
                  mode === item ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                }`}
              >
                {item === "weekly" ? "Fixed weekly" : "Rotation"}
              </button>
            ))}
          </div>

          {mode === "weekly" ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Pick a workout for each day.</p>
              {WEEKDAY_LABELS.map((label, day) => (
                <div key={label} className="flex items-center gap-3">
                  <span className="w-10 shrink-0 text-sm text-muted-foreground" aria-hidden="true">
                    {label}
                  </span>
                  <select
                    aria-label={`Workout for ${label}`}
                    value={restWeekdays.includes(day) ? "rest" : weekly[day] ?? ""}
                    onChange={(event) => setWeekdayAssignment(day, event.target.value)}
                    className="w-full rounded-2xl bg-secondary/50 px-3 py-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">Off</option>
                    <option value="rest">Rest day</option>
                    {sessionTemplates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Workouts cycle in this order, one per day, looping until the end date.
              </p>
              {rotationOrder.length > 0 ? (
                <div className="space-y-2">
                  {rotationOrder.map((id, index) => {
                    const template = sessionTemplates.find((item) => item.id === id);
                    if (!template) {
                      return null;
                    }
                    return (
                      <div
                        key={id}
                        className="flex items-center justify-between gap-3 rounded-2xl bg-secondary/50 px-3 py-2.5"
                      >
                        <span className="flex items-center gap-2 text-sm font-medium">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-xs text-primary">
                            {index + 1}
                          </span>
                          {template.name}
                        </span>
                        <button
                          type="button"
                          aria-label={`Remove ${template.name}`}
                          className="rounded-full p-3.5 text-muted-foreground transition active:scale-95 active:bg-background active:text-danger"
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
                  No order set — all your workouts will cycle in their current order.
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
                      className="flex items-center gap-1 rounded-full bg-background px-3 py-3 text-sm transition active:scale-95 active:bg-secondary/60"
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
                      className={`rounded-full px-3 py-3.5 text-xs transition active:scale-95 ${
                        restWeekdays.includes(day) ? "bg-accent text-accent-foreground" : "bg-background"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <Button
            className="w-full"
            onClick={() => (plannedCount > 0 ? setConfirmGenerate(true) : handleGenerate())}
            disabled={!canGenerate}
          >
            Generate schedule
          </Button>
          <p className={`text-center text-xs ${blockedReason ? "text-warning" : "text-muted-foreground"}`}>
            {blockedReason ?? "Replaces planned days. Finished workouts stay."}
          </p>
          {confirmation ? (
            <p className="flex items-center justify-center gap-1.5 text-sm text-success">
              <Check className="h-4 w-4" />
              {confirmation}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {scheduledSessions.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Upcoming
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                next 10 of {scheduledSessions.filter((session) => session.date >= today).length}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {scheduledSessions
              .filter((session) => session.date >= today)
              .slice(0, 10)
              .map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-secondary/50 px-3 py-2.5"
                >
                  <div>
                    <p className="text-sm font-medium">{session.sessionName}</p>
                    <p className="text-xs text-muted-foreground">{formatDayKey(session.date)}</p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] ${
                      session.type === "rest" ? "bg-muted text-muted-foreground" : "bg-primary/15 text-primary"
                    }`}
                  >
                    {session.type === "rest"
                      ? "Rest"
                      : STATUS_LABELS[session.status] ?? session.status}
                  </span>
                </div>
              ))}
          </CardContent>
        </Card>
      ) : null}

      <Dialog open={!!sessionToRemove} onOpenChange={(open) => !open && setSessionToRemove(null)}>
        <DialogContent className={DRAWER_CONTENT}>
          <DialogHeader>
            <DialogTitle>Remove from this day?</DialogTitle>
            <DialogDescription>
              &quot;{sessionToRemove?.sessionName}&quot; will be taken off{" "}
              {sessionToRemove ? formatDayKey(sessionToRemove.date) : ""}. Your session template is
              not affected.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setSessionToRemove(null)}>
              Cancel
            </Button>
            <Button
              className="bg-danger text-danger-foreground hover:bg-danger/90"
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
              {plannedCount} planned day{plannedCount === 1 ? "" : "s"} will be replaced by the new plan.
              {keptCount > 0
                ? ` ${keptCount} workout${keptCount === 1 ? "" : "s"} you have already started or finished stay as they are.`
                : ""}
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

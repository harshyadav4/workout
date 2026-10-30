"use client";

import { CalendarDays, ChevronLeft, ChevronRight, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DRAWER_CONTENT } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { ThemedSelect } from "@/components/ui/select";
import { usePendingRemoval } from "@/components/ui/use-pending-removal";
import { useDietStore } from "@/features/diet/diet-store";
import { MealDayPreview } from "@/features/diet/meal-day-preview";
import { MealNumbers } from "@/features/diet/meal-numbers";
import { isDayTouched, summarizeItems } from "@/lib/meal-schedule";
import { shiftKey } from "@/lib/progress-metrics";
import { maxScheduleEnd } from "@/lib/schedule";
import { buildWeekDates, todayKey } from "@/lib/utils";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DEFAULT_WEEKS = 8;
const HORIZON_WARNING_DAYS = 14;

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

/** The twin of PlanSchedule, weekly only: food follows the week, and no one rotates lunch. */
export function DietSchedule({ onGoBuild }: { onGoBuild: () => void }) {
  const mealPlans = useDietStore((state) => state.mealPlans);
  const days = useDietStore((state) => state.scheduledMealDays);
  const config = useDietStore((state) => state.mealScheduleConfig);
  const generate = useDietStore((state) => state.generateMealSchedule);
  const scheduleDay = useDietStore((state) => state.scheduleMealDay);
  const removeDay = useDietStore((state) => state.removeScheduledMealDay);
  const removal = usePendingRemoval();

  // Read after mount: the server does not know this phone's date.
  const [today, setToday] = useState("");
  useEffect(() => setToday(todayKey()), []);
  const [weekOffset, setWeekOffset] = useState(0);
  const weekDates = useMemo(() => buildWeekDates(weekOffset), [weekOffset]);
  const [selectedDate, setSelectedDate] = useState("");
  const selected = selectedDate || today;
  const selectedDay = weekDates.find((item) => item.key === selected) ?? weekDates[0];
  const day = days.find((item) => item.date === selected);
  const isPast = selected < today;

  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [kind, setKind] = useState<"same" | "week">("same");
  const [everyDay, setEveryDay] = useState("");
  const [weekly, setWeekly] = useState<Record<number, string>>({});

  const openDialog = () => {
    const start = today;
    const planIds = new Set(mealPlans.map((plan) => plan.id));
    const saved = Object.fromEntries(Object.entries(config?.weekly ?? {}).filter(([, id]) => planIds.has(id)));
    const values = Object.values(saved);
    const allSame = Object.keys(saved).length === 7 && new Set(values).size === 1;
    setStartDate(start);
    setEndDate(config && config.endDate > start ? config.endDate : shiftKey(start, DEFAULT_WEEKS * 7 - 1));
    setKind(values.length > 0 && !allSame ? "week" : "same");
    setEveryDay(allSame ? values[0] : mealPlans[0]?.id ?? "");
    setWeekly(saved);
    setConfirming(false);
    setOpen(true);
  };

  const apply = () => {
    const chosen =
      kind === "same"
        ? Object.fromEntries(WEEKDAY_LABELS.map((_, index) => [index, everyDay]))
        : Object.fromEntries(Object.entries(weekly).filter(([, id]) => id));
    generate({ startDate, endDate, weekly: chosen });
    setOpen(false);
  };

  const nothingChosen = kind === "same" ? !everyDay : !Object.values(weekly).some(Boolean);
  const badDates = !startDate || !endDate || startDate > endDate;

  const daysLeft = config && today && config.endDate >= today
    ? Math.round((Date.parse(`${config.endDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000)
    : 0;
  const runningOut = Boolean(config) && Object.keys(config?.weekly ?? {}).length > 0 && daysLeft <= HORIZON_WARNING_DAYS;

  const extend = () => {
    if (!config) {
      return;
    }
    const from = daysLeft > 0 ? config.endDate : today;
    generate({ ...config, startDate: today, endDate: shiftKey(from, DEFAULT_WEEKS * 7) });
  };

  if (mealPlans.length === 0) {
    return (
      <Card>
        <CardContent className="space-y-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">Build a meal plan first. Then plan your weeks here.</p>
          <Button onClick={onGoBuild}>Go to Build</Button>
        </CardContent>
      </Card>
    );
  }

  const planOptions = mealPlans.map((plan) => ({ value: plan.id, label: plan.name }));
  const totals = day ? summarizeItems(day.items) : undefined;

  return (
    <div className="space-y-4">
      {runningOut ? (
        <div className="rounded-xl bg-warning/10 p-4 ring-1 ring-warning/25">
          <div className="flex items-start gap-3">
            <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">
                {daysLeft === 0 ? "Your diet schedule has ended" : `Your diet schedule ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`}
              </p>
              <Button variant="secondary" className="mt-3 w-full" onClick={extend}>
                Add {DEFAULT_WEEKS} weeks
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <Card>
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
              onClick={() => {
                setWeekOffset(weekOffset - 1);
                setSelectedDate(buildWeekDates(weekOffset - 1)[0].key);
              }}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            {weekOffset !== 0 ? (
              <button
                type="button"
                className="key-quiet flex h-10 items-center justify-center rounded-full px-3 text-xs font-semibold"
                onClick={() => {
                  setWeekOffset(0);
                  setSelectedDate(today);
                }}
              >
                Today
              </button>
            ) : null}
            <button
              type="button"
              aria-label="Next week"
              className="key-quiet flex h-10 w-10 items-center justify-center rounded-full"
              onClick={() => {
                setWeekOffset(weekOffset + 1);
                setSelectedDate(buildWeekDates(weekOffset + 1)[0].key);
              }}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-7 gap-1.5">
          {weekDates.map((item) => {
            const hasDay = days.some((candidate) => candidate.date === item.key && !removal.hidden.has(candidate.id));
            const isSelected = item.key === selected;
            return (
              <button
                key={item.key}
                type="button"
                aria-current={isSelected ? "date" : undefined}
                aria-label={`${item.dayLabel} ${item.dayNumber}${hasDay ? ", meals planned" : ""}`}
                onClick={() => setSelectedDate(item.key)}
                className={`flex flex-col items-center gap-1.5 rounded-lg px-0.5 pb-2 pt-2 transition-colors ${
                  isSelected ? "key-quiet ring-2 ring-brand" : "well"
                }`}
              >
                <span className={`text-[10px] font-semibold ${item.key === today ? "text-brand" : "text-muted-foreground"}`}>
                  {item.dayLabel}
                </span>
                <span className="font-display text-lg font-extrabold leading-none tracking-tight">{item.dayNumber}</span>
                <span aria-hidden className={`h-1.5 w-6 rounded-full ${hasDay ? "bg-primary" : "bg-transparent"}`} />
              </button>
            );
          })}
        </div>

        <div className="mt-4">
          <p className="mb-2 text-sm font-semibold">
            {selectedDay.dayLabel} {selectedDay.dayNumber}
          </p>
          {day && !removal.hidden.has(day.id) ? (
            <div className="rounded-lg bg-muted p-2">
              <div className="flex min-h-10 items-center justify-between gap-3 pl-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{day.planName}</p>
                  {totals ? (
                    <MealNumbers totals={totals} />
                  ) : null}
                </div>
                {/* A day with a tick on it is a record, so it stays. */}
                {isPast || isDayTouched(day) ? null : (
                  <button
                    type="button"
                    aria-label={`Remove ${day.planName} from this day`}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground active:bg-secondary"
                    onClick={() => removal.remove(day.id, `${day.planName} removed`, () => removeDay(day.id))}
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="mt-2">
                <MealDayPreview items={day.items} />
              </div>
            </div>
          ) : (
            <p className="rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">No meals planned.</p>
          )}
          {isPast ? null : (
            <div className="mt-3">
              <ThemedSelect
                aria-label={day ? "Change this day's plan" : "Put a plan on this day"}
                value=""
                onValueChange={(id) => {
                  if (id) {
                    scheduleDay(selected, id);
                  }
                }}
                options={[{ value: "", label: day ? "Change this day's plan" : "Put a plan on this day" }, ...planOptions]}
              />
            </div>
          )}
        </div>
      </Card>

      <Button variant="secondary" className="w-full" onClick={openDialog}>
        <SlidersHorizontal className="h-4 w-4" />
        {config ? "Change my diet schedule" : "Set my diet schedule"}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className={`${DRAWER_CONTENT} max-h-[88dvh] overflow-y-auto`}>
          <DialogHeader>
            <DialogTitle>Your diet schedule</DialogTitle>
            <DialogDescription>Choose dates, then a plan for the days.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-3">
              <label className="block text-xs font-medium text-muted-foreground">
                Start
                <Input type="date" className="mt-1" value={startDate} min={today} onChange={(event) => setStartDate(event.target.value)} />
              </label>
              <label className="block text-xs font-medium text-muted-foreground">
                End
                <Input
                  type="date"
                  className="mt-1"
                  value={endDate}
                  min={startDate}
                  max={startDate ? maxScheduleEnd(startDate) : undefined}
                  onChange={(event) => setEndDate(event.target.value)}
                />
              </label>
            </div>
            <Segmented
              aria-label="Schedule kind"
              options={[
                { id: "same", label: "Same every day" },
                { id: "week", label: "By weekday" }
              ]}
              value={kind}
              onChange={setKind}
            />
            {kind === "same" ? (
              <ThemedSelect aria-label="Plan for every day" value={everyDay} onValueChange={setEveryDay} options={planOptions} />
            ) : (
              <div className="space-y-2">
                {WEEKDAY_LABELS.map((label, index) => (
                  <div key={label} className="flex items-center gap-3">
                    <span className="w-10 shrink-0 text-sm font-medium text-muted-foreground" aria-hidden="true">
                      {label}
                    </span>
                    <ThemedSelect
                      aria-label={`Plan for ${label}`}
                      className="min-w-0 flex-1"
                      value={weekly[index] ?? ""}
                      onValueChange={(id) => setWeekly((current) => ({ ...current, [index]: id }))}
                      options={[{ value: "", label: "No plan" }, ...planOptions]}
                    />
                  </div>
                ))}
              </div>
            )}
            {confirming ? (
              <div className="rounded-xl bg-warning/10 p-3 text-sm ring-1 ring-warning/25">
                <p className="font-semibold">Replace your diet schedule?</p>
                <p className="mt-1 text-muted-foreground">Days you have ticked, and days you set by hand, do not change.</p>
                <Button className="mt-3 w-full" onClick={apply}>
                  Replace
                </Button>
              </div>
            ) : (
              <Button
                className="w-full"
                disabled={nothingChosen || badDates}
                onClick={() => (config ? setConfirming(true) : apply())}
              >
                Save schedule
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

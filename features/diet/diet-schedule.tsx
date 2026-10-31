"use client";

import { Check, ChevronLeft, ChevronRight, Plus, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DRAWER_CONTENT, SHEET_FOOT } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ListGroup, ListRow, ListSheet, SheetRows } from "@/components/ui/list";
import { Segmented } from "@/components/ui/segmented";
import { ThemedSelect } from "@/components/ui/select";
import { usePendingRemoval } from "@/components/ui/use-pending-removal";
import { useDietStore } from "@/features/diet/diet-store";
import { MealDayPreview } from "@/features/diet/meal-day-preview";
import { MealNumbers, planLine } from "@/features/diet/meal-numbers";
import { isDayTouched, summarizeItems } from "@/lib/meal-schedule";
import { formatDayKey, shiftKey } from "@/lib/progress-metrics";
import { maxScheduleEnd } from "@/lib/schedule";
import { buildWeekDates, cn, todayKey } from "@/lib/utils";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DEFAULT_WEEKS = 8;
const HORIZON_WARNING_DAYS = 14;

const MONTH = new Intl.DateTimeFormat("en-US", { month: "long" });

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
  // Removed days hide at once and go after the Undo bar.
  const removal = usePendingRemoval();

  // Read after mount: the server does not know this phone's date.
  const [today, setToday] = useState("");
  useEffect(() => setToday(todayKey()), []);
  const [weekOffset, setWeekOffset] = useState(0);
  const weekDates = useMemo(() => buildWeekDates(weekOffset), [weekOffset]);
  const [selectedDate, setSelectedDate] = useState("");
  const selected = selectedDate || today;
  const selectedDay = weekDates.find((item) => item.key === selected) ?? weekDates[0];
  const dayOn = (date: string) => days.find((item) => item.date === date && !removal.hidden.has(item.id));
  const day = dayOn(selected);
  const isPast = selected < today;
  const dayName = `${selectedDay.dayLabel} ${selectedDay.dayNumber}`;

  // The week is what you look at; the form is what you touch twice a season.
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [kind, setKind] = useState<"same" | "week">("same");
  const [everyDay, setEveryDay] = useState("");
  const [weekly, setWeekly] = useState<Record<number, string>>({});

  // Landing on today whenever that week holds it, so stepping away and back returns where you started.
  const changeWeek = (offset: number) => {
    const dates = buildWeekDates(offset);
    setWeekOffset(offset);
    setSelectedDate(dates.some((item) => item.key === today) ? today : dates[0].key);
    setConfirmation(null);
  };

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
    setOpen(true);
  };

  const apply = () => {
    const chosen =
      kind === "same"
        ? Object.fromEntries(WEEKDAY_LABELS.map((_, index) => [index, everyDay]))
        : Object.fromEntries(Object.entries(weekly).filter(([, id]) => id));
    generate({ startDate, endDate, weekly: chosen });
    setConfirming(false);
    setOpen(false);
    setConfirmation(`Your diet schedule runs until ${formatDayKey(endDate)}.`);
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
    const next = shiftKey(from, DEFAULT_WEEKS * 7);
    generate({ ...config, startDate: today, endDate: next });
    setConfirmation(`Your diet schedule runs until ${formatDayKey(next)}.`);
  };

  if (mealPlans.length === 0) {
    return (
      <div className="px-1 pt-3">
        <h2 className="font-heading text-[34px] leading-[1.08]">Nothing to schedule yet</h2>
        <p className="mt-2.5 text-[15px] text-muted-foreground">Build a meal plan first. Then plan your weeks here.</p>
        <Button className="mt-5 w-full" size="lg" onClick={onGoBuild}>
          Go to Build
        </Button>
      </div>
    );
  }

  const planOptions = mealPlans.map((plan) => ({ value: plan.id, label: plan.name }));
  const configValues = Object.values(config?.weekly ?? {});
  const configSame = configValues.length === 7 && new Set(configValues).size === 1;

  return (
    <div className="space-y-5">
      {runningOut ? (
        <div className="notice-line">
          <p className="min-w-0 flex-1">
            {daysLeft === 0 ? "Your diet schedule has ended." : `Your diet schedule ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}.`}
          </p>
          <button
            type="button"
            onClick={extend}
            className="h-11 shrink-0 rounded-full px-2.5 font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Add {DEFAULT_WEEKS} weeks
          </button>
        </div>
      ) : null}

      <section>
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

        {/* Seven days and no boxes: the chosen day is the only one with a shape. One
            dot says what the day is: bright for a plan, warm once you have eaten from it. */}
        <div className="mt-2.5 grid grid-cols-7 gap-0.5">
          {weekDates.map((item) => {
            const onDay = dayOn(item.key);
            const ate = onDay?.items.some((meal) => meal.status === "eaten");
            const isSelected = item.key === selected;
            const isToday = item.key === today;
            return (
              <button
                key={item.key}
                type="button"
                aria-current={isSelected ? "date" : undefined}
                aria-label={`${item.dayLabel} ${item.dayNumber}${onDay ? `, ${onDay.planName}${ate ? ", meals eaten" : ""}` : ""}`}
                onClick={() => setSelectedDate(item.key)}
                className={cn("flex flex-col items-center gap-1.5 rounded-2xl pb-2 pt-2 transition-colors", isSelected && "bg-hi")}
              >
                <span className={cn("text-[11.5px] font-medium", isToday ? "text-brand" : "text-muted-foreground")}>{item.dayLabel}</span>
                <span className={cn("text-[18px] font-semibold leading-none tabular-nums", isToday && "text-brand")}>{item.dayNumber}</span>
                <span
                  aria-hidden
                  className={cn("h-1.5 w-1.5 rounded-full", !onDay ? "bg-transparent" : ate ? "bg-[var(--l2)]" : "bg-foreground/75")}
                />
              </button>
            );
          })}
        </div>
      </section>

      <ListGroup title={`${selected === today ? "Today · " : ""}${dayName}`}>
        {day ? (
          <>
            <div className="list-row flex items-start gap-3 py-3.5 pl-4 pr-3.5">
              <div className="min-w-0 flex-1">
                <h3 className="break-words font-heading text-[28px] leading-[1.12]">{day.planName}</h3>
                <MealNumbers totals={summarizeItems(day.items)} className="mt-1" />
              </div>
              {isPast ? null : (
                <button
                  type="button"
                  aria-label={`Change or remove ${day.planName}`}
                  className="key-quiet h-11 shrink-0 rounded-full px-4 text-[13.5px] font-semibold"
                  onClick={() => setChoosing(true)}
                >
                  Change
                </button>
              )}
            </div>
            <MealDayPreview items={day.items} />
          </>
        ) : (
          <>
            <p className="list-row flex min-h-[54px] items-center pl-4 pr-3.5 text-[15px] text-muted-foreground">No meals planned.</p>
            {isPast ? null : <ListRow icon={Plus} label="Add meal plan" noChevron onClick={() => setChoosing(true)} />}
          </>
        )}
      </ListGroup>

      {isPast ? <p className="-mt-3 px-1 text-[13px] text-muted-foreground">Past days stay as your history.</p> : null}

      {confirmation ? (
        <p className="-mt-2 flex items-center gap-1.5 px-1 text-[13.5px]" role="status">
          <Check className="h-4 w-4 shrink-0 text-[var(--l2)]" strokeWidth={2.4} aria-hidden />
          {confirmation}
        </p>
      ) : null}

      {/* The first thing to do with a plan, until it is done. After that the form
          is a row at the foot of the page. */}
      {config ? (
        <ListGroup>
          <ListRow
            icon={SlidersHorizontal}
            label="Edit schedule"
            hint={`${configSame ? "Same every day" : "By weekday"} · until ${formatDayKey(config.endDate)}`}
            onClick={openDialog}
          />
        </ListGroup>
      ) : (
        <Button className="w-full" size="lg" onClick={openDialog}>
          Set up schedule
        </Button>
      )}

      <ListSheet
        open={choosing}
        onOpenChange={setChoosing}
        title={`${day ? "Change" : "Add to"} ${dayName}`}
        description={day && isDayTouched(day) ? "Meals you have ticked or skipped stay." : undefined}
      >
        <SheetRows>
          {mealPlans.map((plan) => {
            const onDay = day?.mealPlanId === plan.id;
            return (
              <ListRow
                key={plan.id}
                label={plan.name}
                hint={<span className="tabular-nums">{planLine(plan)}</span>}
                value={onDay ? "On this day" : undefined}
                disabled={onDay}
                noChevron
                onClick={() => {
                  scheduleDay(selected, plan.id);
                  setChoosing(false);
                }}
              />
            );
          })}
        </SheetRows>
        {/* A day with a tick on it is a record, so it stays. The rare one: quiet,
            under the common one, and it can be undone. */}
        {day && !isDayTouched(day) ? (
          <button
            type="button"
            className="mt-2 h-11 w-full rounded-full text-sm font-medium text-danger transition-colors active:bg-hi"
            onClick={() => {
              removal.remove(day.id, `${day.planName} removed`, () => removeDay(day.id));
              setChoosing(false);
            }}
          >
            Remove from this day
          </button>
        ) : null}
      </ListSheet>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className={`${DRAWER_CONTENT} max-h-[88dvh] overflow-y-auto`}>
          <DialogHeader className="pr-9">
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
              quiet
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
            <div className={SHEET_FOOT}>
              <Button
                className="w-full"
                disabled={nothingChosen || badDates}
                onClick={() => (config ? setConfirming(true) : apply())}
              >
                Save schedule
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className={DRAWER_CONTENT}>
          <DialogHeader className="pr-9">
            <DialogTitle>Replace your diet schedule?</DialogTitle>
            <DialogDescription>Days you have ticked, and days you set by hand, do not change.</DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={apply}>
              Replace
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

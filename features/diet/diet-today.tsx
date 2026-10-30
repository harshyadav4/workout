"use client";

import { Check, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useDietStore, useTodayMealDay } from "@/features/diet/diet-store";
import { MealForm } from "@/features/diet/meal-form";
import { MeterBar } from "@/features/diet/meter-bar";
import { MealNumbers } from "@/features/diet/meal-numbers";
import { meterTone } from "@/lib/diet-metrics";
import type { PlannedMeal } from "@/lib/diet-types";
import { tick } from "@/lib/feedback";
import { formatMealTime, formatRupees, summarizeItems } from "@/lib/meal-schedule";
import { cn } from "@/lib/utils";

const LONG_DAY = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

/** The date in the page header, on the Diet side. */
export function DietTodayHeader() {
  const activeDate = useDietStore((state) => state.activeDate);
  return (
    <>
      <p className="text-sm font-medium text-muted-foreground">
        {LONG_DAY.format(new Date(`${activeDate}T00:00:00Z`))}
      </p>
      <h1 className="mt-1.5 font-display text-[34px] font-extrabold leading-none tracking-tight">Today&apos;s meals</h1>
    </>
  );
}

function clockNow() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

/**
 * One nutrient's bar. Its colour follows the progress, and the numbers beside it
 * say the same thing, so nothing here relies on colour alone.
 */
function Meter({
  label,
  value,
  target,
  unit,
  noLimit
}: {
  label: string;
  value: number;
  target?: number;
  unit: string;
  noLimit?: boolean;
}) {
  const tone = meterTone(value, target, { noLimit });
  const percent = target ? Math.min(100, (value / target) * 100) : 0;
  return (
    <div className="min-w-0">
      <p className="text-sm font-medium">{label}</p>
      <p className={cn("text-xs tabular-nums", tone === "over" ? "font-semibold text-danger" : "text-muted-foreground")}>
        {value}
        {target ? ` / ${target}` : ""} {unit}
        {tone === "over" ? " · over" : ""}
      </p>
      <MeterBar label={`${label} eaten`} value={value} target={target} percent={percent} tone={tone} className="mt-1.5" />
    </div>
  );
}

function MealRow({
  item,
  onToggle,
  onSkip,
  onRemove
}: {
  item: PlannedMeal;
  onToggle: () => void;
  onSkip: () => void;
  onRemove: () => void;
}) {
  const eaten = item.status === "eaten";
  const skipped = item.status === "skipped";
  return (
    <li className={cn("flex items-center gap-3 rounded-xl bg-muted py-2 pl-2 pr-1.5", skipped && "opacity-60")}>
      <button
        type="button"
        role="checkbox"
        aria-checked={eaten}
        aria-label={`${item.name}, ${formatMealTime(item.time)}. ${eaten ? "Eaten" : "Not eaten"}`}
        onClick={onToggle}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-lg border-2 transition-colors",
            eaten ? "border-transparent bg-brand text-white" : "border-muted-foreground/50 bg-card"
          )}
        >
          {eaten ? <Check className="h-5 w-5" strokeWidth={3} /> : null}
        </span>
      </button>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-brand tabular-nums">
          {formatMealTime(item.time)}
          {item.extra ? <span className="ml-1.5 font-medium text-muted-foreground">Extra</span> : null}
        </p>
        <p className={cn("text-sm font-semibold", skipped && "line-through")}>{item.name}</p>
        <MealNumbers totals={item} />
      </div>
      {item.extra ? (
        <button
          type="button"
          aria-label={`Remove ${item.name}`}
          onClick={onRemove}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground active:bg-secondary"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      ) : eaten ? null : (
        <button
          type="button"
          onClick={onSkip}
          aria-pressed={skipped}
          className="h-10 shrink-0 rounded-full px-3 text-xs font-semibold text-muted-foreground active:bg-secondary"
        >
          {skipped ? "Undo" : "Skip"}
        </button>
      )}
    </li>
  );
}

/** The Today tab on the Diet side: the day's meals as a checklist, in clock order. */
export function DietToday() {
  const day = useTodayMealDay();
  const activeDate = useDietStore((state) => state.activeDate);
  const meals = useDietStore((state) => state.meals);
  const settings = useDietStore((state) => state.settings);
  const hasPlans = useDietStore((state) => state.mealPlans.length > 0);
  const setMealStatus = useDietStore((state) => state.setMealStatus);
  const addExtraMeal = useDietStore((state) => state.addExtraMeal);
  const removeDayMeal = useDietStore((state) => state.removeDayMeal);

  const [adding, setAdding] = useState(false);
  const [library, setLibrary] = useState(false);
  const [time, setTime] = useState("12:00");

  const items = useMemo(() => day?.items ?? [], [day]);
  const eaten = useMemo(() => summarizeItems(items.filter((item) => item.status === "eaten")), [items]);
  // With no target of its own, a bar measures against what today's plan adds up to.
  const planned = useMemo(() => summarizeItems(items.filter((item) => item.status !== "skipped")), [items]);
  const missingTarget =
    !settings.kcalTarget || !settings.proteinTargetG || !settings.carbsTargetG || !settings.fatTargetG;
  const doneCount = items.filter((item) => item.status === "eaten").length;

  return (
    <div className="space-y-4" data-tour="diet-today">
      {day && items.length > 0 ? (
        <>
          <Card>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Meter label="Calories" value={eaten.kcal} target={settings.kcalTarget ?? planned.kcal} unit="kcal" />
              <Meter label="Protein" value={eaten.proteinG} target={settings.proteinTargetG ?? planned.proteinG} unit="g" noLimit />
              <Meter label="Carbs" value={eaten.carbsG} target={settings.carbsTargetG ?? planned.carbsG} unit="g" />
              <Meter label="Fat" value={eaten.fatG} target={settings.fatTargetG ?? planned.fatG} unit="g" />
            </div>
            <div className="mt-3 flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium">Spent today</span>
              <span className="font-semibold tabular-nums">{formatRupees(eaten.costInr)}</span>
            </div>
            {missingTarget ? (
              <p className="mt-2 text-xs text-muted-foreground">
                A bar with no target compares with today&apos;s plan. Set your targets on You.
              </p>
            ) : null}
          </Card>
          <Card>
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="min-w-0 truncate font-display text-xl font-bold tracking-tight">{day.planName}</h2>
              <p className="shrink-0 text-sm text-muted-foreground tabular-nums">
                {doneCount} of {items.length} eaten
              </p>
            </div>
            <ul className="space-y-2">
              {items.map((item) => (
                <MealRow
                  key={item.id}
                  item={item}
                  onToggle={() => {
                    tick();
                    setMealStatus(day.id, item.id, item.status === "eaten" ? "pending" : "eaten");
                  }}
                  onSkip={() => setMealStatus(day.id, item.id, item.status === "skipped" ? "pending" : "skipped")}
                  onRemove={() => removeDayMeal(day.id, item.id)}
                />
              ))}
            </ul>
          </Card>
        </>
      ) : (
        <Card>
          <h2 className="font-display text-[28px] font-extrabold leading-[1.1] tracking-tight">No meals planned today.</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            {hasPlans ? "Put a meal plan on today in Schedule." : "Build a meal plan. It then shows here each day, with a checkbox for each meal."}
          </p>
          <Button asChild size="lg" className="mt-5 w-full">
            <Link href={hasPlans ? "/plan" : "/plan?mode=build"}>{hasPlans ? "Go to Schedule" : "Build a meal plan"}</Link>
          </Button>
        </Card>
      )}

      <Button
        variant="secondary"
        className="w-full"
        onClick={() => {
          setTime(clockNow());
          setLibrary(false);
          setAdding(true);
        }}
      >
        <Plus className="h-4 w-4" />
        Add something I ate
      </Button>

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="max-h-[88dvh] overflow-y-auto" hideClose={library}>
          {library ? null : (
            <DialogHeader>
              <DialogTitle>Add something I ate</DialogTitle>
              <DialogDescription>It counts for today, as eaten. Your plan does not change.</DialogDescription>
            </DialogHeader>
          )}
          {adding ? (
            <MealForm
              savedMeals={meals}
              submitLabel="Add to today"
              onLibraryChange={setLibrary}
              onSubmit={(draft) => {
                const { foodId: _foodId, grams: _grams, ingredients: _ingredients, ...numbers } = draft;
                addExtraMeal(activeDate, { ...numbers, time: time || clockNow() });
                setAdding(false);
                return undefined;
              }}
            >
              <label className="block text-xs font-medium text-muted-foreground">
                Time
                <Input type="time" className="mt-1" value={time} onChange={(event) => setTime(event.target.value)} />
              </label>
            </MealForm>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

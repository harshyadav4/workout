"use client";

import { Check, Plus, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DRAWER_CONTENT } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ListGroup, ListRow } from "@/components/ui/list";
import { HORIZON_WIDTH, HorizonArc } from "@/components/ui/progress-arc";
import { usePendingRemoval } from "@/components/ui/use-pending-removal";
import { useDietStore, useTodayMealDay } from "@/features/diet/diet-store";
import { MealForm } from "@/features/diet/meal-form";
import { MealLine } from "@/features/diet/meal-numbers";
import { MeterBar } from "@/features/diet/meter-bar";
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
      <p className="text-[13.5px] text-muted-foreground">{LONG_DAY.format(new Date(`${activeDate}T00:00:00Z`))}</p>
      <h1 className="mt-0.5 font-heading text-[36px] leading-[1.05]">Today&apos;s meals</h1>
    </>
  );
}

function clockNow() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

/** The day's calories as the horizon: the same light as the week on Today and the sets in a workout. */
function CaloriesArc({ eaten, target, spent }: { eaten: number; target: number; spent: number }) {
  const over = meterTone(eaten, target) === "over";
  return (
    <div>
      <div className="-mx-4">
        <HorizonArc
          litTo={target > 0 ? Math.min(1, eaten / target) * HORIZON_WIDTH : 0}
          height={68}
          label={`${eaten} of ${target} kcal eaten${over ? ", over" : ""}${spent > 0 ? `. ${formatRupees(spent)} spent` : ""}`}
        />
      </div>
      <p className="-mt-5 text-center text-[13.5px] text-muted-foreground tabular-nums" aria-hidden>
        <span className="block text-[40px] font-medium leading-none tracking-[-0.03em] text-foreground">
          {eaten.toLocaleString("en-US")}
        </span>
        of {target.toLocaleString("en-US")} kcal
        {over ? <span className="font-semibold text-danger"> · over</span> : null}
        {spent > 0 ? ` · ${formatRupees(spent)} spent` : ""}
      </p>
    </div>
  );
}

/** One macro's bar. The numbers beside it say the same thing, so nothing relies on the bar alone. */
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
  return (
    <div className="min-w-0">
      <p className={cn("text-[13.5px] font-medium", tone === "over" && "text-danger")}>
        {label}
        {tone === "over" ? " · over" : ""}
      </p>
      <p className="text-[12.5px] text-muted-foreground tabular-nums">
        {value}
        {target ? ` / ${target}` : ""} {unit}
      </p>
      <MeterBar
        label={`${label} eaten`}
        value={value}
        target={target}
        percent={target ? Math.min(100, (value / target) * 100) : 0}
        tone={tone}
        className="mt-1.5"
      />
    </div>
  );
}

/**
 * One meal. Ticking it is what this screen is for, many times a day, so the whole
 * row is the box. Skip is the rare one, small at the end of the row.
 */
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
    // data-icon: the line between rows starts where the name starts, past the box.
    <div className="list-row flex items-center pr-1.5" data-icon="">
      <button
        type="button"
        role="checkbox"
        aria-checked={eaten}
        aria-label={`${item.name}, ${formatMealTime(item.time)}. ${eaten ? "Eaten" : skipped ? "Skipped" : "Not eaten"}`}
        onClick={onToggle}
        className="flex min-h-[60px] min-w-0 flex-1 items-center gap-2.5 py-2.5 pl-4 pr-2 text-left transition-colors active:bg-hi focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <span
          aria-hidden
          className={cn(
            "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full transition-colors",
            eaten ? "bg-[var(--l2)] text-[var(--on-warm)]" : "border-[1.5px] border-foreground/35"
          )}
        >
          {eaten ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn("block text-[15.5px] font-medium", (eaten || skipped) && "text-muted-foreground", skipped && "line-through")}>
            {item.name}
          </span>
          <span className="mt-px block text-[13px] text-muted-foreground tabular-nums">
            <MealLine totals={item} before={[formatMealTime(item.time), ...(item.extra ? ["Extra"] : [])]} />
          </span>
        </span>
      </button>
      {item.extra ? (
        <button
          type="button"
          aria-label={`Remove ${item.name}`}
          onClick={onRemove}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors active:bg-hi"
        >
          <X className="h-4 w-4" />
        </button>
      ) : eaten ? null : (
        <button
          type="button"
          onClick={onSkip}
          aria-pressed={skipped}
          className="h-11 shrink-0 rounded-full px-3 text-[13px] font-medium text-muted-foreground transition-colors active:bg-hi"
        >
          {skipped ? "Undo" : "Skip"}
        </button>
      )}
    </div>
  );
}

/** The Today tab on the Diet side: the day's calories, then its meals as a checklist, in clock order. */
export function DietToday() {
  const day = useTodayMealDay();
  const activeDate = useDietStore((state) => state.activeDate);
  const meals = useDietStore((state) => state.meals);
  const settings = useDietStore((state) => state.settings);
  const hasPlans = useDietStore((state) => state.mealPlans.length > 0);
  const setMealStatus = useDietStore((state) => state.setMealStatus);
  const addExtraMeal = useDietStore((state) => state.addExtraMeal);
  const removeDayMeal = useDietStore((state) => state.removeDayMeal);
  // A removed extra hides at once and goes after the Undo bar.
  const removal = usePendingRemoval();

  const [adding, setAdding] = useState(false);
  const [library, setLibrary] = useState(false);
  const [time, setTime] = useState("12:00");

  const items = useMemo(() => (day?.items ?? []).filter((item) => !removal.hidden.has(item.id)), [day, removal.hidden]);
  const eaten = useMemo(() => summarizeItems(items.filter((item) => item.status === "eaten")), [items]);
  // With no target of its own, a bar measures against what today's plan adds up to.
  const planned = useMemo(() => summarizeItems(items.filter((item) => item.status !== "skipped")), [items]);
  const missingTarget =
    !settings.kcalTarget || !settings.proteinTargetG || !settings.carbsTargetG || !settings.fatTargetG;
  const doneCount = items.filter((item) => item.status === "eaten").length;

  const openAdding = () => {
    setTime(clockNow());
    setLibrary(false);
    setAdding(true);
  };
  const addRow = <ListRow icon={Plus} label="Add something I ate" noChevron onClick={openAdding} />;

  return (
    <div className="space-y-5" data-tour="diet-today">
      {day && items.length > 0 ? (
        <>
          <CaloriesArc eaten={eaten.kcal} target={settings.kcalTarget ?? planned.kcal} spent={eaten.costInr} />

          <div className="grid grid-cols-3 gap-3 px-1">
            <Meter label="Protein" value={eaten.proteinG} target={settings.proteinTargetG ?? planned.proteinG} unit="g" noLimit />
            <Meter label="Carbs" value={eaten.carbsG} target={settings.carbsTargetG ?? planned.carbsG} unit="g" />
            <Meter label="Fat" value={eaten.fatG} target={settings.fatTargetG ?? planned.fatG} unit="g" />
          </div>

          <ListGroup title={day.planName} aside={`${doneCount} of ${items.length} eaten`}>
            {items.map((item) => (
              <MealRow
                key={item.id}
                item={item}
                onToggle={() => {
                  tick();
                  setMealStatus(day.id, item.id, item.status === "eaten" ? "pending" : "eaten");
                }}
                onSkip={() => setMealStatus(day.id, item.id, item.status === "skipped" ? "pending" : "skipped")}
                onRemove={() => removal.remove(item.id, `${item.name} removed`, () => removeDayMeal(day.id, item.id))}
              />
            ))}
            {addRow}
          </ListGroup>

          {missingTarget ? (
            <p className="px-1 text-[13px] text-muted-foreground">
              A number with no target compares with today&apos;s plan.{" "}
              <Link href="/profile" className="font-medium text-foreground underline underline-offset-2">
                Set your targets on You.
              </Link>
            </p>
          ) : null}
        </>
      ) : (
        <>
          <div className="px-1 pt-3">
            <h2 className="font-heading text-[34px] leading-[1.08]">No meals planned today.</h2>
            <p className="mt-2.5 text-[15px] text-muted-foreground">
              {hasPlans ? "Put a meal plan on today in Schedule." : "Build a meal plan. It then shows here each day, with a box to tick for each meal."}
            </p>
            <Button asChild size="lg" className="mt-5 w-full">
              <Link href={hasPlans ? "/plan" : "/plan?mode=build"}>{hasPlans ? "Go to Schedule" : "Build a meal plan"}</Link>
            </Button>
          </div>
          <ListGroup>{addRow}</ListGroup>
        </>
      )}

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className={`${DRAWER_CONTENT} max-h-[88dvh] overflow-y-auto`} hideClose={library}>
          {library ? null : (
            <DialogHeader className="pr-9">
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

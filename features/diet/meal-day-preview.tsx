"use client";

import { Check, Minus } from "lucide-react";

import type { PlannedMeal } from "@/lib/diet-types";
import { MealNumbers } from "@/features/diet/meal-numbers";
import { formatMealTime } from "@/lib/meal-schedule";
import { cn } from "@/lib/utils";

/**
 * A day's meals to read, not to tick: rows in the day's one surface, with every
 * number, because this is where you read a plan. The ticking happens on the Meals
 * tab, on the day.
 */
export function MealDayPreview({ items }: { items: PlannedMeal[] }) {
  return (
    <>
      {items.map((item) => (
        <div key={item.id} className="list-row flex items-start gap-3 py-2.5 pl-4 pr-3.5">
          <div className="min-w-0 flex-1">
            <p className={cn("text-[15.5px] font-medium", item.status === "skipped" && "text-muted-foreground line-through")}>
              {item.name}
            </p>
            <MealNumbers totals={item} before={[formatMealTime(item.time)]} className="mt-px" />
          </div>
          {item.status === "eaten" ? <Check className="mt-1 h-4 w-4 shrink-0 text-[var(--l2)]" strokeWidth={2.6} aria-label="Eaten" /> : null}
          {item.status === "skipped" ? <Minus className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-label="Skipped" /> : null}
        </div>
      ))}
    </>
  );
}

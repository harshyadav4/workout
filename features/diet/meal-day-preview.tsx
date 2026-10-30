"use client";

import { Check, Minus } from "lucide-react";

import type { PlannedMeal } from "@/lib/diet-types";
import { MealNumbers } from "@/features/diet/meal-numbers";
import { formatMealTime } from "@/lib/meal-schedule";

/** A day's meals to read, not to tick. The ticking happens on the Meals tab, on the day. */
export function MealDayPreview({ items }: { items: PlannedMeal[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item) => (
        <li key={item.id} className="flex items-center gap-2.5 rounded-lg bg-card px-3 py-2">
          <span className="w-16 shrink-0 text-xs font-semibold text-muted-foreground tabular-nums">
            {formatMealTime(item.time)}
          </span>
          <div className="min-w-0 flex-1">
            <span className={`block truncate text-sm font-medium ${item.status === "skipped" ? "text-muted-foreground line-through" : ""}`}>
              {item.name}
            </span>
            <MealNumbers totals={item} />
          </div>
          {item.status === "eaten" ? <Check className="h-4 w-4 shrink-0 text-success" aria-label="Eaten" /> : null}
          {item.status === "skipped" ? <Minus className="h-4 w-4 shrink-0 text-muted-foreground" aria-label="Skipped" /> : null}
        </li>
      ))}
    </ul>
  );
}

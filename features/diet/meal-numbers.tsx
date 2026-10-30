import type { MealTotals } from "@/lib/diet-types";
import { formatRupees } from "@/lib/meal-schedule";
import { cn } from "@/lib/utils";

/**
 * A meal's or a day's numbers, the same on every diet screen: calories and cost,
 * then the three macros. Each macro stays whole, so a narrow phone wraps between
 * them and never inside one.
 */
export function MealNumbers({ totals, className }: { totals: MealTotals; className?: string }) {
  return (
    <div className={cn("text-xs text-muted-foreground tabular-nums", className)}>
      <p>
        {totals.kcal} kcal · {formatRupees(totals.costInr)}
      </p>
      <p className="mt-0.5 flex flex-wrap gap-x-2">
        <span className="whitespace-nowrap">Protein {totals.proteinG} g</span>
        <span className="whitespace-nowrap">Carbs {totals.carbsG} g</span>
        <span className="whitespace-nowrap">Fat {totals.fatG} g</span>
      </p>
    </div>
  );
}

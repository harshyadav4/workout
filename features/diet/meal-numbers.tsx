import { Fragment } from "react";

import type { MealPlan, MealTotals } from "@/lib/diet-types";
import { formatRupees } from "@/lib/meal-schedule";
import { cn } from "@/lib/utils";

/** "2,817 kcal". */
export function formatKcal(value: number) {
  return `${Math.round(value).toLocaleString("en-US")} kcal`;
}

/** No cost typed: nothing to say, rather than "₹0". */
const cost = (totals: MealTotals) => (totals.costInr > 0 ? [formatRupees(totals.costInr)] : []);

/** Parts of one line. Each stays whole, so a narrow phone wraps between them and never inside one. */
function Parts({ parts }: { parts: string[] }) {
  return (
    <>
      {parts.map((part, index) => (
        <Fragment key={index}>
          {index > 0 ? " · " : ""}
          <span className="whitespace-nowrap">{part}</span>
        </Fragment>
      ))}
    </>
  );
}

/** "4 meals · 2,817 kcal · 163 g protein · ₹375": what a saved plan holds, on one line. */
export function planLine(plan: MealPlan): string {
  const count = plan.items.length;
  return [
    `${count} meal${count === 1 ? "" : "s"}`,
    formatKcal(plan.summary.kcal),
    `${Math.round(plan.summary.proteinG)} g protein`,
    ...cost(plan.summary)
  ].join(" · ");
}

/** A meal in a list: its calories, protein and cost. The rest is one tap away. */
export function MealLine({ totals, before = [] }: { totals: MealTotals; before?: string[] }) {
  return <Parts parts={[...before, formatKcal(totals.kcal), `${totals.proteinG} g protein`, ...cost(totals)]} />;
}

/**
 * Every number of a meal or a day, for the places you read them: the same on every
 * diet screen. Two lines, so the macros always read together.
 */
export function MealNumbers({ totals, before = [], className }: { totals: MealTotals; before?: string[]; className?: string }) {
  return (
    <div className={cn("text-[13px] text-muted-foreground tabular-nums", className)}>
      <p>
        <Parts parts={[...before, formatKcal(totals.kcal), ...cost(totals)]} />
      </p>
      <p>
        <Parts parts={[`${totals.proteinG} g protein`, `${totals.carbsG} g carbs`, `${totals.fatG} g fat`]} />
      </p>
    </div>
  );
}

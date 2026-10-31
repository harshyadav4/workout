/**
 * The three cards at the top of the Diet side's Progress, and its one sentence.
 *
 * As on the workout side, a ring compares against something you already
 * understand: your own plan, your own usual week, your own target weight. Never an
 * invented score. Pure functions, so every sentence here is tested directly.
 */
import type { Adherence, Spend } from "@/lib/diet-metrics";
import type { GoalPath, PathStatus } from "@/lib/diet-science";
import type { MealTotals } from "@/lib/diet-types";
import { formatRupees } from "@/lib/meal-schedule";
import { weekStartKey, type ProgressRange } from "@/lib/progress-metrics";
import type { Ring, RingTone } from "@/lib/progress-scores";

export type DietCardId = "eating" | "money" | "body";

/** From this share of planned meals eaten the card reads as good; under the lower one it says "Needs work". */
const GOOD_SHARE = 0.75;
const FAIR_SHARE = 0.5;

/** Closer than this, a weight is at its target. */
const AT_TARGET_KG = 0.05;

/** The range, as the end of a sentence. */
const WHEN: Record<ProgressRange, string> = {
  "4w": "in the last 4 weeks",
  "12w": "in the last 12 weeks",
  "1y": "in the last year",
  all: "since you started",
  custom: "in these dates"
};

const whole = (value: number) => Math.round(value).toLocaleString("en-US");

const days = (count: number) => `${count} day${count === 1 ? "" : "s"}`;

function notYet(sentence: string): Ring {
  return { fill: 0, value: "—", sentence, tone: "steady", ready: false };
}

/** The share of the plan you ate. With no plan, only extras, it is the days you logged. */
export function eatingRing(planned: Adherence, loggedDays: number, rangeDays: number): Ring {
  if (planned.rate !== undefined) {
    return {
      fill: planned.rate,
      value: `${Math.round(planned.rate * 100)}%`,
      sentence: `You ate ${planned.eaten} of ${planned.planned} planned meals.`,
      tone: planned.rate >= GOOD_SHARE ? "good" : planned.rate >= FAIR_SHARE ? "steady" : "low",
      ready: true
    };
  }
  if (loggedDays > 0) {
    const share = rangeDays > 0 ? Math.min(1, loggedDays / rangeDays) : 0;
    return {
      fill: share,
      value: `${Math.round(share * 100)}%`,
      sentence: `You logged food on ${loggedDays} of ${days(rangeDays)}.`,
      tone: "steady",
      ready: true
    };
  }
  return notYet("Tick a meal on the Meals tab to see this.");
}

/**
 * What a day costs, and this week against your usual week. There is no budget in
 * the app, so spending is never judged: the ring only fills as the week goes on.
 */
export function moneyRing(money: Spend, today: string): Ring {
  if (money.total <= 0) {
    return notYet("Add a cost to your meals, then tick them.");
  }
  const thisWeek = weekStartKey(today);
  const spent = money.thisWeek;
  const others = money.weeks.filter((week) => week.week !== thisWeek);
  const usual = others.length > 0 ? others.reduce((sum, week) => sum + week.costInr, 0) / others.length : undefined;
  const perDay = formatRupees(Math.round(money.perDay));
  return {
    fill: usual ? Math.min(1, spent / usual) : 1,
    value: perDay,
    sentence: usual
      ? `${perDay} a day. This week ${formatRupees(Math.round(spent))}, a usual week ${formatRupees(Math.round(usual))}.`
      : `${perDay} a day, on the days you logged.`,
    tone: "steady",
    ready: true
  };
}

export const PATH_COPY: Record<PathStatus, { headline: string; tone: RingTone }> = {
  atGoal: { headline: "You are at your target weight, and your food holds you there.", tone: "good" },
  onPace: { headline: "What you eat keeps you on the path.", tone: "good" },
  slow: { headline: "You are moving toward your target, but slowly.", tone: "steady" },
  fast: { headline: "You are moving faster than the safe pace.", tone: "steady" },
  stalled: { headline: "At what you eat, your weight stays about the same.", tone: "steady" },
  wrongWay: { headline: "At what you eat, your weight moves away from your target.", tone: "low" }
};

/** How far you have come from your first weigh-in to the target, and the kilos still to go. */
export function bodyRing(path: GoalPath | undefined, firstKg: number | undefined, needs: string[]): Ring {
  if (!path) {
    return notYet(needs.length > 0 ? `Needs ${needs.join(", ")}.` : "Set a goal weight on You to see this.");
  }
  const { headline, tone } = PATH_COPY[path.status];
  const left = Math.abs(path.currentKg - path.goalKg);
  if (left < AT_TARGET_KG) {
    return { fill: 1, value: "At goal", sentence: headline, tone, ready: true };
  }
  const start = Math.abs((firstKg ?? path.currentKg) - path.goalKg);
  const kilos = Number(left.toFixed(1));
  return {
    fill: start > 0 ? Math.max(0, 1 - left / start) : 0,
    value: `${kilos} kg`,
    sentence: `${kilos} kg to your target of ${path.goalKg} kg. ${headline}`,
    tone,
    ready: true
  };
}

/** The page's one sentence: the answer to "am I eating what I meant to". */
export function dietHeadline(planned: Adherence, loggedDays: number, range: ProgressRange): string {
  if (loggedDays === 0) {
    return "Your food log starts here.";
  }
  return planned.rate !== undefined
    ? `You ate ${Math.round(planned.rate * 100)}% of your plan ${WHEN[range]}.`
    : `You logged ${days(loggedDays)} ${WHEN[range]}.`;
}

/** The facts under that sentence. */
export function averageLine(average: MealTotals, loggedDays: number): string {
  if (loggedDays === 0) {
    return "Tick a meal on the Meals tab to see your numbers.";
  }
  return `${whole(average.kcal)} kcal and ${whole(average.proteinG)} g of protein a day, on the ${days(loggedDays)} you logged.`;
}

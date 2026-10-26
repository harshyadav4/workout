"use client";

import { useMemo } from "react";

import { Card } from "@/components/ui/card";
import { RankProgress } from "@/features/home/hunter-rank";
import { useWorkoutStore } from "@/features/workout/workout-store";
import { earliestLogDate, shiftKey, weekStartKey } from "@/lib/progress-metrics";
import { buildStreaks } from "@/lib/progress-trends";
import { streakHeadline } from "@/lib/streak-copy";
import { cn, formatVolume } from "@/lib/utils";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"] as const;
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/**
 * The habit, in the unit the app already decided on: weeks, not days. See
 * `buildStreaks` — a day streak rewards never resting, which is bad advice
 * dressed as a number. Copy lives in `lib/streak-copy.ts` so it can be checked.
 *
 * Seven tiles, one per day: an orange key for a day you trained, a well for one
 * you did not, a fainter well for a day still ahead, a ring on today.
 */
export function StreakCard() {
  const logs = useWorkoutStore((state) => state.logs);
  // `activeDate`, never `new Date()` — `dateKey()` pins the app to one timezone
  // and a stray local date would drift a day against the rest of the screen.
  const activeDate = useWorkoutStore((state) => state.activeDate);

  const view = useMemo(() => {
    // All of history, not a fixed window: a 12-week window would cap the streak
    // at 12 and understate it. Ending at today is what makes a partial week read
    // as still-alive rather than broken.
    const streaks = buildStreaks(logs, {
      start: earliestLogDate(logs) ?? activeDate,
      end: activeDate
    });

    const trained = new Set(logs.map((log) => log.date));
    const weekStart = weekStartKey(activeDate);
    const days = WEEKDAYS.map((letter, index) => {
      const date = shiftKey(weekStart, index);
      return { letter, date, name: DAY_NAMES[index], done: trained.has(date) };
    });

    const volume = logs
      .filter((log) => log.date >= weekStart && log.date <= activeDate)
      .reduce((total, log) => total + log.totalVolume, 0);

    return { streaks, days, volume, doneThisWeek: days.filter((day) => day.done).length };
  }, [activeDate, logs]);

  const { title, caption } = streakHeadline(
    view.streaks.currentWeeks,
    view.streaks.longestWeeks,
    logs.length > 0
  );
  const trainedNames = view.days.filter((day) => day.done).map((day) => day.name);

  return (
    <Card>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[15px] font-bold tracking-tight">This week</h3>
        <p className="text-xs text-muted-foreground tabular-nums">
          {view.doneThisWeek > 0
            ? `${view.doneThisWeek} day${view.doneThisWeek === 1 ? "" : "s"} · ${formatVolume(view.volume)} kg`
            : "No workouts yet"}
        </p>
      </div>

      <div
        className="mt-3 grid grid-cols-7 gap-1.5"
        role="img"
        aria-label={
          trainedNames.length > 0
            ? `Trained this week: ${trainedNames.join(", ")}`
            : "No workouts logged this week"
        }
      >
        {view.days.map((day) => {
          const isToday = day.date === activeDate;
          const ahead = day.date > activeDate;
          return (
            <div key={day.date} className="flex flex-col items-center gap-1.5">
              <span
                className={cn(
                  "text-[11px] font-semibold",
                  isToday ? "text-brand" : "text-muted-foreground"
                )}
                aria-hidden
              >
                {day.letter}
              </span>
              <span
                aria-hidden
                className={cn(
                  "h-8 w-full rounded-[9px] transition-colors duration-200",
                  day.done
                    ? "bg-gradient-to-b from-[hsl(var(--key-top))] to-[hsl(var(--key-bottom))] shadow-[inset_0_1px_0_rgba(255,255,255,0.6),inset_0_-2px_0_rgba(0,0,0,0.14)]"
                    : "well",
                  ahead && !day.done ? "opacity-50" : "",
                  isToday ? "ring-2 ring-brand ring-offset-2 ring-offset-card" : ""
                )}
              />
            </div>
          );
        })}
      </div>

      <h4 className="mt-4 font-display text-[22px] font-extrabold leading-none tracking-tight">
        {title}
      </h4>
      <p className="mt-1.5 text-sm text-muted-foreground">{caption}</p>
      <RankProgress />
    </Card>
  );
}

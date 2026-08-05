"use client";

import { Flame } from "lucide-react";
import { useMemo } from "react";

import { Card } from "@/components/ui/card";
import { useWorkoutStore } from "@/features/workout/workout-store";
import { earliestLogDate, shiftKey, weekStartKey } from "@/lib/progress-metrics";
import { buildStreaks } from "@/lib/progress-trends";
import { streakHeadline } from "@/lib/streak-copy";
import { formatVolume } from "@/lib/utils";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"] as const;
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/**
 * The habit, in the unit the app already decided on: weeks, not days. See
 * `buildStreaks` — a day streak rewards never resting, which is bad advice
 * dressed as a number. Copy lives in `lib/streak-copy.ts` so it can be checked.
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
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/15 ring-1 ring-primary/30">
          <Flame className="h-5 w-5 text-primary" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-2xl font-bold leading-tight tracking-tight">{title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{caption}</p>
        </div>
      </div>

      <div
        className="mt-4 grid grid-cols-7 gap-1.5"
        role="img"
        aria-label={
          trainedNames.length > 0
            ? `Trained this week: ${trainedNames.join(", ")}`
            : "No sessions logged this week yet"
        }
      >
        {view.days.map((day) => {
          const isToday = day.date === activeDate;
          // Untrained is a ring, not a fill — a tint alone measures ~1.3:1 on
          // this card and the empty half of the week would be invisible. Days
          // still ahead sit fainter: they are not misses yet.
          const tone = day.done
            ? "bg-success ring-1 ring-success"
            : day.date > activeDate
              ? "bg-white/5 ring-1 ring-white/15"
              : "bg-white/10 ring-1 ring-white/30";

          return (
            <div key={day.date} className="flex flex-col items-center gap-1.5">
              <span
                className={`font-mono text-[11px] ${isToday ? "text-primary" : "text-muted-foreground"}`}
                aria-hidden
              >
                {day.letter}
              </span>
              <span
                aria-hidden
                className={`h-7 w-full rounded-lg transition-colors duration-200 ${tone} ${
                  isToday ? "ring-2 ring-primary" : ""
                }`}
              />
            </div>
          );
        })}
      </div>

      <p className="mt-3 font-mono text-xs tabular-nums text-muted-foreground">
        {view.doneThisWeek > 0
          ? `${view.doneThisWeek} day${view.doneThisWeek === 1 ? "" : "s"} this week · ${formatVolume(view.volume)} kg moved`
          : "Nothing logged this week yet"}
      </p>
    </Card>
  );
}

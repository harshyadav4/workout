"use client";

import { useMemo } from "react";

import { ListGroup, ListRow } from "@/components/ui/list";
import { HorizonArc, horizonY } from "@/components/ui/progress-arc";
import { RankProgress } from "@/features/home/hunter-rank";
import { useWorkoutStore } from "@/features/workout/workout-store";
import { earliestLogDate, shiftKey, weekStartKey } from "@/lib/progress-metrics";
import { buildStreaks } from "@/lib/progress-trends";
import { streakHeadline } from "@/lib/streak-copy";
import { formatVolume } from "@/lib/utils";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"] as const;
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
/** Where each day sits along the horizon. */
const DAY_X = [39, 91, 143, 195, 247, 299, 351];

function useWeek() {
  const logs = useWorkoutStore((state) => state.logs);
  // `activeDate`, never `new Date()` — `dateKey()` pins the app to one timezone
  // and a stray local date would drift a day against the rest of the screen.
  const activeDate = useWorkoutStore((state) => state.activeDate);

  return useMemo(() => {
    const trained = new Set(logs.map((log) => log.date));
    const weekStart = weekStartKey(activeDate);
    const days = WEEKDAYS.map((letter, index) => {
      const date = shiftKey(weekStart, index);
      return { letter, date, name: DAY_NAMES[index], done: trained.has(date), isToday: date === activeDate };
    });
    const volume = logs
      .filter((log) => log.date >= weekStart && log.date <= activeDate)
      .reduce((total, log) => total + log.totalVolume, 0);

    return { days, volume, doneThisWeek: days.filter((day) => day.done).length };
  }, [activeDate, logs]);
}

/**
 * The week as the horizon: a warm dot for a day you trained, a faint one for a
 * day you did not, and the sun on today. The light comes up to today, so a week
 * reads as something still in progress.
 */
export function WeekArc() {
  const { days } = useWeek();
  const today = Math.max(0, days.findIndex((day) => day.isToday));
  const trained = days.filter((day) => day.done).map((day) => day.name);

  return (
    <HorizonArc
      litTo={DAY_X[today]}
      label={trained.length > 0 ? `Trained this week: ${trained.join(", ")}` : "No workouts logged this week"}
    >
      {days.map((day, index) => {
        const x = DAY_X[index];
        const y = horizonY(x);
        return (
          <g key={day.date}>
            {day.isToday ? null : (
              <circle cx={x} cy={y.toFixed(2)} r={day.done ? 3.5 : 3} style={{ fill: day.done ? "var(--l2)" : "var(--track)" }} />
            )}
            <text
              x={x}
              y={(y + 24).toFixed(1)}
              textAnchor="middle"
              className={day.isToday ? "fill-foreground text-[11.5px] font-bold" : "fill-muted-foreground text-[11.5px] font-medium"}
            >
              {day.letter}
            </text>
          </g>
        );
      })}
    </HorizonArc>
  );
}

/**
 * The habit, in the unit the app already decided on: weeks, not days. See
 * `buildStreaks` — a day streak rewards never resting, which is bad advice
 * dressed as a number. Copy lives in `lib/streak-copy.ts` so it can be checked.
 * The days themselves are on the horizon at the top of the page.
 */
export function StreakCard() {
  const logs = useWorkoutStore((state) => state.logs);
  const activeDate = useWorkoutStore((state) => state.activeDate);
  const { volume, doneThisWeek } = useWeek();

  const streaks = useMemo(
    () =>
      // All of history, not a fixed window: a 12-week window would cap the streak
      // at 12 and understate it. Ending at today is what makes a partial week read
      // as still-alive rather than broken.
      buildStreaks(logs, {
        start: earliestLogDate(logs) ?? activeDate,
        end: activeDate
      }),
    [activeDate, logs]
  );

  const { title, caption } = streakHeadline(streaks.currentWeeks, streaks.longestWeeks, logs.length > 0);

  return (
    <ListGroup title="This week">
      <ListRow
        label={title}
        hint={caption}
        value={doneThisWeek > 0 ? `${doneThisWeek} day${doneThisWeek === 1 ? "" : "s"} · ${formatVolume(volume)} kg` : undefined}
      />
      <RankProgress />
    </ListGroup>
  );
}

"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { INJURY_WORKOUT_WEEKS, frequencyWords, injuryWorkoutDates } from "@/lib/injuries";
import { formatDayKey } from "@/lib/progress-metrics";
import type { InjuryWorkoutFrequency } from "@/lib/types";
import { cn, todayKey } from "@/lib/utils";

type Often = "1" | "2" | "pick";

const OFTEN: { id: Often; label: string }[] = [
  { id: "1", label: "Every day" },
  { id: "2", label: "Every 2 days" },
  { id: "pick", label: "Pick days" }
];
const WEEKS = INJURY_WORKOUT_WEEKS.map((weeks) => ({ id: String(weeks), label: `${weeks} weeks` }));
const DAYS: [number, string, string][] = [
  [1, "M", "Monday"],
  [2, "T", "Tuesday"],
  [3, "W", "Wednesday"],
  [4, "T", "Thursday"],
  [5, "F", "Friday"],
  [6, "S", "Saturday"],
  [0, "S", "Sunday"]
];
const FIELD_LABEL = "mb-2 text-[13.5px] font-semibold text-muted-foreground";

/** How often and for how long. The line below it counts the days, so the choice is plain. */
export function InjuryWorkoutForm({
  initial,
  initialWeeks = 6,
  submitLabel,
  onSubmit
}: {
  initial?: InjuryWorkoutFrequency;
  initialWeeks?: number;
  submitLabel: string;
  onSubmit: (frequency: InjuryWorkoutFrequency, weeks: number) => void;
}) {
  const [often, setOften] = useState<Often>(
    initial?.kind === "weekdays" ? "pick" : initial?.days === 2 ? "2" : "1"
  );
  const [weekdays, setWeekdays] = useState<number[]>(initial?.kind === "weekdays" ? initial.weekdays : [1, 3, 5]);
  const [weeks, setWeeks] = useState(String(initialWeeks));

  const frequency: InjuryWorkoutFrequency =
    often === "pick" ? { kind: "weekdays", weekdays } : { kind: "every", days: often === "2" ? 2 : 1 };
  const dates = injuryWorkoutDates(frequency, todayKey(), Number(weeks));
  const last = dates[dates.length - 1];

  return (
    <div>
      <p className={FIELD_LABEL}>How often?</p>
      <Segmented quiet aria-label="How often" options={OFTEN} value={often} onChange={setOften} />
      {often === "pick" ? (
        <div role="group" aria-label="Days" className="mt-2 grid grid-cols-4 gap-1 min-[375px]:grid-cols-7">
          {DAYS.map(([day, letter, name]) => {
            const on = weekdays.includes(day);
            return (
              <button
                key={day}
                type="button"
                aria-pressed={on}
                aria-label={name}
                className={cn("h-11 rounded-2xl text-sm font-medium", on ? "key" : "key-quiet")}
                onClick={() =>
                  setWeekdays((current) => (on ? current.filter((item) => item !== day) : [...current, day]))
                }
              >
                {letter}
              </button>
            );
          })}
        </div>
      ) : null}
      <p className={cn(FIELD_LABEL, "mt-4")}>For how long?</p>
      <Segmented quiet aria-label="For how long" options={WEEKS} value={weeks} onChange={setWeeks} />
      <p className="mt-4 text-[15px] font-medium tabular-nums">
        {last
          ? `${frequencyWords(frequency)}, to ${formatDayKey(last)}. ${dates.length} ${dates.length === 1 ? "day" : "days"}.`
          : "Pick at least one day."}
      </p>
      <p className="mt-2 text-[13px] leading-snug text-muted-foreground">
        Your normal workouts stay as they are. Arise does not raise these targets by itself.
      </p>
      <Button className="mt-4 w-full" disabled={!last} onClick={() => onSubmit(frequency, Number(weeks))}>
        {submitLabel}
      </Button>
    </div>
  );
}

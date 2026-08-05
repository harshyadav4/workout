"use client";

import {
  RANGE_OPTIONS,
  formatDayKey,
  windowDays,
  type DateWindow,
  type ExerciseTotal,
  type ProgressRange
} from "@/lib/progress-metrics";
import { cn } from "@/lib/utils";

/**
 * One filter row, above everything it scopes and outside any card — a filter
 * inside a card reads as content. Every control here scopes every card below, so
 * no two numbers on the page are ever measured over different slices.
 */
export function ProgressFilters({
  range,
  onRangeChange,
  window,
  onWindowChange,
  today,
  exercises,
  workoutId,
  onWorkoutChange
}: {
  range: ProgressRange;
  onRangeChange: (range: ProgressRange) => void;
  window: DateWindow;
  onWindowChange: (window: DateWindow) => void;
  today: string;
  exercises: ExerciseTotal[];
  workoutId?: string;
  onWorkoutChange: (workoutId?: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div
        role="group"
        aria-label="Time range"
        className="grid grid-cols-5 gap-1 rounded-full bg-secondary/50 p-1"
      >
        {RANGE_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={range === option.id}
            onClick={() => onRangeChange(option.id)}
            className={cn(
              "min-h-[44px] rounded-full font-mono text-xs tracking-[0.14em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              range === option.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {range === "custom" ? (
        <div className="rounded-3xl bg-secondary/50 p-3">
          <div className="grid grid-cols-2 gap-2">
            <DateField
              label="From"
              value={window.start}
              max={today}
              onChange={(start) => onWindowChange({ ...window, start })}
            />
            <DateField
              label="To"
              value={window.end}
              max={today}
              onChange={(end) => onWindowChange({ ...window, end })}
            />
          </div>
          <p className="mt-2 text-center font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            {formatDayKey(window.start)} → {formatDayKey(window.end)} · {windowDays(window)} days
          </p>
        </div>
      ) : null}

      {exercises.length > 0 ? (
        <div className="-mx-4 overflow-x-auto px-4 scrollbar-hide [mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)]">
          <div className="flex w-max gap-2">
            <Chip active={!workoutId} onClick={() => onWorkoutChange(undefined)}>
              Everything
            </Chip>
            {exercises.map((exercise) => (
              <Chip
                key={exercise.workoutId}
                active={workoutId === exercise.workoutId}
                onClick={() =>
                  onWorkoutChange(workoutId === exercise.workoutId ? undefined : exercise.workoutId)
                }
              >
                {exercise.name}
              </Chip>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * ponytail: `<input type="date">`. The platform already ships a calendar, a
 * locale-correct format and a keyboard path; a picker component would be a
 * dependency and three bugs to own. `[color-scheme:dark]` is what makes the
 * native panel dark — without it the browser draws a white calendar.
 */
function DateField({
  label,
  value,
  max,
  onChange
}: {
  label: string;
  value: string;
  max: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block rounded-2xl bg-white/[0.04] px-3 py-2">
      <span className="block font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </span>
      <input
        type="date"
        value={value}
        max={max}
        onChange={(event) => {
          // An emptied or half-typed field would collapse the whole page's window.
          if (event.target.value) {
            onChange(event.target.value);
          }
        }}
        className="mt-1 w-full bg-transparent font-mono text-sm tabular-nums text-foreground [color-scheme:dark] focus-visible:outline-none"
      />
    </label>
  );
}

function Chip({
  active,
  onClick,
  children
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "min-h-[44px] whitespace-nowrap rounded-full px-4 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "bg-primary/20 text-primary" : "bg-secondary/50 text-muted-foreground"
      )}
    >
      {children}
    </button>
  );
}

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
        className="well grid grid-cols-5 gap-1 rounded-xl p-1"
      >
        {RANGE_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={range === option.id}
            onClick={() => onRangeChange(option.id)}
            className={cn(
              "min-h-[44px] rounded-lg text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              range === option.id ? "key" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {range === "custom" ? (
        <div className="rounded-xl bg-muted p-3">
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
          <p className="mt-2 text-center text-xs font-semibold text-muted-foreground">
            {formatDayKey(window.start)} → {formatDayKey(window.end)} · {windowDays(window)} days
          </p>
        </div>
      ) : null}

      <ExerciseChips exercises={exercises} workoutId={workoutId} onWorkoutChange={onWorkoutChange} />
    </div>
  );
}

/** The lift chips on their own, for a view that places them under its own header. */
export function ExerciseChips({
  exercises,
  workoutId,
  onWorkoutChange
}: {
  exercises: ExerciseTotal[];
  workoutId?: string;
  onWorkoutChange: (workoutId?: string) => void;
}) {
  if (exercises.length === 0) {
    return null;
  }

  return (
    <div className="-mx-4 overflow-x-auto px-4 scrollbar-hide [mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)]">
      <div className="flex w-max gap-2">
        <Chip active={!workoutId} onClick={() => onWorkoutChange(undefined)}>
          All exercises
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
    <label className="well block rounded-lg px-3 py-2">
      <span className="block text-xs font-semibold text-muted-foreground">
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
        className="mt-1 w-full bg-transparent text-base font-semibold tabular-nums text-foreground focus-visible:outline-none"
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
        "min-h-[44px] whitespace-nowrap rounded-full px-4 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "bg-brand/15 text-brand ring-1 ring-brand/40" : "key-quiet text-muted-foreground"
      )}
    >
      {children}
    </button>
  );
}

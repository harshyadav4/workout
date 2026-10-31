"use client";

import { Check, ChevronDown } from "lucide-react";
import { useState } from "react";

import {
  RANGE_OPTIONS,
  formatDayKey,
  windowDays,
  type DateWindow,
  type ExerciseTotal,
  type ProgressRange
} from "@/lib/progress-metrics";
import { ListRow, ListSheet, SheetDone, SheetRows } from "@/components/ui/list";
import { Segmented } from "@/components/ui/segmented";
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
      <Segmented dense aria-label="Time range" options={RANGE_OPTIONS} value={range} onChange={onRangeChange} />

      {range === "custom" ? <DateFields window={window} onWindowChange={onWindowChange} today={today} /> : null}

      <ExerciseChips exercises={exercises} workoutId={workoutId} onWorkoutChange={onWorkoutChange} />
    </div>
  );
}

const RANGE_ROWS: { id: ProgressRange; short: string; long: string }[] = [
  { id: "4w", short: "4 weeks", long: "Last 4 weeks" },
  { id: "12w", short: "12 weeks", long: "Last 12 weeks" },
  { id: "1y", short: "1 year", long: "Last year" },
  { id: "all", short: "All time", long: "All time" },
  { id: "custom", short: "Dates", long: "Pick dates" }
];

/**
 * The range as one quiet button beside Gym and Cardio. You change it rarely, so
 * five keys across the top of the page were more than it needed.
 */
export function RangeMenu({
  range,
  onRangeChange,
  window,
  onWindowChange,
  today
}: {
  range: ProgressRange;
  onRangeChange: (range: ProgressRange) => void;
  window: DateWindow;
  onWindowChange: (window: DateWindow) => void;
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const short = RANGE_ROWS.find((row) => row.id === range)?.short;

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-label={`Time range: ${short}`}
        onClick={() => setOpen(true)}
        className="key-quiet flex h-11 shrink-0 items-center gap-1 rounded-full pl-3.5 pr-3 text-[13.5px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {short}
        <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden />
      </button>
      <ListSheet open={open} onOpenChange={setOpen} title="Time range">
        <SheetRows>
          {RANGE_ROWS.map((row) => (
            <ListRow
              key={row.id}
              label={row.long}
              noChevron
              value={range === row.id ? <Check className="h-4 w-4 text-foreground" strokeWidth={2.4} aria-label="Chosen" /> : undefined}
              onClick={() => {
                onRangeChange(row.id);
                // Dates still need picking, so that one stays open.
                if (row.id !== "custom") {
                  setOpen(false);
                }
              }}
            />
          ))}
        </SheetRows>
        {range === "custom" ? (
          <div className="mt-3">
            <DateFields window={window} onWindowChange={onWindowChange} today={today} />
            <SheetDone />
          </div>
        ) : null}
      </ListSheet>
    </>
  );
}

function DateFields({
  window,
  onWindowChange,
  today
}: {
  window: DateWindow;
  onWindowChange: (window: DateWindow) => void;
  today: string;
}) {
  return (
    <div>
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
        active ? "key" : "key-quiet text-muted-foreground"
      )}
    >
      {children}
    </button>
  );
}

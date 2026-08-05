"use client";

import { Check, Minus, Plus, Trash2 } from "lucide-react";

import {
  ExerciseMediaDialog,
  templateDatasetId
} from "@/features/workout/exercise-media-dialog";
import type { PlannedExercise, PlannedSet } from "@/lib/types";

const WEIGHT_STEP = 2.5;
const MIN_REPS = 1;
const DURATION_STEP = 5;
const MIN_DURATION = 5;

function Stepper({
  label,
  value,
  suffix,
  step,
  min,
  onChange
}: {
  label: string;
  value: number;
  suffix: string;
  step: number;
  min: number;
  onChange: (next: number) => void;
}) {
  return (
    <div className="rounded-2xl bg-background/70 p-2">
      <p className="text-center text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <div className="mt-1 flex items-center justify-between gap-1">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground transition-colors hover:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95"
          onClick={() => onChange(Math.max(min, value - step))}
        >
          <Minus className="h-5 w-5" />
        </button>
        <span className="font-mono text-2xl font-bold tabular-nums tracking-tight">
          {value}
          <span className="ml-0.5 align-top text-[10px] font-normal uppercase tracking-widest text-muted-foreground">
            {suffix}
          </span>
        </span>
        <button
          type="button"
          aria-label={`Increase ${label}`}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground transition-colors hover:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95"
          onClick={() => onChange(value + step)}
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

function SetChip({
  index,
  setItem,
  isOpen,
  isStamped,
  onOpen
}: {
  index: number;
  setItem: PlannedSet;
  isOpen: boolean;
  /** True for the one set just logged — carries the stamp animation. */
  isStamped: boolean;
  onOpen?: () => void;
}) {
  const state = setItem.completed ? "done" : isOpen ? "open" : "pending";
  // Pending was `bg-secondary` — 1.34:1 on the card, so the hollow half of the
  // tally was invisible and the strip only read in one direction. The ring
  // gives it a shape as well as a colour, which is also what stops done/pending
  // from being a colour-only distinction.
  const tone =
    state === "done"
      ? "bg-primary"
      : state === "open"
        ? "bg-primary/25 ring-1 ring-primary"
        : "bg-white/15 ring-1 ring-white/30";
  const stamp = isStamped ? " set-chip-stamp" : "";

  if (!onOpen) {
    return <span className={`h-2.5 w-6 rounded-full ${tone}`} aria-hidden />;
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Set ${index + 1}, ${state === "done" ? "logged" : state === "open" ? "in progress" : "not logged"}`}
      aria-pressed={isOpen}
      className="flex h-12 w-12 items-center justify-center rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-white/10"
    >
      <span className={`h-2.5 w-6 rounded-full transition-colors duration-200 ${tone}${stamp}`} />
    </button>
  );
}

interface ExerciseLedgerProps {
  exercise: PlannedExercise;
  /** The one set open across the whole session, if it belongs to this exercise. */
  openSetId?: string;
  /** The set logged last, session-wide — the only chip that stamps. */
  stampedSetId?: string;
  /** False while a session is only previewed — chips read, nothing edits. */
  interactive: boolean;
  onOpenSet: (setId: string) => void;
  onPatchSet: (setId: string, patch: Partial<PlannedSet>) => void;
  onLogSet: (setId: string) => void;
  onAddSet: () => void;
  onRemoveSet: (setId: string) => void;
}

export function ExerciseLedger({
  exercise,
  openSetId,
  stampedSetId,
  interactive,
  onOpenSet,
  onPatchSet,
  onLogSet,
  onAddSet,
  onRemoveSet
}: ExerciseLedgerProps) {
  const openSet = exercise.sets.find((setItem) => setItem.id === openSetId);
  const doneCount = exercise.sets.filter((setItem) => setItem.completed).length;
  const isFinished = doneCount === exercise.sets.length && exercise.sets.length > 0;
  const datasetId = templateDatasetId({ id: exercise.workoutId });
  const isTime = exercise.metric === "time";

  // The check belongs beside the tally it annotates, wherever the tally lands.
  const chips = (
    <>
      {isFinished ? <Check className="h-5 w-5 shrink-0 text-success" /> : null}
      {exercise.sets.map((setItem, index) => (
        <SetChip
          key={setItem.id}
          index={index}
          setItem={setItem}
          isOpen={setItem.id === openSetId}
          isStamped={setItem.id === stampedSetId}
          onOpen={interactive ? () => onOpenSet(setItem.id) : undefined}
        />
      ))}
    </>
  );

  return (
    <div className="border-b border-white/5 py-3 last:border-b-0">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <p className="truncate font-semibold leading-tight">{exercise.templateName}</p>
            {datasetId ? (
              <ExerciseMediaDialog datasetId={datasetId} name={exercise.templateName} />
            ) : null}
          </div>
          <p className="mt-0.5 font-mono text-xs tabular-nums text-muted-foreground">
            {doneCount} / {exercise.sets.length} sets
            {isTime && exercise.sets[0]?.durationSeconds
              ? ` · ${exercise.sets[0].durationSeconds}s hold`
              : ""}
            {exercise.restSeconds ? ` · ${exercise.restSeconds}s rest` : ""}
          </p>
        </div>
        {/* Read-only chips are 10px pills — they still fit beside the name, so
            the row stays compact for a previewed or finished session. */}
        {interactive ? null : (
          <div className="flex max-w-[55%] flex-wrap items-center justify-end gap-1.5">{chips}</div>
        )}
      </div>

      {/* The note the session was built with. `plannedExercisesFromTemplate`
          has always carried it onto the planned exercise as `targetNotes` —
          nothing ever rendered it, so it was write-only until here. Full width
          and above the chips: it is a cue you read before the set, not while
          one is open. */}
      {exercise.targetNotes ? (
        <p className="mt-1.5 text-xs italic text-muted-foreground">{exercise.targetNotes}</p>
      ) : null}

      {/* Tappable chips get their own row: at a 48px target a five-set exercise
          wrapped inside `max-w-[55%]` and pushed the exercise name to a stub. */}
      {interactive ? <div className="mt-1.5 flex flex-wrap items-center gap-2">{chips}</div> : null}

      {interactive && openSet ? (
        <div className="mt-3 rounded-3xl bg-secondary/40 p-3">
          <div className="flex items-baseline justify-between">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">
              Set {exercise.sets.indexOf(openSet) + 1}
            </p>
            <p className="font-mono text-xs tabular-nums text-muted-foreground">
              {isTime ? (
                <>target {openSet.durationSeconds ?? 0}s</>
              ) : (
                <>
                  last {openSet.previousWeight ?? openSet.weight}kg ×{" "}
                  {openSet.previousReps ?? openSet.reps}
                </>
              )}
            </p>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <Stepper
              label="Weight"
              suffix="kg"
              value={openSet.weight}
              step={WEIGHT_STEP}
              min={0}
              onChange={(weight) => onPatchSet(openSet.id, { weight })}
            />
            {isTime ? (
              <Stepper
                label="Hold"
                suffix="sec"
                value={openSet.durationSeconds ?? 0}
                step={DURATION_STEP}
                min={MIN_DURATION}
                onChange={(durationSeconds) => onPatchSet(openSet.id, { durationSeconds })}
              />
            ) : (
              <Stepper
                label="Reps"
                suffix="reps"
                value={openSet.reps}
                step={1}
                min={MIN_REPS}
                onChange={(reps) => onPatchSet(openSet.id, { reps })}
              />
            )}
          </div>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => onLogSet(openSet.id)}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-semibold text-primary-foreground shadow-glow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]"
            >
              <Check className="h-4 w-4" />
              {openSet.completed ? "Update set" : "Log set"}
            </button>
            <button
              type="button"
              onClick={onAddSet}
              aria-label="Add a set to this exercise"
              className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-foreground transition-colors hover:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95"
            >
              <Plus className="h-5 w-5" />
            </button>
            {exercise.sets.length > 1 ? (
              <button
                type="button"
                onClick={() => onRemoveSet(openSet.id)}
                aria-label={`Remove set ${exercise.sets.indexOf(openSet) + 1}`}
                className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95"
              >
                <Trash2 className="h-5 w-5" />
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

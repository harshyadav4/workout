"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Minus, Plus, Trash2 } from "lucide-react";

import {
  ExerciseDemoThumb,
  ExerciseMediaDialog,
  templateDatasetId
} from "@/features/workout/exercise-media-dialog";
import { formatPerSide, stepForSide } from "@/lib/per-side";
import type { PlannedExercise, PlannedSet } from "@/lib/types";
import { cn } from "@/lib/utils";

const WEIGHT_STEP = 2.5;
const MIN_REPS = 1;
const DURATION_STEP = 5;
const MIN_DURATION = 5;

// Upper bounds so a held + button (or a fat-fingered keypad) can't run away.
// Generous rather than sport-accurate: the point is a ceiling, not a rule.
const MAX_WEIGHT = 500;
const MAX_REPS = 100;
const MAX_DURATION = 3600;

/**
 * What you lifted here last time, or an honest blank.
 *
 * This used to read `previousWeight ?? openSet.weight` — and since the template
 * wrote its own numbers into `previousWeight`, it was the plan echoed back as
 * history in both branches. A missing record now says so. A weight with no reps
 * came from a `workout_logs` rollup, which knows the peak but not what went
 * with it, so the wording narrows to match what is actually known.
 */
function lastSetLabel(setItem: PlannedSet): string {
  if (setItem.previousWeight === undefined) {
    return "first time";
  }

  return setItem.previousReps === undefined
    ? `last top set ${setItem.previousWeight}kg`
    : `last ${setItem.previousWeight}kg × ${setItem.previousReps}`;
}

function Stepper({
  label,
  value,
  suffix,
  step,
  min,
  max,
  decimal = false,
  onChange
}: {
  label: string;
  value: number;
  suffix: string;
  step: number;
  min: number;
  max: number;
  /** Weight takes 2.5 steps and needs a decimal keypad; reps and holds don't. */
  decimal?: boolean;
  onChange: (next: number) => void;
}) {
  // While the field is being typed into it holds a raw string, because a purely
  // controlled numeric input fights you the moment you backspace to empty.
  // `null` means "show the committed value".
  const [draft, setDraft] = useState<string | null>(null);

  const clamp = (next: number) => Math.min(max, Math.max(min, next));

  const commitDraft = (raw: string) => {
    const parsed = Number(raw);
    // Unparseable input reverts rather than committing a 0 — dropping to zero
    // mid-session is worse than ignoring the edit.
    if (raw.trim() !== "" && Number.isFinite(parsed)) {
      onChange(clamp(parsed));
    }
    setDraft(null);
  };

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
          onClick={() => onChange(clamp(value - step))}
        >
          <Minus className="h-5 w-5" />
        </button>
        {/* The number is the input. Steppers are right for a nudge between
            sets; typing is right for the jump from a 20kg default to a 100kg
            squat, which was 32 taps. Focus selects, so one tap then type
            replaces rather than appends. Native spinners are off — this has
            its own. */}
        <label className="flex min-w-0 flex-1 items-baseline justify-center">
          <span className="sr-only">{label}</span>
          <input
            type="number"
            inputMode={decimal ? "decimal" : "numeric"}
            step={step}
            min={min}
            max={max}
            value={draft ?? value}
            onFocus={(event) => event.target.select()}
            onChange={(event) => {
              setDraft(event.target.value);
              const parsed = Number(event.target.value);
              if (event.target.value.trim() !== "" && Number.isFinite(parsed)) {
                onChange(clamp(parsed));
              }
            }}
            onBlur={(event) => commitDraft(event.target.value)}
            className="w-full min-w-0 bg-transparent text-center font-mono text-2xl font-bold tabular-nums tracking-tight text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <span className="ml-0.5 shrink-0 align-top text-[10px] font-normal uppercase tracking-widest text-muted-foreground">
            {suffix}
          </span>
        </label>
        <button
          type="button"
          aria-label={`Increase ${label}`}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground transition-colors hover:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95"
          onClick={() => onChange(clamp(value + step))}
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
  const panelRef = useRef<HTMLDivElement>(null);
  const doneCount = exercise.sets.filter((setItem) => setItem.completed).length;
  const isFinished = doneCount === exercise.sets.length && exercise.sets.length > 0;
  const datasetId = templateDatasetId({ id: exercise.workoutId });
  const isTime = exercise.metric === "time";

  // Only when the open set arrives from *another* exercise — that is the move
  // that puts the Log set button somewhere you have to go and find, in a session
  // longer than the screen. Between sets of one exercise the panel has not moved,
  // and `nearest` would still nudge the page every log, because a panel this tall
  // usually has a few pixels past the fold. The ref starts at the mounted value,
  // so re-opening the app mid-session does not yank the page either. Scroll
  // margins keep the panel clear of the sticky rest bar and the fixed bottom nav,
  // neither of which `scrollIntoView` can see.
  const ownsOpenSet = interactive && exercise.sets.some((setItem) => setItem.id === openSetId);
  const ownedOpenSet = useRef(ownsOpenSet);

  useEffect(() => {
    if (ownsOpenSet && !ownedOpenSet.current) {
      panelRef.current?.scrollIntoView({ block: "nearest" });
    }
    ownedOpenSet.current = ownsOpenSet;
  }, [ownsOpenSet]);

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

      {/* Why the weight in the field is that number. A prescribed number with no
          reason gets overridden on instinct, which is the same as having no rule
          — so this is load-bearing, not a caption. Primary-tinted to separate it
          from the user's own note directly above. */}
      {exercise.progressionNote ? (
        <p className="mt-1.5 text-xs text-primary/80">{exercise.progressionNote}</p>
      ) : null}

      {/* Tappable chips get their own row: at a 48px target a five-set exercise
          wrapped inside `max-w-[55%]` and pushed the exercise name to a stub. */}
      {interactive ? <div className="mt-1.5 flex flex-wrap items-center gap-2">{chips}</div> : null}

      {interactive && openSet ? (
        <div ref={panelRef} className="mt-3 scroll-mb-28 scroll-mt-20 rounded-3xl bg-secondary/40 p-3">
          {/* Only the open set gets a demo, and it loops without being asked.
              It answers "which one is this again" at the moment the question
              actually comes up — behind a tap on the row above, nobody looks.
              One at a time: six of these running down a session is a slot
              machine, not a ledger. */}
          <div className="flex items-center gap-3">
            {datasetId ? (
              <ExerciseDemoThumb datasetId={datasetId} name={exercise.templateName} />
            ) : null}
            <div className="flex min-w-0 flex-1 items-baseline justify-between gap-2">
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">
                Set {exercise.sets.indexOf(openSet) + 1}
              </p>
              <p className="truncate font-mono text-xs tabular-nums text-muted-foreground">
                {isTime ? <>target {openSet.durationSeconds ?? 0}s</> : lastSetLabel(openSet)}
              </p>
            </div>
          </div>

          {/* Stacked, not side-by-side: two 44px touch targets plus a mono
              number+suffix ("10 REPS") don't fit a 147px half-column without
              shoving the + button past the card edge. */}
          <div className="mt-3 space-y-2">
            <Stepper
              label="Weight"
              suffix="kg"
              value={openSet.weight}
              step={WEIGHT_STEP}
              min={0}
              max={MAX_WEIGHT}
              decimal
              onChange={(weight) => onPatchSet(openSet.id, { weight })}
            />
            {isTime ? (
              <Stepper
                label="Hold"
                suffix="sec"
                value={openSet.durationSeconds ?? 0}
                step={DURATION_STEP}
                min={MIN_DURATION}
                max={MAX_DURATION}
                onChange={(durationSeconds) => onPatchSet(openSet.id, { durationSeconds })}
              />
            ) : (
              <Stepper
                label="Reps"
                // The stored number is always the total across both sides — the
                // split is display only. See lib/per-side.
                suffix={exercise.perSide ? "total" : "reps"}
                value={openSet.reps}
                step={stepForSide(exercise.perSide)}
                min={MIN_REPS}
                max={MAX_REPS}
                onChange={(reps) => onPatchSet(openSet.id, { reps })}
              />
            )}
            {exercise.perSide && openSet.reps > 0 ? (
              <p className="text-center text-xs text-muted-foreground">
                {formatPerSide(openSet.reps, true)}
              </p>
            ) : null}
          </div>

          {/* A warm-up is logged so the ledger is honest about what happened,
              then kept out of every total. Off by default: most sets are work. */}
          <button
            type="button"
            role="switch"
            aria-checked={openSet.type === "warmup"}
            onClick={() =>
              onPatchSet(openSet.id, {
                type: openSet.type === "warmup" ? "normal" : "warmup"
              })
            }
            className={cn(
              "mt-3 flex min-h-11 w-full items-center justify-between rounded-2xl px-4 text-sm transition-colors",
              openSet.type === "warmup"
                ? "bg-warning/15 text-warning ring-1 ring-warning/40"
                : "bg-secondary/50 text-muted-foreground"
            )}
          >
            <span>Warm-up set</span>
            <span className="font-mono text-xs uppercase tracking-[0.18em]">
              {openSet.type === "warmup" ? "not counted" : "counts"}
            </span>
          </button>

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

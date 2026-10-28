"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Minus, Plus, Trash2 } from "lucide-react";

import { LiveTimerControl } from "@/features/home/live-timer";
import { useDistanceUnit } from "@/features/workout/use-distance-unit";
import { formatDistance, formatPace, fromUnit, toUnit } from "@/lib/cardio";
import { formatClock } from "@/lib/timer";
import { ManaBurst, ManaCharge, ManaVial } from "@/features/home/mana-vial";
import { formatRest } from "@/features/home/rest-timer";
import {
  ExerciseDemoThumb,
  ExerciseMediaDialog,
  templateDatasetId
} from "@/features/workout/exercise-media-dialog";
import { useWorkoutStore } from "@/features/workout/workout-store";
import { mediaUrl } from "@/lib/media";
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
/** Reps in reserve a lifter can honestly judge: past 5 it is a guess. */
const RIR_CHOICES = [0, 1, 2, 3, 4, 5] as const;
const MAX_DURATION = 3600;
/** A long run or ride; a typo past this is a typo. */
const MAX_RUN_SECONDS = 3600 * 6;
/** A tenth of a km (or mile) a tap; type for anything bigger. */
const DISTANCE_STEP = 0.1;
const MAX_DISTANCE = 300;

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
    ? `last heaviest set ${setItem.previousWeight} kg`
    : `last time ${setItem.previousWeight} kg × ${setItem.previousReps}`;
}

/**
 * A drum: the number big in a well, a quiet key either side of it below. The
 * number is the input — steppers are right for a nudge between sets; typing is
 * right for the jump from a 20 kg default to a 100 kg squat, which was 32 taps.
 */
function Drum({
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

  // Snapped to the step first: a per-side lift steps by 2 and must stay even
  // (lib/per-side), and neither the minus key nor a typed 7 kept it so.
  const clamp = (next: number) => {
    const snapped = step > 1 ? Math.round(next / step) * step : next;
    return Math.min(max, Math.max(min, snapped));
  };

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
    <div className="well flex flex-col items-center rounded-xl px-2.5 pb-2.5 pt-3">
      <p className="text-[11px] font-semibold text-muted-foreground">{label}</p>
      {/* Focus selects, so one tap then type replaces rather than appends.
          Native spinners are off — this has its own. */}
      <label className="mt-1 flex w-full items-baseline justify-center">
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
          className="w-full min-w-0 bg-transparent text-center font-display text-[40px] font-extrabold leading-none tabular-nums tracking-tight text-foreground focus-visible:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <span className="ml-1 shrink-0 text-sm font-semibold text-muted-foreground">{suffix}</span>
      </label>
      <div className="mt-2.5 flex w-full gap-2">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          className="key-quiet flex h-11 flex-1 items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => onChange(clamp(value - step))}
        >
          <Minus className="h-5 w-5" />
        </button>
        <button
          type="button"
          aria-label={`Increase ${label}`}
          className="key-quiet flex h-11 flex-1 items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => onChange(clamp(value + step))}
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

/** The logged chip: the solid key, lit with mana. */
const DONE_TONE =
  "mana-glow bg-gradient-to-b from-[hsl(var(--key-top))] to-[hsl(var(--key-bottom))] shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_0_0_1px_rgba(0,0,0,0.25)]";

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
  // A golden-ratio step spreads the wave starts evenly, however many sets.
  const phase = (index * 0.618) % 1;
  const pill = (
    <span className="relative block">
      {state === "open" ? <ManaCharge /> : null}
      {state === "done" ? (
        <span className={cn("block h-3 w-[26px] rounded-full", DONE_TONE, isStamped && "set-chip-stamp")} />
      ) : (
        <ManaVial state={state} phase={phase} />
      )}
      {state === "done" && isStamped ? <ManaBurst /> : null}
    </span>
  );

  if (!onOpen) {
    return pill;
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Set ${index + 1}, ${state === "done" ? "logged" : state === "open" ? "in progress" : "not logged"}`}
      aria-pressed={isOpen}
      className="flex h-12 w-12 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-secondary/60"
    >
      {pill}
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
  /** The row was tapped: open this exercise, wherever it sits in the session. */
  onPick: () => void;
  /** Drop this exercise from today. Absent on the last one left. */
  onRemove?: () => void;
  /** The session's one live clock, for timed sets (see live-timer). */
  timer?: {
    /** The set the clock is running for, if any. */
    setId?: string;
    /** When the running clock started (ms since the epoch). */
    startedAt?: number;
    onStart: (setId: string) => void;
    onFinish: () => void;
    onCancel: () => void;
  };
}


/**
 * "Remove from today", inside the open exercise only. Two taps, no dialog: the
 * first arms it and says what the second does, and it disarms itself if the
 * second never comes. A modal would cover the set you are logging; a stray tap
 * mid-set should cost nothing. Quiet text, not an icon on every row — a row of
 * X's read as a list of things to get rid of.
 */
function RemoveExerciseButton({ name, onRemove }: { name: string; onRemove: () => void }) {
  // One tap. It used to arm and ask for a second; the Undo bar is the guard now.
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={`Remove ${name} from today`}
      className="mx-auto mt-2 flex min-h-11 items-center justify-center rounded-lg px-4 text-xs font-semibold text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      Remove from today
    </button>
  );
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
  onRemoveSet,
  onPick,
  onRemove,
  timer
}: ExerciseLedgerProps) {
  const openSet = exercise.sets.find((setItem) => setItem.id === openSetId);
  const panelRef = useRef<HTMLDivElement>(null);
  const doneCount = exercise.sets.filter((setItem) => setItem.completed).length;
  const isFinished = doneCount === exercise.sets.length && exercise.sets.length > 0;
  const datasetId = templateDatasetId({ id: exercise.workoutId });
  // An exercise from outside the library may carry a stored GIF instead.
  const gifUrl = mediaUrl(
    useWorkoutStore((state) => state.templates.find((item) => item.id === exercise.workoutId)?.mediaPath)
  );
  const hasMedia = Boolean(datasetId || gifUrl);
  const isTime = exercise.metric === "time";
  const isDistance = exercise.metric === "distance";
  const unit = useDistanceUnit();

  // Only when the open set arrives from *another* exercise — that is the move
  // that puts the Log set button somewhere you have to go and find, in a session
  // longer than the screen. Between sets of one exercise the panel has not moved,
  // and `nearest` would still nudge the page every log, because a panel this tall
  // usually has a few pixels past the fold. The ref starts at the mounted value,
  // so re-opening the app mid-session does not yank the page either. Scroll
  // margins keep the panel clear of the sticky session strip and the dock,
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
      {isFinished ? <Check className="h-5 w-5 shrink-0 text-brand" aria-label="All sets logged" /> : null}
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

  // "4 × 5 · 70 kg · 2:30 rest" when nothing is logged yet; the tally once
  // something is. The plan's numbers are what you want to see before a set,
  // and the count is what you want after.
  const first = exercise.sets[0];
  const planLine =
    doneCount === 0 && first
      ? isDistance
        ? `${exercise.sets.length} × ${formatDistance(first.distanceKm ?? 0, unit)}`
        : isTime
          ? `${exercise.sets.length} × ${first.durationSeconds ?? 0}s`
          : `${exercise.sets.length} × ${first.reps} · ${first.weight} kg`
      : `${doneCount} of ${exercise.sets.length} sets`;
  const restLine = exercise.restSeconds ? ` · ${formatRest(exercise.restSeconds)} rest` : "";

  return (
    // The open exercise is lit, so in a superset — two exercises taken in
    // turns — it is plain which one the panel is logging.
    <div
      className={cn(
        "border-b border-border py-3 last:border-b-0",
        ownsOpenSet && "-mx-3 rounded-xl border-transparent bg-brand/[0.06] px-3 ring-1 ring-brand/30"
      )}
    >
      {/* The whole head of the row is the way in — name, plan line and notes —
          so switching mid-session (the machine is busy, or a superset) is one
          tap anywhere on it, not a hunt for a 26px chip. The name stays a real
          button for keyboards and screen readers; this is the wide touch area. */}
      <div onClick={interactive ? onPick : undefined} className={cn(interactive && "cursor-pointer")}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            {interactive ? (
              <button
                type="button"
                onClick={onPick}
                aria-pressed={ownsOpenSet}
                className={cn(
                  "-my-2 min-h-11 min-w-0 truncate rounded-md py-2 text-left text-[15px] font-semibold leading-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  ownsOpenSet ? "text-brand" : isFinished ? "text-muted-foreground" : ""
                )}
              >
                {exercise.templateName}
              </button>
            ) : (
              <p className="truncate text-[15px] font-semibold leading-tight">{exercise.templateName}</p>
            )}
            {/* Clicks in the demo sheet bubble through the React tree even from
                its portal; stopped here so watching a demo never re-picks a set.
                Not on the open exercise: its panel's demo thumbnail is the same
                door, and two of them a few rows apart is one too many. */}
            {hasMedia && !ownsOpenSet ? (
              <span onClick={(event) => event.stopPropagation()} className="contents">
                <ExerciseMediaDialog datasetId={datasetId} gifUrl={gifUrl} name={exercise.templateName} />
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
            {planLine}
            {restLine}
          </p>
        </div>
        {/* Read-only chips are small pills — they still fit beside the name, so
            the row stays compact for a previewed or finished session. */}
        {interactive ? null : (
          <div className="flex max-w-[55%] flex-wrap items-center justify-end gap-1.5">{chips}</div>
        )}
      </div>

      {/* The note the session was built with. Full width and above the chips:
          it is a cue you read before the set, not while one is open. */}
      {exercise.targetNotes ? (
        <p className="mt-1.5 text-xs italic text-muted-foreground">{exercise.targetNotes}</p>
      ) : null}

      {/* Why the weight in the field is that number. A prescribed number with no
          reason gets overridden on instinct, which is the same as having no rule
          — so this is load-bearing, not a caption. Brand-tinted to separate it
          from the user's own note directly above. */}
      {exercise.progressionNote ? (
        <p className="mt-1.5 text-xs text-brand/80">{exercise.progressionNote}</p>
      ) : null}
      </div>

      {/* Tappable chips get their own row: at a 48px target a five-set exercise
          wrapped inside `max-w-[55%]` and pushed the exercise name to a stub. */}
      {interactive ? <div className="mt-1 flex flex-wrap items-center gap-1.5">{chips}</div> : null}

      {interactive && openSet ? (
        <div ref={panelRef} className="mt-2 scroll-mb-28 scroll-mt-24">
          {/* Only the open set gets a demo, and it loops without being asked.
              It answers "which one is this again" at the moment the question
              actually comes up — behind a tap on the row above, nobody looks.
              One at a time: six of these running down a session is a slot
              machine, not a ledger. */}
          <div className="flex items-center gap-3">
            {hasMedia ? (
              <ExerciseDemoThumb datasetId={datasetId} gifUrl={gifUrl} name={exercise.templateName} />
            ) : null}
            <div className="flex min-w-0 flex-1 items-baseline justify-between gap-2">
              <p className="text-sm font-semibold">
                Set {exercise.sets.indexOf(openSet) + 1}
                <span className="text-muted-foreground"> of {exercise.sets.length}</span>
              </p>
              <p className="truncate text-xs text-muted-foreground tabular-nums">
                {isDistance ? (
                  <>target {formatClock(openSet.durationSeconds ?? 0)}</>
                ) : isTime ? (
                  <>target {openSet.durationSeconds ?? 0}s</>
                ) : (
                  lastSetLabel(openSet)
                )}
              </p>
            </div>
          </div>

          {/* A run: how far and how long. The weight drum would only invite a 0. */}
          {isDistance ? (
            <>
              <div className="mt-3 grid grid-cols-2 gap-2.5">
                <Drum
                  label="Distance"
                  suffix={unit}
                  value={Math.round(toUnit(openSet.distanceKm ?? 0, unit) * 100) / 100}
                  step={DISTANCE_STEP}
                  min={0}
                  max={MAX_DISTANCE}
                  decimal
                  onChange={(value) => onPatchSet(openSet.id, { distanceKm: fromUnit(value, unit) })}
                />
                <Drum
                  label="Time"
                  suffix="min"
                  value={Math.round(((openSet.durationSeconds ?? 0) / 60) * 10) / 10}
                  step={1}
                  min={0}
                  max={MAX_RUN_SECONDS / 60}
                  decimal
                  onChange={(minutes) => onPatchSet(openSet.id, { durationSeconds: Math.round(minutes * 60) })}
                />
              </div>
              <p className="mt-2 text-center text-xs text-muted-foreground tabular-nums">
                {formatClock(openSet.durationSeconds ?? 0)}
                {formatPace(openSet.durationSeconds ?? 0, openSet.distanceKm ?? 0, unit)
                  ? ` · ${formatPace(openSet.durationSeconds ?? 0, openSet.distanceKm ?? 0, unit)}`
                  : ""}
              </p>
            </>
          ) : (
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <Drum
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
              <Drum
                label="Hold"
                suffix="sec"
                value={openSet.durationSeconds ?? 0}
                step={DURATION_STEP}
                min={MIN_DURATION}
                max={MAX_DURATION}
                onChange={(durationSeconds) => onPatchSet(openSet.id, { durationSeconds })}
              />
            ) : (
              <Drum
                label="Reps"
                // The stored number is always the total across both sides — the
                // split is display only. See lib/per-side.
                suffix={exercise.perSide ? "total" : "reps"}
                value={openSet.reps}
                step={stepForSide(exercise.perSide)}
                min={exercise.perSide ? stepForSide(true) : MIN_REPS}
                max={MAX_REPS}
                onChange={(reps) => onPatchSet(openSet.id, { reps })}
              />
            )}
          </div>
          )}
          {/* Reps in reserve: how many more were left after the set. Rep sets
              only — a hold ends at the clock and a run at the distance. Six
              chips, not a drum: it is a judgement, and 0–5 is the whole range
              anyone can judge. Optional, and tapping the chosen chip clears
              it: a guess forced out of someone is worse than no answer. */}
          {!isTime && !isDistance ? (
            <div className="mt-2.5">
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                Reps left in the tank
                {openSet.rir === undefined ? <span className="text-muted-foreground/60"> · optional</span> : null}
              </p>
              <div role="group" aria-label="Reps left in the tank" className="grid grid-cols-6 gap-1.5">
                {RIR_CHOICES.map((rir) => {
                  const selected = openSet.rir === rir;
                  return (
                    <button
                      key={rir}
                      type="button"
                      aria-pressed={selected}
                      aria-label={`${rir} rep${rir === 1 ? "" : "s"} left in the tank`}
                      onClick={() => onPatchSet(openSet.id, { rir: selected ? undefined : rir })}
                      className={cn(
                        "h-11 rounded-xl text-sm font-bold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        selected ? "bg-brand/15 text-brand ring-1 ring-brand/50" : "key-quiet text-muted-foreground"
                      )}
                    >
                      {rir}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
          {/* A hold or a run is timed, not typed: Start, go, Finish fills the
              seconds. A hold aims at its target; a run just counts. */}
          {(isTime || isDistance) && timer ? (
            <LiveTimerControl
              running={timer.setId === openSet.id}
              startedAt={timer.startedAt}
              targetSeconds={isTime ? openSet.durationSeconds : undefined}
              onStart={() => timer.onStart(openSet.id)}
              onFinish={timer.onFinish}
              onCancel={timer.onCancel}
            />
          ) : null}
          {exercise.perSide && openSet.reps > 0 ? (
            <p className="mt-2 text-center text-xs text-muted-foreground">
              {formatPerSide(openSet.reps, true)}
            </p>
          ) : null}

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => onLogSet(openSet.id)}
              className="key flex h-14 flex-1 items-center justify-center gap-2 rounded-xl font-display text-[18px] font-bold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Check className="h-5 w-5" strokeWidth={3} />
              {openSet.completed ? "Update set" : "Log set"}
            </button>
            {/* A warm-up is logged so the ledger is honest about what happened,
                then kept out of every total. Off by default: most sets are work.
                Not on a run: an easy first km is just a slower row. */}
            {isDistance ? null : (
            <button
              type="button"
              role="switch"
              aria-checked={openSet.type === "warmup"}
              aria-label={openSet.type === "warmup" ? "Warm-up set. Not counted in totals" : "Mark as a warm-up set"}
              title="Warm-up"
              onClick={() =>
                onPatchSet(openSet.id, {
                  type: openSet.type === "warmup" ? "normal" : "warmup"
                })
              }
              className={cn(
                "flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                openSet.type === "warmup"
                  ? "bg-warning/15 text-warning ring-1 ring-warning/50"
                  : "key-quiet text-muted-foreground"
              )}
            >
              W
            </button>
            )}
            <button
              type="button"
              onClick={onAddSet}
              aria-label="Add a set to this exercise"
              className="key-quiet flex h-14 w-14 shrink-0 items-center justify-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Plus className="h-5 w-5" />
            </button>
            {exercise.sets.length > 1 ? (
              <button
                type="button"
                onClick={() => onRemoveSet(openSet.id)}
                aria-label={`Remove set ${exercise.sets.indexOf(openSet) + 1}`}
                className="key-quiet flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Trash2 className="h-5 w-5" />
              </button>
            ) : null}
          </div>
          {openSet.type === "warmup" ? (
            <p className="mt-2 text-xs text-warning">Warm-up sets do not count in totals.</p>
          ) : null}
          {onRemove ? <RemoveExerciseButton name={exercise.templateName} onRemove={onRemove} /> : null}
        </div>
      ) : null}
    </div>
  );
}

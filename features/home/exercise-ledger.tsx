"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Minus, Plus, Trash2 } from "lucide-react";

import { LiveTimerControl } from "@/features/home/live-timer";
import { useDistanceUnit } from "@/features/workout/use-distance-unit";
import { type DistanceUnit, formatDistance, formatPace, fromUnit, toUnit } from "@/lib/cardio";
import { formatClock } from "@/lib/timer";
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

/** "62.5 kg × 8", "45 s", "5 km · 28:30": the set, in the units it is done in. */
function setSummary(setItem: PlannedSet, isTime: boolean, isDistance: boolean, unit: DistanceUnit) {
  if (isDistance) {
    return `${formatDistance(setItem.distanceKm ?? 0, unit)} · ${formatClock(setItem.durationSeconds ?? 0)}`;
  }
  if (isTime) {
    const hold = `${setItem.durationSeconds ?? 0} s`;
    return setItem.weight > 0 ? `${setItem.weight} kg · ${hold}` : hold;
  }
  return setItem.weight > 0 ? `${setItem.weight} kg × ${setItem.reps}` : `${setItem.reps} reps`;
}

/**
 * A drum: the number in a field, with a quiet key on either side of it. The
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
    <div className="well rounded-2xl pb-1 pt-1.5">
      <p className="text-center text-[11.5px] font-medium text-muted-foreground">
        {/* "Reps · reps" says it twice. */}
        {suffix.toLowerCase() === label.toLowerCase() ? label : `${label} · ${suffix}`}
      </p>
      <div className="flex items-center">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => onChange(clamp(value - step))}
        >
          <Minus className="h-5 w-5" strokeWidth={1.8} />
        </button>
        {/* Focus selects, so one tap then type replaces rather than appends.
            Native spinners are off — this has its own. */}
        <label className="min-w-0 flex-1">
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
            className="w-full min-w-0 bg-transparent text-center text-[22px] font-semibold tabular-nums tracking-[-0.02em] text-foreground focus-visible:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
        </label>
        <button
          type="button"
          aria-label={`Increase ${label}`}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => onChange(clamp(value + step))}
        >
          <Plus className="h-5 w-5" strokeWidth={1.8} />
        </button>
      </div>
    </div>
  );
}

/** One set as one flat row: its number, what it holds, and a warm tick once logged. */
function SetRow({
  index,
  setItem,
  summary,
  isOpen,
  isStamped,
  onOpen
}: {
  index: number;
  setItem: PlannedSet;
  summary: string;
  isOpen: boolean;
  /** True for the one set just logged — carries the stamp animation. */
  isStamped: boolean;
  onOpen: () => void;
}) {
  const state = setItem.completed ? "logged" : isOpen ? "in progress" : "not logged";
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Set ${index + 1}, ${state}. ${summary}`}
      aria-pressed={isOpen}
      className={cn(
        "grid min-h-11 w-full grid-cols-[1.75rem_1fr_1.5rem] items-center rounded-xl px-2 text-left text-[15px] tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isOpen ? "bg-hi font-semibold" : setItem.completed ? "text-muted-foreground" : ""
      )}
    >
      <span className={cn("text-[13px]", setItem.type === "warmup" ? "font-semibold text-warning" : "text-muted-foreground")}>
        {setItem.type === "warmup" ? "W" : index + 1}
      </span>
      <span>{summary}</span>
      {setItem.completed ? (
        <Check
          className={cn("h-4 w-4 justify-self-end text-[var(--l2)]", isStamped && "set-chip-stamp")}
          strokeWidth={2.6}
          aria-hidden
        />
      ) : null}
    </button>
  );
}

/** The rare things next to the set you are logging. Quiet, and away from the main button. */
const QUIET_ACTION =
  "flex min-h-11 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

interface ExerciseLedgerProps {
  exercise: PlannedExercise;
  /** The one set open across the whole session, if it belongs to this exercise. */
  openSetId?: string;
  /** The set logged last, session-wide — the only row that stamps. */
  stampedSetId?: string;
  /** False while a session is only previewed — nothing edits. */
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
    // The open exercise is the one that is open, so in a superset — two exercises
    // taken in turns — it is plain which one the panel is logging.
    <div className="border-t border-sep px-4 py-3 first:border-t-0">
      {/* The whole head of the row is the way in — name, plan line and notes —
          so switching mid-session (the machine is busy, or a superset) is one
          tap anywhere on it. The name stays a real button for keyboards and
          screen readers; this is the wide touch area. */}
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
                    "min-w-0 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    ownsOpenSet
                      ?"font-heading text-[30px] leading-[1.1]"
                      : "-my-2 min-h-11 truncate py-2 text-[15.5px] font-medium leading-tight",
                    isFinished && !ownsOpenSet ? "text-muted-foreground" : ""
                  )}
                >
                  {exercise.templateName}
                </button>
              ) : (
                <p className="truncate text-[15.5px] font-medium leading-tight">{exercise.templateName}</p>
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
            <p className="mt-0.5 text-[13px] text-muted-foreground tabular-nums">
              {planLine}
              {restLine}
            </p>
          </div>
          {isFinished ? <Check className="h-5 w-5 shrink-0 text-[var(--l2)]" strokeWidth={2.4} aria-label="All sets logged" /> : null}
        </div>

        {/* The note the session was built with: a cue you read before the set. */}
        {exercise.targetNotes ? (
          <p className="mt-1.5 text-[13px] italic text-muted-foreground">{exercise.targetNotes}</p>
        ) : null}

        {/* Why the weight in the field is that number. A prescribed number with no
            reason gets overridden on instinct, which is the same as having no rule
            — so this is load-bearing, not a caption. Tinted to separate it from
            the user's own note directly above. */}
        {exercise.progressionNote ? (
          <p className="mt-1.5 text-[13px] text-brand">{exercise.progressionNote}</p>
        ) : null}
      </div>

      {interactive && openSet ? (
        <>
          <div className="mt-2 space-y-0.5">
            {exercise.sets.map((setItem, index) => (
              <SetRow
                key={setItem.id}
                index={index}
                setItem={setItem}
                summary={setSummary(setItem, isTime, isDistance, unit)}
                isOpen={setItem.id === openSetId}
                isStamped={setItem.id === stampedSetId}
                onOpen={() => onOpenSet(setItem.id)}
              />
            ))}
          </div>

          {/* Below every set, not inside the open one, so the Log set button stays
              where the thumb left it from one set to the next. */}
          <div ref={panelRef} className="mt-3 scroll-mb-28 scroll-mt-24">
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
                <p className="truncate text-[13px] text-muted-foreground tabular-nums">
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
                <div className="mt-3 grid grid-cols-2 gap-2">
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
                <p className="mt-2 text-center text-[13px] text-muted-foreground tabular-nums">
                  {formatClock(openSet.durationSeconds ?? 0)}
                  {formatPace(openSet.durationSeconds ?? 0, openSet.distanceKm ?? 0, unit)
                    ? ` · ${formatPace(openSet.durationSeconds ?? 0, openSet.distanceKm ?? 0, unit)}`
                    : ""}
                </p>
              </>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-2">
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
              <div className="mt-3">
                <p className="mb-1.5 text-[12.5px] font-medium text-muted-foreground">
                  Reps left in the tank
                  {openSet.rir === undefined ? <span className="text-muted-foreground/70"> · optional</span> : null}
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
                          "h-11 rounded-full text-sm font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          selected ? "bg-hi text-foreground ring-1 ring-foreground" : "well text-muted-foreground"
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
              <p className="mt-2 text-center text-[13px] text-muted-foreground">
                {formatPerSide(openSet.reps, true)}
              </p>
            ) : null}

            <button
              type="button"
              onClick={() => onLogSet(openSet.id)}
              className="key mt-3 flex h-14 w-full items-center justify-center gap-2 rounded-full text-base font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Check className="h-5 w-5" strokeWidth={2.6} />
              {openSet.completed ? "Update set" : "Log set"}
            </button>

            <div className="mt-1 flex flex-wrap items-center justify-center">
              {/* A warm-up is logged so the ledger is honest about what happened,
                  then kept out of every total. Off by default: most sets are work.
                  Not on a run: an easy first km is just a slower row. */}
              {isDistance ? null : (
                <button
                  type="button"
                  role="switch"
                  aria-checked={openSet.type === "warmup"}
                  aria-label={openSet.type === "warmup" ? "Warm-up set. Not counted in totals" : "Mark as a warm-up set"}
                  onClick={() =>
                    onPatchSet(openSet.id, {
                      type: openSet.type === "warmup" ? "normal" : "warmup"
                    })
                  }
                  className={cn(QUIET_ACTION, openSet.type === "warmup" && "text-warning")}
                >
                  Warm-up
                </button>
              )}
              <button type="button" onClick={onAddSet} aria-label="Add a set to this exercise" className={QUIET_ACTION}>
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Add set
              </button>
              {exercise.sets.length > 1 ? (
                <button
                  type="button"
                  onClick={() => onRemoveSet(openSet.id)}
                  aria-label={`Remove set ${exercise.sets.indexOf(openSet) + 1}`}
                  className={QUIET_ACTION}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  Remove set
                </button>
              ) : null}
              {/* One tap. It used to arm and ask for a second; the Undo bar is the guard now. */}
              {onRemove ? (
                <button
                  type="button"
                  onClick={onRemove}
                  aria-label={`Remove ${exercise.templateName} from today`}
                  className={QUIET_ACTION}
                >
                  Remove from today
                </button>
              ) : null}
            </div>
            {openSet.type === "warmup" ? (
              <p className="text-center text-[13px] text-warning">Warm-up sets do not count in totals.</p>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

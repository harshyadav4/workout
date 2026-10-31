"use client";

import { ChevronDown, ChevronLeft, ChevronRight, Dumbbell, PlayCircle, Plus, Sparkles } from "lucide-react";
import { useState, useEffect } from "react";

import { Button } from "@/components/ui/button";
import { InfoNote } from "@/components/ui/info-note";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DRAWER_CONTENT, SHEET_FOOT } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ListGroup, ListRow, ListSwitch, SheetRows } from "@/components/ui/list";
import { Segmented } from "@/components/ui/segmented";
import { SwipeRow } from "@/components/ui/swipe-row";
import { usePendingRemoval } from "@/components/ui/use-pending-removal";
import { NumberInput } from "@/components/ui/number-input";
import { ThemedSelect } from "@/components/ui/select";
import { AiImportSheet } from "@/features/planner/ai-import";
import { InjuryWorkoutForm } from "@/features/injuries/injury-workout-form";
import { ExercisePicker } from "@/features/planner/exercise-picker";
import { MuscleSelectView } from "@/features/planner/muscle-drawer";
import { ExerciseMediaView, templateDatasetId } from "@/features/workout/exercise-media-dialog";
import { useDistanceUnit } from "@/features/workout/use-distance-unit";
import { offerUndo } from "@/lib/undo";
import { useWorkoutStore } from "@/features/workout/workout-store";
import { type DistanceUnit, formatDistance, fromUnit, isDistanceExercise, toUnit } from "@/lib/cardio";
import { deriveEngagement, type Exercise } from "@/lib/exercises";
import { evenTarget } from "@/lib/per-side";
import { formatClock } from "@/lib/timer";
import {
  DEFAULT_INCREMENT_KG,
  DEFAULT_INCREMENT_SECONDS,
  PROGRESSION_LABELS
} from "@/lib/progression";
import { activeInjuries, injuryName } from "@/lib/injuries";
import { buildSessionSummary } from "@/lib/workout-helpers";
import type {
  ExerciseMetric,
  Injury,
  ProgressionSettings,
  MuscleId,
  SessionTemplate,
  SessionTemplateExercise,
  WorkoutMuscleTarget
} from "@/lib/types";

type BuilderExercise = {
  id: string;
  name: string;
  workoutId?: string;
  dbId?: string;
  category?: string;
  equipment?: string;
  muscles: Partial<Record<MuscleId, number>>;
  sets: number;
  reps: number;
  weight: number;
  weights?: number[];
  restSeconds: number;
  notes?: string;
  metric?: ExerciseMetric;
  durationSeconds?: number;
  /** km, when metric is "distance". Shown in the device's unit. */
  distanceKm?: number;
  perSide?: boolean;
};

const DEFAULT_HOLD_SECONDS = 45;
/** A first run, before anything is logged: 5 km in 30 minutes. */
const DEFAULT_RUN_KM = 5;
const DEFAULT_RUN_SECONDS = 1800;

function createEmptyExercise(): BuilderExercise {
  return {
    id: crypto.randomUUID(),
    name: "",
    muscles: {},
    sets: 3,
    reps: 10,
    weight: 20,
    restSeconds: 75
  };
}

// Per-set weights collapse to a single number when they never vary, and to
// nothing when there is no load at all.
function formatWeights(exercise: BuilderExercise): string {
  const weights = exercise.weights?.slice(0, exercise.sets);
  if (weights && weights.length > 0 && weights.some((value) => value !== weights[0])) {
    return ` · ${weights.join(" / ")} kg`;
  }
  const weight = weights?.[0] ?? exercise.weight;
  return weight > 0 ? ` · ${weight} kg` : "";
}

/** "3 × 10 · 45 kg" for a lift, "3 × 45s" for a hold, "1 × 5 km · 30:00" for a run; then the rest. */
function targetLine(exercise: BuilderExercise, unit: DistanceUnit): string {
  const target =
    exercise.metric === "distance"
      ? `${exercise.sets} × ${formatDistance(exercise.distanceKm ?? DEFAULT_RUN_KM, unit)} · ${formatClock(exercise.durationSeconds ?? DEFAULT_RUN_SECONDS)}`
      : exercise.metric === "time"
        ? `${exercise.sets} × ${exercise.durationSeconds ?? DEFAULT_HOLD_SECONDS}s${formatWeights(exercise)}`
        : `${exercise.sets} × ${exercise.reps}${formatWeights(exercise)}`;
  return `${target} · ${exercise.restSeconds}s rest`;
}

/** "5 exercises · 15 sets · 4,446 kg": what a saved workout holds, on one line. */
function workoutLine(session: SessionTemplate): string {
  const count = session.exercises.length;
  const load = Math.round(session.summary.totalWeight);
  const sets = session.summary.totalSets;
  return `${count} exercise${count === 1 ? "" : "s"} · ${sets} set${sets === 1 ? "" : "s"}${load > 0 ? ` · ${load.toLocaleString("en-US")} kg` : ""}`;
}

function toBuilderExercise(exercise: SessionTemplateExercise): BuilderExercise {
  return {
    id: exercise.id,
    name: exercise.name,
    workoutId: exercise.workoutId,
    muscles: Object.fromEntries(
      exercise.muscles.map((target) => [target.muscleId, target.engagement])
    ) as Partial<Record<MuscleId, number>>,
    sets: exercise.sets,
    reps: exercise.reps,
    weight: exercise.weight,
    weights: exercise.weights,
    restSeconds: exercise.restSeconds,
    notes: exercise.notes,
    metric: exercise.metric,
    durationSeconds: exercise.durationSeconds,
    distanceKm: exercise.distanceKm,
    perSide: exercise.perSide
  };
}

// Fresh picks carry dbId; cards rebuilt from a saved session only have the
// workoutId, which encodes the same dataset id.
function builderDatasetId(exercise: BuilderExercise): string | undefined {
  return (
    exercise.dbId ?? (exercise.workoutId ? templateDatasetId({ id: exercise.workoutId }) : undefined)
  );
}

function toMuscleTargets(muscles: Partial<Record<MuscleId, number>>): WorkoutMuscleTarget[] {
  return Object.entries(muscles).map(([muscleId, engagement]) => ({
    muscleId: muscleId as MuscleId,
    engagement: engagement ?? 0
  }));
}

/** Where the error belongs on screen — `name` renders under the name field. */
type BuilderError = { field: "name" | "form"; message: string };

/**
 * `Number("")` is 0, so clearing a field silently saved a 0-set exercise onto
 * real days — `min` on the input is a hint the browser never enforces. Clamp at
 * save rather than per keystroke, so a field can still be emptied to retype.
 */
function clampNumber(value: number, min: number, whole = true): number {
  const parsed = whole ? Math.round(value) : value;
  return Number.isFinite(parsed) ? Math.max(min, parsed) : min;
}

function slug(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "-");
}

// Match the store's addTemplate/createSessionTemplate normalization so the
// in-draft dedup and reuse-by-name lookup agree with what actually registers.
function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function PlanBuild({
  sharedText,
  forInjury
}: {
  /** Text shared into the app from Android's share sheet: an AI answer to import. */
  sharedText?: string;
  /** An injury's id: open Add workout straight away, with its label set. */
  forInjury?: string;
} = {}) {
  const unit = useDistanceUnit();
  const muscles = useWorkoutStore((state) => state.muscles);
  const templates = useWorkoutStore((state) => state.templates);
  const sessionTemplates = useWorkoutStore((state) => state.sessionTemplates);
  const addTemplate = useWorkoutStore((state) => state.addTemplate);
  const createSessionTemplate = useWorkoutStore((state) => state.createSessionTemplate);
  const updateSessionTemplate = useWorkoutStore((state) => state.updateSessionTemplate);
  const deleteSessionTemplate = useWorkoutStore((state) => state.deleteSessionTemplate);
  const injuries = useWorkoutStore((state) => state.injuries);
  const setInjuryWorkout = useWorkoutStore((state) => state.setInjuryWorkout);

  const [drawerOpen, setDrawerOpen] = useState(false);
  // The "For an injury" label, and the workout waiting for its days. Nothing is
  // saved until those are chosen, so closing that sheet goes back to the form.
  const [labelFor, setLabelFor] = useState("");
  const [planning, setPlanning] = useState<SessionTemplate>();
  const [aiOpen, setAiOpen] = useState(false);
  // Shared text opens the AI sheet straight away, with the text in it.
  useEffect(() => {
    if (sharedText) {
      setAiOpen(true);
    }
  }, [sharedText]);
  const [sessionName, setSessionName] = useState("");
  // ponytail: session-level only. The model also honours a per-exercise
  // override (see SessionTemplateExercise.progression) — expose it when
  // someone actually needs +5kg on deadlift and +1.25 on curls.
  const [progression, setProgression] = useState<ProgressionSettings>({ rule: "off" });
  // The one rule that steps in seconds, so the increment field below is a hold
  // and not a plate.
  const isTimeRule = progression.rule === "time";
  const [builderExercises, setBuilderExercises] = useState<BuilderExercise[]>([createEmptyExercise()]);
  // One exercise open at a time. Adding the next one folds the last away, so
  // a thumb that lands on the card above cannot rewrite a finished exercise.
  const [openExerciseId, setOpenExerciseId] = useState<string | null>(
    () => builderExercises[0]?.id ?? null
  );
  const [error, setError] = useState<BuilderError | null>(null);
  const [pickerCardId, setPickerCardId] = useState<string | null>(null);
  const [muscleCardId, setMuscleCardId] = useState<string | null>(null);
  // Swapped into the open drawer instead of a nested dialog — see ExercisePicker.
  const [media, setMedia] = useState<{ datasetId: string; name: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  // Deleted workouts hide at once and commit after the Undo bar (components/ui/undo-bar).
  const removal = usePendingRemoval();
  const deleteWithUndo = (session: { id: string; name: string }) =>
    removal.remove(session.id, `${session.name} deleted`, () => deleteSessionTemplate(session.id));
  /** Drops a builder exercise; Undo puts the list back as it was. */
  const removeBuilderExercise = (exerciseId: string) => {
    const previous = builderExercises;
    setBuilderExercises((current) => current.filter((item) => item.id !== exerciseId));
    setOpenExerciseId((current) => (current === exerciseId ? null : current));
    offerUndo({ label: "Exercise removed", undo: () => setBuilderExercises(previous), commit: () => undefined });
  };

  const labelOptions = activeInjuries(injuries).filter((injury) => !injury.workout);
  const labelledInjury = labelOptions.find((injury) => injury.id === labelFor);
  const ownerOf = (sessionId: string) => injuries.find((injury) => injury.workout?.sessionTemplateId === sessionId);
  const isOwnWorkout = Boolean(editingId && ownerOf(editingId));

  const shownWorkouts = sessionTemplates.filter((session) => !removal.hidden.has(session.id));
  const hasPlan = shownWorkouts.length > 0;

  const resetBuilder = () => {
    setLabelFor("");
    setPlanning(undefined);
    setEditingId(null);
    setSessionName("");
    setProgression({ rule: "off" });
    const first = createEmptyExercise();
    setBuilderExercises([first]);
    setOpenExerciseId(first.id);
    setError(null);
    setPickerCardId(null);
    setMedia(null);
  };

  // From an injury's "Workout for this": the name and the label are already there.
  useEffect(() => {
    const injury = forInjury ? injuries.find((item) => item.id === forInjury) : undefined;
    if (!injury) {
      return;
    }
    resetBuilder();
    setLabelFor(injury.id);
    setSessionName(`${injuryName(injury)} exercises`);
    // A doctor's exercise rarely has a weight, so none is suggested.
    setBuilderExercises((current) => current.map((exercise) => ({ ...exercise, weight: 0 })));
    setDrawerOpen(true);
    // Only when asked to: the injury list changes for other reasons.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forInjury]);

  const openEdit = (session: SessionTemplate) => {
    setLabelFor("");
    setEditingId(session.id);
    setSessionName(session.name);
    setProgression(session.progression ?? { rule: "off" });
    setBuilderExercises(session.exercises.map(toBuilderExercise));
    // Editing a saved session opens folded: you came to change one thing.
    setOpenExerciseId(null);
    setError(null);
    setPickerCardId(null);
    setMedia(null);
    setDrawerOpen(true);
  };

  const deleteEditing = () => {
    const session = sessionTemplates.find((item) => item.id === editingId);
    if (session) {
      deleteWithUndo(session);
    }
    resetBuilder();
    setDrawerOpen(false);
  };

  const updateExercise = (id: string, patch: Partial<BuilderExercise>) => {
    setBuilderExercises((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  // Switching to a hold zeroes the weight: the 20kg default would otherwise put
  // a plank into peakWeight and the strength charts.
  // A run gets one row of 5 km in 30:00 to start from, and no load or sides.
  const setMetric = (exercise: BuilderExercise, metric: ExerciseMetric) => {
    updateExercise(
      exercise.id,
      metric === "time"
        ? {
            metric,
            durationSeconds: exercise.durationSeconds ?? DEFAULT_HOLD_SECONDS,
            weight: 0,
            weights: undefined
          }
        : metric === "distance"
          ? {
              metric,
              sets: exercise.metric === "distance" ? exercise.sets : 1,
              distanceKm: exercise.distanceKm ?? DEFAULT_RUN_KM,
              durationSeconds: exercise.metric === "distance" ? exercise.durationSeconds : DEFAULT_RUN_SECONDS,
              weight: 0,
              weights: undefined,
              perSide: undefined
            }
          : { metric }
    );
  };

  const setPerSetWeight = (id: string, setIndex: number, value: number) => {
    setBuilderExercises((current) =>
      current.map((item) => {
        if (item.id !== id) {
          return item;
        }
        const weights = Array.from({ length: item.sets }, (_, i) => item.weights?.[i] ?? item.weight);
        weights[setIndex] = value;
        return { ...item, weights };
      })
    );
  };

  const openMedia = (exercise: BuilderExercise) => {
    const datasetId = builderDatasetId(exercise);
    if (datasetId) {
      setMedia({ datasetId, name: exercise.name });
    }
  };

  /** What the Build card shows in place of thirty chips. */
  const muscleSummary = (selected: Partial<Record<MuscleId, number>>) => {
    const names = (Object.keys(selected) as MuscleId[])
      .sort((a, b) => (selected[b] ?? 0) - (selected[a] ?? 0))
      .map((id) => muscles.find((muscle) => muscle.id === id)?.name ?? id);

    if (names.length === 0) {
      return "Choose muscles";
    }
    return names.length <= 2 ? names.join(", ") : `${names[0]}, ${names[1]} +${names.length - 2}`;
  };

  const applyPick = (cardId: string, exercise: Exercise) => {
    updateExercise(cardId, {
      name: exercise.name,
      dbId: exercise.id,
      workoutId: undefined,
      category: exercise.category,
      equipment: exercise.equipment,
      muscles: deriveEngagement(exercise),
      // A run or a bike from the library is distance + time from the start.
      ...(isDistanceExercise(exercise.name)
        ? { metric: "distance" as const, sets: 1, distanceKm: DEFAULT_RUN_KM, durationSeconds: DEFAULT_RUN_SECONDS, weight: 0, weights: undefined, perSide: undefined }
        : {})
    });
    setPickerCardId(null);
  };

  // Reuse an existing catalog workout by name, else register a new one so the
  // session's workoutId always resolves in muscle/analytics lookups.
  const resolveWorkoutId = (exercise: BuilderExercise): string => {
    if (exercise.workoutId) {
      return exercise.workoutId;
    }
    const normalized = normalizeName(exercise.name);
    const existing = templates.find((item) => normalizeName(item.name) === normalized);
    if (existing) {
      return existing.id;
    }
    const id = exercise.dbId ? `db-${exercise.dbId}` : `custom-${slug(exercise.name)}`;
    addTemplate({
      id,
      dbId: exercise.dbId,
      name: exercise.name.trim(),
      category: exercise.category ?? "Custom",
      isPreset: false,
      equipment: exercise.equipment,
      defaultSets: [
        {
          sets: exercise.sets,
          reps: exercise.reps,
          weight: exercise.weight,
          restSeconds: exercise.restSeconds
        }
      ],
      muscles: toMuscleTargets(exercise.muscles)
    });
    return id;
  };

  const saveSession = () => {
    const trimmedName = sessionName.trim();

    if (!trimmedName) {
      setError({ field: "name", message: "Type a workout name." });
      return;
    }
    if (
      sessionTemplates.some(
        (item) => item.id !== editingId && item.name.trim().toLowerCase() === trimmedName.toLowerCase()
      )
    ) {
      setError({ field: "name", message: "You already have a workout with this name." });
      return;
    }

    const preparedExercises = builderExercises
      .filter((exercise) => exercise.name.trim())
      .map((exercise) => {
        const isTime = exercise.metric === "time";
        const isDistance = exercise.metric === "distance";
        return {
          ...exercise,
          sets: clampNumber(exercise.sets, 1),
          // Zero reps on a hold or a run is deliberate — see ExerciseMetric.
          // A unilateral target must stay even or it describes a set one
          // side could not have done. See lib/per-side.
          reps: isTime || isDistance ? 0 : evenTarget(clampNumber(exercise.reps, 1), exercise.perSide),
          durationSeconds: isTime
            ? clampNumber(exercise.durationSeconds ?? DEFAULT_HOLD_SECONDS, 5)
            : isDistance
              ? clampNumber(exercise.durationSeconds ?? DEFAULT_RUN_SECONDS, 0)
              : undefined,
          distanceKm: isDistance ? clampNumber(exercise.distanceKm ?? DEFAULT_RUN_KM, 0, false) : undefined,
          weight: clampNumber(exercise.weight, 0, false),
          restSeconds: clampNumber(exercise.restSeconds, 0)
        };
      });
    if (preparedExercises.length === 0) {
      setError({ field: "form", message: "Add at least one exercise." });
      return;
    }

    const seen = new Set<string>();
    for (const exercise of preparedExercises) {
      const normalized = normalizeName(exercise.name);
      if (seen.has(normalized)) {
        setError({
          field: "form",
          message: `"${exercise.name.trim()}" is in this workout 2 times.`
        });
        return;
      }
      seen.add(normalized);
    }

    const exercises: SessionTemplateExercise[] = preparedExercises.map((exercise) => {
      const notes = exercise.notes?.trim();
      return {
        id: exercise.id,
        workoutId: resolveWorkoutId(exercise),
        name: exercise.name.trim(),
        muscles: toMuscleTargets(exercise.muscles),
        sets: exercise.sets,
        reps: exercise.reps,
        weight: exercise.weight,
        weights: exercise.weights
          ? Array.from({ length: exercise.sets }, (_, index) => exercise.weights?.[index] ?? exercise.weight)
          : undefined,
        restSeconds: exercise.restSeconds,
        notes: notes ? notes : undefined,
        metric: exercise.metric,
        durationSeconds: exercise.durationSeconds,
        distanceKm: exercise.distanceKm,
        perSide: exercise.perSide
      };
    });

    const summary = buildSessionSummary({
      id: "",
      name: trimmedName,
      workoutIds: exercises.map((exercise) => exercise.workoutId),
      exercises,
      summary: { totalSets: 0, totalReps: 0, totalWeight: 0 }
    });

    // Rename "Push" to "Chest" (the id stays `session-push`), then make a new
    // "Push": the name is free but the id is taken, and two templates on one
    // id are deleted and scheduled together.
    const uniqueSessionId = (name: string) => {
      const base = `session-${slug(name)}`;
      let id = base;
      for (let n = 2; sessionTemplates.some((item) => item.id === id); n += 1) {
        id = `${base}-${n}`;
      }
      return id;
    };

    const template: SessionTemplate = {
      id: editingId ?? uniqueSessionId(trimmedName),
      name: trimmedName,
      workoutIds: exercises.map((exercise) => exercise.workoutId),
      exercises,
      summary,
      // Undefined rather than `{ rule: "off" }` — off is the absence of a rule,
      // and storing it would write a field onto every session ever saved.
      progression:
        progression.rule === "off"
          ? undefined
          : progression.rule === "time"
            ? {
                ...progression,
                incrementSeconds: clampNumber(
                  progression.incrementSeconds ?? DEFAULT_INCREMENT_SECONDS,
                  0
                )
              }
            : {
                ...progression,
                incrementKg: clampNumber(progression.incrementKg ?? DEFAULT_INCREMENT_KG, 0, false),
                // 0 made `reps >= repMax` always true: the weight rose every session.
                ...(progression.repMax !== undefined ? { repMax: clampNumber(progression.repMax, 1) } : {})
              }
    };

    // The doctor's numbers stay as typed, so a labelled workout has no rule.
    if (labelledInjury) {
      setPlanning({ ...template, progression: undefined });
      return;
    }

    const saved = editingId
      ? updateSessionTemplate(editingId, template)
      : createSessionTemplate(template);

    // The store normalizes names slightly differently than the check above, so
    // a rejected write here must not close the drawer and drop the edit.
    if (!saved) {
      setError({ field: "name", message: "You already have a workout with this name." });
      return;
    }

    resetBuilder();
    setDrawerOpen(false);
  };

  return (
    <div className="space-y-5">
      {/* Onboarding copy, not a permanent header — once there are sessions to
          manage it is just pushing "Your workouts" below the fold. */}
      {hasPlan ? null : (
        <div className="px-1 pt-3">
          <h2 className="font-heading text-[34px] leading-[1.08]">
            Build a workout once. Use it many times.
          </h2>
          <p className="mt-2.5 text-[15px] text-muted-foreground">
            Name it, add exercises, then put it on days in Schedule.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Dialog
          open={drawerOpen}
          onOpenChange={(open) => {
            setDrawerOpen(open);
            if (!open) {
              resetBuilder();
            }
          }}
        >
          <DialogTrigger asChild>
            <Button className="w-full px-3" onClick={resetBuilder}>
              <Plus className="h-4 w-4" strokeWidth={2.5} />
              Add workout
            </Button>
          </DialogTrigger>
          {/* The sub-views have their own Back; the dialog's ✕ discards the whole
              draft, so showing both makes one gesture mean two things. */}
          {/* dvh, not vh: iOS Safari sizes `vh` off the viewport with the address
              bar collapsed, so a tall session (many exercises) pushed the ✕ up
              behind the address bar instead of clamping to what's actually visible. */}
          <DialogContent
            className={`${DRAWER_CONTENT} max-h-[88dvh] overflow-y-auto`}
            hideClose={Boolean(pickerCardId || muscleCardId || media || planning)}
          >
            {planning && labelledInjury ? (
              <>
                <div className="mb-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPlanning(undefined)}
                    aria-label="Back to workout"
                    className="key-quiet flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-foreground"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <div className="min-w-0">
                    <DialogTitle>Add to your plan</DialogTitle>
                    <DialogDescription>
                      {planning.name} · {planning.exercises.length} exercise{planning.exercises.length === 1 ? "" : "s"}
                    </DialogDescription>
                  </div>
                </div>
                <InjuryWorkoutForm
                  submitLabel="Add to my plan"
                  onSubmit={(frequency, weeks) => {
                    if (createSessionTemplate(planning)) {
                      setInjuryWorkout(labelledInjury.id, planning.id, frequency, weeks);
                    }
                    setPlanning(undefined);
                    resetBuilder();
                    setDrawerOpen(false);
                  }}
                />
              </>
            ) : pickerCardId ? (
              <ExercisePicker
                onBack={() => setPickerCardId(null)}
                onPick={(exercise) => applyPick(pickerCardId, exercise)}
              />
            ) : muscleCardId ? (
              <MuscleSelectView
                exerciseName={
                  builderExercises.find((item) => item.id === muscleCardId)?.name ?? ""
                }
                selected={
                  builderExercises.find((item) => item.id === muscleCardId)?.muscles ?? {}
                }
                onChange={(next) => updateExercise(muscleCardId, { muscles: next })}
                onBack={() => setMuscleCardId(null)}
              />
            ) : media ? (
              <ExerciseMediaView
                datasetId={media.datasetId}
                name={media.name}
                onBack={() => setMedia(null)}
              />
            ) : (
              <>
                <DialogHeader className="pr-9">
                  <DialogTitle>{editingId ? "Edit workout" : "Add workout"}</DialogTitle>
                  <DialogDescription>
                    {editingId ? "Tap an exercise to change it." : "Type a name, add exercises, and set targets."}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <label className="block text-xs font-medium text-muted-foreground">
                    Name
                    <Input
                      className="mt-1"
                      placeholder="Push, Pull, Legs"
                      autoCapitalize="words"
                      value={sessionName}
                      onChange={(event) => setSessionName(event.target.value)}
                    />
                    {/* Beside the field it is about, not at the foot of an 88vh
                        scroll container where the field is no longer on screen. */}
                    {error?.field === "name" ? (
                      <span className="mt-1 block text-sm text-danger">{error.message}</span>
                    ) : null}
                  </label>

                  <SheetRows>
                    {builderExercises.map((exercise, exerciseIndex) =>
                      openExerciseId !== exercise.id ? (
                        <SwipeRow
                          key={exercise.id}
                          className="list-row"
                          label="Remove"
                          disabled={builderExercises.length === 1}
                          onDelete={() => removeBuilderExercise(exercise.id)}
                        >
                          <ListRow
                            label={
                              <span className="capitalize">
                                {exerciseIndex + 1}. {exercise.name.trim() || "Unnamed exercise"}
                              </span>
                            }
                            hint={
                              <>
                                <span className="tabular-nums">{targetLine(exercise, unit)}</span>
                                {exercise.notes?.trim() ? <span className="block italic">{exercise.notes}</span> : null}
                              </>
                            }
                            onClick={() => setOpenExerciseId(exercise.id)}
                          />
                        </SwipeRow>
                      ) : (
                        <div key={exercise.id} className="list-row space-y-3 px-4 py-3.5">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-heading text-[22px] leading-tight">
                              Exercise {exerciseIndex + 1}
                            </p>
                            <button
                              type="button"
                              className="key-quiet h-11 rounded-full px-4 text-[13.5px] font-semibold"
                              onClick={() => setOpenExerciseId(null)}
                            >
                              Done
                            </button>
                          </div>
                          <div className="flex gap-2">
                            <Input
                              placeholder="Exercise name"
                              autoCapitalize="words"
                              value={exercise.name}
                              onChange={(event) =>
                                updateExercise(exercise.id, {
                                  name: event.target.value,
                                  dbId: undefined,
                                  workoutId: undefined
                                })
                              }
                            />
                            <Button
                              type="button"
                              variant="secondary"
                              className="shrink-0 px-4"
                              onClick={() => setPickerCardId(exercise.id)}
                            >
                              <Dumbbell className="h-4 w-4" />
                              Library
                            </Button>
                            {builderDatasetId(exercise) ? (
                              <Button
                                type="button"
                                variant="secondary"
                                size="icon"
                                className="shrink-0"
                                aria-label={`View ${exercise.name} demo`}
                                onClick={() => openMedia(exercise)}
                              >
                                <PlayCircle className="h-4 w-4" />
                              </Button>
                            ) : null}
                          </div>

                          <button
                            type="button"
                            className="well flex min-h-12 w-full items-center justify-between gap-3 rounded-lg py-3 pl-4 pr-3 text-left"
                            onClick={() => setMuscleCardId(exercise.id)}
                          >
                            <span className="shrink-0 text-xs font-medium text-muted-foreground">Muscles worked</span>
                            <span className="min-w-0 flex-1 truncate text-right text-sm font-semibold">
                              {muscleSummary(exercise.muscles)}
                            </span>
                            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden />
                          </button>
                          {/* A plank and a carry are measured in seconds; a run in
                              distance and time. */}
                          <Segmented
                            size="sm"
                            aria-label="Measured in"
                            options={[
                              { id: "reps", label: "Reps" },
                              { id: "time", label: "Time" },
                              { id: "distance", label: "Distance" }
                            ]}
                            value={exercise.metric ?? "reps"}
                            onChange={(item) => setMetric(exercise, item)}
                          />

                          {/* Visible labels, not placeholders: every one of these is
                              pre-filled, so the placeholder never rendered once. */}
                          <div className="grid grid-cols-2 gap-3">
                            <label className="text-xs text-muted-foreground">
                              {exercise.metric === "distance" ? "Intervals" : "Sets"}
                              <NumberInput
                                min={1}
                                className="mt-1"
                                value={exercise.sets}
                                onValueChange={(value) => updateExercise(exercise.id, { sets: value })}
                              />
                            </label>
                            {exercise.metric === "distance" ? (
                              <label className="text-xs text-muted-foreground">
                                Distance ({unit})
                                <NumberInput
                                  min={0}
                                  step={0.1}
                                  className="mt-1"
                                  value={Math.round(toUnit(exercise.distanceKm ?? DEFAULT_RUN_KM, unit) * 100) / 100}
                                  onValueChange={(value) => updateExercise(exercise.id, { distanceKm: fromUnit(value, unit) })}
                                />
                              </label>
                            ) : exercise.metric === "time" ? (
                              <label className="text-xs text-muted-foreground">
                                Hold (seconds)
                                <NumberInput
                                  min={5}
                                  step={5}
                                  className="mt-1"
                                  value={exercise.durationSeconds ?? DEFAULT_HOLD_SECONDS}
                                  onValueChange={(value) => updateExercise(exercise.id, { durationSeconds: value })}
                                />
                              </label>
                            ) : (
                              <label className="text-xs text-muted-foreground">
                                Reps
                                <NumberInput
                                  min={1}
                                  className="mt-1"
                                  value={exercise.reps}
                                  onValueChange={(value) => updateExercise(exercise.id, { reps: value })}
                                />
                              </label>
                            )}
                            {exercise.metric === "distance" ? (
                              <label className="text-xs text-muted-foreground">
                                Time (min)
                                <NumberInput
                                  min={0}
                                  step={1}
                                  className="mt-1"
                                  value={Math.round(((exercise.durationSeconds ?? DEFAULT_RUN_SECONDS) / 60) * 10) / 10}
                                  onValueChange={(value) => updateExercise(exercise.id, { durationSeconds: Math.round(value * 60) })}
                                />
                              </label>
                            ) : null}
                            {exercise.metric === "distance" ? null : (
                              <label className="text-xs text-muted-foreground">
                                {exercise.metric === "time" ? "Added weight (kg)" : "Weight (kg)"}
                                <NumberInput
                                  min={0}
                                  step={2.5}
                                  className="mt-1"
                                  value={exercise.weight}
                                  onValueChange={(value) => updateExercise(exercise.id, { weight: value })}
                                />
                              </label>
                            )}
                            <label className="text-xs text-muted-foreground">
                              Rest (seconds)
                              <NumberInput
                                min={15}
                                step={15}
                                className="mt-1"
                                value={exercise.restSeconds}
                                onValueChange={(value) => updateExercise(exercise.id, { restSeconds: value })}
                              />
                            </label>
                          </div>

                          {exercise.metric === "time" || exercise.metric === "distance" ? null : (
                            <div className="-mx-4">
                              <ListSwitch
                                label="Reps count both sides"
                                hint="For example, lunges or one-arm rows"
                                on={Boolean(exercise.perSide)}
                                onToggle={() => updateExercise(exercise.id, { perSide: !exercise.perSide })}
                              />
                            </div>
                          )}

                          {exercise.metric !== "time" && exercise.metric !== "distance" && exercise.sets > 1 ? (
                            <details className="group">
                              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-[15px] [&::-webkit-details-marker]:hidden">
                                Weight per set
                                <ChevronDown className="h-4 w-4 text-muted-foreground transition group-open:rotate-180" />
                              </summary>
                              <div className="grid grid-cols-3 gap-2 pb-1 pt-1">
                                {Array.from({ length: exercise.sets }).map((_, setIndex) => (
                                  <label key={setIndex} className="text-[11px] text-muted-foreground">
                                    Set {setIndex + 1}
                                    <NumberInput
                                      min={0}
                                      step={2.5}
                                      className="mt-1"
                                      value={exercise.weights?.[setIndex] ?? exercise.weight}
                                      onValueChange={(value) => setPerSetWeight(exercise.id, setIndex, value)}
                                    />
                                  </label>
                                ))}
                              </div>
                            </details>
                          ) : null}

                          <textarea
                            aria-label="Notes"
                            placeholder="Notes (optional)"
                            rows={2}
                            value={exercise.notes ?? ""}
                            onChange={(event) => updateExercise(exercise.id, { notes: event.target.value })}
                            className="well w-full rounded-lg px-4 py-3 text-base text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                          />

                          {builderExercises.length > 1 ? (
                            <button
                              type="button"
                              className="h-11 w-full rounded-full text-[13.5px] font-medium text-muted-foreground active:bg-hi"
                              onClick={() => removeBuilderExercise(exercise.id)}
                            >
                              Remove exercise
                            </button>
                          ) : null}
                        </div>
                      )
                    )}
                  </SheetRows>

                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={() => {
                      const next = { ...createEmptyExercise(), ...(labelFor ? { weight: 0 } : {}) };
                      setBuilderExercises((current) => [...current, next]);
                      setOpenExerciseId(next.id);
                    }}
                  >
                    <Plus className="h-4 w-4" />
                    Add exercise
                  </Button>
                  {error?.field === "form" ? (
                    <p className="text-sm text-danger">{error.message}</p>
                  ) : null}

                  {/* Only on a new workout, so Legs can never leave the main button by mistake. */}
                  {!editingId && labelOptions.length > 0 ? (
                    <div>
                      <p className="mb-1 text-xs font-medium text-muted-foreground">For an injury</p>
                      <ThemedSelect
                        aria-label="For an injury"
                        value={labelFor}
                        onValueChange={(next) => {
                          setLabelFor(next);
                          // A doctor's exercise rarely has a weight, so none is suggested.
                          if (next) {
                            setBuilderExercises((current) =>
                              current.map((exercise) => (exercise.name.trim() ? exercise : { ...exercise, weight: 0 }))
                            );
                          }
                        }}
                        options={[
                          { value: "", label: "No" },
                          ...labelOptions.map((injury) => ({ value: injury.id, label: injuryName(injury) }))
                        ]}
                      />
                    </div>
                  ) : null}

                  {/* The rule that decides the weight when this session opens.
                      Off keeps the numbers above exactly as typed, which is what
                      every session built before this existed still does. */}
                  <div className={labelledInjury || isOwnWorkout ? "hidden" : undefined}>
                    <InfoNote
                      heading={<p className="text-xs font-medium text-muted-foreground">Progression</p>}
                      note={
                        <>
                          <p>Off: each workout starts with the weights you type above.</p>
                          <p>Linear: the weight increases when you do all the reps.</p>
                          <p>Double: the reps increase to the maximum. Then the weight increases.</p>
                          <p>Time: the hold time increases when you reach the target.</p>
                          <p>If you miss the target in 2 workouts, it decreases by 10%.</p>
                        </>
                      }
                    />
                    <ThemedSelect
                      aria-label="Progression"
                      value={progression.rule}
                      onValueChange={(rule) =>
                        setProgression((current) => ({
                          ...current,
                          rule: rule as ProgressionSettings["rule"]
                        }))
                      }
                      options={Object.entries(PROGRESSION_LABELS).map(([rule, label]) => ({
                        value: rule,
                        label: label.split(" — ")[0]
                      }))}
                    />

                    {progression.rule !== "off" ? (
                      <div className="mt-2 flex gap-2">
                        <label className="block flex-1 text-xs text-muted-foreground">
                          {isTimeRule ? "Increase by (s)" : "Increase by (kg)"}
                          <NumberInput
                            className="mt-1"
                            inputMode="decimal"
                            step={isTimeRule ? "1" : "0.5"}
                            min={0}
                            value={isTimeRule ? progression.incrementSeconds ?? DEFAULT_INCREMENT_SECONDS : progression.incrementKg ?? DEFAULT_INCREMENT_KG}
                            onValueChange={(value) =>
                              setProgression((current) =>
                                isTimeRule
                                  ? { ...current, incrementSeconds: value }
                                  : { ...current, incrementKg: value }
                              )
                            }
                          />
                        </label>
                        {progression.rule === "double" ? (
                          <label className="block flex-1 text-xs text-muted-foreground">
                            Maximum reps
                            <NumberInput
                              className="mt-1"
                              inputMode="numeric"
                              min={1}
                              value={progression.repMax ?? 12}
                              onValueChange={(value) => setProgression((current) => ({ ...current, repMax: value }))}
                            />
                          </label>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  {/* The rare one: the last thing in the sheet, and it can be undone. */}
                  {editingId ? (
                    <button
                      type="button"
                      className="h-11 w-full rounded-full text-sm font-medium text-muted-foreground active:bg-hi"
                      onClick={deleteEditing}
                    >
                      Delete workout
                    </button>
                  ) : null}

                  {/* Sticky: with six exercises the commit action was a long
                      scroll away from wherever you finished editing. */}
                  <div className={SHEET_FOOT}>
                    <Button className="w-full" onClick={saveSession}>
                      {editingId ? "Save changes" : labelledInjury ? "Next" : "Save workout"}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
        <Button variant="secondary" className="w-full px-3" onClick={() => setAiOpen(true)} data-tour="plan-ai">
          <Sparkles className="h-4 w-4" />
          Build with AI
        </Button>
        <AiImportSheet open={aiOpen} onOpenChange={setAiOpen} initialText={sharedText} />
      </div>

      {hasPlan ? (
        <ListGroup title="Your workouts">
          {shownWorkouts.map((session) => (
            <SwipeRow key={session.id} className="list-row" onDelete={() => deleteWithUndo(session)}>
              <ListRow
                label={
                  <span className="font-heading text-[23px] leading-tight">
                    {session.name}
                  </span>
                }
                hint={
                  ownerOf(session.id)
                    ? `${workoutLine(session)} · for ${injuryName(ownerOf(session.id) as Injury).toLowerCase()}`
                    : workoutLine(session)
                }
                onClick={() => openEdit(session)}
              />
            </SwipeRow>
          ))}
        </ListGroup>
      ) : null}
    </div>
  );
}

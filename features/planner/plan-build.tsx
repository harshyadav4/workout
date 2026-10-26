"use client";

import { ChevronDown, Dumbbell, Pencil, PlayCircle, Plus, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DRAWER_CONTENT
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { ThemedSelect } from "@/components/ui/select";
import { AiImportSheet } from "@/features/planner/ai-import";
import { ExercisePicker } from "@/features/planner/exercise-picker";
import { MuscleSelectView } from "@/features/planner/muscle-drawer";
import { ExerciseMediaView, templateDatasetId } from "@/features/workout/exercise-media-dialog";
import { useDistanceUnit } from "@/features/workout/use-distance-unit";
import { useWorkoutStore } from "@/features/workout/workout-store";
import { formatDistance, fromUnit, isDistanceExercise, toUnit } from "@/lib/cardio";
import { deriveEngagement, type Exercise } from "@/lib/exercises";
import { evenTarget } from "@/lib/per-side";
import { formatClock } from "@/lib/timer";
import { cn } from "@/lib/utils";
import {
  DEFAULT_INCREMENT_KG,
  DEFAULT_INCREMENT_SECONDS,
  PROGRESSION_LABELS
} from "@/lib/progression";
import { buildSessionSummary } from "@/lib/workout-helpers";
import type {
  ExerciseMetric,
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

// Per-set weights collapse to a single number when they never vary.
function formatWeights(exercise: SessionTemplateExercise): string {
  const weights = exercise.weights?.slice(0, exercise.sets);
  if (weights && weights.length > 0 && weights.some((value) => value !== weights[0])) {
    return `${weights.join(" / ")} kg`;
  }
  return `${weights?.[0] ?? exercise.weight} kg`;
}

/** "3 × 10" for a lift, "3 × 45s" for a hold, "1 × 5 km" for a run. */
function formatTarget(exercise: SessionTemplateExercise): string {
  if (exercise.metric === "distance") {
    return `${exercise.sets} × ${exercise.distanceKm ?? 0} km`;
  }
  return exercise.metric === "time"
    ? `${exercise.sets} × ${exercise.durationSeconds ?? 0}s`
    : `${exercise.sets} × ${exercise.reps}`;
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

export function PlanBuild() {
  const unit = useDistanceUnit();
  const muscles = useWorkoutStore((state) => state.muscles);
  const templates = useWorkoutStore((state) => state.templates);
  const sessionTemplates = useWorkoutStore((state) => state.sessionTemplates);
  const addTemplate = useWorkoutStore((state) => state.addTemplate);
  const createSessionTemplate = useWorkoutStore((state) => state.createSessionTemplate);
  const updateSessionTemplate = useWorkoutStore((state) => state.updateSessionTemplate);
  const deleteSessionTemplate = useWorkoutStore((state) => state.deleteSessionTemplate);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
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
  const [sessionToDelete, setSessionToDelete] = useState<{ id: string; name: string } | null>(null);

  const hasPlan = sessionTemplates.length > 0;

  const resetBuilder = () => {
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

  const openEdit = (session: SessionTemplate) => {
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
      setError({ field: "name", message: "Name your session." });
      return;
    }
    if (
      sessionTemplates.some(
        (item) => item.id !== editingId && item.name.trim().toLowerCase() === trimmedName.toLowerCase()
      )
    ) {
      setError({ field: "name", message: "You already have a session with that name." });
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
          message: `"${exercise.name.trim()}" is in this session twice — each exercise can only appear once.`
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

    const template: SessionTemplate = {
      id: editingId ?? `session-${slug(trimmedName)}`,
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
            : { ...progression, incrementKg: clampNumber(progression.incrementKg ?? DEFAULT_INCREMENT_KG, 0, false) }
    };

    const saved = editingId
      ? updateSessionTemplate(editingId, template)
      : createSessionTemplate(template);

    // The store normalizes names slightly differently than the check above, so
    // a rejected write here must not close the drawer and drop the edit.
    if (!saved) {
      setError({ field: "name", message: "You already have a session with that name." });
      return;
    }

    resetBuilder();
    setDrawerOpen(false);
  };

  return (
    <div className="space-y-4">
      <Card className={hasPlan ? "p-2" : ""}>
        <div className={hasPlan ? "" : "p-2"}>
          {/* Onboarding copy, not a permanent header — once there are sessions to
              manage it is just pushing "Your sessions" below the fold. */}
          {hasPlan ? null : (
            <>
              <h2 className="font-display text-[28px] font-extrabold leading-none tracking-tight">
                Build a session once, reuse it forever
              </h2>
              <p className="mt-3 text-sm text-muted-foreground">
                Pick exercises from the library, set your targets, and name the session like Push or
                Legs. Then switch to Schedule to drop it onto your week.
              </p>
            </>
          )}
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
              <Button size="lg" className={hasPlan ? "w-full" : "mt-5 w-full"} onClick={resetBuilder}>
                <Plus className="h-5 w-5" strokeWidth={2.5} />
                {hasPlan ? "Add another session" : "Build your first session"}
              </Button>
            </DialogTrigger>
            {/* The sub-views have their own Back; the dialog's ✕ discards the whole
                draft, so showing both makes one gesture mean two things. */}
            {/* dvh, not vh: iOS Safari sizes `vh` off the viewport with the address
                bar collapsed, so a tall session (many exercises) pushed the ✕ up
                behind the address bar instead of clamping to what's actually visible. */}
            <DialogContent
              className="max-h-[88dvh] overflow-y-auto"
              hideClose={Boolean(pickerCardId || muscleCardId || media)}
            >
              {pickerCardId ? (
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
              <DialogHeader>
                <DialogTitle>{editingId ? "Edit session" : "Session builder"}</DialogTitle>
                <DialogDescription>Name the session, add exercises, and set targets.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <label className="block text-xs font-medium text-muted-foreground">
                  Session name
                  <Input
                    className="mt-1"
                    placeholder="Push, Pull, Legs"
                    value={sessionName}
                    onChange={(event) => setSessionName(event.target.value)}
                  />
                  {/* Beside the field it is about, not at the foot of an 88vh
                      scroll container where the field is no longer on screen. */}
                  {error?.field === "name" ? (
                    <span className="mt-1 block text-sm text-danger">{error.message}</span>
                  ) : null}
                </label>

                {/* The rule that decides the weight when this session opens.
                    Off keeps the numbers below exactly as typed, which is what
                    every session built before this existed still does. */}
                <div className="rounded-xl bg-muted p-3">
                  <p className="text-xs font-medium text-muted-foreground">
                    Progression
                  </p>
                  <ThemedSelect
                    aria-label="Progression"
                    className="mt-1"
                    value={progression.rule}
                    onValueChange={(rule) =>
                      setProgression((current) => ({
                        ...current,
                        rule: rule as ProgressionSettings["rule"]
                      }))
                    }
                    options={Object.entries(PROGRESSION_LABELS).map(([rule, label]) => ({
                      value: rule,
                      label
                    }))}
                  />

                  {progression.rule !== "off" ? (
                    <div className="mt-2 flex gap-2">
                      <label className="block flex-1 text-xs text-muted-foreground">
                        {isTimeRule ? "Add per jump (s)" : "Add per jump (kg)"}
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
                          Top of rep range
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

                  <p className="mt-2 text-xs text-muted-foreground">
                    {progression.rule === "off"
                      ? "Sessions open with the weights you type below."
                      : isTimeRule
                        ? "Holds get longer only when you reach the target. Two short sessions cut it 10%."
                        : "Missed reps never move the weight up. Two stalls at one weight drops it 10%."}
                  </p>
                </div>
                {builderExercises.map((exercise, exerciseIndex) => (
                  openExerciseId !== exercise.id ? (
                    <div key={exercise.id} className="flex items-center gap-2 rounded-xl bg-muted p-2 pl-4">
                      <button
                        type="button"
                        className="min-w-0 flex-1 py-2 text-left"
                        onClick={() => setOpenExerciseId(exercise.id)}
                        aria-label={`Edit exercise ${exerciseIndex + 1}${exercise.name ? `, ${exercise.name}` : ""}`}
                      >
                        <span className="block truncate text-[15px] font-semibold capitalize">
                          {exerciseIndex + 1}. {exercise.name.trim() || "Unnamed exercise"}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground tabular-nums">
                          {exercise.metric === "distance"
                            ? `${exercise.sets} × ${formatDistance(exercise.distanceKm ?? DEFAULT_RUN_KM, unit)} · ${formatClock(exercise.durationSeconds ?? DEFAULT_RUN_SECONDS)}`
                            : exercise.metric === "time"
                              ? `${exercise.sets} × ${exercise.durationSeconds ?? DEFAULT_HOLD_SECONDS}s`
                              : `${exercise.sets} × ${exercise.reps} · ${exercise.weight} kg`}
                          {` · ${exercise.restSeconds}s rest`}
                        </span>
                      </button>
                      <button
                        type="button"
                        aria-label={`Edit exercise ${exerciseIndex + 1}`}
                        className="key-quiet flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground"
                        onClick={() => setOpenExerciseId(exercise.id)}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove exercise ${exerciseIndex + 1}`}
                        className="key-quiet flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground disabled:opacity-40"
                        onClick={() =>
                          setBuilderExercises((current) => current.filter((item) => item.id !== exercise.id))
                        }
                        disabled={builderExercises.length === 1}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                  <div key={exercise.id} className="rounded-xl bg-muted p-4 ring-1 ring-brand/40">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <p className="font-display text-lg font-bold tracking-tight">Exercise {exerciseIndex + 1}</p>
                      <button
                        type="button"
                        className="key-quiet ml-auto h-10 rounded-full px-3.5 text-xs font-semibold"
                        onClick={() => setOpenExerciseId(null)}
                      >
                        Done
                      </button>
                      <button
                        type="button"
                        className="key-quiet h-10 rounded-full px-3.5 text-xs font-semibold disabled:opacity-40"
                        onClick={() =>
                          setBuilderExercises((current) => current.filter((item) => item.id !== exercise.id))
                        }
                        disabled={builderExercises.length === 1}
                      >
                        Remove
                      </button>
                    </div>
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <Input
                          placeholder="Exercise name"
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
                          className="shrink-0"
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
                        className="key-quiet flex min-h-12 w-full items-center justify-between rounded-lg px-4 py-3 text-left"
                        onClick={() => setMuscleCardId(exercise.id)}
                      >
                        <span className="text-xs font-medium text-muted-foreground">Muscles worked</span>
                        <span className="ml-3 min-w-0 flex-1 truncate text-right text-sm font-semibold">
                          {muscleSummary(exercise.muscles)}
                        </span>
                      </button>
                      {/* A plank and a carry are measured in seconds; a run in
                          distance and time. */}
                      <div className="well grid grid-cols-3 gap-1 rounded-xl p-1">
                        {(["reps", "time", "distance"] as const).map((item) => {
                          const active = (exercise.metric ?? "reps") === item;
                          return (
                            <button
                              key={item}
                              type="button"
                              aria-pressed={active}
                              onClick={() => setMetric(exercise, item)}
                              className={`h-10 rounded-lg text-xs font-semibold transition-colors ${
                                active ? "key" : "text-muted-foreground"
                              }`}
                            >
                              {item === "reps" ? "Reps" : item === "time" ? "Hold / time" : "Distance"}
                            </button>
                          );
                        })}
                      </div>

                      {/* Visible labels, not placeholders: every one of these is
                          pre-filled, so the placeholder never rendered once. */}
                      <div className="grid grid-cols-2 gap-3">
                        <label className="text-xs text-muted-foreground">
                          {exercise.metric === "distance" ? "Rows (intervals)" : "Sets"}
                          <NumberInput
                            min={1}
                            className="mt-1"
                            value={exercise.sets}
                            onValueChange={(value) => updateExercise(exercise.id, { sets: value })}
                          />
                        </label>
                        {exercise.metric === "distance" ? (
                          <label className="text-xs text-muted-foreground">
                            Distance per row ({unit})
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
                            Target time (minutes)
                            <NumberInput
                              min={0}
                              step={1}
                              className="mt-1"
                              value={Math.round(((exercise.durationSeconds ?? DEFAULT_RUN_SECONDS) / 60) * 10) / 10}
                              onValueChange={(value) => updateExercise(exercise.id, { durationSeconds: Math.round(value * 60) })}
                            />
                          </label>
                        ) : null}
                        {exercise.metric === "time" || exercise.metric === "distance" ? null : (
                          <label className="col-span-2 flex items-center justify-between text-xs text-muted-foreground">
                            <span>
                              Reps are the total across both sides
                              <span className="mt-0.5 block text-[11px]">
                                Lunges, single-arm rows — logged as a total, shown as a split
                              </span>
                            </span>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={Boolean(exercise.perSide)}
                              aria-label="Reps per side"
                              onClick={() =>
                                updateExercise(exercise.id, { perSide: !exercise.perSide })
                              }
                              className={cn(
                                "ml-3 h-6 w-11 shrink-0 rounded-full transition-colors",
                                exercise.perSide ? "bg-primary" : "well"
                              )}
                            >
                              <span
                                className={cn(
                                  "block h-5 w-5 rounded-full bg-card shadow-quiet transition-transform",
                                  exercise.perSide ? "translate-x-[22px]" : "translate-x-[2px]"
                                )}
                              />
                            </button>
                          </label>
                        )}
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

                      {exercise.metric !== "time" && exercise.metric !== "distance" && exercise.sets > 1 ? (
                        <details className="group rounded-lg bg-card px-3">
                          <summary className="flex cursor-pointer list-none items-center justify-between py-3 text-sm text-muted-foreground [&::-webkit-details-marker]:hidden">
                            Weight per set
                            <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
                          </summary>
                          <div className="grid grid-cols-3 gap-2 pb-3">
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
                    </div>
                  </div>
                  )
                ))}
                <Button
                  variant="secondary"
                  onClick={() => {
                    const next = createEmptyExercise();
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
                {/* Sticky: with six exercise cards the commit action was a long
                    scroll away from wherever you finished editing. */}
                <div className="sticky bottom-0 border-t border-border bg-card pt-3">
                  <Button className="w-full" onClick={saveSession}>
                    {editingId ? "Save changes" : "Save session"}
                  </Button>
                </div>
              </div>
                </>
              )}
            </DialogContent>
          </Dialog>
          <Button variant="secondary" className="mt-2 w-full" onClick={() => setAiOpen(true)}>
            <Sparkles className="h-4 w-4 text-brand" />
            Build with AI
          </Button>
          <AiImportSheet open={aiOpen} onOpenChange={setAiOpen} />
        </div>
      </Card>

      {hasPlan ? (
        <Card>
          <CardHeader>
            <CardTitle>Your sessions</CardTitle>
            <CardDescription>Reusable templates. Switch to Schedule to place them on a day.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {sessionTemplates.map((session) => (
              <div key={session.id} className="rounded-xl bg-muted p-4">
                {/* Name on its own line with the two keys; the numbers under it
                    in one line. The old layout put a badge and both buttons
                    beside the name, and "Upper · Heavy" wrapped onto two lines
                    while "17 sets • 118 reps • 764 planned kg" took three. */}
                <div className="flex items-center justify-between gap-3">
                  <p className="min-w-0 truncate font-display text-xl font-bold tracking-tight">
                    {session.name}
                  </p>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      aria-label={`Edit ${session.name} session`}
                      className="key-quiet flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground"
                      onClick={() => openEdit(session)}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${session.name} session`}
                      className="key-quiet flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground"
                      onClick={() => setSessionToDelete({ id: session.id, name: session.name })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <p className="mt-1 text-sm text-muted-foreground tabular-nums">
                  {session.exercises.length} exercise{session.exercises.length === 1 ? "" : "s"} ·{" "}
                  {session.summary.totalSets} sets · {session.summary.totalReps} reps ·{" "}
                  {session.summary.totalWeight.toFixed(0)} kg
                </p>
                <details className="group mt-3">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-2 [&::-webkit-details-marker]:hidden">
                    {/* Outlined, not filled: these are labels inside the summary's
                        hit area, and filled chips read as individually tappable. */}
                    <span className="flex flex-wrap gap-2">
                      {session.exercises.map((exercise) => (
                        <span
                          key={exercise.id}
                          className="rounded-full border border-border px-2.5 py-1 text-xs font-medium capitalize text-muted-foreground"
                        >
                          {exercise.name}
                        </span>
                      ))}
                    </span>
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition group-open:rotate-180" />
                  </summary>
                  <div className="mt-3 space-y-2">
                    {session.exercises.map((exercise) => (
                      <div key={exercise.id} className="rounded-lg bg-card px-3 py-2.5">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold capitalize">{exercise.name}</p>
                          <p className="shrink-0 text-xs text-muted-foreground tabular-nums">
                            {formatTarget(exercise)}
                          </p>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {exercise.metric === "time" && exercise.weight === 0
                            ? "Bodyweight"
                            : formatWeights(exercise)}{" "}
                          · {exercise.restSeconds}s rest
                        </p>
                        {exercise.notes ? (
                          <p className="mt-1 text-xs italic text-muted-foreground">{exercise.notes}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No sessions yet. Build your first one above, then head to Schedule to plan your week.
          </CardContent>
        </Card>
      )}

      <Dialog open={!!sessionToDelete} onOpenChange={(open) => !open && setSessionToDelete(null)}>
        <DialogContent className={DRAWER_CONTENT}>
          <DialogHeader>
            <DialogTitle>Delete session template?</DialogTitle>
            <DialogDescription className="space-y-2 pt-2">
              <span className="block text-sm text-foreground font-medium">
                Are you sure you want to delete &quot;{sessionToDelete?.name}&quot;?
              </span>
              <span className="block text-xs text-muted-foreground">
                This template will no longer be available to select in the Schedule section. (Existing workouts already scheduled on your calendar will remain).
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setSessionToDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (sessionToDelete) {
                  deleteSessionTemplate(sessionToDelete.id);
                  setSessionToDelete(null);
                }
              }}
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}


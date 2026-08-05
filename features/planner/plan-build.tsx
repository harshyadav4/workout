"use client";

import { ChevronDown, Dumbbell, Pencil, PlayCircle, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
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
import { ExercisePicker } from "@/features/planner/exercise-picker";
import { MuscleSelectView } from "@/features/planner/muscle-drawer";
import { ExerciseMediaView, templateDatasetId } from "@/features/workout/exercise-media-dialog";
import { useWorkoutStore } from "@/features/workout/workout-store";
import { deriveEngagement, type Exercise } from "@/lib/exercises";
import { buildSessionSummary } from "@/lib/workout-helpers";
import type {
  ExerciseMetric,
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
};

const DEFAULT_HOLD_SECONDS = 45;

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

/** "3 × 10" for a lift, "3 × 45s" for a hold. */
function formatTarget(exercise: SessionTemplateExercise): string {
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
    durationSeconds: exercise.durationSeconds
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
  const muscles = useWorkoutStore((state) => state.muscles);
  const templates = useWorkoutStore((state) => state.templates);
  const sessionTemplates = useWorkoutStore((state) => state.sessionTemplates);
  const addTemplate = useWorkoutStore((state) => state.addTemplate);
  const createSessionTemplate = useWorkoutStore((state) => state.createSessionTemplate);
  const updateSessionTemplate = useWorkoutStore((state) => state.updateSessionTemplate);
  const deleteSessionTemplate = useWorkoutStore((state) => state.deleteSessionTemplate);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sessionName, setSessionName] = useState("");
  const [builderExercises, setBuilderExercises] = useState<BuilderExercise[]>([createEmptyExercise()]);
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
    setBuilderExercises([createEmptyExercise()]);
    setError(null);
    setPickerCardId(null);
    setMedia(null);
  };

  const openEdit = (session: SessionTemplate) => {
    setEditingId(session.id);
    setSessionName(session.name);
    setBuilderExercises(session.exercises.map(toBuilderExercise));
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
      muscles: deriveEngagement(exercise)
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
        return {
          ...exercise,
          sets: clampNumber(exercise.sets, 1),
          // Zero reps on a hold is deliberate — see ExerciseMetric in types.ts.
          reps: isTime ? 0 : clampNumber(exercise.reps, 1),
          durationSeconds: isTime
            ? clampNumber(exercise.durationSeconds ?? DEFAULT_HOLD_SECONDS, 5)
            : undefined,
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
        durationSeconds: exercise.durationSeconds
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
      summary
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
      <Card className="overflow-hidden">
        {/* Concentric radius: 28 outer minus the Card's 16px padding. */}
        <div className="rounded-[12px] bg-gradient-to-br from-primary/20 via-card to-accent/10 p-5">
          {/* Onboarding copy, not a permanent header — once there are sessions to
              manage it is just pushing "Your sessions" below the fold. */}
          {hasPlan ? null : (
            <>
              <p className="text-sm text-primary">Session builder</p>
              <h2 className="mt-2 text-2xl font-bold">Build a session once, reuse it forever</h2>
              <p className="mt-2 text-sm text-muted-foreground">
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
              <Button className={hasPlan ? "w-full" : "mt-5 w-full"} onClick={resetBuilder}>
                <Plus className="mr-2 h-4 w-4" />
                {hasPlan ? "Add another session" : "Build your first session"}
              </Button>
            </DialogTrigger>
            {/* The sub-views have their own Back; the dialog's ✕ discards the whole
                draft, so showing both makes one gesture mean two things. */}
            <DialogContent
              className="max-h-[88vh] overflow-y-auto"
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
                <label className="block text-xs text-muted-foreground">
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
                {builderExercises.map((exercise, exerciseIndex) => (
                  <div key={exercise.id} className="rounded-3xl bg-secondary/50 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="font-medium">Exercise {exerciseIndex + 1}</p>
                      <button
                        type="button"
                        className="rounded-full bg-background px-3 py-3.5 text-xs transition active:scale-95 active:bg-secondary disabled:opacity-40"
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
                          <Dumbbell className="mr-2 h-4 w-4" />
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
                        className="flex w-full items-center justify-between rounded-2xl bg-background px-4 py-3 text-left"
                        onClick={() => setMuscleCardId(exercise.id)}
                      >
                        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                          Muscles worked
                        </span>
                        <span className="ml-3 min-w-0 flex-1 truncate text-right text-sm">
                          {muscleSummary(exercise.muscles)}
                        </span>
                      </button>
                      {/* A plank, a carry and a run are measured in seconds. */}
                      <div className="grid grid-cols-2 gap-1 rounded-full bg-background p-1">
                        {(["reps", "time"] as const).map((item) => {
                          const active = (exercise.metric ?? "reps") === item;
                          return (
                            <button
                              key={item}
                              type="button"
                              aria-pressed={active}
                              onClick={() => setMetric(exercise, item)}
                              className={`rounded-full py-3 text-xs font-medium transition active:scale-[0.98] ${
                                active
                                  ? "bg-primary text-primary-foreground"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {item === "reps" ? "Reps" : "Hold / time"}
                            </button>
                          );
                        })}
                      </div>

                      {/* Visible labels, not placeholders: every one of these is
                          pre-filled, so the placeholder never rendered once. */}
                      <div className="grid grid-cols-2 gap-3">
                        <label className="text-xs text-muted-foreground">
                          Sets
                          <Input
                            type="number"
                            min={1}
                            className="mt-1"
                            value={exercise.sets}
                            onChange={(event) =>
                              updateExercise(exercise.id, { sets: Number(event.target.value) })
                            }
                          />
                        </label>
                        {exercise.metric === "time" ? (
                          <label className="text-xs text-muted-foreground">
                            Hold (seconds)
                            <Input
                              type="number"
                              min={5}
                              step={5}
                              className="mt-1"
                              value={exercise.durationSeconds ?? DEFAULT_HOLD_SECONDS}
                              onChange={(event) =>
                                updateExercise(exercise.id, {
                                  durationSeconds: Number(event.target.value)
                                })
                              }
                            />
                          </label>
                        ) : (
                          <label className="text-xs text-muted-foreground">
                            Reps
                            <Input
                              type="number"
                              min={1}
                              className="mt-1"
                              value={exercise.reps}
                              onChange={(event) =>
                                updateExercise(exercise.id, { reps: Number(event.target.value) })
                              }
                            />
                          </label>
                        )}
                        <label className="text-xs text-muted-foreground">
                          {exercise.metric === "time" ? "Added weight (kg)" : "Weight (kg)"}
                          <Input
                            type="number"
                            min={0}
                            step={2.5}
                            className="mt-1"
                            value={exercise.weight}
                            onChange={(event) =>
                              updateExercise(exercise.id, { weight: Number(event.target.value) })
                            }
                          />
                        </label>
                        <label className="text-xs text-muted-foreground">
                          Rest (seconds)
                          <Input
                            type="number"
                            min={15}
                            step={15}
                            className="mt-1"
                            value={exercise.restSeconds}
                            onChange={(event) =>
                              updateExercise(exercise.id, { restSeconds: Number(event.target.value) })
                            }
                          />
                        </label>
                      </div>

                      {exercise.metric !== "time" && exercise.sets > 1 ? (
                        <details className="group rounded-2xl bg-background px-3">
                          <summary className="flex cursor-pointer list-none items-center justify-between py-3 text-sm text-muted-foreground [&::-webkit-details-marker]:hidden">
                            Weight per set
                            <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
                          </summary>
                          <div className="grid grid-cols-3 gap-2 pb-3">
                            {Array.from({ length: exercise.sets }).map((_, setIndex) => (
                              <label key={setIndex} className="text-[11px] text-muted-foreground">
                                Set {setIndex + 1}
                                <Input
                                  type="number"
                                  min={0}
                                  step={2.5}
                                  className="mt-1"
                                  value={exercise.weights?.[setIndex] ?? exercise.weight}
                                  onChange={(event) =>
                                    setPerSetWeight(exercise.id, setIndex, Number(event.target.value))
                                  }
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
                        className="w-full rounded-2xl bg-background px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                    </div>
                  </div>
                ))}
                <Button
                  variant="secondary"
                  onClick={() => setBuilderExercises((current) => [...current, createEmptyExercise()])}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add exercise
                </Button>
                {error?.field === "form" ? (
                  <p className="text-sm text-danger">{error.message}</p>
                ) : null}
                {/* Sticky: with six exercise cards the commit action was a long
                    scroll away from wherever you finished editing. */}
                <div className="sticky bottom-0 border-t border-white/5 bg-card pt-3">
                  <Button className="w-full" onClick={saveSession}>
                    {editingId ? "Save changes" : "Save session"}
                  </Button>
                </div>
              </div>
                </>
              )}
            </DialogContent>
          </Dialog>
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
              <div key={session.id} className="rounded-3xl bg-secondary/50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{session.name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {session.summary.totalSets} sets • {session.summary.totalReps} reps • {session.summary.totalWeight.toFixed(0)} planned kg
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge>
                      {session.exercises.length} workout{session.exercises.length === 1 ? "" : "s"}
                    </Badge>
                    <button
                      type="button"
                      aria-label={`Edit ${session.name} session`}
                      className="rounded-full p-3.5 text-muted-foreground transition active:scale-95 active:bg-background active:text-primary"
                      onClick={() => openEdit(session)}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${session.name} session`}
                      className="rounded-full p-3.5 text-muted-foreground transition active:scale-95 active:bg-background active:text-danger"
                      onClick={() => setSessionToDelete({ id: session.id, name: session.name })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <details className="group mt-3">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-2 [&::-webkit-details-marker]:hidden">
                    {/* Outlined, not filled: these are labels inside the summary's
                        hit area, and filled chips read as individually tappable. */}
                    <span className="flex flex-wrap gap-2">
                      {session.exercises.map((exercise) => (
                        <span
                          key={exercise.id}
                          className="rounded-full border border-white/10 px-3 py-1.5 text-xs capitalize text-muted-foreground"
                        >
                          {exercise.name}
                        </span>
                      ))}
                    </span>
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition group-open:rotate-180" />
                  </summary>
                  <div className="mt-3 space-y-2">
                    {session.exercises.map((exercise) => (
                      <div key={exercise.id} className="rounded-2xl bg-background px-3 py-2.5">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium capitalize">{exercise.name}</p>
                          <p className="shrink-0 text-xs text-muted-foreground">
                            {formatTarget(exercise)}
                          </p>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {exercise.metric === "time" && exercise.weight === 0
                            ? "Bodyweight"
                            : formatWeights(exercise)}{" "}
                          • {exercise.restSeconds}s rest
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
              className="bg-danger text-danger-foreground hover:bg-danger/90"
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


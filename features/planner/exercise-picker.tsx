"use client";

import { ChevronLeft, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  distinctValues,
  exerciseImageUrl,
  filterExercises,
  loadExercises,
  type Exercise
} from "@/lib/exercises";

const RESULT_LIMIT = 40;

interface ExercisePickerProps {
  onBack: () => void;
  onPick: (exercise: Exercise) => void;
}

// Rendered as a view inside the builder dialog (not a nested dialog) to avoid
// stacked-modal focus/pointer-events issues.
export function ExercisePicker({ onBack, onPick }: ExercisePickerProps) {
  const [list, setList] = useState<Exercise[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [query, setQuery] = useState("");
  const [bodyPart, setBodyPart] = useState("");
  const [equipment, setEquipment] = useState("");

  useEffect(() => {
    let active = true;
    loadExercises()
      .then((data) => {
        if (active) {
          setList(data);
          setStatus("ready");
        }
      })
      .catch(() => {
        if (active) {
          setStatus("error");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const bodyParts = useMemo(() => (list.length ? distinctValues(list, "bodyPart") : []), [list]);
  const equipmentList = useMemo(() => (list.length ? distinctValues(list, "equipment") : []), [list]);

  const results = useMemo(
    () =>
      filterExercises(list, {
        query,
        bodyPart: bodyPart || undefined,
        equipment: equipment || undefined
      }),
    [list, query, bodyPart, equipment]
  );

  const shown = results.slice(0, RESULT_LIMIT);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to session"
          className="shrink-0 rounded-full bg-secondary/60 p-3.5 text-muted-foreground transition active:scale-95 active:bg-secondary"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div>
          <DialogTitle className="text-lg font-semibold">Add exercise</DialogTitle>
          <DialogDescription>Search the library, or filter by body part.</DialogDescription>
        </div>
      </div>

      {/* No autoFocus: on touch it raises the keyboard over the filter row and
          the results — the two things you use when you don't want to type. */}
      <Input
        placeholder="Search by name or muscle"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        <FilterChip label="All" active={!bodyPart} onClick={() => setBodyPart("")} />
        {bodyParts.map((part) => (
          <FilterChip
            key={part}
            label={part}
            active={bodyPart === part}
            onClick={() => setBodyPart(bodyPart === part ? "" : part)}
          />
        ))}
      </div>

      <select
        aria-label="Filter by equipment"
        value={equipment}
        onChange={(event) => setEquipment(event.target.value)}
        className="w-full rounded-2xl bg-secondary/50 px-3 py-3 text-sm capitalize outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="">Any equipment</option>
        {equipmentList.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>

      {status === "loading" ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading exercises…</p>
      ) : status === "error" ? (
        <p className="py-8 text-center text-sm text-danger">
          Couldn&apos;t load the exercise library. Check your connection and try again.
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {results.length} found{results.length > RESULT_LIMIT ? ` · showing first ${RESULT_LIMIT}` : ""}
          </p>
          {/* The dialog is already the scroll container — a second one nested
              inside it swallows the drag until the inner list hits its end. */}
          <div className="space-y-2">
            {shown.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No matches. Try a different search or filter.
              </p>
            ) : (
              shown.map((exercise) => (
                <ExerciseRow key={exercise.id} exercise={exercise} onPick={onPick} />
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap rounded-full px-3 py-3.5 text-xs capitalize transition active:scale-95 ${
        active ? "bg-primary text-primary-foreground" : "bg-secondary/50 text-muted-foreground"
      }`}
    >
      {label}
    </button>
  );
}

function ExerciseRow({ exercise, onPick }: { exercise: Exercise; onPick: (exercise: Exercise) => void }) {
  return (
    <div className="rounded-2xl bg-secondary/50 p-2">
      <button
        type="button"
        onClick={() => onPick(exercise)}
        className="flex w-full items-center gap-3 rounded-xl text-left transition active:scale-[0.98] active:bg-background/60"
      >
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-muted">
          <img
            src={exerciseImageUrl(exercise)}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium capitalize">{exercise.name}</p>
          <p className="truncate text-xs capitalize text-muted-foreground">
            {exercise.target} · {exercise.equipment}
          </p>
        </div>
        <Plus className="h-4 w-4 shrink-0 text-primary" />
      </button>
      {exercise.steps.length ? (
        <details className="mt-1 px-1">
          <summary className="cursor-pointer list-none py-3 text-xs text-muted-foreground [&::-webkit-details-marker]:hidden">
            How to
          </summary>
          <ol className="mt-1 list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
            {exercise.steps.map((step, index) => (
              <li key={index}>{step}</li>
            ))}
          </ol>
        </details>
      ) : null}
    </div>
  );
}

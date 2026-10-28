"use client";

import { ChevronLeft, PlayCircle, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemedSelect } from "@/components/ui/select";
import { ExerciseMediaView } from "@/features/workout/exercise-media-dialog";
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
  // The exercise being watched before it is added. Swapped in place of the list,
  // like every other view in this drawer, rather than stacked as a dialog; the
  // search and filters survive the round trip because this component stays
  // mounted.
  const [preview, setPreview] = useState<Exercise | null>(null);

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

  // Only the equipment the chosen body part actually has. The full list lets you
  // pick barbell + waist and land on "no matches" — a dead end the picker knew
  // about before you tapped it.
  const equipmentList = useMemo(
    () =>
      distinctValues(bodyPart ? list.filter((item) => item.bodyPart === bodyPart) : list, "equipment"),
    [list, bodyPart]
  );

  // Derived rather than cleared inside the body-part handler: a part with no
  // dumbbells would otherwise leave the select reading "dumbbell" while still
  // filtering on it, which looks like a broken library rather than a stale filter.
  // Deriving also keeps the choice — come back to a part that does have dumbbells
  // and it is still selected, which is what someone comparing two parts wants.
  const activeEquipment = equipmentList.includes(equipment) ? equipment : "";

  const results = useMemo(
    () =>
      filterExercises(list, {
        query,
        bodyPart: bodyPart || undefined,
        equipment: activeEquipment || undefined
      }),
    [list, query, bodyPart, activeEquipment]
  );

  const shown = results.slice(0, RESULT_LIMIT);

  if (preview) {
    return (
      <div className="space-y-4">
        <ExerciseMediaView
          datasetId={preview.id}
          name={preview.name}
          onBack={() => setPreview(null)}
        />
        <div className="sticky bottom-0 flex gap-2 border-t border-border bg-card pt-3">
          <Button variant="secondary" className="flex-1" onClick={() => setPreview(null)}>
            Back to list
          </Button>
          <Button className="flex-1" onClick={() => onPick(preview)}>
            <Plus className="h-4 w-4" />
            Add exercise
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to workout"
          className="key-quiet flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div>
          <DialogTitle>Add exercise</DialogTitle>
          <DialogDescription>Search by name, or filter by body part.</DialogDescription>
        </div>
      </div>

      {/* No autoFocus: on touch it raises the keyboard over the filter row and
          the results — the two things you use when you don't want to type. */}
      <Input
        placeholder="Search by name or muscle"
        enterKeyHint="search"
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

      <ThemedSelect
        aria-label="Filter by equipment"
        className="capitalize"
        value={activeEquipment}
        onValueChange={setEquipment}
        options={[
          { value: "", label: "Any equipment" },
          ...equipmentList.map((item) => ({
            value: item,
            label: item.charAt(0).toUpperCase() + item.slice(1)
          }))
        ]}
      />

      {status === "loading" ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading exercises…</p>
      ) : status === "error" ? (
        <p className="py-8 text-center text-sm text-danger">
          The exercises did not load. Check your connection.
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
                No exercises found. Try another search.
              </p>
            ) : (
              shown.map((exercise) => (
                <ExerciseRow
                  key={exercise.id}
                  exercise={exercise}
                  onPick={onPick}
                  onPreview={setPreview}
                />
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
      className={`h-11 shrink-0 whitespace-nowrap rounded-full px-4 text-xs font-semibold capitalize ${
        active ? "key" : "key-quiet text-muted-foreground"
      }`}
    >
      {label}
    </button>
  );
}

function ExerciseRow({
  exercise,
  onPick,
  onPreview
}: {
  exercise: Exercise;
  onPick: (exercise: Exercise) => void;
  onPreview: (exercise: Exercise) => void;
}) {
  // Two buttons side by side, never one inside the other: the thumbnail and
  // the play key open the demo, the name and the + add it.
  return (
    <div className="flex items-center gap-2 rounded-lg bg-muted p-2">
      <button
        type="button"
        onClick={() => onPreview(exercise)}
        aria-label={`Watch ${exercise.name}`}
        className="well relative h-14 w-14 shrink-0 overflow-hidden rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <img
          src={exerciseImageUrl(exercise)}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
        <span className="absolute inset-0 flex items-center justify-center bg-black/25">
          <PlayCircle className="h-6 w-6 text-white drop-shadow" />
        </span>
      </button>
      <button
        type="button"
        onClick={() => onPick(exercise)}
        className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-lg px-1 text-left transition-colors active:bg-secondary"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold capitalize">{exercise.name}</span>
          <span className="block truncate text-xs capitalize text-muted-foreground">
            {exercise.target} · {exercise.equipment}
          </span>
        </span>
        <span className="key-quiet flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
          <Plus className="h-4 w-4 text-brand" />
        </span>
      </button>
    </div>
  );
}

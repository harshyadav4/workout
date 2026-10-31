"use client";

import { BackBody, FrontBody } from "@/features/body/lazy";
import { useMemo, useState } from "react";

import { ChevronLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { muscles as allMuscles } from "@/lib/seed-data";
import type { MuscleGroup, MuscleId } from "@/lib/types";

const GROUP_ORDER: Array<{ id: MuscleGroup; label: string }> = [
  { id: "chest", label: "Chest" },
  { id: "shoulders", label: "Shoulders" },
  { id: "back", label: "Back" },
  { id: "arms", label: "Arms" },
  { id: "core", label: "Core" },
  { id: "legs", label: "Legs" }
];

const DEFAULT_ENGAGEMENT = 30;

interface MuscleSelectViewProps {
  exerciseName: string;
  /** Engagement % per selected muscle. Absent means the muscle is not worked. */
  selected: Partial<Record<MuscleId, number>>;
  onChange: (next: Partial<Record<MuscleId, number>>) => void;
  onBack: () => void;
}

// Rendered as a view inside the builder drawer (not a nested dialog) to avoid
// stacked-modal focus/pointer-events issues — same as ExercisePicker.
export function MuscleSelectView({
  exerciseName,
  selected,
  onChange,
  onBack
}: MuscleSelectViewProps) {
  // The muscle the map is pointing at — the last one you touched, so the figure
  // always answers "which one is that?" for the chip under your thumb.
  const [focused, setFocused] = useState<MuscleId>();

  const chosen = useMemo(
    () => Object.keys(selected) as MuscleId[],
    [selected]
  );
  const focusedMuscle = allMuscles.find((muscle) => muscle.id === focused);
  const focusedEngagement = focused ? selected[focused] : undefined;

  const highlights = useMemo(
    () =>
      allMuscles.map((muscle) => ({
        muscleId: muscle.id,
        muscleName: muscle.name,
        intensity: selected[muscle.id] ?? 0
      })),
    [selected]
  );

  const toggle = (muscleId: MuscleId) => {
    setFocused(muscleId);
    const next = { ...selected };
    if (next[muscleId] === undefined) {
      next[muscleId] = DEFAULT_ENGAGEMENT;
    } else {
      delete next[muscleId];
    }
    onChange(next);
  };

  const setEngagement = (muscleId: MuscleId, value: number) => {
    onChange({ ...selected, [muscleId]: value });
  };

  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to exercise"
          className="key-quiet flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          <DialogTitle>Muscles worked</DialogTitle>
          <DialogDescription>
            {exerciseName.trim() || "This exercise"} ·{" "}
            {chosen.length === 0 ? "none yet" : `${chosen.length} selected`}
          </DialogDescription>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <FrontBody
            className="mx-auto h-[13rem] w-auto max-w-full"
            highlights={highlights}
            selectedMuscleId={focused}
            onSelectMuscle={(muscleId) => muscleId && setFocused(muscleId as MuscleId)}
          />
        </div>
        <div>
          <BackBody
            className="mx-auto h-[13rem] w-auto max-w-full"
            highlights={highlights}
            selectedMuscleId={focused}
            onSelectMuscle={(muscleId) => muscleId && setFocused(muscleId as MuscleId)}
          />
        </div>
      </div>
      {/* State-carrying, so text-xs at 0.14em per the Home #9 ruling — this
          line is the map's answer to "which muscle is that?". */}
      <p className="mt-2 text-center text-xs font-medium text-muted-foreground">
        {focusedMuscle ? focusedMuscle.scientific : "Tap a muscle to find it"}
      </p>

      {focused && focusedMuscle ? (
        <div className="mt-3">
          <div className="flex items-baseline justify-between">
            <p className="text-[15.5px] font-medium">{focusedMuscle.name}</p>
            <p className="text-[15px] tabular-nums text-muted-foreground">
              {focusedEngagement === undefined ? "Not worked" : `${focusedEngagement}%`}
            </p>
          </div>
          <p className="mt-1 text-[13px] text-muted-foreground">{focusedMuscle.description}</p>
          <label className="mt-2 block">
            <span className="text-xs font-medium text-muted-foreground">
              Activation
            </span>
            <input
              type="range"
              min={5}
              max={100}
              step={5}
              value={focusedEngagement ?? DEFAULT_ENGAGEMENT}
              disabled={focusedEngagement === undefined}
              className="mt-1 h-11 w-full accent-[hsl(var(--primary))] disabled:opacity-40"
              onChange={(event) => setEngagement(focused, Number(event.target.value))}
            />
          </label>
          {focusedEngagement === undefined ? (
            <Button className="mt-1 w-full" onClick={() => toggle(focused)}>
              Add {focusedMuscle.name}
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-4 pt-4">
        {GROUP_ORDER.map((group) => (
          <div key={group.id}>
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              {group.label}
            </p>
            <div className="flex flex-wrap gap-2">
              {allMuscles
                .filter((muscle) => muscle.group === group.id)
                .map((muscle) => {
                  const active = selected[muscle.id] !== undefined;
                  return (
                    <button
                      key={muscle.id}
                      type="button"
                      aria-pressed={active}
                      className={`h-11 rounded-full px-3.5 text-xs font-semibold ${
                        active ? "key" : "key-quiet text-muted-foreground"
                      } ${muscle.id === focused ? "ring-2 ring-ring ring-offset-2 ring-offset-card" : ""}`}
                      onClick={() => toggle(muscle.id)}
                      onFocus={() => setFocused(muscle.id)}
                    >
                      {muscle.name}
                    </button>
                  );
                })}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

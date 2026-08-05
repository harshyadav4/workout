"use client";

import { useMemo, useState } from "react";

import BackBody from "@/features/body/back";
import FrontBody from "@/features/body/front";
import { ArrowLeft } from "lucide-react";

import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
      <DialogHeader>
        <button
          type="button"
          className="-ml-2 mb-1 flex items-center gap-2 rounded-full px-2 py-3 text-sm text-muted-foreground transition active:bg-secondary/60"
          onClick={onBack}
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <DialogTitle>Muscles worked</DialogTitle>
        <p className="font-mono text-xs tracking-[0.18em] text-muted-foreground">
          {exerciseName.trim().toUpperCase() || "THIS EXERCISE"} ·{" "}
          {chosen.length === 0 ? "NONE YET" : `${chosen.length} SELECTED`}
        </p>
      </DialogHeader>

      <div>
          <div className="rounded-[24px] bg-background p-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-[#F7ECD9] p-2">
                <FrontBody
                  className="mx-auto h-[13rem] w-auto max-w-full"
                  highlights={highlights}
                  selectedMuscleId={focused}
                  onSelectMuscle={(muscleId) => muscleId && setFocused(muscleId as MuscleId)}
                />
              </div>
              <div className="rounded-2xl bg-[#F7ECD9] p-2">
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
            <p className="mt-2 text-center font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
              {focusedMuscle ? focusedMuscle.scientific : "Tap a muscle to find it"}
            </p>
          </div>
        </div>

      {focused && focusedMuscle ? (
        <div className="mt-3 rounded-2xl bg-secondary/50 p-4">
            <div className="flex items-baseline justify-between">
              <p className="text-sm font-semibold">{focusedMuscle.name}</p>
              <p className="font-mono text-sm tabular-nums text-primary">
                {focusedEngagement === undefined ? "Not worked" : `${focusedEngagement}%`}
              </p>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{focusedMuscle.description}</p>
            <label className="mt-3 block">
              <span className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
                Activation
              </span>
              <input
                type="range"
                min={5}
                max={100}
                step={5}
                value={focusedEngagement ?? DEFAULT_ENGAGEMENT}
                disabled={focusedEngagement === undefined}
                className="mt-2 h-11 w-full accent-[hsl(var(--primary))] disabled:opacity-40"
                onChange={(event) => setEngagement(focused, Number(event.target.value))}
              />
            </label>
            {focusedEngagement === undefined ? (
              <button
                type="button"
                className="mt-2 w-full rounded-full bg-primary px-3 py-3.5 text-xs font-medium text-primary-foreground transition active:scale-[0.98]"
                onClick={() => toggle(focused)}
              >
                Add {focusedMuscle.name}
              </button>
            ) : null}
          </div>
        ) : null}

      <div className="space-y-4 pt-4">
          {GROUP_ORDER.map((group) => (
            <div key={group.id}>
              <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
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
                        className={`rounded-full px-3 py-3.5 text-xs transition active:scale-95 ${
                          active
                            ? "bg-primary text-primary-foreground"
                            : "bg-background text-muted-foreground"
                        } ${muscle.id === focused ? "ring-2 ring-primary/60" : ""}`}
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

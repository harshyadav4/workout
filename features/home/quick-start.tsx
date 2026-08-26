"use client";

import { Check, Dumbbell } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useWorkoutStore } from "@/features/workout/workout-store";
import type { PlannedExercise } from "@/lib/types";
import { plannedExercisesFromWorkouts } from "@/lib/workout-helpers";
import { cn } from "@/lib/utils";

/**
 * Train now, without planning first.
 *
 * The app's structural bet is that you cannot log a workout you did not
 * schedule, and it is the top of every funnel: a new user faced fifteen taps of
 * session-building before the app did anything for them. This is the way past
 * that — pick a group, tap what you're doing, start.
 *
 * It reads the **preset library** rather than `exercises.json`: the presets are
 * already in the store, carry `defaultSets` worth using as starting numbers, and
 * cost no 990 KB fetch on the one screen that has to feel instant.
 */

// Enough to cover a session, few enough to scan standing at a rack.
const PER_GROUP = 8;

interface WorkoutPickerProps {
  /** Verb for the confirm button — this picker both starts and extends sessions. */
  confirmLabel: string;
  onConfirm: (exercises: PlannedExercise[], group: string) => void;
}

export function WorkoutPicker({ confirmLabel, onConfirm }: WorkoutPickerProps) {
  const templates = useWorkoutStore((state) => state.templates);
  const logs = useWorkoutStore((state) => state.logs);
  const setLogs = useWorkoutStore((state) => state.setLogs);

  const [group, setGroup] = useState<string | undefined>(undefined);
  const [pickedIds, setPickedIds] = useState<string[]>([]);

  const groups = useMemo(
    () => [...new Set(templates.map((template) => template.category))].sort(),
    [templates]
  );

  const options = useMemo(
    () => templates.filter((template) => template.category === group).slice(0, PER_GROUP),
    [group, templates]
  );

  const toggle = (id: string) =>
    setPickedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );

  const confirm = () => {
    // Ordered as the library lists them, not as they were tapped — the order you
    // happened to notice an exercise in is not the order you want to train it.
    const picked = options.filter((template) => pickedIds.includes(template.id));
    if (picked.length === 0) {
      return;
    }

    onConfirm(plannedExercisesFromWorkouts(picked, { logs, setLogs }), group ?? "Session");
    setPickedIds([]);
  };

  return (
    <>
      <div className="flex items-baseline justify-between">
        <p className="text-sm text-muted-foreground">
          {group ? "Tap what you're doing." : "What are you training?"}
        </p>
        {pickedIds.length > 0 ? (
          <p className="font-mono text-xs tabular-nums text-muted-foreground">
            {pickedIds.length} picked
          </p>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {groups.map((item) => {
          const active = item === group;
          return (
            <Button
              key={item}
              variant={active ? "default" : "secondary"}
              size="sm"
              className="h-11 rounded-full px-4 text-sm"
              aria-pressed={active}
              onClick={() => {
                // Switching groups clears the picks: they were exercises from
                // the group you just left, and carrying them silently into a
                // list that no longer shows them is worse than losing them.
                setGroup(active ? undefined : item);
                setPickedIds([]);
              }}
            >
              {item}
            </Button>
          );
        })}
      </div>

      {group ? (
        <div className="mt-4 space-y-2">
          {options.map((template) => {
            const picked = pickedIds.includes(template.id);
            const defaults = template.defaultSets?.[0];
            return (
              <button
                key={template.id}
                type="button"
                aria-pressed={picked}
                onClick={() => toggle(template.id)}
                className={cn(
                  "flex min-h-14 w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition-colors",
                  picked ? "bg-primary/15 ring-1 ring-primary/40" : "bg-secondary/50"
                )}
              >
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                    picked ? "bg-primary text-primary-foreground" : "bg-background"
                  )}
                >
                  {picked ? <Check className="h-4 w-4" /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{template.name}</span>
                  {defaults ? (
                    <span className="block font-mono text-xs tabular-nums text-muted-foreground">
                      {defaults.sets} × {defaults.reps} · {template.equipment ?? "any"}
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}

          <Button size="lg" className="w-full" disabled={pickedIds.length === 0} onClick={confirm}>
            <Dumbbell className="mr-2 h-4 w-4" />
            {pickedIds.length === 0
              ? "Pick at least one"
              : `${confirmLabel} · ${pickedIds.length}`}
          </Button>
        </div>
      ) : null}
    </>
  );
}

/** The picker as Home's own card: pick a group, tap what you're doing, start. */
export function QuickStart() {
  const startAdHocSession = useWorkoutStore((state) => state.startAdHocSession);

  return (
    <Card>
      <h3 className="text-lg font-semibold tracking-tight">Train now</h3>
      <div className="mt-1">
        <WorkoutPicker
          confirmLabel="Start"
          // The group is the session's name: "Push", not "Session". It lives in
          // the picker, so it comes back with the picks.
          onConfirm={(exercises, group) => startAdHocSession({ name: group, exercises })}
        />
      </div>
    </Card>
  );
}

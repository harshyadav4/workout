"use client";

import { AlertTriangle, ChevronRight } from "lucide-react";
import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import type { PlannedExercise } from "@/lib/types";

/**
 * "Finish session" with work left asks first. Finishing is the one tap in the
 * session that cannot be taken back, and it sits right under the last set —
 * a thumb meant for Log set lands on it. This says what would be dropped,
 * exercise by exercise, and each row is a way back into that exercise.
 *
 * In the page, in place of the button, not a sheet over it: it is the button's
 * own answer, and a drawer for three lines felt like leaving the screen.
 * "Keep going" is the key: on a stray tap, the safe answer is the obvious one.
 */
export function FinishConfirm({
  exercises,
  onCancel,
  onFinish,
  onPick
}: {
  exercises: PlannedExercise[];
  onCancel: () => void;
  onFinish: () => void;
  /** Leave the question and open this exercise. */
  onPick: (exercise: PlannedExercise) => void;
}) {
  const unfinished = exercises
    .map((exercise) => ({
      exercise,
      done: exercise.sets.filter((setItem) => setItem.completed).length
    }))
    .filter(({ exercise, done }) => done < exercise.sets.length);
  const nothingLogged = exercises.every((exercise) => exercise.sets.every((setItem) => !setItem.completed));

  // Focus moves to the question, so a screen reader announces it — onto the
  // card, not a button, which would light a focus ring nobody asked for.
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus({ preventScroll: true }), []);

  return (
    // The Card's own surface, spelled out because Card does not forward a ref.
    <div
      ref={ref}
      tabIndex={-1}
      role="alertdialog"
      aria-labelledby="finish-confirm-title"
      className="plaque system-pop rounded-3xl p-4 outline-none"
    >
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
        <div>
          <p id="finish-confirm-title" className="font-heading text-[24px] leading-tight">
            {nothingLogged ? "No sets logged" : "Sets not logged"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {nothingLogged
              ? "Finishing now saves nothing."
              : "Only logged sets get saved. Tap one to log it:"}
          </p>
        </div>
      </div>

      <ul className="mt-3 divide-y divide-sep border-t border-sep">
        {unfinished.map(({ exercise, done }) => (
          <li key={exercise.id}>
            <button
              type="button"
              onClick={() => onPick(exercise)}
              className="flex min-h-11 w-full items-center gap-3 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{exercise.templateName}</span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {done} of {exercise.sets.length} sets
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button onClick={onCancel}>
          Log more sets
        </Button>
        <Button variant="secondary" className="text-muted-foreground" onClick={onFinish}>
          Finish now
        </Button>
      </div>
    </div>
  );
}

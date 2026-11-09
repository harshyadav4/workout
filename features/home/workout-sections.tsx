"use client";

import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

import { ListRow } from "@/components/ui/list";
import type { PlannedExercise } from "@/lib/types";
import { isExerciseIncluded, WORKOUT_SECTIONS } from "@/lib/workout-structure";

/** One ledger, grouped only when the workout actually uses sections. */
export function WorkoutSections({ exercises, onInclude, renderExercise, children }: {
  exercises: PlannedExercise[];
  onInclude: (exercise: PlannedExercise) => void;
  renderExercise: (exercise: PlannedExercise) => ReactNode;
  children?: ReactNode;
}) {
  const structured = exercises.some((exercise) => exercise.section && exercise.section !== "main");
  return (
    <div className="plaque overflow-hidden rounded-3xl">
      {WORKOUT_SECTIONS.map((section) => {
        const items = exercises.filter((exercise) => (exercise.section ?? "main") === section.id);
        if (!items.length) return null;
        const included = items.filter(isExerciseIncluded);
        const optional = items.filter((exercise) => !isExerciseIncluded(exercise));
        return (
          <div key={section.id}>
            {structured ? <h3 className="border-t border-sep px-4 pb-1 pt-4 text-[13.5px] font-semibold text-muted-foreground">{section.label}</h3> : null}
            {included.map(renderExercise)}
            {optional.length ? (
              <details className="group/optional border-t border-sep">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-[15px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                  <span>Optional exercises <span className="text-muted-foreground tabular-nums">· {optional.length}</span></span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground group-open/optional:rotate-180" aria-hidden />
                </summary>
                {optional.map((exercise) => (
                  <ListRow key={exercise.id} label={exercise.templateName}
                    hint={exercise.sets.some((set) => set.completed) ? "Logged sets kept · remaining sets left out" : "Left out of today's targets"}
                    value="Include" onClick={() => onInclude(exercise)} />
                ))}
                <p className="px-4 pb-3 text-[13px] text-muted-foreground">Leaving these out does not affect completion.</p>
              </details>
            ) : null}
          </div>
        );
      })}
      {children}
    </div>
  );
}

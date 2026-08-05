"use client";

import { ChevronLeft, PlayCircle } from "lucide-react";
import { useEffect, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
  DRAWER_CONTENT
} from "@/components/ui/dialog";
import { exerciseGifUrl, loadExercises, type Exercise } from "@/lib/exercises";
import type { WorkoutTemplate } from "@/lib/types";

const DB_PREFIX = "db-";

/**
 * Dataset id for a catalog template, or undefined for hand-entered exercises
 * (which have no media). Templates saved before `dbId` existed carry the id
 * only inside their `db-0001` template id, hence the prefix fallback.
 */
export function templateDatasetId(
  template: Pick<WorkoutTemplate, "id" | "dbId"> | undefined
): string | undefined {
  if (!template) {
    return undefined;
  }
  if (template.dbId) {
    return template.dbId;
  }
  return template.id.startsWith(DB_PREFIX) ? template.id.slice(DB_PREFIX.length) : undefined;
}

// The remote CDN is third-party and 404s on a few entries: swap in text rather
// than leave a broken-image icon in the sheet.
function ExerciseGif({ exercise }: { exercise: Exercise }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <p className="flex aspect-[4/3] items-center justify-center rounded-2xl bg-secondary/50 px-6 text-center text-sm text-muted-foreground">
        The demo animation didn&apos;t load. The steps below still apply.
      </p>
    );
  }

  return (
    <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-2xl bg-secondary/50">
      <img
        src={exerciseGifUrl(exercise)}
        alt={`${exercise.name} demonstration`}
        className="h-full w-full object-contain"
        onError={() => setFailed(true)}
      />
    </div>
  );
}

interface ExerciseMediaViewProps {
  datasetId: string;
  name: string;
  /** Shows a back arrow — for the Build drawer, which swaps views instead of stacking dialogs. */
  onBack?: () => void;
}

/**
 * Media panel without a Dialog wrapper, so it can either be swapped into an
 * open drawer (Build) or portalled into its own sheet (Home).
 */
export function ExerciseMediaView({ datasetId, name, onBack }: ExerciseMediaViewProps) {
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let active = true;
    setStatus("loading");
    loadExercises()
      .then((list) => {
        if (!active) {
          return;
        }
        const found = list.find((item) => item.id === datasetId) ?? null;
        setExercise(found);
        setStatus(found ? "ready" : "error");
      })
      .catch(() => {
        if (active) {
          setStatus("error");
        }
      });
    return () => {
      active = false;
    };
  }, [datasetId]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 pr-8">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to session"
            className="shrink-0 rounded-full bg-secondary/60 p-2 text-muted-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        ) : null}
        <div className="min-w-0">
          <DialogTitle className="truncate text-lg font-semibold capitalize">{name}</DialogTitle>
          <DialogDescription className="capitalize">
            {exercise ? `${exercise.target} · ${exercise.equipment}` : "How it is done"}
          </DialogDescription>
        </div>
      </div>

      {status === "loading" ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading demo…</p>
      ) : status === "error" || !exercise ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No demo available for this exercise.
        </p>
      ) : (
        <>
          <ExerciseGif key={exercise.id} exercise={exercise} />
          {exercise.steps.length ? (
            <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
              {exercise.steps.map((step, index) => (
                <li key={index}>{step}</li>
              ))}
            </ol>
          ) : null}
        </>
      )}
    </div>
  );
}

interface ExerciseMediaDialogProps {
  datasetId: string;
  name: string;
}

/** Trigger + bottom sheet. Only for screens that are not already inside a dialog. */
export function ExerciseMediaDialog({ datasetId, name }: ExerciseMediaDialogProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={`View ${name} demo`}
          className="shrink-0 rounded-full p-1.5 text-muted-foreground transition hover:bg-secondary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <PlayCircle className="h-4 w-4" />
        </button>
      </DialogTrigger>
      <DialogContent className={`${DRAWER_CONTENT} max-h-[85vh] overflow-y-auto`}>
        <ExerciseMediaView datasetId={datasetId} name={name} />
      </DialogContent>
    </Dialog>
  );
}

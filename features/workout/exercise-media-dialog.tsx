"use client";

import { ChevronLeft, PlayCircle } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
  DRAWER_CONTENT
} from "@/components/ui/dialog";
import { exerciseGifUrl, exerciseImageUrl, loadExercises, type Exercise } from "@/lib/exercises";
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

/**
 * The dataset row behind one exercise.
 *
 * `loadExercises` caches the parsed file at module level, so every caller after
 * the first is a lookup rather than a fetch — which is what makes this safe in
 * the logging path, where the open set walks from one exercise to the next.
 */
function useDatasetExercise(datasetId: string) {
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

  return { exercise, status };
}

/**
 * A GIF ignores `prefers-reduced-motion`. CSS can pause an animation but not a
 * decoded image, so the only way to honour the setting is to serve the still
 * frame the dataset already ships — `exerciseImageUrl`, the picker's thumbnail.
 */
function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reduced;
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
  const { exercise, status } = useDatasetExercise(datasetId);

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
  /** A trigger of your own. Defaults to the play icon beside an exercise name. */
  children?: ReactNode;
}

/** Trigger + bottom sheet. Only for screens that are not already inside a dialog. */
export function ExerciseMediaDialog({ datasetId, name, children }: ExerciseMediaDialogProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        {children ?? (
          <button
            type="button"
            aria-label={`View ${name} demo`}
            className="shrink-0 rounded-full p-1.5 text-muted-foreground transition hover:bg-secondary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <PlayCircle className="h-4 w-4" />
          </button>
        )}
      </DialogTrigger>
      <DialogContent className={`${DRAWER_CONTENT} max-h-[85dvh] overflow-y-auto`}>
        <ExerciseMediaView datasetId={datasetId} name={name} />
      </DialogContent>
    </Dialog>
  );
}

/**
 * The lift in front of you, looping, at thumbnail size.
 *
 * Small on purpose. It sits in the open set panel, above the steppers and above
 * the one button you press every set — a full-width animation would push that
 * button further down the screen to show you something you already know how to
 * do by set three. Tap it for the full sheet and the written steps.
 */
export function ExerciseDemoThumb({ datasetId, name }: { datasetId: string; name: string }) {
  const { exercise } = useDatasetExercise(datasetId);
  const still = usePrefersReducedMotion();
  const [failed, setFailed] = useState(false);

  return (
    <ExerciseMediaDialog datasetId={datasetId} name={name}>
      {/* Sized whether or not there is an image in it yet, so the panel does not
          jump under your thumb when the dataset resolves a beat after the set
          opens — or when the third-party CDN 404s, which it does for a few. */}
      <button
        type="button"
        aria-label={`View ${name} demo`}
        className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-background/70 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95"
      >
        {exercise && !failed ? (
          <img
            src={still ? exerciseImageUrl(exercise) : exerciseGifUrl(exercise)}
            alt=""
            className="h-full w-full object-cover"
            onError={() => setFailed(true)}
          />
        ) : (
          <PlayCircle className="h-5 w-5 text-muted-foreground" />
        )}
      </button>
    </ExerciseMediaDialog>
  );
}

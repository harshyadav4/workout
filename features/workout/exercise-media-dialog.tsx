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
import { useWorkoutStore } from "@/features/workout/workout-store";
import { exerciseGifUrl, exerciseImageUrl, loadExercises, type Exercise } from "@/lib/exercises";
import { datasetIdOf, mediaUrl } from "@/lib/media";
import type { WorkoutTemplate } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Dataset id for a catalog template or a built-in one, or undefined for
 * hand-entered exercises (which have no media). Templates saved before `dbId` existed carry the id
 * only inside their `db-0001` template id, hence the prefix fallback.
 */
export function templateDatasetId(
  template: Pick<WorkoutTemplate, "id" | "dbId"> | undefined
): string | undefined {
  if (!template) {
    return undefined;
  }
  return template.dbId ?? datasetIdOf(template.id);
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
    // A stored GIF needs no dataset: skip the 1 MB library fetch.
    if (!datasetId) {
      setExercise(null);
      setStatus("error");
      return;
    }
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

const SLOW_GIF_MS = 15000;

/**
 * The still frame first, the animation over it once it has arrived.
 *
 * The GIFs are 80–100 KB from a third-party host that can take minutes on a
 * slow mobile network. Before, the sheet sat on the image's alt text the whole
 * time — it looked broken, not busy. The still is ~6 KB and is the same frame,
 * so there is something true to look at at once, and the GIF fades in over it.
 * Reduced motion gets the still only (see `usePrefersReducedMotion`).
 */
function ExerciseGif({ exercise }: { exercise: Exercise }) {
  const still = usePrefersReducedMotion();
  const [gif, setGif] = useState<"loading" | "ready" | "slow" | "failed">("loading");
  const [stillFailed, setStillFailed] = useState(false);

  useEffect(() => {
    if (gif !== "loading") {
      return;
    }
    const id = window.setTimeout(() => setGif("slow"), SLOW_GIF_MS);
    return () => window.clearTimeout(id);
  }, [gif]);

  const showGif = !still && gif !== "failed";
  const note =
    still || gif === "ready"
      ? undefined
      : gif === "loading"
        ? "Loading video…"
        : gif === "slow"
          ? "The video is slow to load"
          : "The video did not load";

  if (stillFailed && !showGif) {
    return (
      <p className="flex aspect-[4/3] items-center justify-center rounded-lg bg-muted px-6 text-center text-sm text-muted-foreground">
        The demo did not load. Use the steps below.
      </p>
    );
  }

  return (
    <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg bg-muted">
      {stillFailed ? null : (
        <img
          src={exerciseImageUrl(exercise)}
          alt={`${exercise.name} demonstration`}
          className="absolute inset-0 h-full w-full object-contain"
          onError={() => setStillFailed(true)}
        />
      )}
      {/* A late GIF still wins over "slow": the label was a progress report,
          not a verdict. */}
      {showGif ? (
        <img
          src={exerciseGifUrl(exercise)}
          alt=""
          className={cn(
            "absolute inset-0 h-full w-full object-contain transition-opacity duration-300",
            gif === "ready" ? "opacity-100" : "opacity-0"
          )}
          onLoad={() => setGif("ready")}
          onError={() => setGif("failed")}
        />
      ) : null}
      {note ? (
        <p
          role="status"
          className="absolute bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-background/85 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur"
        >
          {note}
        </p>
      ) : null}
    </div>
  );
}

interface ExerciseMediaViewProps {
  /** A library exercise. Either this or `gifUrl`. */
  datasetId?: string;
  /** A stored GIF for an exercise outside the library (lib/media.ts). */
  gifUrl?: string;
  name: string;
  /** Shows a back arrow — for the Build drawer, which swaps views instead of stacking dialogs. */
  onBack?: () => void;
}

/**
 * Media panel without a Dialog wrapper, so it can either be swapped into an
 * open drawer (Build) or portalled into its own sheet (Home).
 */
export function ExerciseMediaView({ datasetId, gifUrl, name, onBack }: ExerciseMediaViewProps) {
  const { exercise, status } = useDatasetExercise(datasetId ?? "");

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 pr-8">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className="key-quiet flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        ) : null}
        <div className="min-w-0">
          <DialogTitle className="truncate capitalize">{name}</DialogTitle>
          <DialogDescription className="capitalize">
            {exercise ? `${exercise.target} · ${exercise.equipment}` : "How to do it"}
          </DialogDescription>
        </div>
      </div>

      {gifUrl ? (
        <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg bg-muted">
          <img src={gifUrl} alt={`${name} demonstration`} className="h-full w-full object-contain" />
        </div>
      ) : status === "loading" ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading demo…</p>
      ) : status === "error" || !exercise ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          This exercise has no demo.
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
  datasetId?: string;
  gifUrl?: string;
  name: string;
  /** A trigger of your own. Defaults to the play icon beside an exercise name. */
  children?: ReactNode;
}

/** Trigger + bottom sheet. Only for screens that are not already inside a dialog. */
export function ExerciseMediaDialog({ datasetId, gifUrl, name, children }: ExerciseMediaDialogProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        {children ?? (
          <button
            type="button"
            aria-label={`View ${name} demo`}
            className="shrink-0 rounded-full p-1.5 text-muted-foreground transition hover:bg-secondary hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <PlayCircle className="h-4 w-4" />
          </button>
        )}
      </DialogTrigger>
      <DialogContent className={`${DRAWER_CONTENT} max-h-[85dvh] overflow-y-auto`}>
        <ExerciseMediaView datasetId={datasetId} gifUrl={gifUrl} name={name} />
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
export function ExerciseDemoThumb({
  datasetId,
  gifUrl,
  name
}: {
  datasetId?: string;
  gifUrl?: string;
  name: string;
}) {
  const { exercise } = useDatasetExercise(datasetId ?? "");
  const still = usePrefersReducedMotion();
  const [failed, setFailed] = useState(false);

  return (
    <ExerciseMediaDialog datasetId={datasetId} gifUrl={gifUrl} name={name}>
      {/* Sized whether or not there is an image in it yet, so the panel does not
          jump under your thumb when the dataset resolves a beat after the set
          opens — or when the third-party CDN 404s, which it does for a few. */}
      <button
        type="button"
        aria-label={`View ${name} demo`}
        className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg well transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95"
      >
        {gifUrl && !failed ? (
          // A stored GIF has no still frame, so reduced motion gets the icon.
          still ? (
            <PlayCircle className="h-5 w-5 text-muted-foreground" />
          ) : (
            <img src={gifUrl} alt="" className="h-full w-full object-cover" onError={() => setFailed(true)} />
          )
        ) : exercise && !failed ? (
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

/**
 * The demo, opened from a list row — the finish card, a day in the plan. A
 * full 44px target, unlike the ledger's 28px icon beside a name mid-set: these
 * sit in lists of rows. Renders nothing for an exercise with no demo.
 */
export function ExerciseDemoButton({ workoutId, name }: { workoutId: string; name: string }) {
  const datasetId = templateDatasetId({ id: workoutId });
  // An exercise from outside the library may carry a stored GIF instead.
  const gifUrl = mediaUrl(
    useWorkoutStore((state) => state.templates.find((item) => item.id === workoutId)?.mediaPath)
  );

  if (!datasetId && !gifUrl) {
    return null;
  }

  return (
    <ExerciseMediaDialog datasetId={datasetId} gifUrl={gifUrl} name={name}>
      <button
        type="button"
        aria-label={`View ${name} demo`}
        className="-my-2.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-secondary/60"
      >
        <PlayCircle className="h-5 w-5" />
      </button>
    </ExerciseMediaDialog>
  );
}

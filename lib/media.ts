/**
 * Stored demo GIFs for exercises outside the library. The fetch itself happens
 * on the server (app/api/media/route.ts); this is the browser's side of it.
 */
import { supabase } from "@/lib/supabase";
import type { ScheduledSession, SessionTemplate, WorkoutTemplate } from "@/lib/types";

export const MEDIA_BUCKET = "exercise-media";

/**
 * The built-in exercises, matched to their entry in the exercise library
 * (public/exercises.json), so they get a demo too. Presets were never given a
 * `dbId`, and every device already holds a stored copy of them — so the link
 * lives here, keyed by preset id, rather than on the template. Where the
 * library has no exact twin the closest one stands in: a face pull is the
 * rope rear-delt row, a chest-supported row the incline dumbbell row.
 */
export const PRESET_DATASET_IDS: Record<string, string> = {
  "bench-press": "0025",
  "incline-db-press": "0314",
  "cable-fly": "0188",
  "shoulder-press": "1456",
  "lat-pulldown": "0150",
  "barbell-row": "0027",
  "chest-supported-row": "0327",
  "seated-cable-row": "0861",
  "face-pull": "0203",
  "back-squat": "0043",
  "front-squat": "0042",
  deadlift: "0032",
  "romanian-deadlift": "0085",
  "leg-press": "0739",
  "leg-extension": "0585",
  "seated-leg-curl": "0599",
  "lying-leg-curl": "0586",
  "walking-lunge": "1460",
  "standing-calf-raise": "0605",
  "seated-calf-raise": "0594",
  "lateral-raise": "0334",
  "biceps-curl": "0294",
  "incline-db-curl": "0318",
  "cable-curl": "0868",
  "triceps-pushdown": "0201",
  "overhead-triceps-ext": "0194",
  "hanging-leg-raise": "0472",
  "cable-crunch": "0175",
  plank: "2135",
  "farmers-carry": "2133",
  "wrist-curl": "0401"
};

/**
 * The library entry behind an exercise id, if it has one: `db-0652` is library
 * exercise 0652, and a built-in like `cable-curl` maps through
 * PRESET_DATASET_IDS. Custom exercises have none. Two ids with the same entry
 * are the same movement — logging the built-in Plank counts as the library's.
 */
export function datasetIdOf(workoutId: string): string | undefined {
  if (workoutId.startsWith("db-")) {
    return workoutId.slice(3);
  }
  return Object.hasOwn(PRESET_DATASET_IDS, workoutId) ? PRESET_DATASET_IDS[workoutId] : undefined;
}

/** The public URL of a stored GIF, or undefined when there is no Supabase. */
export function mediaUrl(path?: string): string | undefined {
  if (!path || !supabase) {
    return undefined;
  }
  return supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Ask the server to fetch and store one GIF. Resolves to its storage path. */
export async function storeGif(url: string): Promise<string> {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new Error("Sign in first.");
  }
  const response = await fetch("/api/media", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ url })
  });
  const body = (await response.json().catch(() => ({}))) as { path?: string; error?: string };
  if (!response.ok || !body.path) {
    throw new Error(body.error ?? `Media request failed (${response.status}).`);
  }
  return body.path;
}

/**
 * Drop the media of every custom exercise no session uses any more.
 *
 * "Uses" covers the calendar as well as the templates: deleting a template
 * must not strip the demo from sessions already on the calendar — past ones
 * are history, and they keep everything they had. The template itself stays
 * too: logged history still points at it for its name and muscles. Only the
 * GIF goes, and only once nothing at all refers to it. Clearing the
 * path here is what makes the sync layer delete the file — see
 * `removedMediaPaths` in lib/sync.ts.
 */
export function releaseUnusedMedia(
  templates: WorkoutTemplate[],
  sessionTemplates: SessionTemplate[],
  scheduledSessions: Pick<ScheduledSession, "exercises">[] = []
): WorkoutTemplate[] {
  const used = new Set([
    ...sessionTemplates.flatMap((session) => session.workoutIds),
    ...scheduledSessions.flatMap((session) => session.exercises.map((exercise) => exercise.workoutId))
  ]);
  let changed = false;
  const next = templates.map((template) => {
    if (template.mediaPath && !used.has(template.id)) {
      changed = true;
      return { ...template, mediaPath: undefined };
    }
    return template;
  });
  return changed ? next : templates;
}

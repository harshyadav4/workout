/**
 * Stored demo GIFs for exercises outside the library. The fetch itself happens
 * on the server (app/api/media/route.ts); this is the browser's side of it.
 */
import { supabase } from "@/lib/supabase";
import type { SessionTemplate, WorkoutTemplate } from "@/lib/types";

export const MEDIA_BUCKET = "exercise-media";

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
 * The template itself stays: logged history still points at it for its name
 * and muscles. Only the GIF goes, which is what costs storage. Clearing the
 * path here is what makes the sync layer delete the file — see
 * `removedMediaPaths` in lib/sync.ts.
 */
export function releaseUnusedMedia(
  templates: WorkoutTemplate[],
  sessionTemplates: SessionTemplate[]
): WorkoutTemplate[] {
  const used = new Set(sessionTemplates.flatMap((session) => session.workoutIds));
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

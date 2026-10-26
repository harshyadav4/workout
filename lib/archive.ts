import { ImportError, parseExportText } from "@/lib/import-backup";
import { supabase } from "@/lib/supabase";
import {
  buildExport,
  clearUserRows,
  isMissingTable,
  pushChanges,
  type RemoteState,
  type SyncableState
} from "@/lib/sync";
import type { WorkoutTemplate } from "@/lib/types";

/**
 * "Delete all my data", with a week to change your mind.
 *
 * Asking for deletion moves everything into one hidden row (`data_archives`)
 * and clears the live tables, so the app is empty and ready for a fresh start
 * at once. For a week the archive can come back — merged with whatever was
 * logged since, or replacing it. After the week, the app deletes the archive
 * the next time it opens. Data logged after the request is never touched by
 * that: it is new data, not the data that was asked to go.
 */

const MEDIA_BUCKET = "exercise-media";

/** Storage `list` pages at 100 by default; one call should see a whole folder. */
const MEDIA_LIST_LIMIT = 1000;

function client() {
  if (!supabase) {
    throw new Error("Supabase is not configured");
  }
  return supabase;
}

/** A missing table means 0008 has not run — say so, rather than show a code. */
function archiveError(error: { code?: string; message?: string }): Error {
  return isMissingTable(error)
    ? new Error("Deletion needs a database update (migration 0008). Nothing was changed.")
    : new Error(error.message ?? "Could not reach your account.");
}

/**
 * Snapshot everything into the archive, then clear the live rows. In that
 * order: if the snapshot fails, nothing has been removed. Returns the request
 * time, which the caller stamps on the profile.
 */
export async function archiveUserData(userId: string, state: SyncableState): Promise<string> {
  const requestedAt = new Date().toISOString();
  const { error } = await client()
    .from("data_archives")
    .upsert({ user_id: userId, requested_at: requestedAt, payload: buildExport(state) });
  if (error) {
    throw archiveError(error);
  }
  await clearUserRows(userId);
  return requestedAt;
}

/** The archived data, in the shape a restore merges. */
export async function loadArchive(userId: string): Promise<RemoteState> {
  const { data, error } = await client()
    .from("data_archives")
    .select("payload")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    throw archiveError(error);
  }
  if (!data) {
    throw new Error("The archive is gone — it may already have been deleted.");
  }
  try {
    // The archive is a backup file in all but name, so it goes through the
    // same validation: a damaged row drops what it cannot read, not the lot.
    return parseExportText(JSON.stringify(data.payload)).state;
  } catch (cause) {
    throw new Error(cause instanceof ImportError ? cause.message : "The archive could not be read.");
  }
}

/**
 * Stored files no current exercise points at — the GIFs of archived
 * exercises, once the archive is gone. Content-addressed paths can be shared,
 * so a file still used by anything stays.
 */
export function unusedMedia(files: string[], templates: Pick<WorkoutTemplate, "mediaPath">[]): string[] {
  const used = new Set(templates.map((template) => template.mediaPath).filter(Boolean));
  return files.filter((path) => !used.has(path));
}

/**
 * Delete the archive for good: the row, then the GIFs only it was using.
 * Current data — anything logged since the request — stays.
 */
export async function discardArchive(
  userId: string,
  currentTemplates: Pick<WorkoutTemplate, "mediaPath">[]
): Promise<void> {
  const supabaseClient = client();
  const { error } = await supabaseClient.from("data_archives").delete().eq("user_id", userId);
  if (error && !isMissingTable(error)) {
    throw archiveError(error);
  }

  const listed = await supabaseClient.storage.from(MEDIA_BUCKET).list(userId, { limit: MEDIA_LIST_LIMIT });
  if (listed.error) {
    throw listed.error;
  }
  const leftovers = unusedMedia(
    (listed.data ?? []).map((file) => `${userId}/${file.name}`),
    currentTemplates
  );
  if (leftovers.length > 0) {
    const { error: removeError } = await supabaseClient.storage.from(MEDIA_BUCKET).remove(leftovers);
    if (removeError) {
      throw removeError;
    }
  }
}

/**
 * After a restore on this phone, make the account match it exactly, then let
 * the archive go. Cleared and rewritten rather than left to the debounced
 * diff: "replace" has to delete what was logged since, and the archive must
 * not be deleted until the restored rows are safely in the account. If any
 * step fails, the archive is still there.
 */
export async function restoreToAccount(userId: string, restored: SyncableState): Promise<void> {
  await clearUserRows(userId);
  const nothing: SyncableState = {
    templates: [],
    sessionTemplates: [],
    scheduledSessions: [],
    logs: [],
    setLogs: [],
    measurements: [],
    skillGoals: [],
    // A different object, so the profile is written too — with the stamp cleared.
    profile: { ...restored.profile },
    scheduleConfig: undefined
  };
  await pushChanges(userId, nothing, restored);
  await discardArchive(userId, restored.templates);
}

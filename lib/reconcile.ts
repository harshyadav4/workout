import type { RemoteState, SyncableState } from "@/lib/sync";
import type { BodyMeasurement, ScheduledSession } from "@/lib/types";

/**
 * Merge what Supabase returned into what this device already holds.
 *
 * `hydrateRemote` used to take the remote copy outright. That is right for a
 * device that has always been online and destructive for one that has not: a
 * session logged on the underground, or during any push that failed, was wiped
 * at the next sign-in by a read that knew nothing about it.
 *
 * Pure, and in its own file rather than in `lib/sync.ts`, so the store can call
 * it without importing the Supabase client — the boundary `lib/sync.ts` sets out
 * in its own header. It only imports types from there.
 *
 * **Deliberately deletion-blind.** A row deleted on another device comes back.
 * Resurrecting one session is a far cheaper mistake than losing one, and the fix
 * for it is a `deleted_at` tombstone rather than a narrower merge.
 *
 * Safe only because the caller has already established that the local copy
 * belongs to the signed-in user — see `claimFor` in the store. Merging a
 * stranger's local data into an account is precisely the bleed this would
 * otherwise cause.
 */

// A session never goes back from completed to planned, and the row carries no
// `updated_at`, so this progression is the only ordering there is.
const STATUS_RANK: Record<ScheduledSession["status"], number> = {
  planned: 0,
  active: 1,
  completed: 2
};

function unionById<T extends { id?: string }>(
  local: T[],
  remote: T[],
  resolve: (mine: T, theirs: T) => T = (_mine, theirs) => theirs
): T[] {
  const byId = new Map<string, T>();
  // `WorkoutLog.id` is optional in the type. Both producers set it, but an
  // id-less local row cannot be matched, so it is carried rather than dropped.
  const unidentified: T[] = [];

  for (const item of local) {
    if (item.id) {
      byId.set(item.id, item);
    } else {
      unidentified.push(item);
    }
  }

  for (const item of remote) {
    if (!item.id) {
      continue; // every remote row came back from a primary key.
    }
    const mine = byId.get(item.id);
    byId.set(item.id, mine ? resolve(mine, item) : item);
  }

  return [...byId.values(), ...unidentified];
}

/**
 * Measurements are identified by `(date, metric)`, not by `id`: re-measuring a
 * site on a day it already holds mints a **new** id in `upsertMeasurement`, so a
 * union by id would leave Tuesday with two weights and feed both to the girth
 * series. Remote wins, matching every other collection here.
 */
function unionByDateAndMetric(local: BodyMeasurement[], remote: BodyMeasurement[]) {
  const byKey = new Map<string, BodyMeasurement>();
  for (const item of [...local, ...remote]) {
    byKey.set(`${item.date}:${item.metric}`, item);
  }
  return [...byKey.values()];
}

const byDateAscending = (a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date);

export function reconcile(local: SyncableState, remote: RemoteState): SyncableState {
  // Presets ship with the app and are never stored, so the remote list holds
  // only what the user added. This branch was already right in `hydrateRemote`
  // and is carried across verbatim — nothing fails loudly if it is dropped.
  const presets = local.templates.filter((template) => template.isPreset);
  const added = unionById(
    local.templates.filter((template) => !template.isPreset),
    remote.templates
  );

  return {
    templates: [...presets, ...added.filter((item) => !presets.some((p) => p.id === item.id))],
    sessionTemplates: unionById(local.sessionTemplates, remote.sessionTemplates),
    scheduledSessions: unionById(local.scheduledSessions, remote.scheduledSessions, (mine, theirs) =>
      STATUS_RANK[mine.status] > STATUS_RANK[theirs.status] ? mine : theirs
    ).sort(byDateAscending),
    // Newest first, the order `loadUserState` asks Postgres for and the order
    // the store prepends in.
    logs: unionById(local.logs, remote.logs).sort((a, b) => byDateAscending(b, a)),
    // Append-only and never edited, so an id union is the whole of it. Missing
    // this field would have re-created the replace-outright bug one table down.
    setLogs: unionById(local.setLogs, remote.setLogs).sort((a, b) => byDateAscending(b, a)),
    measurements: unionByDateAndMetric(local.measurements, remote.measurements).sort(byDateAscending),
    // Both are one small object that the next push rewrites whole, so there is
    // no partial local edit to lose. The account is the authority on them.
    profile: remote.profile ?? local.profile,
    scheduleConfig: remote.scheduleConfig ?? local.scheduleConfig
  };
}

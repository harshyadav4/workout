import type { RemoteState } from "@/lib/sync";
import type {
  BodyMeasurement,
  ScheduledSession,
  SessionTemplate,
  SetLog,
  WorkoutLog,
  WorkoutTemplate
} from "@/lib/types";

/**
 * Reading an export back in.
 *
 * `buildExport` shipped without this, which made "yours to keep" a one-way door:
 * the file downloaded and nothing in the app could ever read it. The round trip
 * is the point of an export.
 *
 * **It returns a `RemoteState` on purpose.** That is the same shape
 * `loadUserState` returns, so the merge is `reconcile(local, parsed)` — the
 * function that already decides these exact conflicts for sync, already tested,
 * and already deletion-blind. An import that merges instead of replacing means a
 * stale backup can never wipe work done since it was taken.
 *
 * Pure, and in its own file rather than `lib/sync.ts`, for the reason
 * `lib/reconcile.ts` gives: the store must be able to call it without pulling in
 * the Supabase client.
 *
 * Everything here treats the file as hostile input. It is the only place in the
 * app where arbitrary user-supplied JSON reaches the store, so nothing is
 * trusted: rows that do not typecheck at runtime are dropped rather than
 * carried, because one malformed row that reaches a chart is harder to diagnose
 * than one that never arrived.
 */

export class ImportError extends Error {}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const isText = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/**
 * Keeps the rows that satisfy `valid` and silently drops the rest.
 *
 * Silent because the alternative — failing the whole import on one bad row — is
 * worse for the case this exists to serve: someone restoring a backup after
 * losing a phone. `importSummary` reports the counts so the drop is visible.
 */
function keepValid<T>(value: unknown, valid: (row: Record<string, unknown>) => boolean): T[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((row) => isObject(row) && valid(row)) as T[];
}

const hasDate = (row: Record<string, unknown>) => isText(row.date);
const hasId = (row: Record<string, unknown>) => isText(row.id);

function validProfile(value: unknown): RemoteState["profile"] {
  if (
    !isObject(value) ||
    !isText(value.name) ||
    typeof value.email !== "string" ||
    !isNumber(value.heightCm) ||
    !isNumber(value.weightKg)
  ) {
    return undefined;
  }
  return value as unknown as RemoteState["profile"];
}

function validScheduleConfig(value: unknown): RemoteState["scheduleConfig"] {
  if (
    !isObject(value) ||
    !isText(value.startDate) ||
    !isText(value.endDate) ||
    (value.mode !== "weekly" && value.mode !== "rotation") ||
    !isObject(value.weekly) ||
    !Array.isArray(value.rotationOrder) ||
    !Array.isArray(value.restWeekdays)
  ) {
    return undefined;
  }
  return value as unknown as RemoteState["scheduleConfig"];
}

export interface ParsedBackup {
  state: RemoteState;
  /** What was in the file, after invalid rows were dropped. Shown before merging. */
  counts: Record<string, number>;
}

/**
 * Validate a decoded export. Throws `ImportError` only when the file is not an
 * export at all — a file with no recognisable rows is a wrong-file mistake, and
 * merging nothing while reporting success would hide it.
 */
export function parseExport(raw: unknown): ParsedBackup {
  if (!isObject(raw)) {
    throw new ImportError("That file isn't a GymFlow export.");
  }

  const state: RemoteState = {
    templates: keepValid<WorkoutTemplate>(
      raw.templates,
      (row) => hasId(row) && isText(row.name) && Array.isArray(row.muscles)
    ),
    sessionTemplates: keepValid<SessionTemplate>(
      raw.sessionTemplates,
      (row) => hasId(row) && isText(row.name) && Array.isArray(row.exercises)
    ),
    scheduledSessions: keepValid<ScheduledSession>(
      raw.scheduledSessions,
      (row) => hasId(row) && hasDate(row) && Array.isArray(row.exercises)
    ),
    logs: keepValid<WorkoutLog>(
      raw.logs,
      (row) => hasDate(row) && isText(row.workoutId) && isNumber(row.totalVolume)
    ),
    setLogs: keepValid<SetLog>(
      raw.setLogs,
      (row) =>
        hasId(row) && hasDate(row) && isText(row.workoutId) && isNumber(row.reps) && isNumber(row.weight)
    ),
    measurements: keepValid<BodyMeasurement>(
      raw.measurements,
      (row) => hasId(row) && hasDate(row) && isText(row.metric) && isNumber(row.value)
    ),
    // Optional in RemoteState, and `reconcile` already falls back to the local
    // copy — so a file with no usable profile leaves the account's own alone.
    // Every required field is checked: a half-built profile reaching the store
    // would render NaN into the header rather than fail anywhere visible.
    profile: validProfile(raw.profile),
    scheduleConfig: validScheduleConfig(raw.scheduleConfig)
  };

  const counts = {
    exercises: state.templates.length,
    sessions: state.sessionTemplates.length,
    "scheduled days": state.scheduledSessions.length,
    workouts: state.logs.length,
    sets: state.setLogs.length,
    measurements: state.measurements.length
  };

  if (Object.values(counts).every((count) => count === 0) && !state.profile) {
    throw new ImportError("That file has nothing in it we recognise.");
  }

  return { state, counts };
}

/** Parses the text of an uploaded file. Bad JSON is a wrong-file mistake too. */
export function parseExportText(text: string): ParsedBackup {
  let decoded: unknown;
  try {
    decoded = JSON.parse(text);
  } catch {
    throw new ImportError("That file isn't valid JSON.");
  }
  return parseExport(decoded);
}

/** "12 workouts, 48 sets, 3 sessions" — zero counts left out. */
export function importSummary(counts: Record<string, number>): string {
  const parts = Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([label, count]) => `${count} ${label}`);
  return parts.length > 0 ? parts.join(", ") : "nothing";
}

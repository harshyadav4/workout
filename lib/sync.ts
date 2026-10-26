import { supabase } from "@/lib/supabase";
import type {
  BodyMeasurement,
  BodyMetric,
  MeasurementCadence,
  ProfileInfo,
  ScheduleConfig,
  ScheduledSession,
  SessionTemplate,
  SetLog,
  SkillGoal,
  SkillLevel,
  WorkoutLog,
  WorkoutTemplate
} from "@/lib/types";

/**
 * Supabase read/write for the workout store.
 *
 * The store never imports this file. `supabase-sync.tsx` subscribes to the
 * store and calls `pushChanges` with the previous and next state, so
 * `persist()` and every action keep the signatures they already have.
 */

type Row = Record<string, unknown>;

/** Everything the app owns per user, in write order (nothing here references anything else). */
const TABLES = [
  "workout_templates",
  "session_templates",
  "scheduled_sessions",
  "workout_logs",
  // After workout_logs: `log_id` references it, so a set row written first has
  // nothing to point at.
  "set_logs",
  "body_measurements",
  "skill_goals"
] as const;

// -- mappers ---------------------------------------------------------------

function templateToRow(template: WorkoutTemplate, userId: string): Row {
  return {
    id: template.id,
    user_id: userId,
    name: template.name,
    category: template.category,
    db_id: template.dbId ?? null,
    equipment: template.equipment ?? null,
    muscles: template.muscles,
    default_sets: template.defaultSets ?? null,
    media_path: template.mediaPath ?? null
  };
}

function rowToTemplate(row: Row): WorkoutTemplate {
  return {
    id: row.id as string,
    name: row.name as string,
    category: (row.category as string) ?? "custom",
    dbId: (row.db_id as string) ?? undefined,
    equipment: (row.equipment as string) ?? undefined,
    muscles: (row.muscles as WorkoutTemplate["muscles"]) ?? [],
    defaultSets: (row.default_sets as WorkoutTemplate["defaultSets"]) ?? undefined,
    mediaPath: (row.media_path as string) ?? undefined,
    // Only user-added templates are stored; presets ship in lib/seed-data.ts.
    isPreset: false
  };
}

function sessionTemplateToRow(template: SessionTemplate, userId: string): Row {
  return {
    id: template.id,
    user_id: userId,
    name: template.name,
    exercises: template.exercises,
    summary: template.summary,
    // null, not undefined: writing undefined leaves the column untouched on an
    // update, so turning a rule back off would never actually clear it.
    progression: template.progression ?? null
  };
}

function rowToSessionTemplate(row: Row): SessionTemplate {
  const exercises = (row.exercises as SessionTemplate["exercises"]) ?? [];
  return {
    id: row.id as string,
    name: row.name as string,
    exercises,
    summary: row.summary as SessionTemplate["summary"],
    progression: (row.progression as SessionTemplate["progression"]) ?? undefined,
    // Derived rather than stored — it is exactly the exercises' workout ids.
    workoutIds: [...new Set(exercises.map((exercise) => exercise.workoutId))]
  };
}

function sessionToRow(session: ScheduledSession, userId: string): Row {
  return {
    id: session.id,
    user_id: userId,
    date: session.date,
    day_index: session.dayIndex,
    session_template_id: session.sessionTemplateId ?? null,
    session_name: session.sessionName,
    type: session.type,
    status: session.status,
    source: session.source,
    exercises: session.exercises
  };
}

function rowToSession(row: Row): ScheduledSession {
  return {
    id: row.id as string,
    date: row.date as string,
    dayIndex: row.day_index as number,
    sessionTemplateId: (row.session_template_id as string) ?? undefined,
    sessionName: row.session_name as string,
    type: row.type as ScheduledSession["type"],
    status: row.status as ScheduledSession["status"],
    source: row.source as ScheduledSession["source"],
    exercises: (row.exercises as ScheduledSession["exercises"]) ?? []
  };
}

function logToRow(log: WorkoutLog, userId: string): Row {
  return {
    // WorkoutLog.id is optional in the type. Both producers set it, but a null
    // here would be rejected by the primary key and lose a finished session.
    id: log.id ?? crypto.randomUUID(),
    user_id: userId,
    date: log.date,
    session_id: log.sessionId ?? null,
    workout_id: log.workoutId,
    name: log.name,
    total_volume: log.totalVolume,
    total_sets: log.totalSets ?? null,
    total_reps: log.totalReps ?? null,
    peak_weight: log.peakWeight ?? null,
    muscles: log.muscles
  };
}

function rowToLog(row: Row): WorkoutLog {
  return {
    id: row.id as string,
    date: row.date as string,
    sessionId: (row.session_id as string) ?? undefined,
    workoutId: row.workout_id as string,
    name: row.name as string,
    totalVolume: Number(row.total_volume ?? 0),
    totalSets: (row.total_sets as number) ?? undefined,
    totalReps: (row.total_reps as number) ?? undefined,
    peakWeight: row.peak_weight === null ? undefined : Number(row.peak_weight),
    muscles: (row.muscles as WorkoutLog["muscles"]) ?? []
  };
}

function setLogToRow(setLog: SetLog, userId: string): Row {
  return {
    id: setLog.id,
    user_id: userId,
    log_id: setLog.logId,
    workout_id: setLog.workoutId,
    date: setLog.date,
    set_index: setLog.setIndex,
    reps: setLog.reps,
    weight: setLog.weight,
    duration_seconds: setLog.durationSeconds ?? null,
    distance_km: setLog.distanceKm ?? null,
    completed_at: setLog.completedAt ?? null
  };
}

function rowToSetLog(row: Row): SetLog {
  return {
    id: row.id as string,
    logId: row.log_id as string,
    workoutId: row.workout_id as string,
    date: row.date as string,
    setIndex: Number(row.set_index ?? 0),
    reps: Number(row.reps ?? 0),
    weight: Number(row.weight ?? 0),
    // Null is "not a held set", not "held for nothing" — every row written
    // before the column existed is a rep set, and 0 would read as a failed hold.
    durationSeconds: (row.duration_seconds as number) ?? undefined,
    // Null is "not a distance set". Numeric columns come back as strings.
    distanceKm: row.distance_km == null ? undefined : Number(row.distance_km),
    completedAt: (row.completed_at as string) ?? undefined
  };
}

function measurementToRow(measurement: BodyMeasurement, userId: string): Row {
  return {
    id: measurement.id,
    user_id: userId,
    date: measurement.date,
    metric: measurement.metric,
    value: measurement.value
  };
}

function rowToMeasurement(row: Row): BodyMeasurement {
  return {
    id: row.id as string,
    date: row.date as string,
    metric: row.metric as BodyMetric,
    value: Number(row.value ?? 0)
  };
}

function skillGoalToRow(goal: SkillGoal, userId: string): Row {
  return {
    id: goal.id,
    user_id: userId,
    name: goal.name,
    template_key: goal.templateKey ?? null,
    levels: goal.levels,
    created_at: goal.createdAt
  };
}

function rowToSkillGoal(row: Row): SkillGoal {
  return {
    id: row.id as string,
    name: (row.name as string) ?? "",
    templateKey: (row.template_key as string) ?? undefined,
    levels: (row.levels as SkillLevel[]) ?? [],
    createdAt: (row.created_at as string) ?? new Date().toISOString()
  };
}

/**
 * True when a table this build expects is not in the database yet — a deploy
 * that went out before its migration ran. 42P01 from Postgres, PGRST205 from
 * PostgREST's schema cache.
 */
function isMissingTable(error: { code?: string } | null | undefined): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

// -- read ------------------------------------------------------------------

export interface RemoteState {
  templates: WorkoutTemplate[];
  sessionTemplates: SessionTemplate[];
  scheduledSessions: ScheduledSession[];
  logs: WorkoutLog[];
  setLogs: SetLog[];
  measurements: BodyMeasurement[];
  /** Absent when the table is not there yet (0007): keep what is on the device. */
  skillGoals?: SkillGoal[];
  profile?: ProfileInfo;
  scheduleConfig?: ScheduleConfig;
}

/**
 * Everything this user owns. RLS scopes each query to them, so none of these
 * carry a `user_id` filter — the JWT is the filter.
 */
export async function loadUserState(): Promise<RemoteState> {
  if (!supabase) {
    return {
      templates: [],
      sessionTemplates: [],
      scheduledSessions: [],
      logs: [],
      setLogs: [],
      measurements: []
    };
  }

  const [templates, sessionTemplates, sessions, logs, setLogs, measurements, profile, skills] =
    await Promise.all([
    supabase.from("workout_templates").select("*"),
    supabase.from("session_templates").select("*"),
    supabase.from("scheduled_sessions").select("*").order("date"),
    supabase.from("workout_logs").select("*").order("date", { ascending: false }),
      supabase.from("set_logs").select("*").order("date", { ascending: false }),
      supabase.from("body_measurements").select("*").order("date"),
      supabase.from("profiles").select("*").maybeSingle(),
      supabase.from("skill_goals").select("*").order("created_at")
    ]);

  const failure = [
    templates,
    sessionTemplates,
    sessions,
    logs,
    setLogs,
    measurements,
    profile,
    // A missing skills table is a migration not yet run, not a failed load:
    // everything else still comes back.
    ...(isMissingTable(skills.error) ? [] : [skills])
  ].find(
    (result) => result.error
  );
  if (failure?.error) {
    throw failure.error;
  }

  const profileRow = profile.data as Row | null;

  return {
    templates: (templates.data ?? []).map(rowToTemplate),
    sessionTemplates: (sessionTemplates.data ?? []).map(rowToSessionTemplate),
    scheduledSessions: (sessions.data ?? []).map(rowToSession),
    logs: (logs.data ?? []).map(rowToLog),
    setLogs: (setLogs.data ?? []).map(rowToSetLog),
    measurements: (measurements.data ?? []).map(rowToMeasurement),
    skillGoals: skills.error ? undefined : (skills.data ?? []).map(rowToSkillGoal),
    profile: profileRow
      ? {
          name: (profileRow.name as string) ?? "",
          email: (profileRow.email as string) ?? "",
          heightCm: Number(profileRow.height_cm ?? 0),
          weightKg: Number(profileRow.weight_kg ?? 0),
          // `|| undefined` rather than `?? 0`: the column is nullable and a
          // goal of 0 kg is not a goal, so both readings collapse to "unset".
          goalWeightKg: Number(profileRow.goal_weight_kg) || undefined,
          weightCadence: (profileRow.weight_cadence as MeasurementCadence) ?? undefined,
          measurementCadence:
            (profileRow.measurement_cadence as MeasurementCadence) ?? undefined
        }
      : undefined,
    scheduleConfig: (profileRow?.schedule_config as ScheduleConfig) ?? undefined
  };
}

// -- write -----------------------------------------------------------------

interface Identified {
  id?: string;
}

/**
 * Rows that were added or changed, and ids that disappeared. Items are compared
 * by reference: the store rebuilds only what it touches, so an untouched
 * session is the same object and never gets rewritten.
 */
export function diffRows<T extends Identified>(previous: T[], next: T[]) {
  const before = new Map(previous.map((item) => [item.id, item]));
  const upserts = next.filter((item) => before.get(item.id) !== item);

  const nextIds = new Set(next.map((item) => item.id));
  const deletedIds = previous
    .map((item) => item.id)
    .filter((id): id is string => Boolean(id) && !nextIds.has(id));

  return { upserts, deletedIds };
}

async function writeTable<T extends Identified>(
  table: (typeof TABLES)[number],
  previous: T[],
  next: T[],
  toRow: (item: T) => Row
) {
  if (!supabase) {
    return;
  }

  const { upserts, deletedIds } = diffRows(previous, next);

  if (deletedIds.length > 0) {
    const { error } = await supabase.from(table).delete().in("id", deletedIds);
    if (error) {
      throw error;
    }
  }

  if (upserts.length > 0) {
    const rows = upserts.map(toRow);
    const { error } = await supabase.from(table).upsert(rows);
    if (error && isMissingOptionalColumn(error)) {
      // A project that has not run the migration adding an optional column
      // yet. Write without it rather than fail every save: the feature that
      // column serves waits, nothing else does.
      const { error: retry } = await supabase
        .from(table)
        .upsert(rows.map((row) => withoutOptionalColumns(row)));
      if (retry) {
        throw retry;
      }
      return;
    }
    if (error) {
      throw error;
    }
  }
}

/**
 * Columns added by migrations newer than the app's floor, which a write may
 * drop when the project lacks them. `media_path` is 0006 (stored exercise
 * GIFs): without it, saving any exercise template used to fail outright.
 * `distance_km` is 0007 (cardio): a run still syncs its time without it.
 */
const OPTIONAL_COLUMNS = ["media_path", "distance_km"];

function isMissingOptionalColumn(error: { code?: string; message?: string }): boolean {
  // 42703 from Postgres, PGRST204 from PostgREST's schema cache.
  return (
    (error.code === "42703" || error.code === "PGRST204") &&
    OPTIONAL_COLUMNS.some((column) => error.message?.includes(column))
  );
}

function withoutOptionalColumns(row: Row): Row {
  const copy = { ...row };
  OPTIONAL_COLUMNS.forEach((column) => delete copy[column]);
  return copy;
}

export interface SyncableState {
  templates: WorkoutTemplate[];
  sessionTemplates: SessionTemplate[];
  scheduledSessions: ScheduledSession[];
  logs: WorkoutLog[];
  setLogs: SetLog[];
  measurements: BodyMeasurement[];
  skillGoals?: SkillGoal[];
  profile: ProfileInfo;
  scheduleConfig?: ScheduleConfig;
}

/**
 * The user's half of the store — everything `pushChanges` writes and an export
 * hands back. `muscles` and the preset workouts ship with the app and are not
 * anyone's data, so they are not here.
 */
export function snapshotState(state: SyncableState): SyncableState {
  return {
    templates: state.templates,
    sessionTemplates: state.sessionTemplates,
    scheduledSessions: state.scheduledSessions,
    logs: state.logs,
    setLogs: state.setLogs,
    measurements: state.measurements,
    skillGoals: state.skillGoals,
    profile: state.profile,
    scheduleConfig: state.scheduleConfig
  };
}

/**
 * A sync failure in words the user can act on.
 *
 * Read by shape rather than `instanceof Error`: a rejected fetch does not always
 * arrive as an `Error` subclass. `hint` is appended because PostgrestError's own
 * docs say Postgres usually puts the actionable fix there, not in `message`.
 */
export function syncErrorMessage(error: unknown): string {
  const shape = error as { message?: unknown; hint?: unknown; code?: unknown } | null | undefined;
  const message = typeof shape?.message === "string" ? shape.message.trim() : "";
  const hint = typeof shape?.hint === "string" ? shape.hint.trim() : "";
  // PGRST205 is "table not found" and 42703 "column not found": almost always
  // a migration in supabase/migrations that has not been run on this project.
  const code = typeof shape?.code === "string" ? shape.code : "";
  const missingSchema = code === "PGRST205" || code === "42703";

  if (!message) {
    return "Unknown error";
  }

  const text = hint ? `${message} — ${hint}` : message;
  return missingSchema ? `${text} (run the migrations in supabase/migrations)` : text;
}

/**
 * What "Export my data" writes to disk. Presets are dropped for the same reason
 * `pushChanges` drops them — they ship with the app and are not the user's.
 */
export function buildExport(state: SyncableState) {
  return {
    exportedAt: new Date().toISOString(),
    ...snapshotState(state),
    templates: state.templates.filter((template) => !template.isPreset)
  };
}

/**
 * Stored GIFs that the previous state referenced and the next one does not —
 * the files to delete. Content-addressed paths can be shared, so a path still
 * used by any template survives.
 */
export function removedMediaPaths(previous: WorkoutTemplate[], next: WorkoutTemplate[]): string[] {
  const still = new Set(next.map((template) => template.mediaPath).filter(Boolean));
  return [
    ...new Set(
      previous
        .map((template) => template.mediaPath)
        .filter((path): path is string => Boolean(path) && !still.has(path))
    )
  ];
}

/**
 * Push what changed between two store states. Throws on the first failed write
 * so the caller can surface it — a silently dropped set is worse than an error.
 */
export async function pushChanges(
  userId: string,
  previous: SyncableState,
  next: SyncableState
): Promise<void> {
  if (!supabase) {
    return;
  }

  // Presets ship with the app; only what the user built is theirs to store.
  const userTemplates = (list: WorkoutTemplate[]) => list.filter((item) => !item.isPreset);

  await writeTable("workout_templates", userTemplates(previous.templates), userTemplates(next.templates), (item) =>
    templateToRow(item, userId)
  );

  // After the rows: a file is only removed once nothing in the database points
  // at it. A failed remove is not worth failing the push for — the worst case
  // is an orphaned GIF, which costs a few hundred KB, not a lost set.
  const orphaned = removedMediaPaths(previous.templates, next.templates);
  if (orphaned.length > 0) {
    const { error } = await supabase.storage.from("exercise-media").remove(orphaned);
    if (error) {
      console.warn("[sync] could not remove media", error.message);
    }
  }
  await writeTable("session_templates", previous.sessionTemplates, next.sessionTemplates, (item) =>
    sessionTemplateToRow(item, userId)
  );
  await writeTable("scheduled_sessions", previous.scheduledSessions, next.scheduledSessions, (item) =>
    sessionToRow(item, userId)
  );
  await writeTable("workout_logs", previous.logs, next.logs, (item) => logToRow(item, userId));
  await writeTable("set_logs", previous.setLogs, next.setLogs, (item) =>
    setLogToRow(item, userId)
  );
  await writeTable("body_measurements", previous.measurements, next.measurements, (item) =>
    measurementToRow(item, userId)
  );
  try {
    await writeTable("skill_goals", previous.skillGoals ?? [], next.skillGoals ?? [], (item) =>
      skillGoalToRow(item, userId)
    );
  } catch (error) {
    // Before 0007 has run the goals live on the device only; nothing else fails.
    if (!isMissingTable(error as { code?: string })) {
      throw error;
    }
    console.warn("[sync] skill_goals table missing — run migration 0007");
  }

  const profileChanged =
    previous.profile !== next.profile || previous.scheduleConfig !== next.scheduleConfig;

  if (profileChanged) {
    const { error } = await supabase.from("profiles").upsert({
      id: userId,
      name: next.profile.name,
      email: next.profile.email,
      height_cm: next.profile.heightCm,
      weight_kg: next.profile.weightKg,
      goal_weight_kg: next.profile.goalWeightKg ?? null,
      weight_cadence: next.profile.weightCadence ?? null,
      measurement_cadence: next.profile.measurementCadence ?? null,
      schedule_config: next.scheduleConfig ?? null,
      updated_at: new Date().toISOString()
    });
    if (error) {
      throw error;
    }
  }
}

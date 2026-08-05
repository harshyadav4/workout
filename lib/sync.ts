import { supabase } from "@/lib/supabase";
import type {
  BodyMeasurement,
  BodyMetric,
  MeasurementCadence,
  ProfileInfo,
  ScheduleConfig,
  ScheduledSession,
  SessionTemplate,
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
  "body_measurements"
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
    default_sets: template.defaultSets ?? null
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
    summary: template.summary
  };
}

function rowToSessionTemplate(row: Row): SessionTemplate {
  const exercises = (row.exercises as SessionTemplate["exercises"]) ?? [];
  return {
    id: row.id as string,
    name: row.name as string,
    exercises,
    summary: row.summary as SessionTemplate["summary"],
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

// -- read ------------------------------------------------------------------

export interface RemoteState {
  templates: WorkoutTemplate[];
  sessionTemplates: SessionTemplate[];
  scheduledSessions: ScheduledSession[];
  logs: WorkoutLog[];
  measurements: BodyMeasurement[];
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
      measurements: []
    };
  }

  const [templates, sessionTemplates, sessions, logs, measurements, profile] = await Promise.all([
    supabase.from("workout_templates").select("*"),
    supabase.from("session_templates").select("*"),
    supabase.from("scheduled_sessions").select("*").order("date"),
    supabase.from("workout_logs").select("*").order("date", { ascending: false }),
    supabase.from("body_measurements").select("*").order("date"),
    supabase.from("profiles").select("*").maybeSingle()
  ]);

  const failure = [templates, sessionTemplates, sessions, logs, measurements, profile].find(
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
    measurements: (measurements.data ?? []).map(rowToMeasurement),
    profile: profileRow
      ? {
          name: (profileRow.name as string) ?? "",
          email: (profileRow.email as string) ?? "",
          heightCm: Number(profileRow.height_cm ?? 0),
          weightKg: Number(profileRow.weight_kg ?? 0),
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
    const { error } = await supabase.from(table).upsert(upserts.map(toRow));
    if (error) {
      throw error;
    }
  }
}

export interface SyncableState {
  templates: WorkoutTemplate[];
  sessionTemplates: SessionTemplate[];
  scheduledSessions: ScheduledSession[];
  logs: WorkoutLog[];
  measurements: BodyMeasurement[];
  profile: ProfileInfo;
  scheduleConfig?: ScheduleConfig;
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
  await writeTable("session_templates", previous.sessionTemplates, next.sessionTemplates, (item) =>
    sessionTemplateToRow(item, userId)
  );
  await writeTable("scheduled_sessions", previous.scheduledSessions, next.scheduledSessions, (item) =>
    sessionToRow(item, userId)
  );
  await writeTable("workout_logs", previous.logs, next.logs, (item) => logToRow(item, userId));
  await writeTable("body_measurements", previous.measurements, next.measurements, (item) =>
    measurementToRow(item, userId)
  );

  const profileChanged =
    previous.profile !== next.profile || previous.scheduleConfig !== next.scheduleConfig;

  if (profileChanged) {
    const { error } = await supabase.from("profiles").upsert({
      id: userId,
      name: next.profile.name,
      email: next.profile.email,
      height_cm: next.profile.heightCm,
      weight_kg: next.profile.weightKg,
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

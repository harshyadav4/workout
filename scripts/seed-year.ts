/**
 * Seed a year of training history, so Home, Plan and Progress all have
 * something real to show.
 *
 * Three tables, seeded to different depths on purpose:
 *
 *   workout_logs        a full year — every chart on /progress reads logs and
 *                       nothing else, and the graphs want the whole range.
 *   session_templates   the five splits below.
 *   scheduled_sessions  a 12-week window, not a year. Home shows today and Plan
 *                       shows a week; nothing renders a year of sessions, and a
 *                       year of them is ~350 rows of jsonb nobody looks at.
 *                       Bump SESSION_WINDOW if you want more.
 *
 * Two ways to run it. The service role key bypasses RLS by design, which is why
 * seeding needs no RLS changes — it is server-only and must never get a
 * NEXT_PUBLIC_ prefix.
 *
 *   npm run seed:year                         # writes directly (needs the key)
 *   npm run seed:year -- --wipe               # clear seeded rows first
 *   npm run seed:year -- --dry                # generate only, print a summary
 *   npm run seed:year -- --sql <user-id>      # emit SQL to paste (no key needed)
 */

import { createClient } from "@supabase/supabase-js";

import { presetWorkouts } from "../lib/seed-data";
import type {
  PlannedExercise,
  ScheduledSession,
  SessionTemplate,
  SessionTemplateExercise,
  WorkoutLog
} from "../lib/types";

const DRY = process.argv.includes("--dry");

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
        "Get the service role key from Project Settings -> API, and put it in .env\n" +
        "WITHOUT a NEXT_PUBLIC_ prefix — it bypasses RLS and must stay server-side.\n" +
        "Or skip the key entirely: npm run seed:year -- --sql <user-id> > seed.sql"
    );
    process.exit(1);
  }

  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

const DAYS = 365; // of logs
const SESSION_WINDOW = { back: 56, ahead: 28 }; // of scheduled sessions
const SEED_PREFIX = "seed-y1-"; // deterministic ids, so re-running replaces

/** A weekly split, indexed by weekday (0 = Sunday). null is a rest day. */
const SPLIT: ({ name: string; workoutIds: string[] } | null)[] = [
  null, // Sun
  { name: "Push A", workoutIds: ["bench-press", "incline-db-press", "cable-fly", "triceps-pushdown"] },
  { name: "Pull A", workoutIds: ["lat-pulldown", "barbell-row", "face-pull", "biceps-curl"] },
  null, // Wed
  { name: "Legs A", workoutIds: ["back-squat", "romanian-deadlift", "leg-press", "standing-calf-raise"] },
  { name: "Shoulders & Core", workoutIds: ["shoulder-press", "lateral-raise", "overhead-triceps-ext", "cable-crunch"] },
  { name: "Deadlift Day", workoutIds: ["deadlift", "chest-supported-row", "hanging-leg-raise"] }
];

const templates = new Map(presetWorkouts.map((workout) => [workout.id, workout]));
const templateId = (weekday: number) => `${SEED_PREFIX}tpl-${weekday}`;

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function shiftDays(offset: number) {
  const day = new Date();
  day.setUTCDate(day.getUTCDate() + offset);
  return day;
}

/**
 * Deterministic pseudo-random in [0,1). Keeps re-runs byte-identical so the
 * graphs don't reshuffle every time you seed.
 */
function noise(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 1000) / 1000;
}

function baseSets(workoutId: string) {
  const template = templates.get(workoutId);
  if (!template) {
    throw new Error(`Unknown preset workout: ${workoutId}`);
  }
  return {
    template,
    base: template.defaultSets?.[0] ?? { sets: 3, reps: 10, weight: 40, restSeconds: 90 }
  };
}

/** Miss roughly one session in twelve — a year with no gaps hides how the charts handle holes. */
const skipped = (date: string) => noise(`skip-${date}`) < 0.08;

/** Progressive overload: ~30% across the year, plus per-session jitter, rounded to plates. */
function weightFor(date: string, workoutId: string, daysBack: number) {
  const { base } = baseSets(workoutId);
  const progress = 1 + 0.3 * ((DAYS - daysBack) / DAYS);
  const jitter = 0.92 + noise(`${date}-${workoutId}`) * 0.16;
  return Math.round((base.weight * progress * jitter) / 2.5) * 2.5;
}

// -- session templates -----------------------------------------------------

function buildSessionTemplates(): SessionTemplate[] {
  return SPLIT.flatMap((split, weekday) => {
    if (!split) {
      return [];
    }

    const exercises: SessionTemplateExercise[] = split.workoutIds.map((workoutId) => {
      const { template, base } = baseSets(workoutId);
      return {
        id: `${templateId(weekday)}-${workoutId}`,
        workoutId,
        name: template.name,
        muscles: template.muscles,
        sets: base.sets,
        reps: base.reps,
        weight: weightFor(dateKey(new Date()), workoutId, 0),
        restSeconds: base.restSeconds
      };
    });

    // Same shape buildSessionSummary produces, so the Build screen agrees with it.
    const summary = exercises.reduce(
      (totals, exercise) => ({
        totalSets: totals.totalSets + exercise.sets,
        totalReps: totals.totalReps + exercise.sets * exercise.reps,
        totalWeight: totals.totalWeight + exercise.sets * exercise.weight
      }),
      { totalSets: 0, totalReps: 0, totalWeight: 0 }
    );

    return [
      {
        id: templateId(weekday),
        name: split.name,
        workoutIds: split.workoutIds,
        exercises,
        summary
      }
    ];
  });
}

// -- scheduled sessions ----------------------------------------------------

function plannedExercises(date: string, workoutIds: string[], daysBack: number, done: boolean) {
  return workoutIds.map<PlannedExercise>((workoutId) => {
    const { template, base } = baseSets(workoutId);
    const weight = weightFor(date, workoutId, daysBack);

    return {
      id: `${SEED_PREFIX}${date}-${workoutId}`,
      workoutId,
      templateName: template.name,
      restSeconds: base.restSeconds,
      // Set ids must be unique across the whole session: Home tracks one open
      // set by id, so duplicates would open every exercise at once.
      sets: Array.from({ length: base.sets }, (_, index) => ({
        id: `${SEED_PREFIX}${date}-${workoutId}-set-${index + 1}`,
        reps: base.reps,
        weight,
        previousReps: base.reps,
        previousWeight: weight,
        type: "normal" as const,
        completed: done
      }))
    };
  });
}

function buildScheduledSessions(): ScheduledSession[] {
  const today = dateKey(new Date());
  const sessions: ScheduledSession[] = [];

  for (let offset = -SESSION_WINDOW.back; offset <= SESSION_WINDOW.ahead; offset += 1) {
    const day = shiftDays(offset);
    const date = dateKey(day);
    const weekday = day.getUTCDay();
    const split = SPLIT[weekday];

    if (!split) {
      sessions.push({
        id: `${SEED_PREFIX}${date}-rest`,
        date,
        dayIndex: weekday,
        sessionName: "Rest Day",
        exercises: [],
        type: "rest",
        status: "planned",
        source: "repeat"
      });
      continue;
    }

    // Past skips leave no session, matching the logs.
    if (date < today && skipped(date)) {
      continue;
    }

    const isPast = date < today;

    sessions.push({
      id: `${SEED_PREFIX}${date}`,
      date,
      dayIndex: weekday,
      sessionTemplateId: templateId(weekday),
      sessionName: split.name,
      // Today stays `planned` so Home opens on the `ready` state with a Start
      // button — that is the state you want to poke at.
      exercises: plannedExercises(date, split.workoutIds, offset < 0 ? -offset : 0, isPast),
      type: "workout",
      status: isPast ? "completed" : "planned",
      source: "repeat"
    });
  }

  return sessions;
}

// -- logs ------------------------------------------------------------------

function buildLogs(): WorkoutLog[] {
  const logs: WorkoutLog[] = [];

  for (let back = DAYS - 1; back >= 0; back -= 1) {
    const day = shiftDays(-back);
    const date = dateKey(day);
    const split = SPLIT[day.getUTCDay()];

    if (!split || skipped(date)) {
      continue;
    }

    split.workoutIds.forEach((workoutId) => {
      const { template, base } = baseSets(workoutId);
      const weight = weightFor(date, workoutId, back);

      logs.push({
        id: `${SEED_PREFIX}${date}-${workoutId}`,
        date,
        sessionId: `${SEED_PREFIX}${date}`,
        workoutId,
        name: template.name,
        totalVolume: weight * base.reps * base.sets,
        totalSets: base.sets,
        totalReps: base.reps * base.sets,
        peakWeight: weight,
        muscles: template.muscles
      });
    });
  }

  return logs;
}

// -- rows ------------------------------------------------------------------

const templateRow = (template: SessionTemplate, userId: string) => ({
  id: template.id,
  user_id: userId,
  name: template.name,
  exercises: template.exercises,
  summary: template.summary
});

const sessionRow = (session: ScheduledSession, userId: string) => ({
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
});

const logRow = (log: WorkoutLog, userId: string) => ({
  id: log.id,
  user_id: userId,
  date: log.date,
  session_id: log.sessionId,
  workout_id: log.workoutId,
  name: log.name,
  total_volume: log.totalVolume,
  total_sets: log.totalSets,
  total_reps: log.totalReps,
  peak_weight: log.peakWeight,
  muscles: log.muscles
});

// -- output ----------------------------------------------------------------

const quote = (value: string) => `'${value.replace(/'/g, "''")}'`;

function literal(value: unknown): string {
  if (value === null || value === undefined) {
    return "null";
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (typeof value === "object") {
    return `${quote(JSON.stringify(value))}::jsonb`;
  }
  return quote(String(value));
}

function insertBlock(table: string, rows: Record<string, unknown>[], userId: string) {
  if (rows.length === 0) {
    return "";
  }
  const columns = Object.keys(rows[0]);
  const values = rows
    .map((row) => `  (${columns.map((column) => literal(row[column])).join(",")})`)
    .join(",\n");
  const updates = columns
    .filter((column) => column !== "id" && column !== "user_id")
    .map((column) => `  ${column} = excluded.${column}`)
    .join(",\n");

  return [
    `-- ${table}: ${rows.length} rows`,
    `delete from ${table} where user_id = ${quote(userId)} and id like ${quote(`${SEED_PREFIX}%`)};`,
    `insert into ${table} (${columns.join(", ")})`,
    "values",
    values,
    "on conflict (id) do update set",
    `${updates};`,
    ""
  ].join("\n");
}

function report(
  sessionTemplates: SessionTemplate[],
  sessions: ScheduledSession[],
  logs: WorkoutLog[]
) {
  const days = [...new Set(logs.map((log) => log.date))].sort();
  const volume = logs.reduce((sum, log) => sum + log.totalVolume, 0);
  const bench = logs.filter((log) => log.workoutId === "bench-press");
  const rest = sessions.filter((session) => session.type === "rest").length;
  const doneSessions = sessions.filter((session) => session.status === "completed").length;

  console.log(`session_templates   ${sessionTemplates.length}`);
  console.log(
    `scheduled_sessions  ${sessions.length}  (${doneSessions} completed, ${rest} rest, ${sessions.length - doneSessions - rest} upcoming)`
  );
  console.log(`workout_logs        ${logs.length} across ${days.length} training days`);
  console.log(`  range   ${days[0]} .. ${days[days.length - 1]}`);
  console.log(`  volume  ${Math.round(volume).toLocaleString()} kg total`);
  // If these two are equal the overload curve is broken and every chart is flat.
  console.log(
    `  bench   ${bench[0]?.peakWeight}kg -> ${bench[bench.length - 1]?.peakWeight}kg over the year`
  );
}

async function resolveUserId(): Promise<string> {
  const { data, error } = await client().auth.admin.listUsers();
  if (error) {
    throw error;
  }
  if (data.users.length === 0) {
    throw new Error("No auth users yet — sign in through the app once, then re-run.");
  }
  if (data.users.length > 1) {
    throw new Error(
      `${data.users.length} users found. Pass one explicitly:\n` +
        data.users.map((user) => `  npm run seed:year -- ${user.id}  # ${user.email}`).join("\n")
    );
  }
  return data.users[0].id;
}

async function main() {
  const sessionTemplates = buildSessionTemplates();
  const sessions = buildScheduledSessions();
  const logs = buildLogs();

  if (DRY) {
    report(sessionTemplates, sessions, logs);
    return;
  }

  const explicitId = process.argv.find((arg) => arg.length === 36 && arg.includes("-"));

  if (process.argv.includes("--sql")) {
    if (!explicitId) {
      console.error(
        "--sql needs the user id:\n" +
          "  npm run seed:year -- --sql <user-id> > seed-year.sql\n" +
          "Find it with: select id from auth.users;"
      );
      process.exit(1);
    }
    process.stdout.write(
      [
        insertBlock("session_templates", sessionTemplates.map((item) => templateRow(item, explicitId)), explicitId),
        insertBlock("scheduled_sessions", sessions.map((item) => sessionRow(item, explicitId)), explicitId),
        insertBlock("workout_logs", logs.map((item) => logRow(item, explicitId)), explicitId)
      ].join("\n")
    );
    return;
  }

  const supabase = client();
  const userId = explicitId ?? (await resolveUserId());
  console.log(`Seeding for user ${userId}`);

  if (process.argv.includes("--wipe")) {
    for (const table of ["session_templates", "scheduled_sessions", "workout_logs"]) {
      const { error } = await supabase
        .from(table)
        .delete()
        .eq("user_id", userId)
        .like("id", `${SEED_PREFIX}%`);
      if (error) {
        throw error;
      }
    }
    console.log("Wiped previous seeded rows (anything you logged in the app is untouched).");
  }

  // Chunked: one huge request is a slow round trip and a big failure blast.
  const CHUNK = 250;
  const write = async (table: string, rows: Record<string, unknown>[]) => {
    for (let start = 0; start < rows.length; start += CHUNK) {
      const { error } = await supabase.from(table).upsert(rows.slice(start, start + CHUNK));
      if (error) {
        throw error;
      }
    }
    console.log(`  ${table}: ${rows.length}`);
  };

  await write("session_templates", sessionTemplates.map((item) => templateRow(item, userId)));
  await write("scheduled_sessions", sessions.map((item) => sessionRow(item, userId)));
  await write("workout_logs", logs.map((item) => logRow(item, userId)));

  report(sessionTemplates, sessions, logs);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

// The daily reminders: the morning card (workout today, weigh-in, tape, plan
// ending) and the evening card (streak at risk, Sunday recap), per lifter, at
// their local times. Run by pg_cron every minute (README › Reminders).
//
// What to say and whether it is time live in ../_shared/reminders.ts, which
// has tests; this file only gathers the inputs and sends. Each kind is logged
// in reminder_log per local day, so nothing repeats within a day and the due
// ones (weigh-in, tape) come back the next day while still due.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

import {
  awayMessage,
  eveningMessage,
  isDue,
  localClock,
  morningMessage,
  workoutReminderTime,
  type ReminderInput,
  type ReminderMessage,
  type TodaySession
} from "../_shared/reminders.ts";
import { configurePush, env, sendToUsers, type PushCard } from "../_shared/send.ts";

interface Settings {
  user_id: string;
  timezone: string;
  morning_time: string;
  evening_time: string;
  workout: boolean;
  weight: boolean;
  measurement: boolean;
  plan: boolean;
  streak: boolean;
  recap: boolean;
  /** Absent before migration 0012. */
  away?: boolean;
}

type Row = Record<string, unknown>;

/** The Monday of the week holding `date` (YYYY-MM-DD), as a key. */
function mondayOf(date: string, weekday: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const back = (weekday + 6) % 7;
  const monday = new Date(Date.UTC(y, m - 1, d - back));
  return monday.toISOString().slice(0, 10);
}

/** Today's workout, if the calendar has one. */
async function todaySession(supabase: SupabaseClient, userId: string, date: string): Promise<TodaySession | undefined> {
  const { data } = await supabase
    .from("scheduled_sessions")
    .select("session_name, status, exercises")
    .eq("user_id", userId)
    .eq("date", date)
    .eq("type", "workout")
    .limit(1)
    .maybeSingle();
  if (!data) {
    return undefined;
  }
  const exercises = (data.exercises as { sets?: unknown[] }[] | null) ?? [];
  return {
    name: data.session_name as string,
    status: data.status as TodaySession["status"],
    exercises: exercises.length,
    sets: exercises.reduce((count, exercise) => count + (exercise.sets?.length ?? 0), 0)
  };
}

async function lastStartedAt(supabase: SupabaseClient, userId: string): Promise<string | undefined> {
  const { data } = await supabase
    .from("scheduled_sessions")
    .select("started_at")
    .eq("user_id", userId)
    .not("started_at", "is", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.started_at as string | null) ?? undefined;
}

async function lastMeasurement(supabase: SupabaseClient, userId: string, weight: boolean): Promise<string | undefined> {
  let query = supabase.from("body_measurements").select("date").eq("user_id", userId);
  query = weight ? query.eq("metric", "weight") : query.neq("metric", "weight");
  const { data } = await query.order("date", { ascending: false }).limit(1).maybeSingle();
  return (data?.date as string | null) ?? undefined;
}

async function loggedOn(supabase: SupabaseClient, userId: string, date: string): Promise<boolean> {
  const { count } = await supabase
    .from("set_logs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("date", date);
  return (count ?? 0) > 0;
}

/** The newest logged set's date and its session's name, or nothing for an account that never trained. */
async function lastSet(supabase: SupabaseClient, userId: string): Promise<{ date: string; sessionName?: string } | undefined> {
  const { data } = await supabase
    .from("set_logs")
    .select("date, log_id")
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) {
    return undefined;
  }
  // The session name sits on the scheduled session the log points at.
  const { data: log } = await supabase
    .from("workout_logs")
    .select("session_id")
    .eq("id", data.log_id as string)
    .maybeSingle();
  const sessionId = (log?.session_id as string | null) ?? undefined;
  const { data: session } = sessionId
    ? await supabase.from("scheduled_sessions").select("session_name").eq("id", sessionId).maybeSingle()
    : { data: undefined };
  return { date: data.date as string, sessionName: (session?.session_name as string | undefined) ?? undefined };
}

/** The next planned workout's name — what a fresh account would start with. */
async function nextPlanned(supabase: SupabaseClient, userId: string, today: string): Promise<string | undefined> {
  const { data } = await supabase
    .from("scheduled_sessions")
    .select("session_name")
    .eq("user_id", userId)
    .eq("type", "workout")
    .eq("status", "planned")
    .gte("date", today)
    .order("date")
    .limit(1)
    .maybeSingle();
  return (data?.session_name as string | undefined) ?? undefined;
}

async function hasPlan(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { count } = await supabase
    .from("session_templates")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  return (count ?? 0) > 0;
}

/** Away kinds already sent since `since` — the current gap. */
async function awaySentSince(supabase: SupabaseClient, userId: string, since: string): Promise<Set<string>> {
  const { data } = await supabase
    .from("reminder_log")
    .select("kind")
    .eq("user_id", userId)
    .like("kind", "away-%")
    .gte("sent_on", since);
  return new Set(((data ?? []) as Row[]).map((row) => row.kind as string));
}

/** The day the account was made, from auth (service role). */
async function signedUpOn(supabase: SupabaseClient, userId: string): Promise<string | undefined> {
  const { data } = await supabase.auth.admin.getUserById(userId);
  const created = data?.user?.created_at;
  return created ? created.slice(0, 10) : undefined;
}

/**
 * The nudge for someone not training, at the morning time, only when the
 * morning card itself had nothing to say — "Push today" already speaks to
 * someone with a workout planned.
 */
async function awayCard(supabase: SupabaseClient, userId: string, settings: Settings, name: string | undefined, today: string) {
  const last = await lastSet(supabase, userId);
  const since = last?.date ?? (await signedUpOn(supabase, userId));
  if (!since) {
    return undefined;
  }
  return awayMessage({
    name,
    today,
    switches: { away: Boolean(settings.away) },
    signedUpOn: last ? undefined : since,
    lastSetDate: last?.date,
    sentInGap: await awaySentSince(supabase, userId, since),
    sessionName: last?.sessionName ?? (await nextPlanned(supabase, userId, today)),
    hasPlan: await hasPlan(supabase, userId)
  });
}

/** Sessions, volume and records from Monday to today. */
async function weekSoFar(supabase: SupabaseClient, userId: string, monday: string, today: string) {
  const { data } = await supabase
    .from("workout_logs")
    .select("date, workout_id, total_volume, peak_weight")
    .eq("user_id", userId)
    .gte("date", monday)
    .lte("date", today);
  const logs = (data ?? []) as Row[];
  const sessions = new Set(logs.map((log) => log.date as string)).size;
  const volumeKg = logs.reduce((sum, log) => sum + Number(log.total_volume ?? 0), 0);

  // A record: this week's heaviest set on a lift beats everything before Monday.
  const bestThisWeek = new Map<string, number>();
  logs.forEach((log) => {
    const id = log.workout_id as string;
    bestThisWeek.set(id, Math.max(bestThisWeek.get(id) ?? 0, Number(log.peak_weight ?? 0)));
  });
  const ids = [...bestThisWeek.keys()];
  let prs = 0;
  if (ids.length > 0) {
    const { data: before } = await supabase
      .from("workout_logs")
      .select("workout_id, peak_weight")
      .eq("user_id", userId)
      .in("workout_id", ids)
      .lt("date", monday);
    const bestBefore = new Map<string, number>();
    ((before ?? []) as Row[]).forEach((log) => {
      const id = log.workout_id as string;
      bestBefore.set(id, Math.max(bestBefore.get(id) ?? 0, Number(log.peak_weight ?? 0)));
    });
    // A lift's first week is a baseline, not a record — the same rule as the PR ledger.
    prs = ids.filter((id) => bestBefore.has(id) && (bestThisWeek.get(id) ?? 0) > (bestBefore.get(id) ?? 0)).length;
  }
  return { sessions, volumeKg, prs };
}

Deno.serve(async (request) => {
  if (request.headers.get("x-cron-secret") !== env("CRON_SECRET")) {
    return new Response("Forbidden", { status: 403 });
  }

  configurePush();
  const supabase = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false }
  });
  const now = new Date();

  const anyOn = "workout.eq.true,weight.eq.true,measurement.eq.true,plan.eq.true,streak.eq.true,recap.eq.true";
  let { data: rows, error } = await supabase.from("reminder_settings").select("*").or(`${anyOn},away.eq.true`);
  if (error && /away/.test(error.message)) {
    // Before migration 0012: no away column, so no away nudges either.
    ({ data: rows, error } = await supabase.from("reminder_settings").select("*").or(anyOn));
  }
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const cards = new Map<string, PushCard>();
  const toLog: { user_id: string; kind: string; sent_on: string }[] = [];

  for (const settings of (rows ?? []) as Settings[]) {
    const userId = settings.user_id;
    let clock;
    try {
      clock = localClock(now, settings.timezone);
    } catch {
      clock = localClock(now, "UTC");
    }
    const eveningDue = isDue(clock, settings.evening_time);
    // The morning card's time depends on today's workout; only look when the
    // morning time or the hour before any plausible start could be near.
    const wantsMorning =
      settings.workout || settings.weight || settings.measurement || settings.plan || Boolean(settings.away);
    if (!wantsMorning && !eveningDue) {
      continue;
    }

    const { data: sentRows } = await supabase
      .from("reminder_log")
      .select("kind")
      .eq("user_id", userId)
      .eq("sent_on", clock.date);
    const sent = new Set(((sentRows ?? []) as Row[]).map((row) => row.kind as string));

    const session = wantsMorning || settings.streak ? await todaySession(supabase, userId, clock.date) : undefined;
    const workoutToday = settings.workout && session && session.status !== "completed";
    const morningAt = workoutToday
      ? workoutReminderTime(await lastStartedAt(supabase, userId), settings.timezone, settings.morning_time)
      : settings.morning_time;
    const morningDue = wantsMorning && isDue(clock, morningAt);
    if (!morningDue && !eveningDue) {
      continue;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("name, weight_cadence, measurement_cadence, schedule_config")
      .eq("id", userId)
      .maybeSingle();
    const scheduleConfig = (profile?.schedule_config as { endDate?: string } | null) ?? undefined;

    const input: ReminderInput = {
      name: (profile?.name as string | null) ?? undefined,
      today: clock.date,
      weekday: clock.weekday,
      switches: settings,
      sent,
      todaySession: session,
      lastWeightDate: settings.weight ? await lastMeasurement(supabase, userId, true) : undefined,
      weightCadence: (profile?.weight_cadence as ReminderInput["weightCadence"]) ?? undefined,
      lastTapeDate: settings.measurement ? await lastMeasurement(supabase, userId, false) : undefined,
      measurementCadence: (profile?.measurement_cadence as ReminderInput["measurementCadence"]) ?? undefined,
      scheduleEndDate: scheduleConfig?.endDate,
      loggedToday: eveningDue && settings.streak ? await loggedOn(supabase, userId, clock.date) : undefined,
      week:
        eveningDue && settings.recap && clock.weekday === 0
          ? await weekSoFar(supabase, userId, mondayOf(clock.date, clock.weekday), clock.date)
          : undefined
    };

    let message: ReminderMessage | undefined =
      (morningDue ? morningMessage(input) : undefined) ?? (eveningDue ? eveningMessage(input) : undefined);
    // Nothing else to say this morning, and the plain morning time has come:
    // the away nudge, if its day has come too.
    if (!message && settings.away && isDue(clock, settings.morning_time)) {
      message = await awayCard(supabase, userId, settings, input.name, clock.date);
    }
    if (!message) {
      continue;
    }
    cards.set(userId, { title: message.title, body: message.body, tag: `reminder-${message.kinds[0]}`, url: message.url });
    message.kinds.forEach((kind) => toLog.push({ user_id: userId, kind, sent_on: clock.date }));
  }

  if (toLog.length > 0) {
    // Logged before sending: a send that fails is not retried a minute later
    // with the same card, and two overlapping runs cannot both send.
    const { error: logError } = await supabase.from("reminder_log").upsert(toLog, { ignoreDuplicates: true });
    if (logError) {
      return Response.json({ error: logError.message }, { status: 500 });
    }
  }

  const result = await sendToUsers(supabase, [...cards.keys()], (userId) => cards.get(userId), {
    // A morning card is still right at lunch; by evening it is not.
    ttlSeconds: 6 * 60 * 60
  });
  return Response.json({ ...result, users: cards.size });
});

/**
 * Cardio on Progress: how far, how fast, and the best of each.
 *
 * Built from set rows, not from WorkoutLog rollups — a run's distance lives on
 * its rows (`distanceKm`), and the rollup was designed for kg and reps. One run
 * is one *session* here: its rows summed, so 6 × 400 m intervals are a 2.4 km
 * session at the pace of the whole thing, and a steady 5 km is one row.
 */
import { paceSecondsPerKm } from "@/lib/cardio";
import { weekStartKey } from "@/lib/progress-metrics";
import type { SetLog, WorkoutLog } from "@/lib/types";

export interface CardioSession {
  logId: string;
  date: string;
  workoutId: string;
  name: string;
  km: number;
  seconds: number;
  /** Seconds per km over the whole session. Absent when it was not timed. */
  pace?: number;
}

/** Every logged cardio session, oldest first. Rows with no distance are not cardio. */
export function cardioSessions(setLogs: SetLog[], logs: WorkoutLog[]): CardioSession[] {
  const names = new Map(logs.map((log) => [log.id, log.name]));
  const byLog = new Map<string, CardioSession>();

  setLogs
    .filter((row) => (row.distanceKm ?? 0) > 0)
    .forEach((row) => {
      const current = byLog.get(row.logId) ?? {
        logId: row.logId,
        date: row.date,
        workoutId: row.workoutId,
        name: names.get(row.logId) ?? row.workoutId,
        km: 0,
        seconds: 0
      };
      current.km += row.distanceKm ?? 0;
      current.seconds += row.durationSeconds ?? 0;
      byLog.set(row.logId, current);
    });

  return [...byLog.values()]
    .map((session) => ({ ...session, pace: paceSecondsPerKm(session.seconds, session.km) }))
    .sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? -1 : 1));
}

function shiftDays(key: string, days: number) {
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * km per week for the last `weeks` weeks, Monday first, ending with the week
 * of `today`. Empty weeks are 0, not missing: a gap in training is a gap on
 * the chart, not a week that quietly disappears.
 */
export function weeklyDistance(sessions: CardioSession[], today: string, weeks = 12): { week: string; km: number }[] {
  const last = weekStartKey(today);
  const keys = Array.from({ length: weeks }, (_, index) => shiftDays(last, (index - weeks + 1) * 7));
  const totals = new Map(keys.map((key) => [key, 0]));
  sessions.forEach((session) => {
    const key = weekStartKey(session.date);
    if (totals.has(key)) {
      totals.set(key, (totals.get(key) ?? 0) + session.km);
    }
  });
  return keys.map((week) => ({ week, km: Math.round((totals.get(week) ?? 0) * 100) / 100 }));
}

/** The kinds of cardio done, the most-logged first — the pace chart's choices. */
export function cardioTypes(sessions: CardioSession[]): { workoutId: string; name: string; count: number }[] {
  const counts = new Map<string, { workoutId: string; name: string; count: number }>();
  sessions.forEach((session) => {
    const current = counts.get(session.workoutId) ?? { workoutId: session.workoutId, name: session.name, count: 0 };
    current.count += 1;
    counts.set(session.workoutId, current);
  });
  return [...counts.values()].sort((a, b) => b.count - a.count);
}

/**
 * Pace over time for one kind of cardio. A run and a ride never share a line:
 * 2:00 a km is a slow ride and an impossible run.
 */
export function paceTrend(sessions: CardioSession[], workoutId: string): { date: string; pace: number }[] {
  return sessions
    .filter((session) => session.workoutId === workoutId && session.pace !== undefined)
    .map((session) => ({ date: session.date, pace: Math.round(session.pace ?? 0) }));
}

/** Shorter than this, a "fastest pace" is a sprint, not a record worth keeping. */
export const FASTEST_MIN_KM = 1;

export interface CardioRecords {
  totalKm: number;
  longest?: CardioSession;
  /** Lowest seconds per km, over at least FASTEST_MIN_KM. */
  fastest?: CardioSession;
  longestTime?: CardioSession;
}

export function cardioRecords(sessions: CardioSession[]): CardioRecords {
  const pick = (better: (a: CardioSession, b: CardioSession) => boolean, list = sessions) =>
    list.reduce<CardioSession | undefined>((best, session) => (!best || better(session, best) ? session : best), undefined);

  return {
    totalKm: Math.round(sessions.reduce((sum, session) => sum + session.km, 0) * 100) / 100,
    longest: pick((a, b) => a.km > b.km),
    fastest: pick(
      (a, b) => (a.pace ?? Infinity) < (b.pace ?? Infinity),
      sessions.filter((session) => session.km >= FASTEST_MIN_KM && session.pace !== undefined)
    ),
    longestTime: pick((a, b) => a.seconds > b.seconds, sessions.filter((session) => session.seconds > 0))
  };
}

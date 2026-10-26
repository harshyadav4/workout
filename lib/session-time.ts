/**
 * Session time: when a session started, when it really ended, and what that
 * adds up to. Times are ISO strings, written by the device at the moment —
 * Start, each Log set, Finish — so they are the clock on the phone, not a
 * guess.
 *
 * Only completion times exist for sets (there is no "started the set" tap), so
 * the honest per-set number is the gap since the previous logged set: the set
 * and the rest before it, together. It is labelled as exactly that.
 */
import type { ScheduledSession } from "@/lib/types";

/** A Finish this long after the last set was forgotten, not trained through. */
export const FORGOT_FINISH_MS = 30 * 60 * 1000;
/** What a forgotten Finish is cut to after the last set, if it had no rest set. */
const DEFAULT_TAIL_SECONDS = 60;

/**
 * When the session really ended. Finish tapped on time: that moment. Tapped
 * long after the last set — the app closed, the phone in a bag — the session
 * ended at the last set plus its rest, not three hours later.
 */
export function finishTime(nowIso: string, setTimes: string[], restAfterLastSeconds?: number): string {
  const last = setTimes.reduce<string | undefined>((latest, time) => (!latest || time > latest ? time : latest), undefined);
  if (!last) {
    return nowIso;
  }
  const lastMs = Date.parse(last);
  if (Date.parse(nowIso) - lastMs <= FORGOT_FINISH_MS) {
    return nowIso;
  }
  return new Date(lastMs + (restAfterLastSeconds ?? DEFAULT_TAIL_SECONDS) * 1000).toISOString();
}

export function secondsBetween(startIso: string, endIso: string): number {
  return Math.max(0, Math.round((Date.parse(endIso) - Date.parse(startIso)) / 1000));
}

/** "1 h 12 min", "42 min", "under a minute". */
export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) {
    return "under a minute";
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) {
    return `${minutes} min`;
  }
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/** "6:10 PM", in the phone's own time zone. */
export function formatTimeOfDay(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone }).format(new Date(iso));
}

export type PartOfDay = "morning" | "afternoon" | "evening" | "night";

export function partOfDay(hour: number): PartOfDay {
  if (hour >= 5 && hour < 12) {
    return "morning";
  }
  if (hour >= 12 && hour < 17) {
    return "afternoon";
  }
  if (hour >= 17 && hour < 22) {
    return "evening";
  }
  return "night";
}

export interface SetTiming {
  setId: string;
  at: string;
  /** Seconds since the previous logged set, or since Start for the first: the set and the rest before it. */
  gap: number;
  /** The session's first logged set: its gap is measured from Start, not from a set. */
  fromStart: boolean;
}

export interface ExerciseTiming {
  exerciseId: string;
  name: string;
  /** The sum of its sets' gaps: from when you moved onto it to its last set. */
  seconds: number;
  sets: SetTiming[];
}

/** Per workout and per set, in the order the sets were logged. */
export function sessionBreakdown(session: ScheduledSession): ExerciseTiming[] {
  const logged = session.exercises
    .flatMap((exercise) =>
      exercise.sets
        .filter((setItem) => setItem.completed && setItem.completedAt)
        .map((setItem) => ({ exercise, setId: setItem.id, at: setItem.completedAt as string }))
    )
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));

  const byExercise = new Map<string, ExerciseTiming>();
  let previous = session.startedAt;
  logged.forEach(({ exercise, setId, at }) => {
    const fromStart = previous === session.startedAt;
    const gap = previous ? secondsBetween(previous, at) : 0;
    previous = at;
    const entry = byExercise.get(exercise.id) ?? { exerciseId: exercise.id, name: exercise.templateName, seconds: 0, sets: [] };
    entry.sets.push({ setId, at, gap, fromStart });
    entry.seconds += gap;
    byExercise.set(exercise.id, entry);
  });
  return [...byExercise.values()];
}

// -- Progress ----------------------------------------------------------------

export interface TimedSession {
  id: string;
  date: string;
  name: string;
  start: string;
  end: string;
  seconds: number;
}

/** Finished sessions that carry both times, oldest first. Older sessions without times are left out, not zero. */
export function timedSessions(sessions: ScheduledSession[]): TimedSession[] {
  return sessions
    .filter((session) => session.status === "completed" && session.startedAt && session.finishedAt)
    .map((session) => ({
      id: session.id,
      date: session.date,
      name: session.sessionName,
      start: session.startedAt as string,
      end: session.finishedAt as string,
      seconds: secondsBetween(session.startedAt as string, session.finishedAt as string)
    }))
    .filter((session) => session.seconds > 0)
    .sort((a, b) => (a.start < b.start ? -1 : 1));
}

function mondayOf(key: string) {
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

/** Hours trained per Monday-first week, the last `weeks` ending with today's. */
export function weeklyHours(sessions: TimedSession[], today: string, weeks = 12): { week: string; hours: number }[] {
  const last = mondayOf(today);
  const keys = Array.from({ length: weeks }, (_, index) => {
    const date = new Date(`${last}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + (index - weeks + 1) * 7);
    return date.toISOString().slice(0, 10);
  });
  const totals = new Map(keys.map((key) => [key, 0]));
  sessions.forEach((session) => {
    const key = mondayOf(session.date);
    if (totals.has(key)) {
      totals.set(key, (totals.get(key) ?? 0) + session.seconds);
    }
  });
  return keys.map((week) => ({ week, hours: Math.round(((totals.get(week) ?? 0) / 3600) * 10) / 10 }));
}

/** Sessions per part of the day, and the usual start (the median), by the phone's clock. */
export function whenYouTrain(sessions: TimedSession[], timeZone?: string) {
  const counts: Record<PartOfDay, number> = { morning: 0, afternoon: 0, evening: 0, night: 0 };
  const minutes = sessions
    .map((session) => {
      const parts = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "numeric", hourCycle: "h23", timeZone })
        .formatToParts(new Date(session.start));
      const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
      const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
      counts[partOfDay(hour)] += 1;
      return hour * 60 + minute;
    })
    .sort((a, b) => a - b);
  const median = minutes.length ? minutes[Math.floor((minutes.length - 1) / 2)] : undefined;
  return { counts, usualStartMinutes: median };
}

/** Per kind of session: how long it usually takes, and its extremes. */
export function durationRecords(sessions: TimedSession[]) {
  const byName = new Map<string, TimedSession[]>();
  sessions.forEach((session) => byName.set(session.name, [...(byName.get(session.name) ?? []), session]));
  return [...byName.entries()]
    .map(([name, list]) => ({
      name,
      count: list.length,
      average: Math.round(list.reduce((sum, session) => sum + session.seconds, 0) / list.length),
      longest: list.reduce((a, b) => (b.seconds > a.seconds ? b : a)),
      shortest: list.reduce((a, b) => (b.seconds < a.seconds ? b : a))
    }))
    .sort((a, b) => b.count - a.count);
}

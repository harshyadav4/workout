import type { PlannedExercise, ScheduleConfig, ScheduledSession, SessionTemplate } from "@/lib/types";

const DAY_MS = 86_400_000;
/** The most days one schedule generates; see `scheduleHorizonEnd`. */
export const MAX_DAYS = 400;

/** A rest day inside `rotationOrder` — a 3-on-1-off split needs the off day in the cycle. */
export const REST_SLOT = "rest";

/**
 * What Home shows today. `open` is the state a generated schedule falls into on
 * an unassigned weekday: `buildScheduleSessions` emits a session for rest days
 * but nothing at all for a weekday with no workout, so "no session today" is a
 * normal day, not an error.
 */
export type DayState =
  | { kind: "setup" }
  | { kind: "open"; next?: ScheduledSession }
  | { kind: "rest"; session: ScheduledSession; next?: ScheduledSession }
  | { kind: "ready"; session: ScheduledSession; next?: ScheduledSession }
  | { kind: "logging"; session: ScheduledSession; next?: ScheduledSession }
  | { kind: "done"; session: ScheduledSession; next?: ScheduledSession };

/** Earliest workout still ahead of today — what the idle states answer "so when?" with. */
export function findNextSession(
  sessions: ScheduledSession[],
  today: string
): ScheduledSession | undefined {
  return sessions.reduce<ScheduledSession | undefined>((best, session) => {
    if (session.date <= today || session.type !== "workout" || session.status === "completed") {
      return best;
    }
    return !best || session.date < best.date ? session : best;
  }, undefined);
}

/**
 * Resolve today into one screen state. `session` is the caller's already-picked
 * session for today (selected, or the first one); `hasPlan` is false only for a
 * brand new account with nothing built and nothing scheduled.
 */
export function resolveDayState({
  today,
  session,
  sessions,
  hasPlan
}: {
  today: string;
  session?: ScheduledSession;
  sessions: ScheduledSession[];
  hasPlan: boolean;
}): DayState {
  if (!hasPlan) {
    return { kind: "setup" };
  }

  const next = findNextSession(sessions, today);

  if (!session) {
    return { kind: "open", next };
  }

  if (session.type === "rest") {
    return { kind: "rest", session, next };
  }

  if (session.status === "active") {
    return { kind: "logging", session, next };
  }

  if (session.status === "completed") {
    return { kind: "done", session, next };
  }

  return { kind: "ready", session, next };
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

// Iterate calendar days in UTC so weekday/date math is timezone-independent;
// the YYYY-MM-DD keys are plain day strings the rest of the app matches on.
function* eachDay(start: string, end: string): Generator<{ key: string; weekday: number }> {
  const [ys, ms, ds] = start.split("-").map(Number);
  const [ye, me, de] = end.split("-").map(Number);
  let cursor = Date.UTC(ys, ms - 1, ds);
  const last = Date.UTC(ye, me - 1, de);
  let count = 0;
  while (cursor <= last && count < MAX_DAYS) {
    const date = new Date(cursor);
    yield {
      key: `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`,
      weekday: date.getUTCDay()
    };
    cursor += DAY_MS;
    count += 1;
  }
}

/**
 * Days of schedule left after `from`.
 *
 * The default horizon is eight weeks and nothing regenerates it. In week nine
 * the calendar simply empties, with no warning and nothing to explain it — the
 * app looks broken on the day it matters most.
 *
 * Counts only what is still ahead: a config whose window has already closed
 * returns 0, not a negative.
 */
export function daysOfScheduleLeft(config: ScheduleConfig | undefined, from: string): number {
  const endDate = config ? scheduleHorizonEnd(config) : undefined;
  if (!endDate || endDate < from) {
    return 0;
  }

  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const end = new Date(`${endDate}T00:00:00`).getTime();
  const start = new Date(`${from}T00:00:00`).getTime();

  return Math.max(0, Math.round((end - start) / MS_PER_DAY));
}

/** `key` plus `days`, in UTC like `eachDay`. */
function addDaysKey(key: string, days: number): string {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day) + days * DAY_MS);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** The last day a schedule starting on `startDate` can generate. */
export function maxScheduleEnd(startDate: string): string {
  return addDaysKey(startDate, MAX_DAYS - 1);
}

/**
 * The last day `buildScheduleSessions` really fills: the end date, or the cap
 * if the end date is further out. "Days left" and the running-out warning
 * count to this, so the calendar never empties before they say so.
 */
export function scheduleHorizonEnd(config: Pick<ScheduleConfig, "startDate" | "endDate">): string {
  const capped = maxScheduleEnd(config.startDate);
  return config.endDate < capped ? config.endDate : capped;
}

/**
 * Merge a freshly generated plan over the existing one.
 *
 * Two things survive regeneration: work already done (`active`/`completed`, a
 * record rather than a plan) and anything the user put on the calendar
 * themselves. Only what this generator produced last time — `source: "repeat"`,
 * still `planned` — is its to replace.
 *
 * The source clause is why an ad-hoc session started from Home does not need a
 * third `source` value to survive: it is `manual`, like a hand-scheduled
 * session, and both were being silently regenerated away.
 */
export function mergeGeneratedSessions(
  existing: ScheduledSession[],
  generated: ScheduledSession[]
): ScheduledSession[] {
  const kept = existing.filter(
    (session) => session.status !== "planned" || session.source !== "repeat"
  );
  const keptDates = new Set(kept.map((session) => session.date));

  return [...kept, ...generated.filter((session) => !keptDates.has(session.date))].sort((a, b) =>
    a.date.localeCompare(b.date)
  );
}

/**
 * Generate the dated sessions for a schedule config across [startDate, endDate].
 * - Rest weekdays win over any assignment; the rotation pointer holds on rest days
 *   so the sequence continues from the last workout.
 * - Weekly: each weekday maps to a workout (unassigned weekdays are off).
 * - Rotation: cycle rotationOrder one workout per non-rest day, looping.
 */
export function buildScheduleSessions(
  config: ScheduleConfig,
  templates: SessionTemplate[],
  buildExercises: (template: SessionTemplate) => PlannedExercise[]
): ScheduledSession[] {
  if (!config.startDate || !config.endDate || config.startDate > config.endDate) {
    return [];
  }

  const byId = new Map(templates.map((template) => [template.id, template]));
  const restWeekdays = new Set(config.restWeekdays);
  const sessions: ScheduledSession[] = [];
  let pointer = 0;

  const restDay = (key: string, weekday: number): ScheduledSession => ({
    id: crypto.randomUUID(),
    date: key,
    dayIndex: weekday,
    sessionName: "Rest Day",
    exercises: [],
    type: "rest",
    status: "planned",
    source: "repeat"
  });

  for (const { key, weekday } of eachDay(config.startDate, config.endDate)) {
    if (restWeekdays.has(weekday)) {
      sessions.push(restDay(key, weekday));
      continue;
    }

    let templateId: string | undefined;
    if (config.mode === "weekly") {
      templateId = config.weekly[weekday];
      if (!templateId) {
        continue; // off day
      }
    } else {
      if (config.rotationOrder.length === 0) {
        continue;
      }
      templateId = config.rotationOrder[pointer % config.rotationOrder.length];
      pointer += 1;
      if (templateId === REST_SLOT) {
        sessions.push(restDay(key, weekday));
        continue;
      }
    }

    const template = byId.get(templateId);
    if (!template) {
      continue;
    }

    sessions.push({
      id: crypto.randomUUID(),
      date: key,
      dayIndex: weekday,
      sessionTemplateId: template.id,
      sessionName: template.name,
      exercises: buildExercises(template),
      type: "workout",
      status: "planned",
      source: "repeat"
    });
  }

  return sessions;
}

/** Weekday for a YYYY-MM-DD key, in UTC — matching `eachDay`. */
function weekdayOf(key: string): number {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export type MoveResult =
  | { ok: true; sessions: ScheduledSession[] }
  | { ok: false; reason: string };

/**
 * Move one dated session to another day, leaving the weekly plan alone.
 *
 * The common real edit there is — sick, travelling, gym shut, three gym days
 * this week instead of four — and until now the only thing Plan offered was
 * "Remove from this day", which loses the session rather than moving it.
 *
 * **Two things make this survive the generator**, and both are load-bearing:
 *
 * `mergeGeneratedSessions` keeps a session only when
 * `status !== "planned" || source !== "repeat"`, so anything still carrying
 * `source: "repeat"` is replaced on the next regeneration. Both ends of a move
 * become `source: "manual"` — the move is a manual decision by definition, and
 * without this the session would snap back to its original day.
 *
 * And the **vacated date does not stay empty**: it takes whatever was on the
 * target day, or a rest day if the target was clear. An empty date is one the
 * generator refills, which would silently duplicate the session the user just
 * moved. A rest day is also what the user actually means — the session left,
 * so that day is now off.
 */
export function moveSession(
  sessions: ScheduledSession[],
  sessionId: string,
  toDate: string,
  /** Today's key. A day before it is history, and Plan hides every control there. */
  today?: string
): MoveResult {
  const moving = sessions.find((session) => session.id === sessionId);

  if (!moving) {
    return { ok: false, reason: "That workout is no longer on the calendar." };
  }
  if (moving.date === toDate) {
    return { ok: true, sessions };
  }
  // The date input's `min` is a hint; a desktop browser lets any date through.
  // Landed in the past, a session could never be moved or removed again.
  if (today && toDate < today) {
    return { ok: false, reason: "That day has passed. Pick today or later." };
  }
  // A completed session is a record of a day that happened. Moving it would
  // rewrite history and detach it from the logs already written against its date.
  if (moving.status === "completed") {
    return { ok: false, reason: "That workout is done. It stays on its day." };
  }

  const displaced = sessions.find(
    (session) => session.date === toDate && session.id !== sessionId
  );

  if (displaced?.status === "completed") {
    return { ok: false, reason: "You already did a workout on that day." };
  }
  // A swap would carry a half-done session to another day, and its logs with it.
  if (displaced?.status === "active") {
    return { ok: false, reason: "A workout is in progress on that day." };
  }

  const vacated: ScheduledSession = displaced
    ? { ...displaced, date: moving.date, dayIndex: weekdayOf(moving.date), source: "manual" }
    : {
        id: crypto.randomUUID(),
        date: moving.date,
        dayIndex: weekdayOf(moving.date),
        sessionName: "Rest Day",
        exercises: [],
        type: "rest",
        status: "planned",
        source: "manual"
      };

  const moved: ScheduledSession = {
    ...moving,
    date: toDate,
    dayIndex: weekdayOf(toDate),
    source: "manual"
  };

  return {
    ok: true,
    sessions: [
      ...sessions.filter(
        (session) => session.id !== sessionId && session.id !== displaced?.id
      ),
      moved,
      vacated
    ].sort((a, b) => a.date.localeCompare(b.date))
  };
}

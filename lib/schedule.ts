import type { PlannedExercise, ScheduleConfig, ScheduledSession, SessionTemplate } from "@/lib/types";

const DAY_MS = 86_400_000;
const MAX_DAYS = 400;

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
 * Merge a freshly generated plan over the existing one.
 * Sessions that are active or completed are a record of work done, so they
 * survive regeneration and the new plan skips their dates rather than
 * duplicating them. Everything still merely `planned` is replaced.
 */
export function mergeGeneratedSessions(
  existing: ScheduledSession[],
  generated: ScheduledSession[]
): ScheduledSession[] {
  const kept = existing.filter((session) => session.status !== "planned");
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

  for (const { key, weekday } of eachDay(config.startDate, config.endDate)) {
    if (restWeekdays.has(weekday)) {
      sessions.push({
        id: crypto.randomUUID(),
        date: key,
        dayIndex: weekday,
        sessionName: "Rest Day",
        exercises: [],
        type: "rest",
        status: "planned",
        source: "repeat"
      });
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

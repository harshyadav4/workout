import { resolveMuscleIds } from "@/features/body/body-map-shared";
import { DIRECT_ENGAGEMENT, daysBetween, formatDayKey, shiftKey } from "@/lib/progress-metrics";
import { eachDay } from "@/lib/schedule";
import type {
  Injury,
  InjuryPlace,
  InjurySide,
  InjuryWorkout,
  InjuryWorkoutFrequency,
  MuscleId,
  PainLog,
  ScheduledSession,
  WorkoutMuscleTarget
} from "@/lib/types";

/**
 * Injuries and their weekly pain score. Pure, like `lib/skills`: the store holds
 * the rows and everything said about them is worked out here.
 *
 * The app never diagnoses. Every rule below is a hint to the person or a nudge
 * towards a doctor, and none of them blocks a workout. A physio reviews these
 * numbers and words before launch.
 */

interface InjuryPlaceInfo {
  /** Lower case, to sit inside a sentence: "May load your lower back". */
  name: string;
  /** On the body's middle line, so it has no left and right. */
  middle?: boolean;
  /** Reads as plural: "How are your abs". */
  plural?: boolean;
  /**
   * The muscles whose direct work may load this place. A joint has no muscle of
   * its own, so it lists the muscles that move it. This is only a hint from the
   * app's muscle data.
   */
  muscles: MuscleId[];
}

const QUADS: MuscleId[] = ["rectusFemoris", "vastusLateralis", "vastusMedialis"];
const HAMSTRINGS: MuscleId[] = ["hamsOuter", "hamsInner"];
const FOREARMS: MuscleId[] = ["forearmFlexors", "forearmExtensors"];
const CALVES: MuscleId[] = ["gastrocnemius", "soleus"];
const BICEPS: MuscleId[] = ["biceps", "brachialis"];
const TRICEPS: MuscleId[] = ["tricepsLong", "tricepsLateral"];

/** The 20 places the body map can name. */
export const INJURY_PLACES: Record<InjuryPlace, InjuryPlaceInfo> = {
  neck: { name: "neck", middle: true, muscles: ["traps"] },
  upperBack: { name: "upper back", middle: true, muscles: ["traps", "rhomboids", "lats"] },
  lowerBack: { name: "lower back", middle: true, muscles: ["erectors"] },
  abs: { name: "abs", middle: true, plural: true, muscles: ["abs", "obliques"] },
  shoulder: { name: "shoulder", muscles: ["deltFront", "deltSide", "deltRear"] },
  chest: { name: "chest", muscles: ["pecUpper", "pecLower", "serratus"] },
  biceps: { name: "biceps", muscles: BICEPS },
  triceps: { name: "triceps", muscles: TRICEPS },
  elbow: { name: "elbow", muscles: [...BICEPS, ...TRICEPS, ...FOREARMS] },
  forearm: { name: "forearm", muscles: FOREARMS },
  wrist: { name: "wrist", muscles: FOREARMS },
  hip: { name: "hip", muscles: ["gluteMax", "gluteMed", "adductors", "sartorius", "rectusFemoris"] },
  groin: { name: "groin", muscles: ["adductors"] },
  quad: { name: "quad", muscles: [...QUADS, "sartorius"] },
  glute: { name: "glute", muscles: ["gluteMax", "gluteMed"] },
  hamstring: { name: "hamstring", muscles: HAMSTRINGS },
  knee: { name: "knee", muscles: [...QUADS, ...HAMSTRINGS] },
  shin: { name: "shin", muscles: ["tibialis"] },
  calf: { name: "calf", muscles: CALVES },
  ankle: { name: "ankle", muscles: [...CALVES, "tibialis"] }
};

const PLACE_IDS = new Set<string>(Object.keys(INJURY_PLACES));
const SIDES = new Set<string>(["left", "right", "both"] satisfies InjurySide[]);

/** The pain question comes once a week. */
export const CHECK_IN_DAYS = 7;
/** How far back "no better" looks. */
export const PHYSIO_AFTER_DAYS = 21;
/** The smallest change on a 0 to 10 pain score that counts as a real change. */
export const REAL_CHANGE = 2;
/** A score that adds the "ask your doctor" line. It never blocks. */
export const HIGH_PAIN = 7;
/** How long an injury's workout can run. */
export const INJURY_WORKOUT_WEEKS = [2, 4, 6, 8] as const;

const capital = (text: string) => text[0].toUpperCase() + text.slice(1);

/** "Left hip", "Knee, both sides", "Lower back". */
export function injuryName(injury: Pick<Injury, "place" | "side">): string {
  const { name, middle } = INJURY_PLACES[injury.place];
  if (middle || !injury.side) {
    return capital(name);
  }
  return injury.side === "both" ? `${capital(name)}, both sides` : `${capital(injury.side)} ${name}`;
}

export function painQuestion(injury: Pick<Injury, "place">, when: "today" | "this week" = "today"): string {
  const { name, plural } = INJURY_PLACES[injury.place];
  return `How ${plural ? "are" : "is"} your ${name} ${when}?`;
}

export function mayLoadLine(injury: Pick<Injury, "place">): string {
  return `May load your ${INJURY_PLACES[injury.place].name}`;
}

export function isPainScore(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 10;
}

export const isHighPain = (score: number) => score >= HIGH_PAIN;

export function activeInjuries(injuries: Injury[]): Injury[] {
  return injuries.filter((injury) => !injury.healedDate);
}

/**
 * Rows are identified by `(injuryId, date)`, like a weigh-in by `(date, metric)`:
 * a second score on a day replaces the first.
 */
export function upsertPainLog(list: PainLog[], entry: PainLog): PainLog[] {
  const without = list.filter((log) => !(log.injuryId === entry.injuryId && log.date === entry.date));
  return [...without, entry].sort((a, b) => a.date.localeCompare(b.date));
}

/** One injury's scores, oldest first. */
export function painLogsFor(list: PainLog[], injuryId: string): PainLog[] {
  return list
    .filter((log) => log.injuryId === injuryId)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function latestPain(list: PainLog[], injuryId: string): PainLog | undefined {
  return painLogsFor(list, injuryId).at(-1);
}

/** `skippedOn` is the day they last chose "Skip this week". */
export function isCheckInDue(injury: Injury, list: PainLog[], today: string, skippedOn?: string): boolean {
  if (injury.healedDate) {
    return false;
  }
  if (skippedOn && daysBetween(skippedOn, today) < CHECK_IN_DAYS) {
    return false;
  }
  const latest = latestPain(list, injury.id);
  return !latest || daysBetween(latest.date, today) >= CHECK_IN_DAYS;
}

/** The newest score at least `days` older than the latest one. */
function scoreFromBefore(logs: PainLog[], days: number): PainLog | undefined {
  const latest = logs.at(-1);
  return latest && logs.filter((log) => daysBetween(log.date, latest.date) >= days).at(-1);
}

export type PainTrend = "new" | "better" | "same" | "worse";

/**
 * Against 3 weeks ago, or the first score while there is no such score yet. Not
 * against last week: pain moves up and down, and one week says little.
 */
export function painTrend(list: PainLog[], injuryId: string): PainTrend {
  const logs = painLogsFor(list, injuryId);
  const latest = logs.at(-1);
  const earlier = scoreFromBefore(logs, PHYSIO_AFTER_DAYS) ?? scoreFromBefore(logs, CHECK_IN_DAYS);
  if (!latest || !earlier) {
    return "new";
  }
  const change = latest.score - earlier.score;
  if (change <= -REAL_CHANGE) {
    return "better";
  }
  return change >= REAL_CHANGE ? "worse" : "same";
}

/** "down from 7 in 8 weeks", from an injury's scores, oldest first. Nothing to say with one score. */
export function painChangeWords(logs: PainLog[]): string | undefined {
  if (logs.length < 2) {
    return undefined;
  }
  const first = logs[0];
  const last = logs[logs.length - 1];
  const weeks = Math.round(daysBetween(first.date, last.date) / 7);
  const when = weeks < 1 ? "this week" : `in ${weeks} ${weeks === 1 ? "week" : "weeks"}`;
  if (last.score === first.score) {
    return `no change ${when}`;
  }
  return `${last.score < first.score ? "down" : "up"} from ${first.score} ${when}`;
}

/** No real improvement in 3 weeks, with real pain left. */
export function shouldSeePhysio(injury: Injury, list: PainLog[]): boolean {
  if (injury.healedDate) {
    return false;
  }
  const logs = painLogsFor(list, injury.id);
  const latest = logs.at(-1);
  const earlier = scoreFromBefore(logs, PHYSIO_AFTER_DAYS);
  if (!latest || !earlier || latest.score < REAL_CHANGE) {
    return false;
  }
  return earlier.score - latest.score < REAL_CHANGE;
}

export function loadsInjury(targets: WorkoutMuscleTarget[], injury: Pick<Injury, "place">): boolean {
  const loaded = INJURY_PLACES[injury.place].muscles;
  return targets.some(
    (target) =>
      target.engagement >= DIRECT_ENGAGEMENT &&
      resolveMuscleIds(target.muscleId).some((muscleId) => loaded.includes(muscleId))
  );
}

/**
 * The injuries an exercise may load. An injury's own workout gives no warning:
 * a clamshell from the doctor must not say "May load your hip".
 */
export function injuriesLoadedBy(
  targets: WorkoutMuscleTarget[],
  injuries: Injury[],
  sessionTemplateId?: string
): Injury[] {
  return activeInjuries(injuries).filter((injury) => {
    const ownWorkout = Boolean(sessionTemplateId) && injury.workout?.sessionTemplateId === sessionTemplateId;
    return !ownWorkout && loadsInjury(targets, injury);
  });
}

/** The days an injury's workout falls on. `weeks` counts from `startDate`, which is day one. */
export function injuryWorkoutDates(
  frequency: InjuryWorkoutFrequency,
  startDate: string,
  weeks: number
): string[] {
  const days = [...eachDay(startDate, shiftKey(startDate, weeks * 7 - 1))];
  return (
    frequency.kind === "every"
      ? days.filter((_, index) => index % frequency.days === 0)
      : days.filter((day) => frequency.weekdays.includes(day.weekday))
  ).map((day) => day.key);
}

/**
 * The workouts labelled "For an injury". Healed injuries count too: their
 * finished days are still not normal workouts.
 */
export function injuryWorkoutIds(injuries: Injury[]): Set<string> {
  return new Set(injuries.flatMap((injury) => (injury.workout ? [injury.workout.sessionTemplateId] : [])));
}

/** A session that belongs to an injury sits apart from the day's main workout. */
export function isInjurySession(session: Pick<ScheduledSession, "sessionTemplateId">, ids: ReadonlySet<string>) {
  return Boolean(session.sessionTemplateId) && ids.has(session.sessionTemplateId as string);
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Every day", "Every 2 days", "Mon, Wed, Fri". Monday first, as the week reads. */
export function frequencyWords(frequency: InjuryWorkoutFrequency): string {
  if (frequency.kind === "every") {
    return frequency.days === 1 ? "Every day" : "Every 2 days";
  }
  return [...frequency.weekdays]
    .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
    .map((day) => WEEKDAYS[day])
    .join(", ");
}

/** "Every day to Dec 11", for a row. */
export function injuryWorkoutLine(workout: InjuryWorkout): string {
  return `${frequencyWords(workout.frequency)} to ${formatDayKey(workout.endDate)}`;
}

/** How many of the weeks on offer a saved workout covers, for opening its form again. */
export function injuryWorkoutWeeks(workout: InjuryWorkout): (typeof INJURY_WORKOUT_WEEKS)[number] {
  const weeks = Math.ceil((daysBetween(workout.startDate, workout.endDate) + 1) / 7);
  return INJURY_WORKOUT_WEEKS.find((option) => option >= weeks) ?? INJURY_WORKOUT_WEEKS[INJURY_WORKOUT_WEEKS.length - 1];
}

/** The days still ahead of a saved workout, from `today` on. */
export function injuryWorkoutDaysLeft(workout: InjuryWorkout, today: string): string[] {
  const weeks = Math.ceil((daysBetween(workout.startDate, workout.endDate) + 1) / 7);
  return injuryWorkoutDates(workout.frequency, workout.startDate, weeks).filter(
    (date) => date >= today && date <= workout.endDate
  );
}

/** Done and planned days of a workout, to show the doctor. */
export function injuryWorkoutProgress(workout: InjuryWorkout, sessions: ScheduledSession[]) {
  const own = sessions.filter((session) => session.sessionTemplateId === workout.sessionTemplateId);
  return { done: own.filter((session) => session.status === "completed").length, total: own.length };
}

/**
 * Planned days of an injury's workout that only this phone still holds, after the
 * account has moved on: the injury healed or was deleted, the workout stopped, or
 * its days changed. The merge keeps any row that one side holds, so these would
 * otherwise go straight back to the account and every other phone.
 *
 * Only the account's word counts. An injury it has not heard of yet is work done
 * offline, and a day the account also holds is not this phone's alone.
 */
export function staleInjuryDays(
  localInjuries: Injury[],
  localSessions: ScheduledSession[],
  remoteInjuries: Injury[] | undefined,
  remoteSessions: ScheduledSession[],
  deletedIds: ReadonlySet<string>
): Set<string> {
  const stale = new Set<string>();
  if (!remoteInjuries) {
    return stale;
  }
  const onAccount = new Set(remoteSessions.map((session) => session.id));
  for (const injury of localInjuries) {
    const templateId = injury.workout?.sessionTemplateId;
    const there = remoteInjuries.find((item) => item.id === injury.id);
    if (!templateId || (!there && !deletedIds.has(injury.id))) {
      continue;
    }
    const running = there?.workout?.sessionTemplateId === templateId && !there.healedDate ? there.workout : undefined;
    const allowed = new Set(running ? injuryWorkoutDaysLeft(running, running.startDate) : []);
    for (const session of localSessions) {
      if (
        session.sessionTemplateId === templateId &&
        session.status === "planned" &&
        !onAccount.has(session.id) &&
        !allowed.has(session.date)
      ) {
        stale.add(session.id);
      }
    }
  }
  return stale;
}

/** An injury leaves with its scores. */
export function withoutInjury(injuries: Injury[], painLogs: PainLog[], id: string) {
  return {
    injuries: injuries.filter((injury) => injury.id !== id),
    painLogs: painLogs.filter((log) => log.injuryId !== id)
  };
}

const isText = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const isDateKey = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readFrequency(value: unknown): InjuryWorkoutFrequency | undefined {
  if (!isObject(value)) {
    return undefined;
  }
  if (value.kind === "every" && (value.days === 1 || value.days === 2)) {
    return { kind: "every", days: value.days };
  }
  if (
    value.kind === "weekdays" &&
    Array.isArray(value.weekdays) &&
    value.weekdays.every((day) => Number.isInteger(day) && day >= 0 && day <= 6)
  ) {
    return { kind: "weekdays", weekdays: value.weekdays as number[] };
  }
  return undefined;
}

function readWorkout(value: unknown): InjuryWorkout | undefined {
  if (!isObject(value) || !isText(value.sessionTemplateId)) {
    return undefined;
  }
  const frequency = readFrequency(value.frequency);
  if (!frequency || !isDateKey(value.startDate) || !isDateKey(value.endDate)) {
    return undefined;
  }
  return {
    sessionTemplateId: value.sessionTemplateId,
    frequency,
    startDate: value.startDate,
    endDate: value.endDate
  };
}

/**
 * One row from a backup file or the account, which nothing here trusts. A row
 * that cannot say where the injury is, or which side, is dropped. A damaged
 * optional field is dropped on its own, so it does not cost the injury.
 */
export function readInjury(value: unknown): Injury | undefined {
  if (!isObject(value) || !isText(value.id) || !isDateKey(value.startDate)) {
    return undefined;
  }
  const { place, side } = value;
  if (typeof place !== "string" || !PLACE_IDS.has(place)) {
    return undefined;
  }
  const known = place as InjuryPlace;
  const middle = INJURY_PLACES[known].middle;
  if (!middle && (typeof side !== "string" || !SIDES.has(side))) {
    return undefined;
  }
  const workout = readWorkout(value.workout);
  return {
    id: value.id,
    place: known,
    ...(middle ? {} : { side: side as InjurySide }),
    startDate: value.startDate,
    ...(isText(value.worseWith) ? { worseWith: value.worseWith } : {}),
    ...(value.stopSign === true ? { stopSign: true } : {}),
    ...(isDateKey(value.healedDate) ? { healedDate: value.healedDate } : {}),
    ...(workout ? { workout } : {})
  };
}

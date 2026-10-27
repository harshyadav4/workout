/**
 * "Build with AI": the JSON an outside assistant hands back, and how it becomes
 * sessions, a schedule and exercise templates in this app.
 *
 * The flow: the app gives the user a prompt (lib/ai-prompt.ts), the assistant
 * interviews them and replies with one JSON object in the shape below, the user
 * pastes it back, and this module checks it, matches every exercise against the
 * library in public/exercises.json, and builds the store objects.
 *
 * Pure: the library, today's date and the user's existing state are passed in,
 * so every rule here is testable without React or a network.
 */
import { deriveEngagement, type Exercise } from "@/lib/exercises";
import { REST_SLOT } from "@/lib/schedule";
import { addDays, dateKey } from "@/lib/utils";
import type {
  MuscleId,
  ProgressionRule,
  ProgressionSettings,
  ScheduleConfig,
  SessionTemplate,
  SessionTemplateExercise,
  WorkoutMuscleTarget,
  WorkoutTemplate
} from "@/lib/types";
import { buildSessionSummary } from "@/lib/workout-helpers";

export const AI_PLAN_VERSION = "sessions/v1";

// ---------------------------------------------------------------------------
// The format
// ---------------------------------------------------------------------------

export interface AiExercise {
  /** Ideally an exact name from the library list in the prompt. */
  name: string;
  /** One of the library's equipment words. Narrows the match. */
  equipment?: string;
  /** One of the library's target words. Narrows the match, and gives an
   *  exercise that is not in the library its muscles. */
  target?: string;
  sets: number;
  /** Absent on a held set, which uses `seconds`. */
  reps?: number;
  /** Present on a held set: plank, carry, wall sit. On a run, the time to cover `distanceKm`. */
  seconds?: number;
  /** Present on a run, ride or row: kilometres per set, with `seconds` for the time. Never with `reps`. */
  distanceKm?: number;
  weightKg?: number;
  /** Per-set weights, when they ramp. Length should equal `sets`. */
  weightsKg?: number[];
  restSeconds?: number;
  /** Lunges, single-arm rows: `reps` is the total across both sides. */
  perSide?: boolean;
  notes?: string;
  /** A public .gif demo, only for an exercise that is not in the library. */
  gifUrl?: string;
}

export interface AiSession {
  name: string;
  progression?: ProgressionRule;
  exercises: AiExercise[];
}

export type Weekday = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";
export const WEEKDAYS: Weekday[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export interface AiSchedule {
  startDate?: string;
  endDate?: string;
  /** Defaults to "weekly" when `days` is present, "rotation" when `rotation` is. */
  mode?: "weekly" | "rotation";
  /** Weekday → a session name from `sessions`, or "rest". */
  days?: Partial<Record<Weekday, string>>;
  /** Session names in order, one per training day, looping. */
  rotation?: string[];
  restDays?: Weekday[];
}

export interface AiPlan {
  sessions: AiSession[];
  schedule?: AiSchedule;
}

export class AiPlanError extends Error {}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * The JSON object inside whatever was pasted. Assistants wrap their answer in a
 * ```json fence, or put a sentence before it; both are tolerated. Anything else
 * is an error that names what was wrong.
 */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new AiPlanError("Nothing was pasted.");
  }
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  const body = fenced ? fenced[1] : trimmed;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new AiPlanError("No JSON object found. Copy the whole block the AI gave you.");
  }
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    throw new AiPlanError(
      "The JSON is incomplete or broken. Ask the AI to send the full JSON again, in one code block."
    );
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function positive(value: unknown, path: string, { whole = true, allowZero = false } = {}) {
  const number = typeof value === "string" ? Number(value) : value;
  if (typeof number !== "number" || !Number.isFinite(number) || number < 0 || (!allowZero && number === 0)) {
    throw new AiPlanError(`${path} must be a ${allowZero ? "" : "positive "}number.`);
  }
  const rounded = whole ? Math.round(number) : Math.round(number * 4) / 4;
  // Checked after rounding: 0.4 sets passed the check above and became 0.
  if (!allowZero && rounded === 0) {
    throw new AiPlanError(`${path} must be a positive number.`);
  }
  return rounded;
}

/**
 * Kilometres on a run: a positive decimal, two places, at most 100. Not
 * `positive()`, which rounds to a quarter — a 0.4 km interval must stay 0.4.
 */
function parseDistance(value: unknown, path: string): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const number = typeof value === "string" ? Number(value) : value;
  if (typeof number !== "number" || !Number.isFinite(number) || number <= 0) {
    throw new AiPlanError(`${path} must be a positive number of kilometres.`);
  }
  return Math.min(Math.round(number * 100) / 100, 100);
}

function optionalText(value: unknown, path: string): string | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new AiPlanError(`${path} must be text.`);
  }
  return value.trim() || undefined;
}

const RULES: ProgressionRule[] = ["off", "linear", "double", "time"];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseExercise(raw: unknown, path: string): AiExercise {
  if (!isRecord(raw)) {
    throw new AiPlanError(`${path} must be an object.`);
  }
  const name = optionalText(raw.name, `${path}.name`);
  if (!name) {
    throw new AiPlanError(`${path}.name is missing.`);
  }
  const label = `${path} ("${name}")`;
  const sets = positive(raw.sets, `${label}.sets`);
  const seconds = raw.seconds === undefined || raw.seconds === null ? undefined : positive(raw.seconds, `${label}.seconds`);
  const reps = raw.reps === undefined || raw.reps === null ? undefined : positive(raw.reps, `${label}.reps`);
  const distanceKm = parseDistance(raw.distanceKm, `${label}.distanceKm`);
  if (distanceKm !== undefined && seconds === undefined) {
    throw new AiPlanError(`${label} has distanceKm, so it also needs seconds: the time for that distance.`);
  }
  if (seconds === undefined && reps === undefined) {
    throw new AiPlanError(`${label} needs either reps or seconds.`);
  }
  const weightsKg =
    Array.isArray(raw.weightsKg) && raw.weightsKg.length > 0
      ? raw.weightsKg.map((value, index) =>
          positive(value, `${label}.weightsKg[${index}]`, { whole: false, allowZero: true })
        )
      : undefined;
  const gifUrl = optionalText(raw.gifUrl, `${label}.gifUrl`);

  return {
    name,
    equipment: optionalText(raw.equipment, `${label}.equipment`)?.toLowerCase(),
    target: optionalText(raw.target, `${label}.target`)?.toLowerCase(),
    sets: Math.min(sets, 20),
    reps: seconds === undefined ? Math.min(reps ?? 1, 100) : undefined,
    seconds: seconds === undefined ? undefined : Math.min(seconds, distanceKm === undefined ? 3600 : 6 * 3600),
    distanceKm,
    weightKg:
      raw.weightKg === undefined || raw.weightKg === null
        ? undefined
        : positive(raw.weightKg, `${label}.weightKg`, { whole: false, allowZero: true }),
    weightsKg,
    restSeconds:
      raw.restSeconds === undefined || raw.restSeconds === null
        ? undefined
        : positive(raw.restSeconds, `${label}.restSeconds`, { allowZero: true }),
    perSide: raw.perSide === true ? true : undefined,
    notes: optionalText(raw.notes, `${label}.notes`),
    // GIF only, https only. Anything else is dropped here rather than fetched.
    gifUrl: gifUrl && /^https:\/\/\S+$/i.test(gifUrl) ? gifUrl : undefined
  };
}

function parseWeekday(value: unknown, path: string): Weekday {
  const day = typeof value === "string" ? value.trim().toLowerCase().slice(0, 3) : "";
  if (!(WEEKDAYS as string[]).includes(day)) {
    throw new AiPlanError(`${path} must be a weekday like "mon".`);
  }
  return day as Weekday;
}

function parseSchedule(raw: unknown, sessionNames: Set<string>): AiSchedule | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }
  if (!isRecord(raw)) {
    throw new AiPlanError("schedule must be an object.");
  }
  const date = (value: unknown, path: string) => {
    if (value === undefined || value === null || value === "") {
      return undefined;
    }
    if (typeof value !== "string" || !DATE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
      throw new AiPlanError(`${path} must be a date like 2026-11-02.`);
    }
    return value;
  };
  const known = (name: unknown, path: string) => {
    const text = typeof name === "string" ? name.trim() : "";
    if (text.toLowerCase() === "rest") {
      return "rest";
    }
    const match = [...sessionNames].find((item) => normalize(item) === normalize(text));
    if (!match) {
      throw new AiPlanError(`${path} names "${text}", which is not one of the sessions.`);
    }
    return match;
  };

  let days: AiSchedule["days"];
  if (raw.days !== undefined) {
    if (!isRecord(raw.days)) {
      throw new AiPlanError("schedule.days must map weekdays to session names.");
    }
    days = {};
    for (const [key, value] of Object.entries(raw.days)) {
      if (value === null || value === "" || value === undefined) {
        continue;
      }
      days[parseWeekday(key, `schedule.days.${key}`)] = known(value, `schedule.days.${key}`);
    }
  }
  // "rest" stays in: a 3-on-1-off split is ["Push", "Pull", "Legs", "rest"],
  // and dropping the slot put a workout on every calendar day.
  const rotation = Array.isArray(raw.rotation)
    ? raw.rotation.map((item, index) => known(item, `schedule.rotation[${index}]`))
    : undefined;
  const restDays = Array.isArray(raw.restDays)
    ? raw.restDays.map((item, index) => parseWeekday(item, `schedule.restDays[${index}]`))
    : undefined;
  const mode =
    raw.mode === "rotation" || raw.mode === "weekly"
      ? raw.mode
      : rotation?.length && !days
        ? "rotation"
        : "weekly";

  if (mode === "weekly" && (!days || !Object.values(days).some((item) => item !== "rest"))) {
    throw new AiPlanError("schedule.days must put at least one session on a weekday.");
  }
  if (mode === "rotation" && !rotation?.some((item) => item !== "rest")) {
    throw new AiPlanError("schedule.rotation must list at least one session.");
  }

  const startDate = date(raw.startDate, "schedule.startDate");
  const endDate = date(raw.endDate, "schedule.endDate");
  if (startDate && endDate && endDate < startDate) {
    throw new AiPlanError("schedule.endDate is before schedule.startDate.");
  }

  return { startDate, endDate, mode, days, rotation, restDays };
}

/** The pasted text, checked and normalised. Throws AiPlanError with a reason. */
export function parseAiPlan(text: string): AiPlan {
  const decoded = extractJson(text);
  if (!isRecord(decoded)) {
    throw new AiPlanError("The JSON must be an object with a sessions list.");
  }
  if (!Array.isArray(decoded.sessions) || decoded.sessions.length === 0) {
    throw new AiPlanError("The JSON has no sessions.");
  }
  if (decoded.sessions.length > 14) {
    throw new AiPlanError("That is more than 14 sessions. Ask the AI for a smaller plan.");
  }

  const seen = new Set<string>();
  const sessions = decoded.sessions.map((raw, index): AiSession => {
    const path = `sessions[${index}]`;
    if (!isRecord(raw)) {
      throw new AiPlanError(`${path} must be an object.`);
    }
    const name = optionalText(raw.name, `${path}.name`);
    if (!name) {
      throw new AiPlanError(`${path}.name is missing.`);
    }
    if (seen.has(normalize(name))) {
      throw new AiPlanError(`Two sessions are called "${name}". Each needs its own name.`);
    }
    seen.add(normalize(name));
    if (!Array.isArray(raw.exercises) || raw.exercises.length === 0) {
      throw new AiPlanError(`"${name}" has no exercises.`);
    }
    const progression =
      typeof raw.progression === "string" && (RULES as string[]).includes(raw.progression)
        ? (raw.progression as ProgressionRule)
        : undefined;
    const exercises = raw.exercises.map((item, exerciseIndex) =>
      parseExercise(item, `"${name}" exercise ${exerciseIndex + 1}`)
    );
    const names = new Set<string>();
    for (const exercise of exercises) {
      if (names.has(normalize(exercise.name))) {
        throw new AiPlanError(`"${name}" lists "${exercise.name}" twice.`);
      }
      names.add(normalize(exercise.name));
    }
    return { name, progression, exercises };
  });

  return {
    sessions,
    schedule: parseSchedule(decoded.schedule, new Set(sessions.map((session) => session.name)))
  };
}

// ---------------------------------------------------------------------------
// Matching against the library
// ---------------------------------------------------------------------------

export function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Shorthand people (and assistants) write, expanded to the library's words. */
const SYNONYMS: Record<string, string> = {
  db: "dumbbell",
  dumbbells: "dumbbell",
  bb: "barbell",
  kb: "kettlebell",
  ohp: "overhead press",
  rdl: "romanian deadlift",
  "pull up": "pull-up",
  pullup: "pull up",
  pushup: "push up",
  situp: "sit up",
  chinup: "chin up",
  ez: "ez barbell",
  bw: "body weight",
  bodyweight: "body weight",
  machine: "lever",
  lever: "lever",
  presses: "press",
  raises: "raise",
  curls: "curl",
  rows: "row",
  extensions: "extension",
  flyes: "fly",
  flys: "fly"
};

function tokens(value: string): string[] {
  return normalize(value)
    .split(" ")
    .flatMap((word) => normalize(SYNONYMS[word] ?? word).split(" "))
    .filter((word) => word && word !== "with" && word !== "the" && word !== "on" && word !== "and");
}

/** Shared words over all words, the two names' vocabularies combined. */
function similarity(a: string[], b: string[]): number {
  const left = new Set(a);
  const right = new Set(b);
  const shared = [...left].filter((word) => right.has(word)).length;
  const union = new Set([...left, ...right]).size;
  return union === 0 ? 0 : shared / union;
}

export type MatchStatus = "exact" | "close" | "check" | "none";

export interface ExerciseMatch {
  status: MatchStatus;
  /** The library exercise chosen, when any. */
  exercise?: Exercise;
  /** Up to three alternatives for the review screen, best first. */
  candidates: Exercise[];
}

/** At or above this, a fuzzy match is taken without asking. */
const AUTO = 0.75;
/** Below this, no candidate is worth showing. */
const FLOOR = 0.34;

/**
 * Exact (normalised) name first. Then a word-overlap score, preferring entries
 * with the same equipment and target when the assistant gave them. "close" is
 * accepted but marked, "check" waits for the user, "none" becomes a custom
 * exercise.
 */
export function matchExercise(item: AiExercise, library: Exercise[]): ExerciseMatch {
  const wanted = normalize(item.name);
  const exact = library.find((exercise) => normalize(exercise.name) === wanted);
  if (exact) {
    return { status: "exact", exercise: exact, candidates: [] };
  }

  const words = tokens(item.name);
  const scored = library
    .map((exercise) => {
      let score = similarity(words, tokens(exercise.name));
      if (item.equipment && exercise.equipment === item.equipment) score += 0.08;
      if (item.equipment && exercise.equipment !== item.equipment) score -= 0.12;
      if (item.target && exercise.target === item.target) score += 0.06;
      return { exercise, score };
    })
    .filter((entry) => entry.score >= FLOOR)
    .sort((a, b) => b.score - a.score || a.exercise.name.length - b.exercise.name.length);

  const candidates = scored.slice(0, 3).map((entry) => entry.exercise);
  if (scored.length === 0) {
    return { status: "none", candidates: [] };
  }
  if (scored[0].score >= AUTO) {
    return { status: "close", exercise: scored[0].exercise, candidates };
  }
  return { status: "check", candidates };
}

// ---------------------------------------------------------------------------
// Building the store objects
// ---------------------------------------------------------------------------

/** What the user decided on the review screen, per exercise. */
export interface ExerciseChoice {
  /** A library exercise, or undefined to import it as a custom one. */
  exercise?: Exercise;
}

export interface ImportOptions {
  library: Exercise[];
  /** Keyed `${sessionIndex}:${exerciseIndex}`. Missing keys use the matcher. */
  choices?: Record<string, ExerciseChoice>;
  /** Session names (as in the plan) that should overwrite the user's session of the same name. */
  replace?: Set<string>;
  /** Whether to apply the schedule, when the plan has one. */
  applySchedule?: boolean;
  existingTemplates: WorkoutTemplate[];
  existingSessions: SessionTemplate[];
  today: string;
}

export interface MediaRequest {
  templateId: string;
  url: string;
}

export interface PlanImport {
  /** New exercise templates to register. */
  templates: WorkoutTemplate[];
  /** Session templates; `replaces` is the id of the user's session it overwrites. */
  sessions: { template: SessionTemplate; replaces?: string }[];
  scheduleConfig?: ScheduleConfig;
  /** GIFs to fetch for exercises that are not in the library. */
  media: MediaRequest[];
}

export const choiceKey = (sessionIndex: number, exerciseIndex: number) =>
  `${sessionIndex}:${exerciseIndex}`;

function slug(value: string) {
  return normalize(value).replace(/[ /]+/g, "-") || "exercise";
}

const DEFAULT_REST = 90;
const DEFAULT_WEEKS = 8;

function muscleTargets(muscles: Partial<Record<MuscleId, number>>): WorkoutMuscleTarget[] {
  return Object.entries(muscles).map(([muscleId, engagement]) => ({
    muscleId: muscleId as MuscleId,
    engagement: engagement ?? 0
  }));
}

/** "Push" → "Push (AI)", "Push (AI 2)", … until it is free. */
function freeName(name: string, taken: Set<string>) {
  if (!taken.has(normalize(name))) {
    return name;
  }
  for (let n = 1; ; n += 1) {
    const candidate = n === 1 ? `${name} (AI)` : `${name} (AI ${n})`;
    if (!taken.has(normalize(candidate))) {
      return candidate;
    }
  }
}

export function buildPlanImport(plan: AiPlan, options: ImportOptions): PlanImport {
  const { library, choices = {}, replace = new Set(), existingTemplates, existingSessions, today } = options;
  const templates: WorkoutTemplate[] = [];
  const media: MediaRequest[] = [];
  const byName = new Map(existingTemplates.map((template) => [normalize(template.name), template]));

  /** Reuse a template with the same name, as the builder does; else register one. */
  const resolve = (item: AiExercise, chosen: Exercise | undefined): WorkoutTemplate => {
    const name = chosen ? chosen.name : item.name;
    const found = byName.get(normalize(name));
    if (found) {
      return found;
    }
    const engagement = chosen
      ? deriveEngagement(chosen)
      : deriveEngagement({ name: item.name, target: item.target ?? "", secondary: [] });
    const template: WorkoutTemplate = chosen
      ? {
          id: `db-${chosen.id}`,
          dbId: chosen.id,
          name: chosen.name,
          category: chosen.bodyPart,
          equipment: chosen.equipment,
          isPreset: false,
          muscles: muscleTargets(engagement)
        }
      : {
          id: `custom-${slug(item.name)}`,
          name: item.name,
          category: "Custom",
          equipment: item.equipment,
          isPreset: false,
          muscles: muscleTargets(engagement)
        };
    template.defaultSets = [
      {
        sets: item.sets,
        reps: item.reps ?? 0,
        weight: item.weightKg ?? 0,
        restSeconds: item.restSeconds ?? DEFAULT_REST
      }
    ];
    byName.set(normalize(template.name), template);
    templates.push(template);
    if (!chosen && item.gifUrl) {
      media.push({ templateId: template.id, url: item.gifUrl });
    }
    return template;
  };

  const sessionNames = new Map(existingSessions.map((session) => [normalize(session.name), session]));
  const taken = new Set(existingSessions.map((session) => normalize(session.name)));
  // Ids too: "Push" imported, renamed in Build (the id stays), "Push" imported
  // again at the same index would land on the same id as the renamed one.
  const takenIds = new Set(existingSessions.map((session) => session.id));
  const freeId = (base: string) => {
    let id = base;
    for (let n = 2; takenIds.has(id); n += 1) {
      id = `${base}-${n}`;
    }
    takenIds.add(id);
    return id;
  };
  const nameInApp = new Map<string, string>();
  const idInApp = new Map<string, string>();

  const sessions = plan.sessions.map((session, sessionIndex) => {
    const exercises: SessionTemplateExercise[] = session.exercises.map((item, exerciseIndex) => {
      const key = choiceKey(sessionIndex, exerciseIndex);
      const chosen = key in choices ? choices[key].exercise : matchExercise(item, library).exercise;
      const template = resolve(item, chosen);
      // A run carries distance and seconds; a hold only seconds. Both have no reps.
      const isDistance = item.distanceKm !== undefined;
      const isTime = item.seconds !== undefined;
      const weights =
        item.weightsKg && item.weightsKg.some((value) => value !== item.weightsKg?.[0])
          ? Array.from({ length: item.sets }, (_, index) => item.weightsKg?.[index] ?? item.weightKg ?? 0)
          : undefined;
      const reps = isTime ? 0 : item.reps ?? 1;
      return {
        id: `ai-${sessionIndex}-${exerciseIndex}-${slug(template.name)}`,
        workoutId: template.id,
        name: template.name,
        muscles: template.muscles,
        sets: item.sets,
        // Per-side targets stay even, as the builder enforces. See lib/per-side.
        reps: item.perSide && reps % 2 === 1 ? reps + 1 : reps,
        weight: item.weightKg ?? item.weightsKg?.[0] ?? 0,
        weights,
        restSeconds: item.restSeconds ?? DEFAULT_REST,
        notes: item.notes,
        metric: isDistance ? "distance" : isTime ? "time" : undefined,
        durationSeconds: isTime ? item.seconds : undefined,
        distanceKm: isDistance ? item.distanceKm : undefined,
        perSide: item.perSide
      };
    });

    const existing = sessionNames.get(normalize(session.name));
    const replaces = existing && replace.has(session.name) ? existing.id : undefined;
    const name = replaces ? existing!.name : freeName(session.name, taken);
    taken.add(normalize(name));

    const progression: ProgressionSettings | undefined =
      session.progression && session.progression !== "off" ? { rule: session.progression } : undefined;
    const draft: SessionTemplate = {
      id: replaces ?? freeId(`session-ai-${slug(name)}-${sessionIndex}`),
      name,
      workoutIds: exercises.map((exercise) => exercise.workoutId),
      exercises,
      progression,
      summary: { totalSets: 0, totalReps: 0, totalWeight: 0 }
    };
    draft.summary = buildSessionSummary(draft);
    nameInApp.set(session.name, name);
    idInApp.set(session.name, draft.id);
    return { template: draft, replaces };
  });

  let scheduleConfig: ScheduleConfig | undefined;
  if (plan.schedule && options.applySchedule !== false) {
    const schedule = plan.schedule;
    const startDate = schedule.startDate && schedule.startDate >= today ? schedule.startDate : today;
    const endDate =
      schedule.endDate && schedule.endDate >= startDate
        ? schedule.endDate
        : dateKey(addDays(new Date(`${startDate}T00:00:00`), DEFAULT_WEEKS * 7));
    const weekly: Record<number, string> = {};
    const restWeekdays = new Set<number>((schedule.restDays ?? []).map((day) => WEEKDAYS.indexOf(day)));
    for (const [day, value] of Object.entries(schedule.days ?? {})) {
      const index = WEEKDAYS.indexOf(day as Weekday);
      if (value === "rest") {
        restWeekdays.add(index);
      } else if (value && idInApp.has(value)) {
        weekly[index] = idInApp.get(value)!;
        restWeekdays.delete(index);
      }
    }
    scheduleConfig = {
      startDate,
      endDate,
      mode: schedule.mode ?? "weekly",
      weekly: schedule.mode === "rotation" ? {} : weekly,
      rotationOrder:
        schedule.mode === "rotation"
          ? (schedule.rotation ?? [])
              .map((name) => (name === "rest" ? REST_SLOT : idInApp.get(name)))
              .filter((id): id is string => Boolean(id))
          : [],
      restWeekdays: [...restWeekdays].sort()
    };
  }

  return { templates, sessions, scheduleConfig, media };
}

import { deriveEngagement } from "@/lib/exercises";
import { daysBetween, shiftKey, weekStartKey } from "@/lib/progress-metrics";
import { presetWorkouts } from "@/lib/seed-data";
import { SKILL_TEMPLATES } from "@/lib/skills";
import type { SyncableState } from "@/lib/sync";
import type {
  BodyMeasurement,
  BodyMetric,
  MuscleId,
  PlannedExercise,
  ScheduleConfig,
  ScheduledSession,
  SessionTemplate,
  SessionTemplateExercise,
  SetLog,
  SkillGoal,
  WorkoutLog,
  WorkoutTemplate
} from "@/lib/types";
import { buildLogFromSession } from "@/lib/workout-helpers";

/**
 * The tour's sample account: "Alex", six months into a sensible programme.
 *
 * Every page has something true to show — a session waiting today, a streak
 * with one honest gap, steady progress with records along the way, a weight
 * goal on its way, runs getting faster, a skill half-climbed, and one weak spot
 * (core) for the advice cards to name. Built relative to `today`, so it never
 * goes stale, and from a fixed seed, so the same day always gives the same
 * numbers. Logs and sets come out of `buildLogFromSession`, the code Finish
 * runs, so their shape is the real one.
 *
 * Never stored and never synced: the tour sandbox holds it (features/tour).
 */

export const DEMO_WEEKS = 26;

/** How many weeks back the one missed week is. The streak runs from after it. */
export const DEMO_MISSED_WEEK = 10;

export const DEMO_PROFILE = {
  name: "Alex Carter",
  email: "alex@example.com",
  heightCm: 178,
  goalWeightKg: 76,
  // The Science tab's sex-specific cards (body fat, standards, DOTS, calories)
  // need these; without them the tour would show a tab of "set X on You".
  birthYear: 1994,
  sex: "male"
} as const;

const PREFIX = "demo-";

// -- the programme -------------------------------------------------------------

interface Lift {
  workoutId: string;
  sets: number;
  reps: number;
  /** Weight at the start of the six months. */
  start: number;
  /** Fractional gain over the six months: 0.25 is +25%. */
  gain: number;
  step: number;
  restSeconds: number;
}

const lift = (workoutId: string, sets: number, reps: number, start: number, gain: number, step = 2.5, restSeconds = 90): Lift => ({
  workoutId,
  sets,
  reps,
  start,
  gain,
  step,
  restSeconds
});

type SplitKey = "push" | "pull" | "legs" | "upper";

const SPLITS: Record<SplitKey, { name: string; lifts: Lift[] }> = {
  push: {
    name: "Push",
    lifts: [
      lift("bench-press", 4, 5, 62.5, 0.26, 2.5, 150),
      lift("incline-db-press", 4, 8, 20, 0.3, 2),
      lift("shoulder-press", 4, 6, 35, 0.25, 2.5, 120),
      lift("lateral-raise", 4, 12, 7, 0.28, 1, 45),
      lift("triceps-pushdown", 3, 10, 22.5, 0.33, 2.5, 60)
    ]
  },
  pull: {
    name: "Pull",
    lifts: [
      lift("barbell-row", 4, 6, 50, 0.3, 2.5, 120),
      lift("lat-pulldown", 3, 10, 45, 0.28, 2.5),
      lift("face-pull", 3, 15, 17.5, 0.28, 2.5, 60),
      lift("biceps-curl", 3, 10, 10, 0.4, 1, 60)
    ]
  },
  legs: {
    name: "Legs",
    lifts: [
      lift("back-squat", 4, 5, 70, 0.3, 2.5, 180),
      lift("romanian-deadlift", 3, 8, 65, 0.3, 2.5, 120),
      lift("leg-press", 3, 10, 110, 0.32, 5, 120),
      lift("standing-calf-raise", 4, 10, 50, 0.3, 2.5, 60)
    ]
  },
  upper: {
    name: "Upper",
    lifts: [
      lift("chest-supported-row", 3, 8, 35, 0.3, 2.5),
      lift("cable-fly", 4, 12, 12.5, 0.3, 2.5, 75),
      lift("overhead-triceps-ext", 3, 10, 17.5, 0.3, 2.5, 60),
      lift("incline-db-curl", 3, 10, 8, 0.35, 1, 60),
      // Two sets, on purpose: core is the one group under its goal, so the
      // Muscles ring and the advice cards have a real finding to show.
      lift("cable-crunch", 2, 12, 25, 0.3, 2.5, 60)
    ]
  }
};

type DayPlan = SplitKey | "run" | "rest";

/** Sunday first, as `getUTCDay` counts. Four lifting days, two runs, one rest. */
const WEEK: DayPlan[] = ["run", "push", "pull", "run", "legs", "rest", "upper"];

const RUN_ID = "db-0685";

/** The pull-up ladder, from the ready-made skills. Alex is on level 4, chin-ups. */
const PULL_UP = SKILL_TEMPLATES.find((skill) => skill.key === "pull-up")!;

/**
 * Library exercises the sample uses, written in rather than loaded: the tour
 * must work offline, the first time, before the library has ever downloaded.
 * Fields as in public/exercises.json.
 */
const LIBRARY: Record<string, { name: string; bodyPart: string; equipment: string; target: string; secondary: string[] }> = {
  "0685": { name: "Run", bodyPart: "cardio", equipment: "body weight", target: "cardiovascular system", secondary: ["quadriceps", "hamstrings", "calves"] },
  "0688": { name: "Scapular pull-up", bodyPart: "back", equipment: "body weight", target: "traps", secondary: ["biceps", "rhomboids", "rear deltoids"] },
  "0499": { name: "Inverted row", bodyPart: "back", equipment: "body weight", target: "upper back", secondary: ["biceps", "forearms"] },
  "0970": { name: "Band-assisted pull-up", bodyPart: "back", equipment: "band", target: "lats", secondary: ["biceps", "forearms"] },
  "1326": { name: "Chin-up", bodyPart: "back", equipment: "body weight", target: "lats", secondary: ["biceps", "forearms"] }
};

function libraryTemplate(datasetId: string): WorkoutTemplate {
  const entry = LIBRARY[datasetId];
  return {
    id: `db-${datasetId}`,
    dbId: datasetId,
    name: entry.name,
    category: entry.bodyPart,
    equipment: entry.equipment,
    isPreset: false,
    muscles: Object.entries(deriveEngagement(entry)).map(([muscleId, engagement]) => ({
      muscleId: muscleId as MuscleId,
      engagement: engagement ?? 0
    }))
  };
}

/** The non-preset exercises the sample adds: the run and the skill rungs. */
export const DEMO_TEMPLATES: WorkoutTemplate[] = ["0685", "0688", "0499", "0970", "1326"].map(libraryTemplate);

const PRESETS = new Map(presetWorkouts.map((workout) => [workout.id, workout]));

function templateOf(workoutId: string): WorkoutTemplate {
  const found = PRESETS.get(workoutId) ?? DEMO_TEMPLATES.find((item) => item.id === workoutId);
  if (!found) {
    throw new Error(`Sample data names an unknown exercise: ${workoutId}`);
  }
  return found;
}

// -- the story -----------------------------------------------------------------

/** Deterministic noise in [0, 1): FNV-1a over a string, as in scripts/seed-year. */
function noise(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 1000) / 1000;
}

function weekday(date: string) {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

function round(value: number, step: number) {
  return Math.round(value / step) * step;
}

interface Calendar {
  start: string;
  today: string;
  missedStart: string;
  missedEnd: string;
}

/** 0 at the start of the six months, 1 today. */
function progressAt(calendar: Calendar, date: string) {
  return Math.min(1, Math.max(0, daysBetween(calendar.start, date) / (DEMO_WEEKS * 7)));
}

function inMissedWeek(calendar: Calendar, date: string) {
  return date >= calendar.missedStart && date <= calendar.missedEnd;
}

/** The week after the break comes back 10% lighter — a real return, not a straight line. */
function deload(calendar: Calendar, date: string) {
  const after = shiftKey(calendar.missedEnd, 1);
  return date >= after && date <= shiftKey(after, 6) ? 0.9 : 1;
}

function weightOn(calendar: Calendar, item: Lift, date: string) {
  const grown = item.start * (1 + item.gain * progressAt(calendar, date));
  return round(grown * deload(calendar, date), item.step);
}

/** Double progression: reps climb for a few weeks, then the weight steps up. */
function repsOn(calendar: Calendar, item: Lift, date: string) {
  const week = Math.floor(daysBetween(calendar.start, date) / 7);
  return item.reps + (week % 3);
}

/** Bodyweight on a date: down from 82.4 kg, with a little day-to-day water. */
function bodyweightOn(calendar: Calendar, date: string) {
  const weeks = daysBetween(calendar.start, date) / 7;
  return Math.round((82.4 - 0.14 * weeks + (noise(`bw-${date}`) - 0.5) * 0.8) * 10) / 10;
}

/** Which pull-up rung is worked on in a given week back, and the reps that week. */
function skillWork(weeksBack: number): { level: number; reps: number } | undefined {
  if (weeksBack >= 11 && weeksBack <= 13) {
    return { level: 0, reps: 6 + (13 - weeksBack) }; // clears 3 × 8 on the last week
  }
  if (weeksBack >= 7 && weeksBack <= 9) {
    return { level: 1, reps: 8 + (9 - weeksBack) }; // clears 3 × 10
  }
  if (weeksBack >= 4 && weeksBack <= 6) {
    return { level: 2, reps: 6 + (6 - weeksBack) }; // clears 3 × 8
  }
  if (weeksBack >= 0 && weeksBack <= 3) {
    return { level: 3, reps: weeksBack >= 2 ? 2 : 3 }; // chin-ups: 3 of 5, in progress
  }
  return undefined;
}

// -- sessions --------------------------------------------------------------------

function liftExercise(calendar: Calendar, date: string, item: Lift, done: boolean, clock: { at: number }): PlannedExercise {
  const template = templateOf(item.workoutId);
  const weight = weightOn(calendar, item, date);
  const reps = repsOn(calendar, item, date);
  return {
    id: `${PREFIX}${date}-${item.workoutId}`,
    workoutId: item.workoutId,
    templateName: template.name,
    restSeconds: item.restSeconds,
    sets: Array.from({ length: item.sets }, (_, index) => {
      // About a minute under the bar, then the rest. Milliseconds.
      clock.at += (60 + item.restSeconds) * 1000;
      return {
        id: `${PREFIX}${date}-${item.workoutId}-s${index + 1}`,
        // The last set is a rep short now and then, as real last sets are.
        reps: index === item.sets - 1 && noise(`${date}-${item.workoutId}`) < 0.3 ? reps - 1 : reps,
        weight,
        type: "normal" as const,
        completed: done,
        completedAt: done ? new Date(clock.at).toISOString() : undefined,
        // Rated like a lifter who leaves a little in the tank until the last
        // set: the effective-reps card has something to count.
        rir: done ? (index === item.sets - 1 ? 1 : 2) : undefined,
        previousReps: reps,
        previousWeight: weight
      };
    })
  };
}

function skillExercise(date: string, weeksBack: number, done: boolean, clock: { at: number }): PlannedExercise | undefined {
  const work = skillWork(weeksBack);
  if (!work) {
    return undefined;
  }
  const level = PULL_UP.levels[work.level];
  return {
    id: `${PREFIX}${date}-${level.workoutId}`,
    workoutId: level.workoutId,
    templateName: level.name,
    restSeconds: 90,
    sets: Array.from({ length: level.sets }, (_, index) => {
      clock.at += 150 * 1000;
      return {
        id: `${PREFIX}${date}-${level.workoutId}-s${index + 1}`,
        reps: work.reps,
        weight: 0,
        type: "normal" as const,
        completed: done,
        completedAt: done ? new Date(clock.at).toISOString() : undefined
      };
    })
  };
}

function liftingSession(calendar: Calendar, date: string, key: SplitKey): ScheduledSession {
  const done = date < calendar.today;
  const weeksBack = Math.floor(daysBetween(date, calendar.today) / 7);
  // Evenings, a few minutes either side of 17:30 UTC.
  const start = Date.parse(`${date}T17:30:00.000Z`) + Math.round(noise(`start-${date}`) * 20) * 60 * 1000;
  const clock = { at: start };
  const exercises = SPLITS[key].lifts.map((item) => liftExercise(calendar, date, item, done, clock));
  const skill = key === "pull" ? skillExercise(date, weeksBack, done, clock) : undefined;
  if (skill) {
    exercises.push(skill);
  }

  return {
    id: `${PREFIX}${date}`,
    date,
    dayIndex: weekday(date),
    sessionTemplateId: `${PREFIX}tpl-${key}`,
    sessionName: SPLITS[key].name,
    exercises,
    type: "workout",
    status: done ? "completed" : "planned",
    source: "repeat",
    ...(done
      ? { startedAt: new Date(start).toISOString(), finishedAt: new Date(clock.at + 2 * 60 * 1000).toISOString() }
      : {})
  };
}

function runSession(calendar: Calendar, date: string): ScheduledSession {
  const done = date < calendar.today;
  const long = weekday(date) === 0;
  const km = long ? 7 : 5;
  // Pace from 6:10 to 5:25 per km over the six months, a few seconds of day-to-day noise.
  const pace = 370 - 45 * progressAt(calendar, date) + (noise(`pace-${date}`) - 0.5) * 12;
  const seconds = Math.round(km * pace);
  const start = Date.parse(`${date}T06:45:00.000Z`);

  return {
    id: `${PREFIX}${date}-run`,
    date,
    dayIndex: weekday(date),
    sessionTemplateId: `${PREFIX}tpl-run`,
    sessionName: long ? "Long run" : "Easy run",
    exercises: [
      {
        id: `${PREFIX}${date}-${RUN_ID}`,
        workoutId: RUN_ID,
        templateName: "Run",
        metric: "distance",
        sets: [
          {
            id: `${PREFIX}${date}-${RUN_ID}-s1`,
            reps: 0,
            weight: 0,
            distanceKm: km,
            durationSeconds: seconds,
            type: "normal",
            completed: done,
            completedAt: done ? new Date(start + seconds * 1000).toISOString() : undefined
          }
        ]
      }
    ],
    type: "workout",
    status: done ? "completed" : "planned",
    source: "repeat",
    ...(done
      ? { startedAt: new Date(start).toISOString(), finishedAt: new Date(start + seconds * 1000).toISOString() }
      : {})
  };
}

function restSession(date: string): ScheduledSession {
  return {
    id: `${PREFIX}${date}-rest`,
    date,
    dayIndex: weekday(date),
    sessionName: "Rest Day",
    exercises: [],
    type: "rest",
    status: "planned",
    source: "repeat"
  };
}

function sessionTemplates(calendar: Calendar): SessionTemplate[] {
  const keys = Object.keys(SPLITS) as SplitKey[];
  const lifting = keys.map((key) => {
    const exercises: SessionTemplateExercise[] = SPLITS[key].lifts.map((item) => {
      const template = templateOf(item.workoutId);
      return {
        id: `${PREFIX}tpl-${key}-${item.workoutId}`,
        workoutId: item.workoutId,
        name: template.name,
        muscles: template.muscles,
        sets: item.sets,
        reps: item.reps,
        weight: weightOn(calendar, item, calendar.today),
        restSeconds: item.restSeconds
      };
    });
    return {
      id: `${PREFIX}tpl-${key}`,
      name: SPLITS[key].name,
      workoutIds: exercises.map((exercise) => exercise.workoutId),
      exercises,
      summary: exercises.reduce(
        (totals, exercise) => ({
          totalSets: totals.totalSets + exercise.sets,
          totalReps: totals.totalReps + exercise.sets * exercise.reps,
          totalWeight: totals.totalWeight + exercise.sets * exercise.weight
        }),
        { totalSets: 0, totalReps: 0, totalWeight: 0 }
      )
    };
  });

  const run = templateOf(RUN_ID);
  return [
    ...lifting,
    {
      id: `${PREFIX}tpl-run`,
      name: "Easy run",
      workoutIds: [RUN_ID],
      exercises: [
        {
          id: `${PREFIX}tpl-run-${RUN_ID}`,
          workoutId: RUN_ID,
          name: run.name,
          muscles: run.muscles,
          sets: 1,
          reps: 0,
          weight: 0,
          restSeconds: 0,
          metric: "distance",
          distanceKm: 5,
          durationSeconds: 5 * 330
        }
      ],
      summary: { totalSets: 1, totalReps: 0, totalWeight: 0 }
    }
  ];
}

// -- body ------------------------------------------------------------------------

/** Monthly tape: waist slowly down, chest, shoulders and arms slowly up. Left arm a touch smaller. */
const TAPE: { metric: BodyMetric; start: number; perWeek: number }[] = [
  { metric: "neck", start: 39.2, perWeek: -0.02 },
  { metric: "waist", start: 88, perWeek: -0.12 },
  { metric: "hips", start: 97, perWeek: -0.05 },
  { metric: "chest", start: 101, perWeek: 0.05 },
  { metric: "shoulders", start: 116, perWeek: 0.06 },
  { metric: "armL", start: 35.4, perWeek: 0.05 },
  { metric: "armR", start: 35.9, perWeek: 0.05 },
  { metric: "thighL", start: 57.5, perWeek: 0.04 },
  { metric: "thighR", start: 57.8, perWeek: 0.04 }
];

function measurements(calendar: Calendar): BodyMeasurement[] {
  const rows: BodyMeasurement[] = [];
  for (let date = calendar.start; date < calendar.today; date = shiftKey(date, 1)) {
    const day = weekday(date);
    // Weighs in Sunday and Wednesday mornings.
    if (day === 0 || day === 3) {
      rows.push({ id: `${PREFIX}m-${date}-weight`, date, metric: "weight", value: bodyweightOn(calendar, date) });
    }
    // Tape every fourth Sunday.
    const weeks = daysBetween(calendar.start, date) / 7;
    if (day === 0 && Math.floor(weeks) % 4 === 0) {
      TAPE.forEach(({ metric, start, perWeek }) => {
        rows.push({
          id: `${PREFIX}m-${date}-${metric}`,
          date,
          metric,
          value: Math.round((start + perWeek * weeks) * 10) / 10
        });
      });
    }
  }
  return rows;
}

// -- assembly --------------------------------------------------------------------

export type DemoState = SyncableState;

/**
 * The whole sample account for `today` (YYYY-MM-DD). `templates` holds only
 * the exercises the sample adds; the presets are already in every store.
 */
export function buildDemoState(today: string): DemoState {
  const thisWeek = weekStartKey(today);
  const missedStart = shiftKey(thisWeek, -7 * DEMO_MISSED_WEEK);
  const calendar: Calendar = {
    start: shiftKey(thisWeek, -7 * DEMO_WEEKS),
    today,
    missedStart,
    missedEnd: shiftKey(missedStart, 6)
  };

  const sessions: ScheduledSession[] = [];
  for (let date = calendar.start; date <= shiftKey(today, 7); date = shiftKey(date, 1)) {
    if (date < today && inMissedWeek(calendar, date)) {
      continue;
    }
    let plan = WEEK[weekday(date)];
    // Today is always a lifting day, so Home opens on a session ready to start.
    if (date === today && (plan === "run" || plan === "rest")) {
      plan = "upper";
    }
    if (plan === "rest") {
      sessions.push(restSession(date));
    } else if (plan === "run") {
      sessions.push(runSession(calendar, date));
    } else {
      sessions.push(liftingSession(calendar, date, plan));
    }
  }

  const allTemplates = [...presetWorkouts, ...DEMO_TEMPLATES];
  const logs: WorkoutLog[] = [];
  const setLogs: SetLog[] = [];
  sessions
    .filter((session) => session.status === "completed" && session.type === "workout")
    .forEach((session) => {
      const built = buildLogFromSession(session, allTemplates, bodyweightOn(calendar, session.date));
      logs.push(...built.logs);
      setLogs.push(...built.setLogs);
    });

  const body = measurements(calendar);
  const latestWeight = [...body].reverse().find((row) => row.metric === "weight")?.value ?? 0;

  const skillGoals: SkillGoal[] = [
    {
      id: `${PREFIX}skill-pull-up`,
      name: PULL_UP.name,
      templateKey: PULL_UP.key,
      levels: PULL_UP.levels.map((level) => ({ ...level })),
      createdAt: `${shiftKey(thisWeek, -7 * 14)}T12:00:00.000Z`
    }
  ];

  const scheduleConfig: ScheduleConfig = {
    startDate: calendar.start,
    endDate: shiftKey(today, 28),
    mode: "weekly",
    weekly: {
      0: `${PREFIX}tpl-run`,
      1: `${PREFIX}tpl-push`,
      2: `${PREFIX}tpl-pull`,
      3: `${PREFIX}tpl-run`,
      4: `${PREFIX}tpl-legs`,
      6: `${PREFIX}tpl-upper`
    },
    rotationOrder: [],
    restWeekdays: [5]
  };

  return {
    templates: DEMO_TEMPLATES,
    sessionTemplates: sessionTemplates(calendar),
    scheduledSessions: sessions,
    logs,
    setLogs,
    measurements: body,
    skillGoals,
    profile: {
      ...DEMO_PROFILE,
      weightKg: latestWeight,
      weightCadence: "weekly",
      measurementCadence: "monthly"
    },
    scheduleConfig
  };
}

/**
 * Skills: a goal like the pull-up or the handstand, climbed one exercise at a
 * time. A level is cleared by a logged session that hits its bar — every set
 * of `sets` at `target` reps or seconds — and nothing about progress is
 * stored: it is read off the logged sets each time, so it cannot drift from
 * what you actually did, and deleting a session un-clears what it cleared.
 */
import { datasetIdOf } from "@/lib/media";
import type { SetLog, SkillGoal, SkillLevel } from "@/lib/types";

const lib = (id: string, name: string, sets: number, target: number, metric: "reps" | "time" = "reps"): SkillLevel => ({
  workoutId: `db-${id}`,
  name,
  metric,
  sets,
  target
});

export interface SkillTemplate {
  key: string;
  name: string;
  /** One line under the name: what the top of the ladder is. */
  goal: string;
  levels: SkillLevel[];
}

/** The ready-made ladders, easiest first. Every exercise is in the library, with a demo. */
export const SKILL_TEMPLATES: SkillTemplate[] = [
  {
    key: "pull-up",
    name: "Pull-up",
    goal: "Archer pull-ups",
    levels: [
      lib("0688", "Scapular pull-up", 3, 8),
      lib("0499", "Inverted row", 3, 10),
      lib("0970", "Band-assisted pull-up", 3, 8),
      lib("1326", "Chin-up", 3, 5),
      lib("0652", "Pull-up", 3, 8),
      lib("3293", "Archer pull-up", 3, 5)
    ]
  },
  {
    key: "push-up",
    name: "Push-up",
    goal: "Archer push-ups",
    levels: [
      lib("0659", "Wall push-up", 3, 15),
      lib("0493", "Incline push-up", 3, 12),
      lib("0662", "Push-up", 3, 15),
      lib("0283", "Diamond push-up", 3, 10),
      lib("0279", "Decline push-up", 3, 12),
      lib("3294", "Archer push-up", 3, 6)
    ]
  },
  {
    key: "pistol",
    name: "Pistol squat",
    goal: "Pistol squats, 3 × 5",
    levels: [
      lib("3470", "Forward lunge", 3, 12),
      lib("2368", "Split squat", 3, 10),
      lib("1476", "One-leg squat", 3, 5),
      lib("1759", "Pistol squat", 3, 5)
    ]
  },
  {
    key: "handstand",
    name: "Handstand",
    goal: "Handstand push-ups",
    levels: [
      lib("2135", "Plank hold", 3, 45, "time"),
      lib("0279", "Decline push-up", 3, 10),
      lib("3302", "Handstand hold", 3, 20, "time"),
      lib("0471", "Handstand push-up", 3, 5)
    ]
  },
  {
    key: "l-sit",
    name: "L-sit",
    goal: "A 20-second L-sit",
    levels: [
      lib("0620", "Lying leg raise", 3, 12),
      lib("0011", "Hanging knee raise", 3, 10),
      lib("0472", "Hanging leg raise", 3, 10),
      lib("3419", "L-sit", 3, 20, "time")
    ]
  },
  {
    key: "muscle-up",
    name: "Muscle-up",
    goal: "Strict muscle-ups",
    levels: [
      lib("0652", "Pull-up", 3, 10),
      lib("0251", "Chest dip", 3, 10),
      lib("0558", "Kipping muscle-up", 3, 3),
      lib("0631", "Muscle-up", 3, 3)
    ]
  }
];

/** Is this logged row the level's exercise — the same id, or the same library entry? */
function isLevelExercise(row: SetLog, level: SkillLevel): boolean {
  if (row.workoutId === level.workoutId) {
    return true;
  }
  const wanted = datasetIdOf(level.workoutId);
  return wanted !== undefined && datasetIdOf(row.workoutId) === wanted;
}

function rowValue(row: SetLog, level: SkillLevel): number {
  return level.metric === "time" ? row.durationSeconds ?? 0 : row.reps;
}

export interface LevelResult {
  cleared: boolean;
  /** The first day it was cleared. */
  clearedOn?: string;
  /** Your best single set on it, in reps or seconds — the number to show against the target. */
  best: number;
}

/** Has any one logged session cleared this level? Sets from different days never add up. */
export function evaluateLevel(level: SkillLevel, setLogs: SetLog[]): LevelResult {
  const sessions = new Map<string, SetLog[]>();
  setLogs
    .filter((row) => isLevelExercise(row, level))
    .forEach((row) => sessions.set(row.logId, [...(sessions.get(row.logId) ?? []), row]));

  let best = 0;
  let clearedOn: string | undefined;
  sessions.forEach((rows) => {
    rows.forEach((row) => (best = Math.max(best, rowValue(row, level))));
    const good = rows.filter((row) => rowValue(row, level) >= level.target).length;
    if (good >= level.sets && (!clearedOn || rows[0].date < clearedOn)) {
      clearedOn = rows[0].date;
    }
  });

  return { cleared: clearedOn !== undefined, clearedOn, best };
}

export interface SkillProgress {
  /** Levels cleared — the highest one cleared, so starting strong skips the easy rungs. */
  level: number;
  total: number;
  mastered: boolean;
  /** The level being worked on now; absent once mastered. */
  current?: SkillLevel;
  currentIndex: number;
  /** Best single set on the current level, and how far that is toward its target (0–1). */
  best: number;
  ratio: number;
}

export function skillProgress(goal: SkillGoal, setLogs: SetLog[]): SkillProgress {
  const results = goal.levels.map((level) => evaluateLevel(level, setLogs));
  // Cleared a harder rung first? It counts: you are past everything below it.
  const highest = results.reduce((top, result, index) => (result.cleared ? index : top), -1);
  const level = highest + 1;
  const current = goal.levels[level];
  const best = current ? results[level].best : 0;

  return {
    level,
    total: goal.levels.length,
    mastered: level >= goal.levels.length,
    current,
    currentIndex: level,
    best,
    ratio: current ? Math.min(1, best / current.target) : 1
  };
}

/** Skills whose level went up between two histories — what Finish just earned. */
export function levelUps(goals: SkillGoal[], before: SetLog[], after: SetLog[]) {
  return goals
    .map((goal) => ({ goal, from: skillProgress(goal, before).level, to: skillProgress(goal, after) }))
    .filter(({ from, to }) => to.level > from)
    .map(({ goal, from, to }) => ({ goal, from, to: to.level, mastered: to.mastered, next: to.current }));
}

/** "3 × 8", "3 × 20s". */
export function levelTarget(level: SkillLevel): string {
  return `${level.sets} × ${level.target}${level.metric === "time" ? "s" : ""}`;
}

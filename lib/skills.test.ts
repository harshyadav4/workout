// Run with: npm run check
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { SKILL_TEMPLATES, evaluateLevel, levelTarget, levelUps, skillProgress } from "@/lib/skills";
import type { SetLog, SkillGoal } from "@/lib/types";

let n = 0;
const rows = (logId: string, date: string, workoutId: string, values: number[], metric: "reps" | "time" = "reps"): SetLog[] =>
  values.map((value, setIndex) => ({
    id: `x${(n += 1)}`,
    logId,
    workoutId,
    date,
    setIndex,
    reps: metric === "reps" ? value : 0,
    weight: 0,
    durationSeconds: metric === "time" ? value : undefined
  }));

const pullUp = SKILL_TEMPLATES.find((skill) => skill.key === "pull-up")!;
const goal: SkillGoal = { id: "g1", name: pullUp.name, templateKey: pullUp.key, levels: pullUp.levels, createdAt: "2026-10-01" };

// Nothing logged: level 0, working on the first rung.
const fresh = skillProgress(goal, []);
assert.deepEqual([fresh.level, fresh.current?.name, fresh.mastered], [0, "Scapular pull-up", false]);

// 3 × 8 scapular pull-ups clears level 1. 3 × 7 does not.
const scapula = pullUp.levels[0].workoutId;
assert.equal(evaluateLevel(pullUp.levels[0], rows("a", "2026-10-02", scapula, [8, 8, 7])).cleared, false, "every set must hit the bar");
const cleared = rows("b", "2026-10-03", scapula, [8, 9, 8]);
assert.equal(evaluateLevel(pullUp.levels[0], cleared).clearedOn, "2026-10-03");
assert.equal(skillProgress(goal, cleared).current?.name, "Inverted row", "and the next rung is up");

// Sets from different days never add up to a clear.
const split = [...rows("c", "2026-10-04", scapula, [8, 8]), ...rows("d", "2026-10-05", scapula, [8])];
assert.equal(evaluateLevel(pullUp.levels[0], split).cleared, false, "two sessions are not one");

// Starting strong: real pull-ups skip the easy rungs.
const strong = rows("e", "2026-10-06", "db-0652", [8, 8, 8]);
const jumped = skillProgress(goal, strong);
assert.deepEqual([jumped.level, jumped.current?.name], [5, "Archer pull-up"], "clearing a hard rung clears everything below");

// Progress toward the current rung is the best single set against its target.
const partial = skillProgress(goal, [...cleared, ...rows("f", "2026-10-07", "db-0499", [6, 5, 4])]);
assert.deepEqual([partial.best, partial.ratio], [6, 0.6], "best 6 of 10 inverted rows");

// A hold is judged in seconds, and the built-in Plank counts for the library plank.
const handstand = SKILL_TEMPLATES.find((skill) => skill.key === "handstand")!;
assert.equal(
  evaluateLevel(handstand.levels[0], rows("g", "2026-10-08", "plank", [45, 50, 46], "time")).cleared,
  true,
  "the built-in Plank is the same movement as the library's"
);

// What Finish just earned.
const ups = levelUps([goal], [], cleared);
assert.deepEqual(ups.map((up) => [up.from, up.to, up.next?.name]), [[0, 1, "Inverted row"]]);
assert.deepEqual(levelUps([goal], cleared, cleared), [], "nothing new, nothing announced");

// Mastered: the last rung cleared.
const top = skillProgress(goal, rows("h", "2026-10-09", "db-3293", [5, 5, 5]));
assert.deepEqual([top.mastered, top.current, top.level], [true, undefined, 6]);

assert.equal(levelTarget(pullUp.levels[4]), "3 × 8");
assert.equal(levelTarget(handstand.levels[2]), "3 × 20s");

// Every ready-made rung is a real library exercise with a demo.
const raw = JSON.parse(readFileSync("public/exercises.json", "utf8"));
type Entry = { id: string; gif?: string };
const entries: Entry[] = Array.isArray(raw) ? raw : (Object.values(raw)[0] as Entry[]);
const library = new Map(entries.map((entry) => [entry.id, entry] as const));
for (const skill of SKILL_TEMPLATES) {
  for (const level of skill.levels) {
    const entry = library.get(level.workoutId.slice(3));
    assert.ok(entry?.gif, `${skill.name}: ${level.name} is in the library with a demo`);
  }
}

console.log("skills checks passed");

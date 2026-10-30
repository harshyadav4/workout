// Run with: npm run check
import assert from "node:assert/strict";

import { buildDietExport, describeDietCounts, hasDietData, parseDietBackup, parseDietBackupText } from "@/lib/diet-backup";
import type { DietData } from "@/lib/diet-types";
import { EMPTY_WORKOUT_BACKUP, ImportError, parseExportText } from "@/lib/import-backup";

const nums = { kcal: 100, proteinG: 1, carbsG: 2, fatG: 3, costInr: 4 };
const item = { id: "i", name: "Oats", time: "09:00", ...nums };
const data: DietData = {
  meals: [{ id: "m", name: "Oats", ...nums }],
  mealPlans: [{ id: "p", name: "Plan", items: [{ ...item, mealId: "m" }], summary: nums }],
  scheduledMealDays: [{ id: "d", date: "2026-11-02", planName: "Plan", items: [{ ...item, status: "eaten" }], source: "repeat" }],
  mealScheduleConfig: { startDate: "2026-11-02", endDate: "2026-12-02", weekly: { 1: "p" } },
  settings: { kcalTarget: 2200 }
};

// round trip through the file
{
  const text = JSON.stringify({ templates: [], diet: buildDietExport(data) });
  const parsed = parseDietBackupText(text);
  assert.ok(parsed);
  assert.deepEqual(parsed.state, data, "everything comes back");
  assert.deepEqual(parsed.counts, { meals: 1, "meal plans": 1, "meal days": 1 });
}

// older files and wrong files
assert.equal(parseDietBackupText(JSON.stringify({ templates: [] })), undefined, "a file from before diet has no diet part");
assert.equal(parseDietBackupText("not json"), undefined);
assert.equal(parseDietBackup("nope"), undefined);
assert.equal(parseDietBackup({ meals: [] }), undefined, "nothing in it is nothing to restore");

// hostile rows are dropped, good ones kept
{
  const parsed = parseDietBackup({
    meals: [{ id: "ok", name: "Ok", ...nums }, { id: "bad", name: "Bad", ...nums, kcal: "lots" }, { id: "neg", name: "Neg", ...nums, costInr: -5 }, 7],
    mealPlans: [{ id: "p", name: "P", items: [{ id: "x" }] }],
    scheduledMealDays: [{ id: "d", items: [] }],
    mealScheduleConfig: { startDate: 1 },
    settings: { kcalTarget: "many", proteinTargetG: 150 }
  });
  assert.deepEqual(parsed?.state.meals.map((m) => m.id), ["ok"]);
  assert.equal(parsed?.state.mealPlans.length, 0, "one broken item rejects its plan");
  assert.equal(parsed?.state.scheduledMealDays.length, 0, "a day with no date is dropped");
  assert.equal(parsed?.state.mealScheduleConfig, undefined);
  assert.deepEqual(parsed?.state.settings, { proteinTargetG: 150 });
}

// A person who only uses Diet: the workout parser finds nothing, and that must not lose the diet.
{
  const dietOnly = JSON.stringify({ templates: [], logs: [], diet: buildDietExport(data) });
  assert.throws(() => parseExportText(dietOnly), ImportError, "the workout half alone calls this empty");
  assert.equal(parseDietBackupText(dietOnly)?.state.meals.length, 1, "so the caller reads the diet half first");
  assert.equal(EMPTY_WORKOUT_BACKUP.logs.length, 0);
}

assert.equal(describeDietCounts(data), "1 meal and 1 meal plan");
assert.equal(hasDietData({ meals: [], mealPlans: [], scheduledMealDays: [] }), false);
assert.equal(hasDietData(data), true);

console.log("diet backup checks passed");

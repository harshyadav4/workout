// Run with: npm run check
import assert from "node:assert/strict";

import { buildDietImport, parseAiDietPlan } from "@/lib/ai-diet-plan";
import { buildAiDietPrompt } from "@/lib/ai-diet-prompt";
import { AiPlanError } from "@/lib/ai-plan";

const item = (name: string, time = "09:00") => ({ name, time, kcal: 400, protein: 20, carbs: 50, fat: 10, cost: 40 });
const good = {
  plans: [
    { name: "Training", items: [item("Dal rice", "13:30"), item("Oats", "8:30")] },
    { name: "Rest", items: [item("Dal rice", "13:30")] }
  ],
  schedule: { days: { monday: "Training", Tue: "Rest" } }
};
const fails = (value: unknown, pattern: RegExp) =>
  assert.throws(() => parseAiDietPlan(typeof value === "string" ? value : JSON.stringify(value)), (error: Error) => error instanceof AiPlanError && pattern.test(error.message), `expected ${pattern}`);

// parsing
{
  const plan = parseAiDietPlan("Here you go:\n```json\n" + JSON.stringify(good) + "\n```");
  assert.equal(plan.plans.length, 2, "a fence and a sentence are tolerated");
  assert.equal(plan.plans[0].items[1].time, "08:30", "a short time is padded, so it sorts");
  assert.deepEqual(plan.schedule?.days, { mon: "Training", tue: "Rest" });
  const noCost = { plans: [{ name: "A", items: [{ ...item("X"), cost: undefined }] }] };
  assert.equal(parseAiDietPlan(JSON.stringify(noCost)).plans[0].items[0].cost, 0, "cost may be left out");
  assert.equal(parseAiDietPlan(JSON.stringify({ plans: [{ name: "A", items: [{ ...item("X"), kcal: "400" }] }] })).plans[0].items[0].kcal, 400, "a number in quotes is still a number");
}

fails("", /Nothing was pasted/);
fails({ plans: [] }, /no meal plans/);
fails({ plans: [{ name: "A", items: [] }] }, /has no meals/);
fails({ plans: [{ name: "A", items: [item("X")] }, { name: "a", items: [item("X")] }] }, /Two plans/);
fails({ plans: [{ name: "A", items: [item("X", "25:00")] }] }, /24-hour/);
fails({ plans: [{ name: "A", items: [{ ...item("X"), kcal: -5 }] }] }, /kcal must be a number/);
fails({ plans: [{ name: "A", items: [item("X")] }], schedule: { days: { mon: "B" } } }, /not in the answer/);
fails({ plans: [{ name: "A", items: [item("X")] }], schedule: { days: { someday: "A" } } }, /not a weekday/);
fails({ plans: Array.from({ length: 8 }, (_, i) => ({ name: `P${i}`, items: [item("X")] })) }, /Keep it to 7/);
fails({ plans: [{ name: "A", items: Array.from({ length: 13 }, () => item("X")) }] }, /Keep it to 12/);

// building
{
  const built = buildDietImport(parseAiDietPlan(JSON.stringify(good)), "2026-11-02");
  assert.equal(built.meals.length, 2, "a meal in two plans is one meal");
  assert.deepEqual(built.mealPlans[0].items.map((i) => i.time), ["08:30", "13:30"], "items are in time order");
  assert.equal(built.mealPlans[0].summary.kcal, 800, "the summary is worked out");
  assert.equal(built.mealPlans[0].items[1].mealId, built.mealPlans[1].items[0].mealId);
  assert.equal(built.mealScheduleConfig?.weekly[1], built.mealPlans[0].id, "Monday is Training");
  assert.equal(built.mealScheduleConfig?.weekly[2], built.mealPlans[1].id);
  assert.equal(built.mealScheduleConfig?.startDate, "2026-11-02");
  assert.equal(built.mealScheduleConfig?.endDate, "2026-12-27", "eight weeks");

  const every = buildDietImport(parseAiDietPlan(JSON.stringify({ ...good, schedule: { everyDay: "Rest" } })), "2026-11-02");
  assert.equal(Object.keys(every.mealScheduleConfig?.weekly ?? {}).length, 7);
  assert.equal(buildDietImport(parseAiDietPlan(JSON.stringify({ plans: good.plans })), "2026-11-02").mealScheduleConfig, undefined, "no schedule, no calendar");
}

// ingredients give micronutrients only when every food is in the library
{
  const zero = { ironMg: 0, calciumMg: 0, magnesiumMg: 0, zincMg: 0, potassiumMg: 0, sodiumMg: 0, vitaminCMg: 0, vitaminDUg: 0, vitaminAUg: 0, folateUg: 0, thiamineMg: 0, riboflavinMg: 0, fiberG: 0 };
  const library = [{ id: "A", name: "Rice, raw, milled", group: "G", kcal: 356, proteinG: 8, carbsG: 78, fatG: 1, micros: { ...zero, ironMg: 1 } }];
  const withFoods = (ingredients: unknown) => buildDietImport(parseAiDietPlan(JSON.stringify({ plans: [{ name: "A", items: [{ ...item("X"), ingredients }] }] })), "2026-11-02", library);
  const known = withFoods([{ food: "rice, raw, MILLED ", grams: 200 }]);
  assert.equal(known.meals[0].micros?.ironMg, 2, "matched by name, and scaled by weight");
  assert.equal(known.mealPlans[0].items[0].micros?.ironMg, 2, "the plan item carries it");
  assert.equal(known.meals[0].kcal, 400, "the AI's calories stand");
  assert.equal(withFoods([{ food: "Rice, raw, milled", grams: 200 }, { food: "Unknown food", grams: 50 }]).meals[0].micros, undefined, "one food not in the library: unknown, not partly counted");
  assert.equal(withFoods([{ food: "Rice, raw, milled", grams: "lots" }]).meals[0].micros, undefined, "a bad weight is no ingredient");
  assert.equal(withFoods("nope").meals[0].micros, undefined);
  assert.equal(buildDietImport(parseAiDietPlan(JSON.stringify({ plans: good.plans })), "2026-11-02").meals[0].micros, undefined, "no library: plans still work");
  const prompt = buildAiDietPrompt({ heightCm: 0, weightKg: 0, settings: {}, today: "2026-11-02", foodNames: ["Rice, raw, milled", "Bajra"] });
  assert.match(prompt, /Rice, raw, milled; Bajra/, "the food list goes in the question");
  assert.equal(parseAiDietPlan(prompt).plans.length, 2, "the example is still found");
  assert.doesNotMatch(buildAiDietPrompt({ heightCm: 0, weightKg: 0, settings: {}, today: "2026-11-02" }), /Food list/);
}

// the prompt, and that its own example passes its own parser
{
  const prompt = buildAiDietPrompt({ heightCm: 175, weightKg: 75, goalWeightKg: 70, trainingDaysPerWeek: 4, settings: { proteinTargetG: 140 }, today: "2026-11-02" });
  assert.match(prompt, /Weight: 75 kg/);
  assert.match(prompt, /Protein target: 140 g/);
  assert.match(prompt, /Training days a week: 4/);
  assert.doesNotMatch(prompt, /Height: 0|undefined/);
  assert.doesNotMatch(buildAiDietPrompt({ heightCm: 0, weightKg: 0, settings: {}, today: "2026-11-02" }), /Height|Weight:/, "unknown facts are left out");
  const example = parseAiDietPlan(prompt);
  assert.equal(example.plans.length, 2, "the example in the prompt is a valid answer");
}

console.log("ai diet plan checks passed");

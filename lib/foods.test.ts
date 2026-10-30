// Run with: npm run check
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { foodGroups, ingredientFromFood, mealFromFood, rescaleIngredient, searchFoods, sumMicros, totalsFromIngredients, type Food } from "@/lib/foods";
import type { Micros } from "@/lib/diet-types";

const noMicros: Micros = { ironMg: 0, calciumMg: 0, magnesiumMg: 0, zincMg: 0, potassiumMg: 0, sodiumMg: 0, vitaminCMg: 0, vitaminDUg: 0, vitaminAUg: 0, folateUg: 0, thiamineMg: 0, riboflavinMg: 0, fiberG: 0 };
const egg: Food = { id: "M001", name: "Egg, poultry, whole, raw", group: "Egg and Egg Products", kcal: 135, proteinG: 13.3, carbsG: 0, fatG: 9.2, micros: { ...noMicros, ironMg: 1.82, calciumMg: 49.4 } };
const rice: Food = { id: "A015", name: "Rice, raw, milled", group: "Cereals and Millets", kcal: 356, proteinG: 7.9, carbsG: 78.2, fatG: 0.5, micros: { ...noMicros, ironMg: 0.65, fiberG: 2.8 } };
const list = [egg, rice];

// scaling: 150 g of egg (three eggs)
const meal = mealFromFood(egg, 150);
assert.equal(meal.kcal, 203, "kcal rounds to a whole number");
assert.equal(meal.proteinG, 20, "protein scales and rounds to one place");
assert.equal(meal.fatG, 13.8);
assert.equal(meal.carbsG, 0);
assert.equal(meal.costInr, 0, "cost is never guessed");
assert.equal(meal.foodId, "M001");
assert.equal(meal.grams, 150);
assert.equal(mealFromFood(rice, -20).kcal, 0, "a negative weight is zero, not negative food");

// search
assert.deepEqual(searchFoods(list, "  RICE   milled ").map((f) => f.id), ["A015"], "case and spaces do not matter, every word must match");
assert.deepEqual(searchFoods(list, "raw").map((f) => f.id), ["M001", "A015"], "one word, both match");
assert.deepEqual(searchFoods(list, "raw", "Cereals and Millets").map((f) => f.id), ["A015"], "a group narrows it");
assert.deepEqual(searchFoods(list, "").map((f) => f.id), ["M001", "A015"], "an empty query is the whole list");
assert.deepEqual(foodGroups(list), ["Egg and Egg Products", "Cereals and Millets"]);

// the shipped file has the shape the picker expects
const shipped = JSON.parse(readFileSync("public/foods.json", "utf8")) as Food[];
assert.ok(shipped.length > 500, `foods.json has ${shipped.length} rows`);
assert.ok(shipped.every((f) => f.id && f.name && f.group && f.kcal > 0), "every food has an id, a name, a group and energy");
assert.ok(shipped.every((f) => [f.proteinG, f.carbsG, f.fatG].every((n) => Number.isFinite(n) && n >= 0)), "macros are finite and non-negative");
assert.ok(shipped.every((f) => Object.keys(noMicros).every((key) => Number.isFinite(f.micros[key as keyof Micros]) && f.micros[key as keyof Micros] >= 0)), "every food has all thirteen micronutrients");
const shippedEgg = shipped.find((f) => f.id === "M001");
assert.equal(shippedEgg?.micros.ironMg, 1.82, "units: the table's grams become mg");
assert.equal(shippedEgg?.micros.vitaminAUg, 199, "and micrograms: retinol 198 + carotene 14.6 / 12");
assert.equal(shippedEgg?.micros.vitaminDUg, 0.84);
const shippedFood = (id: string) => shipped.find((f) => f.id === id);
assert.equal(shippedFood("C033")?.micros.vitaminAUg, 217, "spinach: 2,605 µg of carotene is 217 µg of vitamin A, not 2,605");
assert.equal(shippedFood("A019")?.micros.vitaminDUg, 0, "wheat flour: the table's D2 is not believed");
assert.equal(shippedFood("D076")?.micros.vitaminDUg, 0, "nor tomato's");
assert.equal(shippedFood("N003")?.micros.vitaminDUg, 1.38, "chicken's D3 counts");
assert.ok((shippedFood("J002")?.micros.vitaminDUg ?? 0) > 20, "mushrooms really do carry D2");
assert.ok(shipped.every((f) => f.group === "Mushrooms" || f.micros.vitaminDUg <= 10), "no ordinary food has an unbelievable vitamin D");
assert.ok(shipped.every((f) => f.micros.sodiumMg < 40000 && f.micros.ironMg < 200), "no food has an impossible value, which would mean a unit slip");

// a meal made of foods
{
  const eggs = ingredientFromFood(egg, 200);
  assert.equal(eggs.kcal, 270);
  assert.equal(eggs.micros.ironMg, 3.64, "micronutrients scale with the weight");
  const riceBowl = ingredientFromFood(rice, 100);
  const totals = totalsFromIngredients([eggs, riceBowl]);
  assert.equal(totals.kcal, 626);
  assert.equal(totals.proteinG, 34.5);
  assert.equal(totals.micros?.ironMg, 4.29, "and add up across foods");
  assert.equal(totals.micros?.fiberG, 2.8);
  assert.equal(totalsFromIngredients([]).micros, undefined, "no foods, no data");
  assert.equal(sumMicros([]), undefined);

  const half = rescaleIngredient(eggs, 100);
  assert.equal(half.kcal, 135);
  assert.equal(half.micros.ironMg, 1.82);
  assert.equal(rescaleIngredient(eggs, 0), eggs, "zero could never be scaled back up");
}
assert.ok(shipped.some((f) => /^Milk/i.test(f.name)), "a staple is there");
assert.ok(shipped.some((f) => f.name === "Ghee" && f.kcal === 900 && f.fatG === 100), "pure fats are filled in, not dropped");

console.log("food library checks passed");

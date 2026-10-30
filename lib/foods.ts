/**
 * The food library — the diet twin of lib/exercises.ts. public/foods.json is
 * IFCT 2017 (Indian Food Composition Tables, NIN Hyderabad), built by
 * scripts/build-foods.ts. Every value is per 100 g of the raw food.
 */
import type { Meal, MealIngredient, Micros } from "@/lib/diet-types";

export interface Food {
  id: string;
  name: string;
  group: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  micros: Micros;
}

let cache: Food[] | null = null;

export async function loadFoods(): Promise<Food[]> {
  if (cache) {
    return cache;
  }
  const response = await fetch("/foods.json");
  if (!response.ok) {
    throw new Error(`Failed to load foods (${response.status})`);
  }
  cache = (await response.json()) as Food[];
  return cache;
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Every group in the list, in the order it first appears. */
export function foodGroups(list: Food[]): string[] {
  return [...new Set(list.map((food) => food.group))];
}

/**
 * Name match, case- and space-insensitive, every word of the query somewhere
 * in the name — so "rice milled" finds "Rice, raw, milled".
 */
export function searchFoods(list: Food[], query: string, group?: string): Food[] {
  const words = normalize(query).split(" ").filter(Boolean);
  return list.filter((food) => {
    if (group && food.group !== group) {
      return false;
    }
    const name = normalize(food.name);
    return words.every((word) => name.includes(word));
  });
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/**
 * The four numbers for `grams` of a food. Cost is left at zero: the user
 * types it, because no library knows what their shop charges.
 */
export function mealFromFood(food: Food, grams: number): Omit<Meal, "id"> {
  const scale = Math.max(0, grams) / 100;
  return {
    name: food.name,
    kcal: Math.round(food.kcal * scale),
    proteinG: round(food.proteinG * scale, 1),
    carbsG: round(food.carbsG * scale, 1),
    fatG: round(food.fatG * scale, 1),
    costInr: 0,
    foodId: food.id,
    grams
  };
}

function scaleMicros(micros: Micros, scale: number): Micros {
  return Object.fromEntries(
    Object.entries(micros).map(([key, value]) => [key, Number((value * scale).toPrecision(4))])
  ) as unknown as Micros;
}

/** One food at a weight. Everything is worked out here and copied, so the meal never needs the library again. */
export function ingredientFromFood(food: Food, grams: number): MealIngredient {
  const scale = Math.max(0, grams) / 100;
  return {
    foodId: food.id,
    name: food.name,
    grams,
    kcal: food.kcal * scale,
    proteinG: food.proteinG * scale,
    carbsG: food.carbsG * scale,
    fatG: food.fatG * scale,
    micros: scaleMicros(food.micros, scale)
  };
}

/** The same food at a new weight. Refuses zero: nothing could be scaled back up from it. */
export function rescaleIngredient(item: MealIngredient, grams: number): MealIngredient {
  if (!(grams > 0) || !(item.grams > 0)) {
    return item;
  }
  const scale = grams / item.grams;
  return {
    ...item,
    grams,
    kcal: item.kcal * scale,
    proteinG: item.proteinG * scale,
    carbsG: item.carbsG * scale,
    fatG: item.fatG * scale,
    micros: scaleMicros(item.micros, scale)
  };
}

export function sumMicros(list: readonly Micros[]): Micros | undefined {
  if (list.length === 0) {
    return undefined;
  }
  const total: Record<string, number> = {};
  list.forEach((micros) => {
    Object.entries(micros).forEach(([key, value]) => {
      total[key] = (total[key] ?? 0) + value;
    });
  });
  return Object.fromEntries(
    Object.entries(total).map(([key, value]) => [key, Number(value.toPrecision(4))])
  ) as unknown as Micros;
}

/** A meal's numbers from its foods. */
export function totalsFromIngredients(ingredients: readonly MealIngredient[]) {
  const add = (pick: (item: MealIngredient) => number) => ingredients.reduce((sum, item) => sum + pick(item), 0);
  return {
    kcal: Math.round(add((item) => item.kcal)),
    proteinG: round(add((item) => item.proteinG), 1),
    carbsG: round(add((item) => item.carbsG), 1),
    fatG: round(add((item) => item.fatG), 1),
    micros: sumMicros(ingredients.map((item) => item.micros))
  };
}

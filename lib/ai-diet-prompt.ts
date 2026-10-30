/**
 * The question the user pastes into an outside assistant (ChatGPT, Claude,
 * Gemini) to have it design meal plans for this app. The twin of lib/ai-prompt.ts:
 * how to think, what the app knows, then the reply format. Pure, so it is tested.
 */
import { AI_DIET_VERSION } from "@/lib/ai-diet-plan";
import type { DietSettings, MealTotals } from "@/lib/diet-types";

export interface DietPromptInput {
  heightCm: number;
  weightKg: number;
  goalWeightKg?: number;
  birthYear?: number;
  sex?: string;
  /** Workouts planned in the coming week, when there is a training schedule. */
  trainingDaysPerWeek?: number;
  settings: DietSettings;
  /** Average eaten per tracked day lately, when there is any. */
  recentAverage?: MealTotals;
  /** The food library's names. An ingredient must use one exactly to count. */
  foodNames?: readonly string[];
  today: string;
}

const EXAMPLE = {
  gymflow: AI_DIET_VERSION,
  plans: [
    {
      name: "Training day",
      items: [
        { name: "Oats with milk and banana", time: "08:30", kcal: 450, protein: 18, carbs: 70, fat: 10, cost: 45 },
        { name: "Dal, rice and sabzi", time: "13:30", kcal: 650, protein: 24, carbs: 100, fat: 14, cost: 80 },
        { name: "Paneer bhurji with 2 roti", time: "20:30", kcal: 600, protein: 32, carbs: 45, fat: 28, cost: 90 }
      ]
    },
    {
      name: "Rest day",
      items: [
        { name: "Poha with peanuts", time: "09:00", kcal: 380, protein: 10, carbs: 60, fat: 11, cost: 30 },
        { name: "Dal, rice and sabzi", time: "13:30", kcal: 650, protein: 24, carbs: 100, fat: 14, cost: 80 }
      ]
    }
  ],
  schedule: { days: { mon: "Training day", tue: "Rest day" } }
};

export function buildAiDietPrompt(input: DietPromptInput): string {
  const facts = [
    input.heightCm > 0 ? `- Height: ${input.heightCm} cm` : "",
    input.weightKg > 0 ? `- Weight: ${input.weightKg} kg` : "",
    input.goalWeightKg ? `- Goal weight: ${input.goalWeightKg} kg` : "",
    input.birthYear ? `- Born: ${input.birthYear}` : "",
    input.sex && input.sex !== "other" ? `- Sex: ${input.sex}` : "",
    input.trainingDaysPerWeek !== undefined ? `- Training days a week: ${input.trainingDaysPerWeek}` : "",
    input.settings.kcalTarget ? `- Calorie target: ${input.settings.kcalTarget} kcal a day` : "",
    input.settings.proteinTargetG ? `- Protein target: ${input.settings.proteinTargetG} g a day` : "",
    input.settings.carbsTargetG ? `- Carbs target: ${input.settings.carbsTargetG} g a day` : "",
    input.settings.fatTargetG ? `- Fat target: ${input.settings.fatTargetG} g a day` : "",
    input.recentAverage && input.recentAverage.kcal > 0
      ? `- Lately eats about ${input.recentAverage.kcal} kcal and ${input.recentAverage.proteinG} g protein a day, ₹${input.recentAverage.costInr} a day`
      : ""
  ].filter(Boolean);

  return [
    "You are a sports nutrition coach. Write meal plans I can load into my training app.",
    "",
    "First ask me, in one short message: my goal, what I eat at home, foods I avoid, vegetarian or not, my budget a day, and my meal times. Wait for my answers. Then write the plan.",
    "",
    "Rules:",
    "- Use real meals I can cook or buy in India, unless I say otherwise.",
    "- A plan is one day of eating. Make one for each kind of day I need.",
    "- Numbers are for the whole meal as served: kcal, protein, carbs and fat in grams.",
    "- These are estimates. Do not claim they are exact.",
    "- cost is your estimate in Indian rupees for one person. I will correct it.",
    "- Give each meal its own short name. Use the same name when a meal repeats.",
    "",
    facts.length > 0 ? `What the app knows about me (today is ${input.today}):\n${facts.join("\n")}` : `Today is ${input.today}.`,
    "",
    "When the plan is ready, reply with one JSON code block in exactly this shape, and nothing after it:",
    "```json",
    JSON.stringify(EXAMPLE, null, 2),
    "```",
    "",
    ...(input.foodNames && input.foodNames.length > 0
      ? [
          "For each meal, also add \"ingredients\": a list of { \"food\": exact name from the list below, \"grams\": raw weight }. The app reads micronutrients from these. Use only names from this list, and leave out what is not on it, such as salt.",
          "",
          "Food list:",
          input.foodNames.join("; "),
          ""
        ]
      : []),
    "time is 24-hour. schedule is optional: use \"days\" for different plans on different weekdays, or \"everyDay\": \"Plan name\" for one plan every day. At most 7 plans, and 12 meals in a plan."
  ].join("\n");
}

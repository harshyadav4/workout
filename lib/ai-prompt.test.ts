// Run with: npm run check
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { parseAiPlan } from "@/lib/ai-plan";
import { buildAiPrompt } from "@/lib/ai-prompt";
import type { Exercise } from "@/lib/exercises";
import type { SessionTemplate, WorkoutLog } from "@/lib/types";

const library = JSON.parse(
  readFileSync(new URL("../public/exercises.json", import.meta.url), "utf8")
) as Exercise[];

const sessions: SessionTemplate[] = [
  {
    id: "s1",
    name: "Push",
    workoutIds: ["bench"],
    exercises: [
      { id: "e1", workoutId: "bench", name: "barbell bench press", muscles: [], sets: 4, reps: 8, weight: 70, restSeconds: 120 }
    ],
    summary: { totalSets: 4, totalReps: 32, totalWeight: 280 }
  }
];
const logs: WorkoutLog[] = [
  { date: "2026-10-20", workoutId: "bench", name: "barbell bench press", totalVolume: 2000, peakWeight: 75, muscles: [] },
  { date: "2026-10-23", workoutId: "bench", name: "barbell bench press", totalVolume: 2000, peakWeight: 77.5, muscles: [] },
  // Outside the 8-week window: must not be reported as a recent lift.
  { date: "2026-01-01", workoutId: "squat", name: "barbell full squat", totalVolume: 3000, peakWeight: 140, muscles: [] }
];

const prompt = buildAiPrompt({
  library,
  sessions,
  logs,
  profile: { heightCm: 176, weightKg: 74, goalWeightKg: 70 },
  today: "2026-10-25",
  notes: "No overhead pressing: left shoulder.",
  appUrl: "https://gymflow.example/"
});

// The way back: a link to the paste screen, and plain words before the plan.
assert.match(prompt, /https:\/\/gymflow\.example\/plan\?mode=build&ai=paste/);
assert.match(prompt, /Tap the copy button on the box below/);

// The interview comes before any plan.
assert.match(prompt, /First, interview me/);
assert.ok(prompt.indexOf("First, interview me") < prompt.indexOf("Reply format"));

// The contract survives a long prompt: it is announced at the top, it comes
// after the user's notes, history and the whole library, and the self-check
// and example are the last thing the assistant reads.
assert.ok(prompt.indexOf("reply format at the very end") < 300, "the format is announced up front");
assert.ok(prompt.indexOf("My own notes") < prompt.indexOf("## Exercise library"));
assert.ok(prompt.indexOf("## Exercise library") < prompt.indexOf("## Reply format"));
assert.ok(prompt.trimEnd().endsWith("```"), "the example closes the prompt");
assert.match(prompt, /never the reply format/, "notes cannot override the format");

// What the app knows is in it.
assert.match(prompt, /Height: 176 cm/);
assert.match(prompt, /Goal bodyweight: 70 kg/);
assert.match(prompt, /barbell bench press: 77\.5 kg top set, 2 sessions/);
assert.doesNotMatch(prompt, /barbell full squat: 140/, "only the last 8 weeks count as recent");
assert.match(prompt, /"Push"\n    - barbell bench press: 4 x 8 @ 70 kg/);
assert.match(prompt, /No overhead pressing: left shoulder\./);

// Today's date, the closed vocabularies and every library name are given.
assert.match(prompt, /today is 2026-10-25/);
assert.match(prompt, /"equipment" must be one of: .*leverage machine/);
assert.match(prompt, /"target" must be one of: .*pectorals/);
for (const exercise of library) {
  assert.ok(prompt.includes(exercise.name), `library name missing from prompt: ${exercise.name}`);
}

// Notes are optional: no empty heading when there are none.
const bare = buildAiPrompt({ library, sessions: [], logs: [], profile: { heightCm: 0, weightKg: 0 }, today: "2026-10-25" });
assert.doesNotMatch(bare, /My own notes/);
assert.match(bare, /Nothing yet: a new account/);

// The example inside the prompt teaches the format, so it must itself parse
// once its placeholder session is filled in.
const example = /```json\n([\s\S]*?)\n```/.exec(prompt)![1]
  .replace('"exercises": [ ... ]', '"exercises": [{ "name": "barbell full squat", "sets": 3, "reps": 5 }]')
  .replace("YYYY-MM-DD", "2026-11-02")
  .replace("YYYY-MM-DD", "2026-12-28");
const parsed = parseAiPlan(example);
assert.equal(parsed.sessions.length, 2, "the example must parse once its placeholder is filled");
const names = new Set(library.map((item) => item.name));
parsed.sessions[0].exercises.forEach((exercise) =>
  assert.ok(names.has(exercise.name), `example uses a name not in the library: ${exercise.name}`)
);

// Size: long, but within what chat assistants accept in one paste.
assert.ok(prompt.length < 60_000, `prompt is ${prompt.length} characters`);
console.log(`ai prompt checks passed (${prompt.length} chars, ~${Math.round(prompt.length / 4)} tokens)`);

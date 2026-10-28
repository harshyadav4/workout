// Run with: npm run check
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { parseAiPlan } from "@/lib/ai-plan";
import { buildAiPrompt } from "@/lib/ai-prompt";
import type { Exercise } from "@/lib/exercises";
import type { SessionTemplate, SetLog, WorkoutLog } from "@/lib/types";

const library = JSON.parse(
  readFileSync(new URL("../public/exercises.json", import.meta.url), "utf8")
) as Exercise[];

const sessions: SessionTemplate[] = [
  {
    id: "s1",
    name: "Push",
    workoutIds: ["bench"],
    exercises: [
      { id: "e1", workoutId: "bench", name: "barbell bench press", muscles: [], sets: 4, reps: 8, weight: 70, restSeconds: 120 },
      { id: "e2", workoutId: "run", name: "run", muscles: [], sets: 1, reps: 0, weight: 0, restSeconds: 0, metric: "distance", distanceKm: 5, durationSeconds: 1800 }
    ],
    summary: { totalSets: 4, totalReps: 32, totalWeight: 280 }
  }
];
const logs: WorkoutLog[] = [
  { date: "2026-10-20", workoutId: "bench", name: "barbell bench press", totalVolume: 2000, peakWeight: 75, muscles: [] },
  { date: "2026-10-23", workoutId: "bench", name: "barbell bench press", totalVolume: 2000, peakWeight: 77.5, muscles: [] },
  // Outside the 8-week window: must not be reported as a recent lift.
  { date: "2026-01-01", workoutId: "squat", name: "barbell full squat", totalVolume: 3000, peakWeight: 140, muscles: [] },
  { date: "2026-10-21", workoutId: "run", name: "run", totalVolume: 0, peakWeight: 0, muscles: [] },
  { date: "2026-10-24", workoutId: "run", name: "run", totalVolume: 0, peakWeight: 0, muscles: [] }
];
// Runs live in the per-set logs: how far and how long. The longest run and
// its time are what the prompt reports; an old run is out of the window.
const setLogs: SetLog[] = [
  { id: "r1", logId: "l1", workoutId: "run", date: "2026-10-21", setIndex: 0, reps: 0, weight: 0, distanceKm: 3, durationSeconds: 1080 },
  { id: "r2", logId: "l2", workoutId: "run", date: "2026-10-24", setIndex: 0, reps: 0, weight: 0, distanceKm: 5, durationSeconds: 1690 },
  { id: "r3", logId: "l3", workoutId: "run", date: "2026-01-01", setIndex: 0, reps: 0, weight: 0, distanceKm: 10, durationSeconds: 3600 }
];

const prompt = buildAiPrompt({
  library,
  sessions,
  logs,
  setLogs,
  profile: { heightCm: 176, weightKg: 74, goalWeightKg: 70, birthYear: 1996, sex: "male" },
  today: "2026-10-25"
});

// The way back is plain steps to the paste screen, not a link, and the file
// route is offered too.
assert.doesNotMatch(prompt, /ai=paste/);
assert.match(prompt, /Tap the copy button on the box below/);
assert.match(prompt, /Plan, then Build, then Build with AI/);
assert.match(prompt, /Tap Add my plan, then Paste the answer/);
assert.match(prompt, /tap Upload a file/);
assert.match(prompt, /arise-plan\.json/);

// The interview comes before any plan.
assert.match(prompt, /First, interview me/);
assert.ok(prompt.indexOf("First, interview me") < prompt.indexOf("Reply format"));

// The contract survives a long prompt: it is announced at the top, it comes
// after the user's history and the whole library, and the self-check
// and example are the last thing the assistant reads.
assert.ok(prompt.indexOf("reply format at the very end") < 300, "the format is announced up front");
assert.ok(prompt.indexOf("## Exercise library") < prompt.indexOf("## Reply format"));
assert.ok(prompt.trimEnd().endsWith("```"), "the example closes the prompt");

// What the app knows is in it.
assert.match(prompt, /Height: 176 cm/);
assert.match(prompt, /Goal bodyweight: 70 kg/);
assert.match(prompt, /Age: 30/, "age is the year difference, so a coach can pick loads for it");
assert.match(prompt, /Sex: male/);
{
  const other = buildAiPrompt({ library, sessions, logs, setLogs, profile: { heightCm: 176, weightKg: 74, sex: "other" }, today: "2026-10-25" });
  assert.doesNotMatch(other, /Sex:/, '"other" is not sent: the coach has no table for it either');
  assert.doesNotMatch(other, /Age:/, "no birth year, no age line");
}
assert.match(prompt, /barbell bench press: 77\.5 kg top set, 2 sessions/);
assert.doesNotMatch(prompt, /barbell full squat: 140/, "only the last 8 weeks count as recent");
assert.match(prompt, /"Push"\n    - barbell bench press: 4 x 8 @ 70 kg/);
assert.match(prompt, /- run: 1 x 5 km in 1800s/, "an existing run shows its distance and time, not 1 x 0");
assert.match(prompt, /- run: 5 km in 28:10 \(5:38 \/km\), 2 sessions/, "the longest recent run, its time and pace");
assert.doesNotMatch(prompt, /10 km/, "a run outside the 8-week window is not recent");

// The AI is told how to write a run, and the self-check covers it.
assert.match(prompt, /"distanceKm" \(kilometres/);
assert.match(prompt, /a run has "distanceKm" together with "seconds"/);

// Today's date, the closed vocabularies and every library name are given.
assert.match(prompt, /today is 2026-10-25/);
assert.match(prompt, /"equipment" must be one of: .*leverage machine/);
assert.match(prompt, /"target" must be one of: .*pectorals/);
for (const exercise of library) {
  assert.ok(prompt.includes(exercise.name), `library name missing from prompt: ${exercise.name}`);
}

// A new account: the prompt still reads, with nothing to report.
const bare = buildAiPrompt({ library, sessions: [], logs: [], profile: { heightCm: 0, weightKg: 0 }, today: "2026-10-25" });
assert.match(bare, /Nothing yet: a new account/);
assert.match(bare, /Recent runs, rides and rows[^\n]*\n- None logged yet/, "no set logs at all still reads");

// The example inside the prompt teaches the format, so it must itself parse
// once its placeholder session is filled in.
const example = /```json\n([\s\S]*?)\n```/.exec(prompt)![1]
  .replace('"exercises": [ ... ]', '"exercises": [{ "name": "barbell full squat", "sets": 3, "reps": 5 }]')
  .replace("YYYY-MM-DD", "2026-11-02")
  .replace("YYYY-MM-DD", "2026-12-28");
const parsed = parseAiPlan(example);
assert.equal(parsed.sessions.length, 3, "the example must parse once its placeholder is filled");
const names = new Set(library.map((item) => item.name));
[...parsed.sessions[0].exercises, ...parsed.sessions[2].exercises].forEach((exercise) =>
  assert.ok(names.has(exercise.name), `example uses a name not in the library: ${exercise.name}`)
);
assert.equal(parsed.sessions[2].exercises[0].distanceKm, 5, "the example shows a run the parser accepts");

// Size: long, but within what chat assistants accept in one paste.
assert.ok(prompt.length < 60_000, `prompt is ${prompt.length} characters`);
console.log(`ai prompt checks passed (${prompt.length} chars, ~${Math.round(prompt.length / 4)} tokens)`);

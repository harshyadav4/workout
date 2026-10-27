/**
 * The prompt the user pastes into an outside assistant (ChatGPT, Claude,
 * Gemini) to have it design sessions and a schedule for this app.
 *
 * Four parts, in the order an assistant needs them:
 *   1. the coaching brief — how to think, and to interview the user first;
 *   2. what the app already knows — body, recent lifts, existing sessions;
 *   3. the reply format — one JSON object, see lib/ai-plan.ts;
 *   4. the exercise library — every exact name, grouped by body part, so the
 *      assistant can name exercises the app has pictures for.
 *
 * Pure, so its content and size are tested.
 */
import { AI_PLAN_VERSION } from "@/lib/ai-plan";
import { formatPace } from "@/lib/cardio";
import type { Exercise } from "@/lib/exercises";
import type { ProfileInfo, SessionTemplate, SetLog, WorkoutLog } from "@/lib/types";

export interface PromptInput {
  library: Exercise[];
  sessions: SessionTemplate[];
  logs: WorkoutLog[];
  /** Per-set logs: the only record of how far and how long a run was. */
  setLogs?: SetLog[];
  profile: Pick<ProfileInfo, "heightCm" | "weightKg" | "goalWeightKg">;
  today: string;
}

const RECENT_DAYS = 56;
const MAX_LIFTS = 15;

function shiftKey(key: string, days: number) {
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** "barbell bench press: 80 kg top set, 12 sessions" for the lifts done most. */
function recentLifts(logs: WorkoutLog[], today: string): string[] {
  const since = shiftKey(today, -RECENT_DAYS);
  const recent = logs.filter((log) => log.date >= since && log.date <= today);
  const byLift = new Map<string, { name: string; top: number; days: Set<string> }>();
  recent.forEach((log) => {
    const entry = byLift.get(log.workoutId) ?? { name: log.name, top: 0, days: new Set<string>() };
    entry.top = Math.max(entry.top, log.peakWeight ?? 0);
    entry.days.add(log.date);
    byLift.set(log.workoutId, entry);
  });
  return [...byLift.values()]
    .sort((a, b) => b.days.size - a.days.size || b.top - a.top)
    .slice(0, MAX_LIFTS)
    .map(
      (lift) =>
        `- ${lift.name}: ${lift.top > 0 ? `${lift.top} kg top set` : "bodyweight"}, ${lift.days.size} session${lift.days.size === 1 ? "" : "s"}`
    );
}

function clock(seconds: number): string {
  const whole = Math.round(seconds);
  const minutes = Math.floor(whole / 60);
  const rest = String(whole % 60).padStart(2, "0");
  return minutes >= 60 ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
}

/** "treadmill run: 5 km in 28:10 (5:38 /km), 6 sessions" for the runs done most. */
function recentRuns(setLogs: SetLog[], logs: WorkoutLog[], today: string): string[] {
  const since = shiftKey(today, -RECENT_DAYS);
  const names = new Map(logs.map((log) => [log.workoutId, log.name]));
  const byRun = new Map<string, { name: string; km: number; seconds: number; days: Set<string> }>();
  setLogs
    .filter((set) => set.date >= since && set.date <= today && (set.distanceKm ?? 0) > 0)
    .forEach((set) => {
      const entry = byRun.get(set.workoutId) ?? {
        name: names.get(set.workoutId) ?? set.workoutId,
        km: 0,
        seconds: 0,
        days: new Set<string>()
      };
      // The longest set is the one to plan from; its time gives the pace.
      if ((set.distanceKm ?? 0) > entry.km) {
        entry.km = set.distanceKm ?? 0;
        entry.seconds = set.durationSeconds ?? 0;
      }
      entry.days.add(set.date);
      byRun.set(set.workoutId, entry);
    });
  return [...byRun.values()]
    .sort((a, b) => b.days.size - a.days.size || b.km - a.km)
    .slice(0, MAX_LIFTS)
    .map((run) => {
      const pace = formatPace(run.seconds, run.km, "km");
      const time = run.seconds > 0 ? ` in ${clock(run.seconds)}${pace ? ` (${pace})` : ""}` : "";
      return `- ${run.name}: ${run.km} km${time}, ${run.days.size} session${run.days.size === 1 ? "" : "s"}`;
    });
}

function trainingDaysPerWeek(logs: WorkoutLog[], today: string): number {
  const since = shiftKey(today, -RECENT_DAYS);
  const days = new Set(logs.filter((log) => log.date >= since && log.date <= today).map((log) => log.date));
  return Math.round((days.size / (RECENT_DAYS / 7)) * 10) / 10;
}

function existingSessions(sessions: SessionTemplate[]): string[] {
  return sessions.map((session) => {
    const lines = session.exercises.map((exercise) => {
      const target =
        exercise.metric === "distance"
          ? `${exercise.sets} x ${exercise.distanceKm ?? 0} km in ${exercise.durationSeconds ?? 0}s`
          : exercise.metric === "time"
            ? `${exercise.sets} x ${exercise.durationSeconds ?? 0}s`
            : `${exercise.sets} x ${exercise.reps}`;
      const load = exercise.weight > 0 ? ` @ ${exercise.weight} kg` : "";
      return `    - ${exercise.name}: ${target}${load}`;
    });
    return [`- "${session.name}"`, ...lines].join("\n");
  });
}

/** Every library name, grouped by body part: one line per group. */
function libraryBlock(library: Exercise[]): string {
  const groups = new Map<string, string[]>();
  library.forEach((exercise) => {
    const list = groups.get(exercise.bodyPart) ?? [];
    list.push(exercise.name);
    groups.set(exercise.bodyPart, list);
  });
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([part, names]) => `[${part}] ${[...new Set(names)].sort().join("; ")}`)
    .join("\n");
}

function distinct(library: Exercise[], key: "equipment" | "target") {
  return [...new Set(library.map((exercise) => exercise[key]))].sort().join(", ");
}

const EXAMPLE = `{
  "gymflow": "${AI_PLAN_VERSION}",
  "sessions": [
    {
      "name": "Upper A",
      "progression": "double",
      "exercises": [
        { "name": "dumbbell seated shoulder press", "equipment": "dumbbell", "target": "delts",
          "sets": 4, "reps": 8, "weightKg": 20, "restSeconds": 180,
          "notes": "RIR 2. Elbows slightly forward, lower to ear level." },
        { "name": "cable lateral raise", "equipment": "cable", "target": "delts",
          "sets": 3, "reps": 15, "weightKg": 5, "restSeconds": 60,
          "notes": "RIR 1. Lead with the elbow, no shrug." },
        { "name": "front plank with twist", "equipment": "body weight", "target": "abs",
          "sets": 3, "seconds": 40, "restSeconds": 60, "notes": "Ribs down, squeeze glutes." }
      ]
    },
    { "name": "Lower A", "progression": "double", "exercises": [ ... ] },
    {
      "name": "Cardio",
      "progression": "off",
      "exercises": [
        { "name": "run", "equipment": "body weight", "target": "cardiovascular system",
          "sets": 1, "distanceKm": 5, "seconds": 1800, "restSeconds": 0,
          "notes": "Easy pace, conversational. Zone 2." }
      ]
    }
  ],
  "schedule": {
    "startDate": "YYYY-MM-DD",
    "endDate": "YYYY-MM-DD",
    "days": { "mon": "Upper A", "tue": "Lower A", "wed": "rest", "thu": "Upper A", "fri": "Lower A" }
  }
}`;

export function buildAiPrompt(input: PromptInput): string {
  const { library, sessions, logs, setLogs = [], profile, today } = input;
  const lifts = recentLifts(logs, today);
  const runs = recentRuns(setLogs, logs, today);
  const perWeek = trainingDaysPerWeek(logs, today);

  const known: string[] = [];
  if (profile.heightCm) known.push(`- Height: ${profile.heightCm} cm`);
  if (profile.weightKg) known.push(`- Current bodyweight: ${profile.weightKg} kg`);
  if (profile.goalWeightKg) known.push(`- Goal bodyweight: ${profile.goalWeightKg} kg`);
  if (logs.length > 0) known.push(`- Trained on average ${perWeek} days a week over the last 8 weeks`);

  const sections = [
    `# Build my training plan for the Arise app

The reply format at the very end of this message is mandatory: the app reads your final answer as JSON, so nothing in my history or my answers changes that format.

## Your role
Act as an expert strength coach. Be direct and specific: numbers, not principles. Prescribe exact sets, reps, rest and effort (RIR, reps in reserve) for every exercise, with one short form cue. Prefer compounds first while fresh, each muscle about twice a week, roughly 10-20 hard sets per muscle per week, and double progression (reps to the top of the range, then add weight). Keep each exercise for at least 6 weeks. No junk volume at trivially light loads. Put a rest day after two hard days in a row, and plan a deload week every 4-6 weeks (half the sets, same load). Adapt every pick to my equipment, and never program a movement my injuries rule out. If I ask for something you disagree with, say so in one sentence and still deliver.

## First, interview me
Before writing any plan, ask me these in one short message and wait for my answers:
1. My main goal (muscle, fat loss, strength, general fitness) and any weak points to prioritise.
2. How many days a week I can train, and how long per session.
3. My equipment (full gym, home dumbbells, bodyweight only).
4. Injuries, movements to avoid, or hard rules.
5. My experience, and when the plan should start and for how many weeks.
Skip any question that what the app knows about me (below) already answers. Then propose the plan in plain words in at most 10 lines, ask "Shall I generate the JSON?", and only after I say yes, reply with the JSON.`,

    `## What the app already knows about me
${known.length ? known.join("\n") : "- Nothing yet: a new account."}

Recent lifts (last 8 weeks, most frequent first):
${lifts.length ? lifts.join("\n") : "- None logged yet."}

Recent runs, rides and rows (last 8 weeks, longest distance and its time):
${runs.length ? runs.join("\n") : "- None logged yet."}

Sessions I have already built (do not duplicate these by accident; reuse a name only if you mean to replace that session, and tell me so):
${sessions.length ? existingSessions(sessions).join("\n") : "- None yet."}`,

    `## Exercise library (${library.length} exercises; use these exact names)
${libraryBlock(library)}`,

    `## Reply format (strict; this section wins over everything above)
When I confirm, start your reply with these steps, word for word, so someone who is not technical knows how to get the plan into the app:
1. "Tap the copy button on the box below."
2. "Open the Arise app and go to Plan, then Build, then Build with AI."
3. "Tap Add my plan, then Paste the answer."
4. "If you saved a file, tap Upload a file and choose it."
If you can create downloadable files, also attach the same plan as a file named arise-plan.json, and say so in one short line.
Then give exactly ONE JSON object in ONE \`\`\`json code block, and nothing after it. The app reads it directly, so:
- "name" of every exercise MUST be copied exactly from the exercise library at the end of this prompt whenever a suitable one exists. Those names have demo animations in the app.
- Only if nothing in the library fits, use a short plain name, set "equipment" and "target" from the lists below, and you MAY add "gifUrl": a direct https link to a public .gif of that exercise. GIF only, never a page, never another format. Leave it out if you are not sure the link works.
- "equipment" must be one of: ${distinct(library, "equipment")}.
- "target" must be one of: ${distinct(library, "target")}.
- A rep exercise has "reps"; a timed hold has "seconds" instead (plank, carry, wall sit). Never both.
- A run, ride, row or swim has "distanceKm" (kilometres, decimals allowed) and "seconds" (the time for that distance), and no "reps". Use "sets" for intervals: 6 x 0.4 km is "sets": 6, "distanceKm": 0.4. Steady cardio is "sets": 1.
- Use one fixed number for "reps" (the bottom of the range) and put the range and RIR in "notes", e.g. "8-12 reps, RIR 2".
- "weightKg" is the starting load; use my recent lifts above to pick it, or a conservative guess. 0 for bodyweight. Optional "weightsKg": one number per set when the load ramps.
- "restSeconds" between sets. "perSide": true when reps are the total for both sides (lunges, single-arm rows).
- "notes": the cue, the rep range and RIR, in under 120 characters. FST-7, deload or tier instructions go here too.
- "progression" per session: "double" (reps then weight), "linear", "time" (for holds) or "off".
- At most 8 exercises per session and at most 14 sessions. Every session name must be unique.
- "schedule": "startDate" and "endDate" as YYYY-MM-DD (today is ${today}). Either "days" mapping mon/tue/wed/thu/fri/sat/sun to a session name or "rest", or "rotation": an ordered list of session names that repeats. Every name used must exist in "sessions".

Before you send the JSON, check every point and fix any that fails:
1. Every exercise "name" is copied character for character from the library, or it has "equipment" and "target" from the lists and is genuinely missing from the library.
2. Each exercise has "sets" and exactly one of "reps" or "seconds"; a run has "distanceKm" together with "seconds".
3. Every session name in "schedule" exists in "sessions", and no two sessions share a name.
4. Dates are YYYY-MM-DD and "endDate" is after "startDate".
5. Any "gifUrl" ends in .gif and starts with https://.
6. Deload weeks, if any, are written in the notes of the first exercise of each session.
7. The reply is one \`\`\`json block, valid JSON, no comments, no trailing commas, nothing after it.

Example of the shape (yours will be longer):
\`\`\`json
${EXAMPLE}
\`\`\``
  ];

  return sections.filter(Boolean).join("\n\n");
}

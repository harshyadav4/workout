import assert from "node:assert/strict";

import { equipmentInUse, suggestForHead } from "@/lib/suggestions";
import type { WorkoutTemplate } from "@/lib/types";

// Turns task 19's diagnosis into an action. The plan's own check: a known
// incline movement must rank above a known flat one for `pecUpper`.

const template = (
  id: string,
  name: string,
  muscles: WorkoutTemplate["muscles"],
  equipment?: string
): WorkoutTemplate => ({
  id,
  name,
  category: "Push",
  isPreset: true,
  equipment,
  muscles
});

const incline = template(
  "incline-press",
  "Incline Bench Press",
  [
    { muscleId: "pecUpper", engagement: 70 },
    { muscleId: "pecLower", engagement: 30 }
  ],
  "Barbell"
);
const flat = template(
  "bench-press",
  "Bench Press",
  [
    { muscleId: "pecUpper", engagement: 30 },
    { muscleId: "pecLower", engagement: 70 }
  ],
  "Barbell"
);
const cableFly = template(
  "low-to-high-fly",
  "Low-to-High Cable Fly",
  [{ muscleId: "pecUpper", engagement: 60 }],
  "Cable"
);
const squat = template("squat", "Back Squat", [{ muscleId: "rectusFemoris", engagement: 80 }], "Barbell");

const library = [flat, incline, cableFly, squat];

{
  const ranked = suggestForHead("pecUpper", library);
  assert.deepEqual(
    ranked.map((item) => item.workoutId),
    ["incline-press", "low-to-high-fly", "bench-press"],
    "an incline movement ranks above a flat one for the upper pec"
  );
}

// A lift that barely touches the head is not a suggestion for it.
{
  const ranked = suggestForHead("pecUpper", [squat, flat]);
  assert.deepEqual(
    ranked.map((item) => item.workoutId),
    ["bench-press"],
    "the squat never appears — it does not work this head at all"
  );
}

// Restricted to what the lifter actually trains with. Cables are useless advice
// for someone lifting in a garage.
{
  const garage = suggestForHead("pecUpper", library, { equipmentInUse: ["Barbell"] });
  assert.deepEqual(
    garage.map((item) => item.workoutId),
    ["incline-press", "bench-press"],
    "the cable fly is filtered out"
  );

  const anywhere = suggestForHead("pecUpper", library, { equipmentInUse: [] });
  assert.equal(
    anywhere.length,
    3,
    "no equipment history means no signal, not an empty gym — a new account still gets suggestions"
  );

  const unlabelled = template("dips", "Dips", [{ muscleId: "pecUpper", engagement: 55 }]);
  assert.ok(
    suggestForHead("pecUpper", [unlabelled], { equipmentInUse: ["Barbell"] }).length === 1,
    "an unlabelled lift passes the filter rather than being hidden by it"
  );
}

{
  assert.deepEqual(
    equipmentInUse(["bench-press", "low-to-high-fly", "bench-press"], library),
    ["Barbell", "Cable"],
    "deduped, and only what was actually trained"
  );
  assert.deepEqual(equipmentInUse(["unknown-id"], library), [], "an unknown lift contributes none");
}

console.log("suggestions: ok");

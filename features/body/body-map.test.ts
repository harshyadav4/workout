// Run with: npm run check
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  MUSCLE_HEAT_STEPS,
  MUSCLE_IDLE_COLOR,
  MUSCLE_IDS,
  getHeatColor,
  muscleHeatVars,
  resolveMuscleIds
} from "@/features/body/body-map-shared";

const BASE_FILL = "#C25F60";

// Untouched muscles read neutral; any engagement at all leaves the grey.
assert.equal(getHeatColor(0), MUSCLE_IDLE_COLOR);
assert.equal(getHeatColor(-40), MUSCLE_IDLE_COLOR, "intensity clamps at the bottom");
assert.notEqual(getHeatColor(1), MUSCLE_IDLE_COLOR, "worked at all has to leave the baseline");
assert.equal(getHeatColor(100), getHeatColor(400), "intensity clamps at the top");

// The point of the ramp is comparison: heavier work must land on a later step,
// and no two bands may collapse onto the same colour.
const bandColors = MUSCLE_HEAT_STEPS.map((step) => getHeatColor(step.upTo));
assert.deepEqual(
  bandColors,
  MUSCLE_HEAT_STEPS.map((step) => step.color),
  "each band's top value paints that band's colour"
);
assert.equal(new Set(bandColors).size, MUSCLE_HEAT_STEPS.length, "bands must stay distinct");
assert.equal(getHeatColor(14), getHeatColor(15), "a band is flat inside its range");
assert.notEqual(getHeatColor(15), getHeatColor(16), "and steps at its edge");

// Every muscle gets a variable, so no region can fall back to a stale colour.
const vars = muscleHeatVars([{ muscleId: "pecUpper", intensity: 100 }]);
assert.equal(Object.keys(vars).length, MUSCLE_IDS.length + 1, "every muscle plus the baseline");
assert.equal((vars as Record<string, string>)["--m-pecUpper"], getHeatColor(100));
assert.equal((vars as Record<string, string>)["--m-lats"], getHeatColor(0));

// History predates the anatomical split, so the ten old ids must still light the
// heads they became — otherwise every logged workout reads as untrained.
const legacy = muscleHeatVars([{ muscleId: "shoulders", intensity: 80 }]) as Record<string, string>;
["deltFront", "deltSide", "deltRear"].forEach((id) => {
  assert.equal(legacy[`--m-${id}`], getHeatColor(80), `legacy "shoulders" must light ${id}`);
});
assert.equal(legacy["--m-lats"], getHeatColor(0), "and nothing else");
assert.deepEqual(resolveMuscleIds("calves"), ["gastrocnemius", "soleus"]);
assert.deepEqual(resolveMuscleIds("pecUpper"), ["pecUpper"], "current ids resolve to themselves");
assert.deepEqual(resolveMuscleIds("nonsense"), []);

// The maps only heat up where a path carries data-muscle. If either SVG is
// regenerated without those attributes, that muscle silently stops responding.
const svgs = ["front", "back"].map((name) =>
  readFileSync(new URL(`./${name}.tsx`, import.meta.url), "utf8")
);
const tagged = new Set(
  svgs.flatMap((svg) => [...svg.matchAll(/data-muscle="(\w+)"/g)].map((match) => match[1]))
);

MUSCLE_IDS.forEach((muscleId) => {
  assert.ok(tagged.has(muscleId), `no body-map path is tagged data-muscle="${muscleId}"`);
});

// Untagged muscle paths are the deliberate skip list: head, hands, forearms,
// feet. The count is pinned so a regenerated SVG shows up as a failure here.
const untagged = svgs.map(
  (svg) =>
    [...svg.matchAll(/<path\b[^>]*?>/gs)].filter(
      (match) => match[0].includes(BASE_FILL) && !match[0].includes("data-muscle")
    ).length
);
assert.deepEqual(untagged, [67, 10], "body SVG changed — re-tag its paths with data-muscle");

// A MuscleId with no CSS rule falls back to the idle grey and looks exactly
// like a muscle you never trained — silent, and only visible by inspection.
const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
MUSCLE_IDS.forEach((muscleId) => {
  assert.ok(
    css.includes(`[data-muscle="${muscleId}"]`),
    `globals.css has no fill rule for "${muscleId}"`
  );
});

console.log("body map checks passed");

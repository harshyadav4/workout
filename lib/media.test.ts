// Run with: npm run check
import assert from "node:assert/strict";

import { readFileSync } from "node:fs";

import { PRESET_DATASET_IDS, releaseUnusedMedia } from "@/lib/media";
import { presetWorkouts } from "@/lib/seed-data";
import { removedMediaPaths } from "@/lib/sync";
import type { SessionTemplate, WorkoutTemplate } from "@/lib/types";

const template = (id: string, mediaPath?: string): WorkoutTemplate => ({
  id,
  name: id,
  category: "Custom",
  isPreset: false,
  muscles: [],
  mediaPath
});
const session = (id: string, workoutIds: string[]): SessionTemplate => ({
  id,
  name: id,
  workoutIds,
  exercises: [],
  summary: { totalSets: 0, totalReps: 0, totalWeight: 0 }
});

const templates = [template("landmine", "u/a.gif"), template("sled", "u/b.gif"), template("plain")];

// Still used: nothing changes, and the same array comes back (no needless write).
assert.equal(releaseUnusedMedia(templates, [session("s", ["landmine", "sled"])]), templates);

// Deleting the session that used "sled" drops its media, keeps the template.
const released = releaseUnusedMedia(templates, [session("s", ["landmine"])]);
assert.equal(released.find((item) => item.id === "sled")?.mediaPath, undefined);
assert.equal(released.find((item) => item.id === "landmine")?.mediaPath, "u/a.gif");
assert.equal(released.length, 3, "templates stay: logged history still names them");

// The sync layer turns that into exactly one file to delete.
assert.deepEqual(removedMediaPaths(templates, released), ["u/b.gif"]);

// A path two templates share survives until neither uses it.
const shared = [template("a", "u/same.gif"), template("b", "u/same.gif")];
assert.deepEqual(removedMediaPaths(shared, [shared[0], template("b")]), []);
assert.deepEqual(removedMediaPaths(shared, [template("a"), template("b")]), ["u/same.gif"]);

console.log("media cleanup checks passed");

// Every built-in exercise has a demo, and every demo it points at exists. A
// preset added without an entry here silently ships with no video.
{
  const raw = JSON.parse(readFileSync("public/exercises.json", "utf8"));
  const entries: { id: string }[] = Array.isArray(raw) ? raw : Object.values(raw)[0] as { id: string }[];
  const library = new Set(entries.map((entry) => entry.id));

  for (const preset of presetWorkouts) {
    const id = PRESET_DATASET_IDS[preset.id];
    assert.ok(id, `${preset.name} has a library demo`);
    assert.ok(library.has(id), `${preset.name} points at ${id}, which is in the library`);
  }
}

// Deleting a template must not strip the demo from sessions on the calendar.
{
  const onCalendar = [{ exercises: [{ workoutId: "sled" } as never] }];
  assert.equal(
    releaseUnusedMedia(templates, [session("s", ["landmine"])], onCalendar),
    templates,
    "a GIF a scheduled session still uses is kept, template or not"
  );
}

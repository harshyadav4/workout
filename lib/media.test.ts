// Run with: npm run check
import assert from "node:assert/strict";

import { releaseUnusedMedia } from "@/lib/media";
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

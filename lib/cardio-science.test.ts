// Run with: npm run check
import assert from "node:assert/strict";

import type { CardioSession } from "@/lib/cardio-metrics";
import { bestVdot, buildRacePredictions, paceZones, riegel, vdotFor, velocityAtVo2, vo2AtVelocity } from "@/lib/cardio-science";

const near = (a: number, b: number, tolerance: number, message: string) => assert.ok(Math.abs(a - b) <= tolerance, `${message}: ${a} vs ${b}`);
const run = (km: number, seconds: number, date = "2026-10-20"): CardioSession => ({ logId: `${km}-${seconds}`, date, workoutId: "run", name: "Run", km, seconds, pace: seconds / km });

// --- Daniels -------------------------------------------------------------------

near(vdotFor(5, 20 * 60)!, 49.8, 0.5, "a 20:00 5 km is about VDOT 50 in the tables");
near(vdotFor(10, 50 * 60)!, 41.0, 1.0, "a 50:00 10 km is about VDOT 41");
assert.ok(vdotFor(5, 25 * 60)! < vdotFor(5, 20 * 60)!, "slower is lower");
assert.equal(vdotFor(1, 4 * 60), undefined, "a kilometre is not a race");
assert.equal(vdotFor(2, 3 * 60), undefined, "under 3.5 minutes is off the tables");
assert.equal(vdotFor(60, 200 * 60), undefined, "over three hours is off the tables");
near(velocityAtVo2(vo2AtVelocity(250)), 250, 1e-6, "the velocity inverse round-trips");

// The best run wins, and an interval session too short to count is skipped.
{
  const best = bestVdot([run(5, 25 * 60), run(0.4, 80), run(5, 20 * 60, "2026-10-01"), run(10, 48 * 60)])!;
  assert.equal(best.session.date, "2026-10-01", "the 20:00 5 km, not the newer slower one");
  assert.equal(bestVdot([run(0.4, 80)]), undefined);
}

// --- Riegel ---------------------------------------------------------------------------

near(riegel(20 * 60, 5, 10), 2502, 3, "5 km in 20:00 predicts 10 km in about 41:42");
{
  const predictions = buildRacePredictions(run(5, 20 * 60));
  assert.deepEqual(predictions.map((race) => race.label), ["5 km", "10 km", "Half marathon", "Marathon"]);
  near(predictions[0].seconds, 20 * 60, 1e-9, "the distance it came from predicts itself");
  assert.deepEqual(predictions.map((race) => race.stretch), [false, false, true, true], "past 3× the distance the prediction is flagged");
  assert.ok(predictions[3].seconds > 2 * predictions[2].seconds, "a marathon is slower than two halves");
}

// --- zones -------------------------------------------------------------------------------

{
  const zones = paceZones(50);
  assert.deepEqual(zones.map((zone) => zone.id), ["E", "M", "T", "I", "R"]);
  zones.forEach((zone) => assert.ok(zone.fast < zone.slow, `${zone.id}: the fast edge is fewer seconds per km`));
  for (let index = 1; index < zones.length; index += 1) {
    assert.ok(zones[index].fast < zones[index - 1].fast, `${zones[index].id} is faster than ${zones[index - 1].id}`);
  }
  // Daniels' table for VDOT 50: E ≈ 5:00–5:30 /km, T ≈ 4:15 /km, I ≈ 3:55 /km.
  near(zones[0].slow, 5.6 * 60, 30, "easy, slow edge");
  near(zones[2].fast, 4.2 * 60, 15, "threshold");
  near(zones[3].fast, 3.9 * 60, 12, "interval");
}

console.log("cardio science checks passed");

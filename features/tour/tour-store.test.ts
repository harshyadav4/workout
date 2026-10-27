// Run with: npm run check
import assert from "node:assert/strict";

import { afterTour, endTour, isTouring, setTourStep, startTour, withSample } from "@/features/tour/tour-store";
import { createWorkoutStore, flushPersist } from "@/features/workout/workout-store";
import { buildDemoState } from "@/lib/demo-data";

// The store saves to localStorage when `window` exists — checked when it
// saves, not when it loads, so plain imports above are fine. A stand-in for
// both, so the test sees every write the real store makes.
const storage = new Map<string, string>();
let writes = 0;
Object.assign(globalThis, {
  window: {},
  localStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      writes += 1;
      storage.set(key, value);
    },
    removeItem: (key: string) => storage.delete(key)
  }
});

const today = "2026-10-27";
const demo = buildDemoState(today);

// -- withSample -------------------------------------------------------------

{
  const state = {
    templates: [
      { id: "bench-press", isPreset: true },
      { id: "my-own", isPreset: false }
    ],
    activeDate: today,
    selectedSessionId: "s1",
    selectedMuscleId: "lats",
    owner: "user-1"
  };
  const sample = withSample(state, demo) as typeof state & { logs: unknown[] };

  assert.ok(sample.templates.some((item) => item.id === "bench-press"), "presets stay");
  assert.ok(!sample.templates.some((item) => item.id === "my-own"), "the user's own exercises leave the screen");
  assert.ok(sample.templates.some((item) => item.id === "db-0685"), "the sample's run comes in");
  assert.equal(sample.logs, demo.logs);
  assert.equal(sample.selectedSessionId, undefined, "no selection points at a missing session");
  assert.equal(sample.owner, "user-1", "everything else stays");
}

// -- the sandbox, on the real store -------------------------------------------

{
  const store = createWorkoutStore();
  store.getState().logMeasurement("weight", 90, "2026-10-20");
  flushPersist();
  const saved = [...storage.values()][0];
  assert.ok(saved?.includes('"value":90'), "a real change is saved");

  const real = store.getState();
  const writesBefore = writes;

  startTour(store, demo);
  assert.equal(isTouring(), true);
  assert.equal(store.getState().logs, demo.logs, "the sample is on screen");
  assert.equal(store.getState().profile.name, "Alex Carter");

  // Taps during the tour change the sample, and nothing is saved.
  store.getState().logMeasurement("weight", 70, today);
  store.getState().setActiveDate("2026-10-28");
  assert.equal(writes, writesBefore, "nothing is saved during the tour");
  assert.equal([...storage.values()][0], saved, "the phone's copy is untouched");

  // Starting again mid-tour keeps the first copy, not the sample.
  startTour(store, demo);

  // A late account load waits for the end, then lands on the real data.
  let seen: unknown;
  afterTour(() => {
    seen = store.getState().measurements;
  });
  assert.equal(seen, undefined, "deferred while touring");

  setTourStep(3);
  endTour(store);

  assert.equal(isTouring(), false);
  assert.equal(store.getState(), real, "the real state comes back, object for object");
  assert.equal(seen, real.measurements, "the deferred work ran on the real data");
  assert.equal(writes, writesBefore, "the restore is not saved as a change");
  assert.equal([...storage.values()][0], saved);

  // After the tour, saving works again.
  store.getState().logMeasurement("weight", 89, "2026-10-21");
  flushPersist();
  assert.ok(writes > writesBefore, "saving resumes after the tour");
  assert.ok([...storage.values()][0]?.includes('"value":89'));

  // Outside a tour, afterTour runs at once.
  let now = false;
  afterTour(() => {
    now = true;
  });
  assert.equal(now, true);

  // Ending when no tour runs does nothing.
  const before = store.getState();
  endTour(store);
  assert.equal(store.getState(), before);
}

console.log("tour store checks passed");

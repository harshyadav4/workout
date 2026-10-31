// Run with: npm run check
import assert from "node:assert/strict";

import {
  PLACES_ON_BODY,
  VIEW_SIZE,
  litMuscles,
  markPoints,
  nearestPlace,
  sideOfHalf,
  type BodyView,
  viewOfPlace
} from "@/features/injuries/body-places";
import { INJURY_PLACES, injuryName } from "@/lib/injuries";
import type { InjuryPlace } from "@/lib/types";

const name = (view: BodyView, x: number, y: number) => {
  const tap = nearestPlace(view, x, y);
  return injuryName({ place: tap.place, side: tap.side });
};

// The person's left is on your right on Front, and on your left on Back.
assert.equal(sideOfHalf("front", true), "right");
assert.equal(sideOfHalf("front", false), "left");
assert.equal(sideOfHalf("back", true), "left");
assert.equal(sideOfHalf("back", false), "right");

// A tap right on each place names it.
const cases: [BodyView, number, number, string][] = [
  ["front", 60, 146, "Right hip"],
  ["front", 103, 146, "Left hip"],
  ["front", 69, 223, "Right knee"],
  ["front", 94, 223, "Left knee"],
  ["front", 81.5, 20, "Neck"],
  ["front", 81.5, 112, "Abs"],
  ["front", 45, 88, "Right biceps"],
  ["front", 118, 88, "Left biceps"],
  ["front", 17, 146, "Right wrist"],
  ["front", 72, 297, "Right ankle"],
  ["front", 60, 190, "Right quad"],
  ["front", 74, 165, "Right groin"],
  ["front", 64, 70, "Right chest"],
  ["front", 67, 257, "Right shin"],
  ["back", 38.5, 57, "Lower back"],
  ["back", 38.5, 33, "Upper back"],
  ["back", 30, 90, "Left hamstring"],
  ["back", 47, 90, "Right hamstring"],
  ["back", 30, 116, "Left calf"],
  ["back", 30, 72, "Left glute"],
  ["back", 22, 29.5, "Left shoulder"],
  ["back", 55, 29.5, "Right shoulder"],
  ["back", 18, 43, "Left triceps"],
  ["back", 30, 102, "Left knee"],
  ["back", 15, 52, "Left elbow"],
  ["back", 8, 67, "Left wrist"],
  ["back", 11.5, 61, "Left forearm"],
  ["back", 30, 139, "Left ankle"]
];
for (const [view, x, y, want] of cases) {
  assert.equal(name(view, x, y), want, `${view} ${x},${y}`);
}

// A tap off the body still lands somewhere sensible.
assert.equal(name("front", 0, 0).includes("hip"), false);
assert.equal(name("back", 38.5, 2), "Neck", "the head goes to the neck");

const places = Object.keys(INJURY_PLACES) as InjuryPlace[];
for (const place of places) {
  const info = PLACES_ON_BODY[place];
  assert.ok(info.front || info.back, `${place} is on a drawing`);
  const view = viewOfPlace(place);
  assert.equal(markPoints(place, "left", view).length, 1, `${place} gets one mark`);

  // Every place can be reached by tapping right on it.
  for (const side of ["front", "back"] as const) {
    for (const point of info[side] ?? []) {
      assert.equal(nearestPlace(side, point[0], point[1]).place, place, `${place} is tappable on ${side}`);
    }
  }
}

// The mark follows the side.
{
  const { width } = VIEW_SIZE.front;
  assert.deepEqual(markPoints("hip", "right", "front"), [[60, 146]], "their right is on your left");
  assert.deepEqual(markPoints("hip", "left", "front"), [[width - 60, 146]]);
  assert.equal(markPoints("hip", "both", "front").length, 2);
  assert.deepEqual(markPoints("hip", "left", "back"), [], "the hip is not on Back");
  assert.equal(markPoints("lowerBack", undefined, "back").length, 1);
  assert.equal(markPoints("lowerBack", "both", "back").length, 1, "a middle place has one mark");
  assert.deepEqual(markPoints("hamstring", "left", "back"), [[30, 90]], "their left is on your left on Back");
}

assert.equal(viewOfPlace("knee"), "front");
assert.equal(viewOfPlace("hamstring"), "back");
assert.deepEqual(litMuscles("knee", "front"), [], "a joint lights no muscle");
assert.deepEqual(litMuscles("hamstring", "back"), ["hamsOuter", "hamsInner"]);
assert.deepEqual(litMuscles("hamstring", "front"), []);

console.log("body places checks passed");

// Run with: npm run check
import assert from "node:assert/strict";

import { GAP, GUTTER, MAX_WIDTH, placeGuide } from "@/features/tour/placement";

const phone = { width: 390, height: 844 };
const limits = { topLimit: 48, bottomLimit: 740 };
const rowHeight = 120;

// A part near the top: the guide sits below it, looking up.
{
  const target = { top: 80, left: 16, width: 358, height: 200 };
  const layout = placeGuide({ target, viewport: phone, rowHeight, ...limits });
  assert.equal(layout.side, "below");
  assert.equal(layout.top, 80 + 200 + GAP);
  assert.equal(layout.left, GUTTER);
  assert.equal(layout.width, 390 - GUTTER * 2);
  assert.ok(layout.gaze.y < 0, "it looks up at the part");
}

// A part near the bottom: above it, looking down.
{
  const target = { top: 560, left: 16, width: 358, height: 150 };
  const layout = placeGuide({ target, viewport: phone, rowHeight, ...limits });
  assert.equal(layout.side, "above");
  assert.equal(layout.top, 560 - GAP - rowHeight);
  assert.ok(layout.gaze.y > 0, "it looks down at the part");
}

// A part taller than the room around it: on its lower edge, still on screen.
{
  const target = { top: 40, left: 16, width: 358, height: 760 };
  const layout = placeGuide({ target, viewport: phone, rowHeight, ...limits });
  assert.equal(layout.side, "over");
  assert.equal(layout.top, limits.bottomLimit - rowHeight);
}

// Never over the bottom navigation, never under the status bar.
for (const top of [-200, 0, 300, 700, 900]) {
  const layout = placeGuide({ target: { top, left: 0, width: 390, height: 60 }, viewport: phone, rowHeight, ...limits });
  assert.ok(layout.top + rowHeight <= limits.bottomLimit, `clear of the navigation (part at ${top})`);
  assert.ok(layout.top >= limits.topLimit, `clear of the status bar (part at ${top})`);
}

// Nothing to point at: centred in the free space, looking straight ahead.
{
  const layout = placeGuide({ viewport: phone, rowHeight, ...limits });
  assert.equal(layout.side, "centre");
  assert.equal(layout.top, Math.round((48 + 740 - rowHeight) / 2));
  assert.deepEqual(layout.gaze, { x: 0, y: 0 });
}

// A wide screen: a note, not a banner, centred.
{
  const layout = placeGuide({ viewport: { width: 1024, height: 768 }, rowHeight, topLimit: 24, bottomLimit: 660 });
  assert.equal(layout.width, MAX_WIDTH);
  assert.equal(layout.left, Math.round((1024 - MAX_WIDTH) / 2));
}

// A part to the right: the eyes go right.
{
  const layout = placeGuide({ target: { top: 100, left: 300, width: 60, height: 40 }, viewport: phone, rowHeight, ...limits });
  assert.ok(layout.gaze.x > 0.5, "looks right");
}

console.log("tour placement checks passed");

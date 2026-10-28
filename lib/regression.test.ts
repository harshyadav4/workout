// Run with: npm run check
import assert from "node:assert/strict";

import { leastSquares, predict } from "@/lib/regression";

// A perfect line comes back exactly.
{
  const fit = leastSquares([0, 1, 2, 3], [10, 12, 14, 16]);
  assert.ok(fit);
  assert.equal(fit.slope, 2);
  assert.equal(fit.intercept, 10);
  assert.equal(fit.n, 4);
  assert.equal(predict(fit, 5), 20);
}

// Noise averages out: the slope is the trend, not the last step.
{
  const fit = leastSquares([0, 7, 14, 21, 28], [80, 79.6, 79.9, 79.1, 79.2]);
  assert.ok(fit);
  assert.ok(fit.slope < 0 && fit.slope > -0.05, `a slow loss, ${fit.slope} kg/day`);
}

// Too little to fit is undefined, never a slope of 0 that reads as "steady".
assert.equal(leastSquares([3], [80]), undefined, "one point");
assert.equal(leastSquares([], []), undefined, "no points");
assert.equal(leastSquares([5, 5, 5], [80, 81, 82]), undefined, "same day three times has no slope");

console.log("regression checks passed");

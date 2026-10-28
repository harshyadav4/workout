/**
 * Ordinary least squares through a handful of points. The one place a slope is
 * fitted, so every "kg per week" on the Science tab is the same arithmetic.
 *
 * `buildGoalEta` (lib/progress-extras) carries its own inline copy from before
 * this existed and is left alone: it is tested, and a shared helper is not a
 * reason to re-open a card that works.
 */
export interface Fit {
  slope: number;
  intercept: number;
  n: number;
}

/**
 * Undefined with fewer than two points, or when every x is the same — a
 * vertical line has no slope, and returning 0 would read as "steady".
 */
export function leastSquares(xs: number[], ys: number[]): Fit | undefined {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) {
    return undefined;
  }
  const meanX = xs.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const meanY = ys.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const spread = xs.slice(0, n).reduce((sum, x) => sum + (x - meanX) ** 2, 0);
  if (spread === 0) {
    return undefined;
  }
  const slope = xs.slice(0, n).reduce((sum, x, index) => sum + (x - meanX) * (ys[index] - meanY), 0) / spread;
  return { slope, intercept: meanY - slope * meanX, n };
}

/** The fitted value at `x`. */
export function predict(fit: Fit, x: number): number {
  return fit.intercept + fit.slope * x;
}

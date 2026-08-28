/**
 * Unilateral lifts — lunges, single-arm rows, split squats.
 *
 * The model stays **one number: the total across both sides.** That is the
 * decision this whole file exists to hold. Storing per-side reps would mean
 * every volume sum, every rep count and every progression rule in the app needs
 * to know whether a lift is unilateral, and would silently halve historical
 * totals for anything reclassified. Only display and target stepping change.
 *
 * The cost is that a total must stay even, or it describes a set one side
 * could not have done. `stepForSide` is what keeps that true.
 */

/** Reps move in twos on a unilateral lift — one per side, never a half rep. */
export function stepForSide(perSide: boolean | undefined): number {
  return perSide ? 2 : 1;
}

/**
 * "16 (8 per side)" — the total stays primary because the total is what is stored.
 *
 * An odd total is shown honestly rather than rounded away. It can only arrive
 * from a lift reclassified as unilateral after the fact, and quietly displaying
 * 8.5 per side is a smaller lie than quietly displaying 8.
 */
export function formatPerSide(totalReps: number, perSide: boolean | undefined): string {
  if (!perSide || totalReps <= 0) {
    return `${totalReps}`;
  }
  const half = totalReps / 2;
  return `${totalReps} (${Number.isInteger(half) ? half : half.toFixed(1)} per side)`;
}

/** Rounds a target up to something both sides can actually share. */
export function evenTarget(reps: number, perSide: boolean | undefined): number {
  return perSide && reps % 2 !== 0 ? reps + 1 : reps;
}

/**
 * "Delete all my data", with a week to change your mind.
 *
 * Asking for deletion only stamps the date. Nothing goes until the grace
 * period is over, so restoring is just clearing the stamp — there is no copy
 * to bring back, because nothing was removed. Pure functions; the clock is a
 * parameter so the tests pin it.
 */

export const DELETION_GRACE_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/** When a request made at `requestedAt` (ISO) is carried out. */
export function deletionDate(requestedAt: string): Date {
  return new Date(new Date(requestedAt).getTime() + DELETION_GRACE_DAYS * DAY_MS);
}

/** Whether the week is over and the data should go now. */
export function deletionDue(requestedAt: string | undefined, now: Date): boolean {
  if (!requestedAt || Number.isNaN(new Date(requestedAt).getTime())) {
    return false;
  }
  return now.getTime() >= deletionDate(requestedAt).getTime();
}

/** Whole days left to restore, rounded up: on the last afternoon it is still "1 day". */
export function daysToRestore(requestedAt: string, now: Date): number {
  return Math.max(0, Math.ceil((deletionDate(requestedAt).getTime() - now.getTime()) / DAY_MS));
}

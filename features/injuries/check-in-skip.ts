/**
 * "Skip this week" for the pain question. A preference of this phone, not data,
 * so it stays out of the store and out of the account, like the tour's flags.
 */
const key = (injuryId: string) => `arise.pain-skipped.${injuryId}`;

export function readPainSkip(injuryId: string): string | undefined {
  try {
    return localStorage.getItem(key(injuryId)) ?? undefined;
  } catch {
    return undefined;
  }
}

export function skipPainQuestion(injuryId: string, today: string) {
  try {
    localStorage.setItem(key(injuryId), today);
  } catch {
    // Private mode: the question comes back tomorrow, which does no harm.
  }
}

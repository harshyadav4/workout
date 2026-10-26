/**
 * When the tour starts by itself: once, on a phone with no training of its
 * own, and only once the account (if any) has been read — an existing lifter
 * on a new phone has an empty store for the first second, and must not be
 * shown "Welcome" over data that is still arriving.
 *
 * Pure, so the rule is tested without a browser (autostart-rule.test.ts).
 */
export interface AutostartInput {
  /** Sessions, plans or weigh-ins on this phone. */
  hasData: boolean;
  /** The tour has started on this phone before. */
  seen: boolean;
  /** Signed in, with the account not read yet (or its read failed). */
  accountPending: boolean;
  touring: boolean;
}

export function shouldAutostart({ hasData, seen, accountPending, touring }: AutostartInput): boolean {
  return !hasData && !seen && !accountPending && !touring;
}

/** What counts as "this phone has training of its own". */
export function hasOwnData(state: {
  logs: unknown[];
  sessionTemplates: unknown[];
  measurements: unknown[];
  scheduledSessions: { type: string }[];
}): boolean {
  return (
    state.logs.length > 0 ||
    state.sessionTemplates.length > 0 ||
    state.measurements.length > 0 ||
    state.scheduledSessions.some((session) => session.type === "workout")
  );
}

/** Kept apart from the workout store: a preference of this phone, not data. */
export const TOUR_SEEN_KEY = "arise.tour-seen";

export function readTourSeen(): boolean {
  try {
    return localStorage.getItem(TOUR_SEEN_KEY) === "1";
  } catch {
    // Unreadable storage (some private modes): treat as seen, so a tour that
    // cannot remember itself never starts on every open.
    return true;
  }
}

export function markTourSeen(): void {
  try {
    localStorage.setItem(TOUR_SEEN_KEY, "1");
  } catch {
    // Forgotten after this visit; the replay on the You tab still works.
  }
}

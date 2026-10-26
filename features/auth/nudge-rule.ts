/**
 * When guest mode asks for an account. Twice at most, and only when the
 * account is worth something to the person asked:
 *
 * - "finish": the first finished session — the work is real and it is theirs.
 * - "reminder": three sessions in, still only on this phone.
 *
 * Never to someone signed in, never over the tour's sample, and each one only
 * until it is answered or dismissed. Pure, so it is tested without a browser.
 */
export type Nudge = "finish" | "reminder";

export interface NudgeInput {
  signedIn: boolean;
  touring: boolean;
  /** Days with training logged on this phone. */
  sessions: number;
  /** Home is showing a session finished today. */
  finishedToday: boolean;
  finishAnswered: boolean;
  reminderDismissed: boolean;
}

/** Sessions on this phone before the quiet reminder appears. */
export const REMINDER_AFTER_SESSIONS = 3;

export function nudgeFor(input: NudgeInput, place: "finish-card" | "home"): Nudge | null {
  if (input.signedIn || input.touring) {
    return null;
  }
  if (place === "finish-card") {
    return input.finishedToday && !input.finishAnswered ? "finish" : null;
  }
  // Home's quiet line: not on the day the finish card is already asking.
  if (input.finishedToday && !input.finishAnswered) {
    return null;
  }
  return input.sessions >= REMINDER_AFTER_SESSIONS && !input.reminderDismissed ? "reminder" : null;
}

export const NUDGE_KEYS: Record<Nudge, string> = {
  finish: "arise.signin.finish-answered",
  reminder: "arise.signin.reminder-dismissed"
};

export function readNudgeDone(nudge: Nudge): boolean {
  try {
    return localStorage.getItem(NUDGE_KEYS[nudge]) === "1";
  } catch {
    // Unreadable storage: treat as answered, so nothing nags on every open.
    return true;
  }
}

export function markNudgeDone(nudge: Nudge): void {
  try {
    localStorage.setItem(NUDGE_KEYS[nudge], "1");
  } catch {
    // Asked again next visit; harmless.
  }
}

/**
 * Timers that survive the app closing.
 *
 * This is a web app: lock the phone, switch to music, or swipe it away, and
 * the page's JavaScript stops or is thrown out. So no timer here counts — each
 * keeps an absolute moment (when the rest ends, when the hold started) on the
 * device, and the screen works the time out from the clock whenever it is
 * looked at. Reopen the app mid-rest and the timer shows what is really left.
 *
 * Reads are defensive: storage can be full, blocked, or hold a copy written by
 * an older build, and a broken timer must never take the session down with it.
 */

export const REST_KEY = "arise.rest";
export const LIVE_KEY = "arise.live";

/** A live timer older than this was forgotten, not held: drop it on reopen. */
const STALE_LIVE_MS = 6 * 60 * 60 * 1000;

export interface RestState {
  /** When the rest is over, ms since epoch. */
  endsAt: number;
  /** The whole rest in seconds, for how full the bar is. */
  total: number;
}

export interface LiveState {
  /** The set being timed. One at a time: you hold one plank at once. */
  setId: string;
  startedAt: number;
}

function parse(raw: string | null): unknown {
  if (!raw) {
    return undefined;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/**
 * The rest after "+15s" / "−15s" at `now`.
 *
 * Never below now: −15 on four seconds left means "done", not a clock that
 * owes you eleven seconds next time. And +15 on a rest that has already run
 * out starts a fresh 15: the same clamp used to pin that at now too, so once a
 * rest was more than 15 s overdue the key did nothing at all.
 */
export function extendRest(state: RestState, deltaSeconds: number, now: number): RestState {
  if (deltaSeconds > 0 && state.endsAt <= now) {
    return { endsAt: now + deltaSeconds * 1000, total: deltaSeconds };
  }
  return {
    endsAt: Math.max(now, state.endsAt + deltaSeconds * 1000),
    // A longer rest is a longer bar, not a bar that jumps backwards.
    total: Math.max(1, state.total + deltaSeconds)
  };
}

/** A rest still running at `now`, or nothing — a finished rest is not restored. */
export function restoreRest(raw: string | null, now: number): RestState | undefined {
  const value = parse(raw) as Partial<RestState> | undefined;
  if (
    !value ||
    typeof value.endsAt !== "number" ||
    typeof value.total !== "number" ||
    value.endsAt <= now ||
    value.total <= 0
  ) {
    return undefined;
  }
  return { endsAt: value.endsAt, total: value.total };
}

/** A live timer worth resuming at `now`: started, not in the future, not abandoned. */
export function restoreLive(raw: string | null, now: number): LiveState | undefined {
  const value = parse(raw) as Partial<LiveState> | undefined;
  if (
    !value ||
    typeof value.setId !== "string" ||
    typeof value.startedAt !== "number" ||
    value.startedAt > now ||
    now - value.startedAt > STALE_LIVE_MS
  ) {
    return undefined;
  }
  return { setId: value.setId, startedAt: value.startedAt };
}

/** Whole seconds since `startedAt`; never negative, even if the clock moved back. */
export function elapsedSeconds(startedAt: number, now: number): number {
  return Math.max(0, Math.floor((now - startedAt) / 1000));
}

/** "0:45", "12:03", "1:02:07" — a running clock, hours only once there are some. */
export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = String(safe % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}

export function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: unknown) {
  try {
    if (value === undefined) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, JSON.stringify(value));
    }
  } catch {
    // Private mode or a full disk: the timer still runs, it just will not
    // survive a reload. Nothing to tell the user mid-set.
  }
}

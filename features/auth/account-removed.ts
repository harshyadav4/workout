/**
 * One flag between "the account is gone, so this device signed itself out"
 * (features/workout/supabase-sync.tsx) and the sentence on the You tab that
 * says so. sessionStorage: it must outlive the sign-out re-render and die with
 * the tab, and it is read once and cleared. Every access is guarded — private
 * windows and cleared site data make storage throw.
 */
const KEY = "arise.account-removed";

export function markAccountRemoved() {
  try {
    sessionStorage.setItem(KEY, "1");
  } catch {
    // No storage: the device still signs out, only the sentence is lost.
  }
}

/** True once, then the flag is gone. */
export function takeAccountRemovedNotice(): boolean {
  try {
    const set = sessionStorage.getItem(KEY) === "1";
    if (set) {
      sessionStorage.removeItem(KEY);
    }
    return set;
  } catch {
    return false;
  }
}

/** A sign-in makes any pending notice stale. */
export function clearAccountRemovedNotice() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}

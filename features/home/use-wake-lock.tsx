"use client";

import { useEffect } from "react";

/**
 * Hold the screen awake while a session is being logged.
 *
 * Between every set the phone locks, and you unlock it with chalky hands to tap
 * one button. Feature-detected: `wakeLock` is absent on older iOS and on any
 * non-secure origin, and its absence is not an error worth showing anyone.
 */
export function useScreenWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) {
      return;
    }

    let sentinel: WakeLockSentinel | undefined;
    let released = false;

    const acquire = () => {
      void navigator.wakeLock
        .request("screen")
        .then((lock) => {
          if (released) {
            void lock.release();
            return;
          }
          sentinel = lock;
        })
        // Rejects whenever the document is not visible, which is every tab
        // switch. Nothing to report and nothing to retry here.
        .catch(() => undefined);
    };

    // The browser drops the lock on every backgrounding, and does not give it
    // back on return — without this it survives exactly one glance away.
    const reacquire = () => {
      if (document.visibilityState === "visible") {
        acquire();
      }
    };

    acquire();
    document.addEventListener("visibilitychange", reacquire);

    return () => {
      released = true;
      document.removeEventListener("visibilitychange", reacquire);
      void sentinel?.release().catch(() => undefined);
    };
  }, [active]);
}

"use client";

import { useEffect } from "react";

/**
 * Registers public/sw.js in production only. In development the worker would
 * cache Next's dev chunks and serve yesterday's code after a save.
 *
 * Also asks once for persistent storage. The training lives in localStorage
 * on the phone; without this the browser may clear it when space runs low
 * (Safari also clears after weeks unused, unless the app is installed).
 * The browser decides with no prompt in most cases; no UI either way.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    void (async () => {
      try {
        if (navigator.storage?.persisted && !(await navigator.storage.persisted())) {
          await navigator.storage.persist?.();
        }
      } catch {
        // Not supported or refused: the data is kept as before.
      }
    })();

    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) {
      return;
    }
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // An app without offline support still works; nothing to tell the user.
    });
  }, []);

  return null;
}

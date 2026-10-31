"use client";

import { useEffect } from "react";

/** After the page has settled, so saving never competes with opening the app. */
const SAVE_OFFLINE_AFTER_MS = 3000;

/**
 * Registers public/sw.js in production only. In development the worker would
 * cache Next's dev chunks and serve yesterday's code after a save. Then it asks
 * the worker to save the whole app for offline, which does nothing if this
 * release is already saved. Not on Data Saver: the person asked for less.
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
    let timer: ReturnType<typeof setTimeout> | undefined;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then(() => navigator.serviceWorker.ready)
      .then((registration) => {
        const { connection } = navigator as Navigator & { connection?: { saveData?: boolean } };
        if (!connection?.saveData) {
          timer = setTimeout(() => registration.active?.postMessage({ type: "save-offline" }), SAVE_OFFLINE_AFTER_MS);
        }
      })
      .catch(() => {
        // An app without offline support still works; nothing to tell the user.
      });
    return () => clearTimeout(timer);
  }, []);

  return null;
}

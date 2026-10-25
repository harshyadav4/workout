"use client";

import { useEffect } from "react";

/**
 * Registers public/sw.js in production only. In development the worker would
 * cache Next's dev chunks and serve yesterday's code after a save.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) {
      return;
    }
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // An app without offline support still works; nothing to tell the user.
    });
  }, []);

  return null;
}

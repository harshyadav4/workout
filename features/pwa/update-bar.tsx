"use client";

import { RefreshCw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { LIVE_KEY, REST_KEY, readStorage, restoreLive, restoreRest } from "@/lib/timer";

/** The build this page was loaded from (next.config `env`). */
const LOADED = process.env.NEXT_PUBLIC_BUILD_ID || "dev";
/** At most one check per ten minutes, however often the app is reopened. */
const CHECK_EVERY_MS = 10 * 60 * 1000;

/**
 * Whether a reload now would cut something short: a rest or a set timer
 * running, a sheet open (a half-built session lives only in it), or a field
 * being typed in. Each of those is the user's, and the update waits.
 */
function midTask(): boolean {
  const now = Date.now();
  if (restoreRest(readStorage(REST_KEY), now) || restoreLive(readStorage(LIVE_KEY), now)) {
    return true;
  }
  if (document.querySelector('[role="dialog"]')) {
    return true;
  }
  const focused = document.activeElement;
  return focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement;
}

/** True only when both builds are real and differ. Development never offers. */
export function isNewer(loaded: string, server: string | undefined): boolean {
  return Boolean(server) && loaded !== "dev" && server !== "dev" && server !== loaded;
}

/**
 * Updates the way a store app does: quietly, while nobody is looking. An
 * installed app stays open for days, so it checks when it comes back to the
 * screen — /api/version against the build it was loaded from — and asks the
 * service worker to look for a new sw.js. Once a newer build is known, the
 * next time the app goes to the background it reloads right there, with
 * nothing on screen to flash, unless a timer or a sheet is in use (midTask).
 * The "New version · Reload" bar above the dock is the fallback for an app
 * that never leaves the screen. Pages are network first in sw.js, so either
 * route gets the new build.
 */
export function UpdateBar() {
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const lastCheck = useRef(0);
  // Read inside the visibility handler, which closes over the first render.
  const newer = useRef(false);

  useEffect(() => {
    if (LOADED === "dev") {
      return;
    }

    const check = async () => {
      if (document.visibilityState !== "visible" || Date.now() - lastCheck.current < CHECK_EVERY_MS) {
        return;
      }
      lastCheck.current = Date.now();
      try {
        const registration = await navigator.serviceWorker?.getRegistration();
        void registration?.update().catch(() => undefined);
      } catch {
        // No worker: the version check still works.
      }
      try {
        const response = await fetch("/api/version", { cache: "no-store" });
        if (!response.ok) {
          return;
        }
        const { version } = (await response.json()) as { version?: string };
        if (isNewer(LOADED, version)) {
          newer.current = true;
          setShow(true);
        }
      } catch {
        // Offline: try again on the next return to the app.
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        if (newer.current && !midTask()) {
          window.location.reload();
        }
        return;
      }
      void check();
    };

    // The first load is the current build; the first check is ten minutes on.
    lastCheck.current = Date.now();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  if (!show || dismissed) {
    return null;
  }

  return (
    <div
      role="status"
      className="fixed inset-x-0 z-40 px-4 bottom-[calc(env(safe-area-inset-bottom)+6rem)]"
    >
      <div className="plaque-solid mx-auto flex max-w-md items-center gap-2 rounded-2xl py-1.5 pl-4 pr-1.5">
        <p className="min-w-0 flex-1 text-sm font-semibold">New version</p>
        <Button size="sm" onClick={() => window.location.reload()}>
          <RefreshCw className="h-4 w-4" aria-hidden />
          Reload
        </Button>
        <button
          type="button"
          aria-label="Hide"
          onClick={() => setDismissed(true)}
          className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

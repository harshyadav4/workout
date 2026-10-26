"use client";

import { RefreshCw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

/** The build this page was loaded from (next.config `env`). */
const LOADED = process.env.NEXT_PUBLIC_BUILD_ID || "dev";
/** At most one check per ten minutes, however often the app is reopened. */
const CHECK_EVERY_MS = 10 * 60 * 1000;

/** True only when both builds are real and differ. Development never offers. */
export function isNewer(loaded: string, server: string | undefined): boolean {
  return Boolean(server) && loaded !== "dev" && server !== "dev" && server !== loaded;
}

/**
 * "New version · Reload", just above the dock. An installed app stays open
 * for days, so it checks when it comes back to the screen: /api/version
 * against the build it was loaded from. It also asks the service worker to
 * look for a new sw.js. Pages are network first in sw.js, so Reload gets the
 * new build.
 */
export function UpdateBar() {
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const lastCheck = useRef(0);

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
          setShow(true);
        }
      } catch {
        // Offline: try again on the next return to the app.
      }
    };

    // The first load is the current build; the first check is ten minutes on.
    lastCheck.current = Date.now();
    document.addEventListener("visibilitychange", check);
    return () => document.removeEventListener("visibilitychange", check);
  }, []);

  if (!show || dismissed) {
    return null;
  }

  return (
    <div
      role="status"
      className="fixed inset-x-0 z-40 px-4 bottom-[calc(env(safe-area-inset-bottom)+6.25rem)]"
    >
      <div className="plaque mx-auto flex max-w-md items-center gap-2 rounded-2xl py-1.5 pl-4 pr-1.5">
        <p className="min-w-0 flex-1 text-sm font-semibold">New version</p>
        <Button size="sm" onClick={() => window.location.reload()}>
          <RefreshCw className="h-4 w-4" aria-hidden />
          Reload
        </Button>
        <button
          type="button"
          aria-label="Hide"
          onClick={() => setDismissed(true)}
          className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

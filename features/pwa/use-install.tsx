"use client";

import { useEffect, useState } from "react";

/** Chrome's install event. Not in the DOM lib types. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type InstallState =
  /** Already running as an installed app. Show nothing. */
  | { kind: "installed" }
  /** Android / desktop Chrome: one tap shows the system install sheet. */
  | { kind: "prompt"; install: () => Promise<void> }
  /** iPhone / iPad Safari: no prompt exists; the user adds it from Share. */
  | { kind: "ios" }
  /** A browser that cannot install, or has not offered it yet. */
  | { kind: "unavailable" };

// Caught once per page load and shared: the event fires before most
// components mount, and it can only be used once.
let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    // Keep Chrome's own mini-bar away; the app offers the button itself.
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    listeners.forEach((listener) => listener());
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    listeners.forEach((listener) => listener());
  });
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari's own flag for a home-screen web app.
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos() {
  const ua = navigator.userAgent;
  // iPadOS 13+ reports itself as a Mac; touch points give it away.
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

export function useInstall(): InstallState {
  const [, rerender] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const listener = () => rerender((n) => n + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  // The server has no window: report nothing until mounted, so the first
  // client render matches the HTML.
  if (!mounted) {
    return { kind: "unavailable" };
  }
  if (isStandalone()) {
    return { kind: "installed" };
  }
  // iPhone first: every iPhone browser installs only through Share › Add to
  // Home Screen, whatever events it happens to fire.
  if (isIos()) {
    return { kind: "ios" };
  }
  if (deferred) {
    const event = deferred;
    return {
      kind: "prompt",
      install: async () => {
        await event.prompt();
        await event.userChoice;
        deferred = null;
        rerender((n) => n + 1);
      }
    };
  }
  return { kind: "unavailable" };
}

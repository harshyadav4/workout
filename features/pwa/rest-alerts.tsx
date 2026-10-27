"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import { useAuth } from "@/features/auth/use-auth";
import { pushSubscribed, pushSupported, subscribePush, unsubscribePush } from "@/features/pwa/push";
import { cn } from "@/lib/utils";

/*
 * "Rest alerts": a notification when a rest ends while the app is not on the
 * screen. Per device, off by default, stored like Detailed timing.
 *
 * Two layers. A timer in the page, for every device: a phone freezes or
 * throttles the timers of a page that is not on screen — iPhone especially,
 * often within seconds of locking — so this one can come late, or not until the
 * app is opened again. And, signed in, Web Push from the server at the end
 * time (features/pwa/push.ts), which a locked phone still receives.
 */

const KEY = "arise.rest-alerts";
const listeners = new Set<() => void>();

function supported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

function read(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1" && supported() && Notification.permission === "granted";
  } catch {
    return false;
  }
}

/** Called when the switch flips, here or in another tab. */
export function subscribeRestAlerts(listener: () => void) {
  return subscribe(listener);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function write(on: boolean) {
  try {
    window.localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    // Applies for this visit only.
  }
  listeners.forEach((listener) => listener());
}

export function useRestAlerts(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}

/** Shows "Rest done". Through the service worker when there is one (Android needs it). */
async function showRestAlert() {
  const title = "Rest done";
  const options: NotificationOptions = { body: "Time for your next set.", tag: "rest", icon: "/icon-192.png" };
  try {
    // No worker in development (sw.js is production only): plain Notification.
    const registration = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    if (registration) {
      // The same two keys the push layer shows (public/sw.js). Android shows
      // them; the type omits `actions` because a plain Notification has none.
      await registration.showNotification(title, {
        ...options,
        actions: [
          { action: "extend", title: "+15s" },
          { action: "skip", title: "Skip" }
        ]
      } as NotificationOptions);
      return;
    }
    new Notification(title, options);
  } catch {
    // Blocked or unsupported: the dial on screen still says done.
  }
}

/**
 * Arms one alert for a rest ending at `endsAt` (ms). It fires only if the app
 * is hidden at that moment — on screen, the dial is the signal. Returns the
 * cancel, for when the rest is skipped or moved.
 */
export function scheduleRestAlert(endsAt: number): () => void {
  const delay = endsAt - Date.now();
  if (delay <= 0 || !read()) {
    return () => undefined;
  }
  const timer = window.setTimeout(() => {
    if (document.visibilityState === "hidden") {
      void showRestAlert();
    }
  }, delay);
  return () => window.clearTimeout(timer);
}

/** The switch on the You page, in the style of Detailed timing. */
export function RestAlertsToggle() {
  const on = useRestAlerts();
  const { user } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [pushed, setPushed] = useState(false);

  useEffect(() => {
    setMounted(true);
    setBlocked(supported() && Notification.permission === "denied");
    setPushed(pushSubscribed());
  }, []);

  // iPhone Safari has notifications only in the installed app.
  const available = !mounted || supported();
  const hint = !available
    ? "Install the app to get rest alerts."
    : blocked
      ? "Blocked. Allow notifications in browser settings."
      : on && pushed
        ? "A notification when rest ends, even with the phone locked."
        : on && user && pushSupported()
          ? "A notification when rest ends while the app is open."
          : "A notification when rest ends.";

  const toggle = async () => {
    if (on) {
      write(false);
      setPushed(false);
      void unsubscribePush();
      return;
    }
    try {
      const permission =
        Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
      setBlocked(permission === "denied");
      write(permission === "granted");
      // Signed in: the server can send it too, and that one reaches a locked
      // phone. Guests keep the page timer; there is no account to hold the address.
      if (permission === "granted" && user) {
        setPushed(await subscribePush());
      }
    } catch {
      write(false);
    }
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={!available}
      onClick={() => void toggle()}
      className="flex min-h-14 w-full items-center justify-between gap-3 rounded-xl bg-muted px-4 py-3 text-left transition-colors active:bg-secondary disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span>
        <span className="block text-sm font-semibold">Rest alerts</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>
      </span>
      <span aria-hidden className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors", on ? "bg-primary" : "well")}>
        <span
          className={cn(
            "absolute top-1 h-5 w-5 rounded-full bg-card shadow-quiet transition-transform",
            on ? "translate-x-6" : "translate-x-1"
          )}
        />
      </span>
    </button>
  );
}

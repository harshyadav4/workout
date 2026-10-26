"use client";

import { useSyncExternalStore } from "react";

/*
 * "Detailed timing": per workout and per set times on the finish card and in
 * the Plan. Always recorded; this only decides whether they are shown — most
 * days the session's length is all anyone wants. Per device, like the skin.
 */

const KEY = "arise.timing.detail";
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function useDetailedTiming(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}

export function setDetailedTiming(on: boolean) {
  try {
    window.localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    // Applies for this visit only.
  }
  listeners.forEach((listener) => listener());
}

"use client";

import { useSyncExternalStore } from "react";

import { type DistanceUnit, UNIT_KEY, readUnit } from "@/lib/cardio";

/*
 * km or miles, per device, like the skin. A small external store rather than
 * React state, so changing it in Profile updates every run on every screen at
 * once — and the server, which has no storage, always renders km.
 */

const listeners = new Set<() => void>();

function read(): DistanceUnit {
  try {
    return readUnit(window.localStorage.getItem(UNIT_KEY));
  } catch {
    return "km";
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another tab changing it counts too.
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function useDistanceUnit(): DistanceUnit {
  return useSyncExternalStore(subscribe, read, () => "km");
}

export function setDistanceUnit(unit: DistanceUnit) {
  try {
    window.localStorage.setItem(UNIT_KEY, unit);
  } catch {
    // Still applies for this visit through the listeners below; not remembered.
  }
  listeners.forEach((listener) => listener());
}

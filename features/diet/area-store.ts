"use client";

import { useSyncExternalStore } from "react";

import { TOUR_STEPS } from "@/features/tour/tour-steps";
import { useTour } from "@/features/tour/tour-store";

/**
 * Which half of the app is on screen: Workout or Diet. One value for the whole
 * app, flipped by the circle in the dock (area-switch). It is a view, not data:
 * it stays on this device and never syncs.
 */
export type Area = "workout" | "diet";

const AREA_KEY = "gymflow-area";

const listeners = new Set<() => void>();
let cached: Area | undefined;

function read(): Area {
  if (cached) {
    return cached;
  }
  try {
    cached = localStorage.getItem(AREA_KEY) === "diet" ? "diet" : "workout";
  } catch {
    cached = "workout";
  }
  return cached;
}

export function setArea(next: Area) {
  cached = next;
  try {
    localStorage.setItem(AREA_KEY, next);
  } catch {
    // Private mode: it holds for this visit, which is all it needs.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * The area on screen. The server always renders Workout, since it cannot see
 * this phone's choice; React then swaps before the first paint. While the tour
 * runs, its step decides, so every step finds the part it points at.
 */
export function useArea(): Area {
  const chosen = useSyncExternalStore(subscribe, read, () => "workout" as Area);
  const { active, step, exploring } = useTour();
  return active && !exploring ? TOUR_STEPS[step]?.area ?? "workout" : chosen;
}

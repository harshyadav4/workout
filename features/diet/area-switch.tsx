"use client";

import { Dumbbell, UtensilsCrossed } from "lucide-react";

import { setArea, useArea } from "@/features/diet/area-store";
import { tick } from "@/lib/feedback";

/**
 * The circle in the middle of the dock. It sits above the row of tabs because
 * it is not a place like they are: it changes what all of them mean. It shows
 * the side you are on, and a tap flips the whole app to the other.
 */
export function AreaSwitch() {
  const area = useArea();
  const Icon = area === "diet" ? UtensilsCrossed : Dumbbell;
  return (
    <div className="relative flex h-14 flex-col items-center justify-end">
      <button
        type="button"
        data-tour="nav-area"
        aria-label={area === "diet" ? "Diet is on. Switch to Workout" : "Workout is on. Switch to Diet"}
        onClick={() => {
          tick();
          setArea(area === "diet" ? "workout" : "diet");
        }}
        className="key absolute -top-5 flex h-14 w-14 items-center justify-center rounded-full ring-4 ring-card focus-visible:outline-none focus-visible:ring-ring"
      >
        <Icon className="h-6 w-6" strokeWidth={2.25} />
      </button>
      <span className="pb-1 text-[11px] font-semibold text-brand">{area === "diet" ? "Diet" : "Workout"}</span>
    </div>
  );
}

"use client";

import { Dumbbell, UtensilsCrossed } from "lucide-react";

import { setArea, useArea } from "@/features/diet/area-store";
import { tick } from "@/lib/feedback";

/**
 * The circle in the middle of the dock. It has no label and no tab's shape
 * because it is not a place like they are: it changes what all of them mean. It
 * shows the side you are on, and a tap flips the whole app to the other.
 */
export function AreaSwitch() {
  const area = useArea();
  const Icon = area === "diet" ? UtensilsCrossed : Dumbbell;
  return (
    <div className="flex h-[58px] items-center justify-center">
      <button
        type="button"
        data-tour="nav-area"
        aria-label={area === "diet" ? "Diet is on. Switch to Workout" : "Workout is on. Switch to Diet"}
        onClick={() => {
          tick();
          setArea(area === "diet" ? "workout" : "diet");
        }}
        className="key-quiet flex h-12 w-12 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Icon className="h-[22px] w-[22px]" strokeWidth={1.6} />
      </button>
    </div>
  );
}

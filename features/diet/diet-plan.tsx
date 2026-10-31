"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { Segmented } from "@/components/ui/segmented";
import { useSwipeTabs } from "@/components/ui/use-swipe-tabs";
import { setArea } from "@/features/diet/area-store";
import { DietBuild } from "@/features/diet/diet-build";
import { DietSchedule } from "@/features/diet/diet-schedule";

type Mode = "build" | "schedule";

const MODES: { id: Mode; label: string }[] = [
  { id: "build", label: "Build" },
  { id: "schedule", label: "Schedule" }
];

/** The Plan tab on the Diet side. Build and Schedule live in the URL, as on the workout side. */
export function DietPlan() {
  const router = useRouter();
  const params = useSearchParams();
  const mode: Mode = params.get("mode") === "build" ? "build" : "schedule";

  // Android's share sheet lands on /plan with a workout plan in the URL. That
  // import lives on the workout side, so go there rather than lose it.
  const shared = params.get("text") ?? params.get("url");
  useEffect(() => {
    if (shared !== null) {
      setArea("workout");
    }
  }, [shared]);

  const setMode = (next: Mode) => {
    router.replace(next === "build" ? "/plan?mode=build" : "/plan", { scroll: false });
  };
  const swipe = useSwipeTabs((direction) => setMode(direction === "left" ? "schedule" : "build"));

  return (
    <section className="space-y-4" {...swipe}>
      <Segmented quiet role="tablist" aria-label="Diet plan mode" options={MODES} value={mode} onChange={setMode} />
      {mode === "build" ? <DietBuild /> : <DietSchedule onGoBuild={() => setMode("build")} />}
    </section>
  );
}

"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { PlanBuild } from "@/features/planner/plan-build";
import { PlanSchedule } from "@/features/planner/plan-schedule";

type PlanMode = "build" | "schedule";

const MODES: { id: PlanMode; label: string }[] = [
  { id: "build", label: "Build" },
  { id: "schedule", label: "Schedule" }
];

export function PlanDashboard() {
  // Mode lives in the URL so /plan?mode=build is linkable — Home's setup CTA
  // needs to land on Build, and back/forward should step between the two.
  const router = useRouter();
  const params = useSearchParams();
  const mode: PlanMode = params.get("mode") === "build" ? "build" : "schedule";

  const setMode = (next: PlanMode) => {
    router.replace(next === "build" ? "/plan?mode=build" : "/plan", { scroll: false });
  };

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-2 gap-1 rounded-full bg-secondary/50 p-1">
        {MODES.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={mode === item.id}
            onClick={() => setMode(item.id)}
            className={`rounded-full py-3 text-sm font-medium transition active:scale-[0.98] ${
              mode === item.id ? "bg-primary text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {mode === "build" ? <PlanBuild /> : <PlanSchedule onGoBuild={() => setMode("build")} />}
    </section>
  );
}

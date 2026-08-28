"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { Printer, Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PlanBuild } from "@/features/planner/plan-build";
import { PlanSchedule } from "@/features/planner/plan-schedule";
import { useWorkoutStoreApi } from "@/features/workout/workout-store";
import { downloadJson } from "@/lib/download";
import { buildPlanExport } from "@/lib/sync";
import { todayKey } from "@/lib/utils";

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
  // Read at click time rather than subscribing this shell to the whole store.
  const store = useWorkoutStoreApi();
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

      {/* Sharing and printing are both "this plan, without my training history".
          Hidden from print itself so the buttons don't end up on the paper. */}
      <div className="flex gap-2 print:hidden">
        <Button
          variant="outline"
          className="flex-1"
          onClick={() =>
            downloadJson(`gymflow-plan-${todayKey()}.json`, buildPlanExport(store.getState()))
          }
        >
          <Share2 className="mr-2 h-4 w-4" />
          Share plan
        </Button>
        {/* ponytail: window.print(). The browser's own dialog already offers
            "Save as PDF" on every desktop and phone, so a PDF library would be
            shipping a second renderer to duplicate one that is already there. */}
        <Button variant="outline" className="flex-1" onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" />
          Print
        </Button>
      </div>
    </section>
  );
}

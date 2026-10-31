"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Segmented } from "@/components/ui/segmented";
import { useSwipeTabs } from "@/components/ui/use-swipe-tabs";
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
  // Android's share sheet (manifest `share_target`) lands here with the shared
  // text in the URL. It is lifted into state and the URL cleaned at once, so a
  // reload or a back swipe does not offer the same import twice.
  const [sharedText, setSharedText] = useState<string>();
  // From an injury's "Workout for this": the Add workout sheet, with the label set.
  const [forInjury, setForInjury] = useState<string>();
  const injuryParam = params.get("injury");
  useEffect(() => {
    if (injuryParam === null) {
      return;
    }
    setForInjury(injuryParam);
    router.replace("/plan?mode=build", { scroll: false });
    // The params object changes identity on every navigation; the id is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [injuryParam]);
  const incoming = params.get("text") ?? params.get("url");
  useEffect(() => {
    if (incoming === null) {
      return;
    }
    const text = [params.get("text"), params.get("url")].filter(Boolean).join("\n");
    setSharedText(text);
    router.replace("/plan?mode=build", { scroll: false });
    // The params object changes identity on every navigation; the text is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incoming]);
  const mode: PlanMode = params.get("mode") === "build" || incoming !== null ? "build" : "schedule";

  const setMode = (next: PlanMode) => {
    router.replace(next === "build" ? "/plan?mode=build" : "/plan", { scroll: false });
  };

  // Build is on the left, Schedule on the right: a swipe left goes to Schedule.
  const swipe = useSwipeTabs((direction) => setMode(direction === "left" ? "schedule" : "build"));

  return (
    <section className="space-y-4" {...swipe}>
      <Segmented quiet role="tablist" aria-label="Plan mode" data-tour="plan-modes" options={MODES} value={mode} onChange={setMode} />

      {mode === "build" ? <PlanBuild sharedText={sharedText} forInjury={forInjury} /> : <PlanSchedule onGoBuild={() => setMode("build")} />}
    </section>
  );
}

import { Suspense } from "react";

import { MobileShell } from "@/components/layout/mobile-shell";
import { AreaView } from "@/features/diet/area-view";
import { DietPlan } from "@/features/diet/diet-plan";
import { PlanDashboard } from "@/features/planner/plan-dashboard";

export default function PlanPage() {
  return (
    <MobileShell title="Plan">
      {/* Both read ?mode from the URL, which needs a boundary here. */}
      <Suspense>
        <AreaView workout={<PlanDashboard />} diet={<DietPlan />} />
      </Suspense>
    </MobileShell>
  );
}

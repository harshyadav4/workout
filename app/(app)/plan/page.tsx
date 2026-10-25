import { Suspense } from "react";

import { MobileShell } from "@/components/layout/mobile-shell";
import { PlanDashboard } from "@/features/planner/plan-dashboard";

export default function PlanPage() {
  return (
    <MobileShell title="Plan" wallpaper="plan">
      {/* PlanDashboard reads ?mode from the URL, which needs a boundary here. */}
      <Suspense>
        <PlanDashboard />
      </Suspense>
    </MobileShell>
  );
}

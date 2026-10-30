import { MobileShell } from "@/components/layout/mobile-shell";
import { AreaView } from "@/features/diet/area-view";
import { DietProgress } from "@/features/diet/diet-progress";
import { ProgressDashboard } from "@/features/progress/progress-dashboard";

export default function ProgressPage() {
  return (
    <MobileShell title="Progress" wallpaper="progress">
      <AreaView workout={<ProgressDashboard />} diet={<DietProgress />} />
    </MobileShell>
  );
}

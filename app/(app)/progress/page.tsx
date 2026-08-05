import { MobileShell } from "@/components/layout/mobile-shell";
import { ProgressDashboard } from "@/features/progress/progress-dashboard";

export default function ProgressPage() {
  return (
    <MobileShell title="Progress" subtitle="Analytics dashboard">
      <ProgressDashboard />
    </MobileShell>
  );
}

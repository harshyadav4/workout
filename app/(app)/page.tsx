import { MobileShell } from "@/components/layout/mobile-shell";
import { HomeDashboard } from "@/features/home/home-dashboard";

export default function HomePage() {
  return (
    <MobileShell title="Today" subtitle="Your logbook">
      <HomeDashboard />
    </MobileShell>
  );
}

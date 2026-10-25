import { MobileShell } from "@/components/layout/mobile-shell";
import { HomeDashboard } from "@/features/home/home-dashboard";
import { TodayHeader } from "@/features/home/today-header";

export default function HomePage() {
  return (
    <MobileShell title="Today" wallpaper="today" header={<TodayHeader />}>
      <HomeDashboard />
    </MobileShell>
  );
}

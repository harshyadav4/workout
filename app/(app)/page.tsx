import { MobileShell } from "@/components/layout/mobile-shell";
import { HomeDashboard } from "@/features/home/home-dashboard";
import { TodayHeader } from "@/features/home/today-header";
import { SkillsGate, SystemSkillsNotice } from "@/features/skills/skill-doors";

export default function HomePage() {
  return (
    <MobileShell title="Today" wallpaper="today" header={<TodayHeader />}>
      <div className="space-y-4">
        <SystemSkillsNotice />
        <HomeDashboard />
        {/* Under the last card, where the wallpaper shows: the third door. */}
        <SkillsGate className="pt-2" />
      </div>
    </MobileShell>
  );
}

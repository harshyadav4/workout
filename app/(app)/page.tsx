import { MobileShell } from "@/components/layout/mobile-shell";
import { SignInNudge } from "@/features/auth/sign-in-nudge";
import { HomeDashboard } from "@/features/home/home-dashboard";
import { TodayHeader } from "@/features/home/today-header";
import { SkillsGate, SystemSkillsNotice } from "@/features/skills/skill-doors";
import { TourLink } from "@/features/tour/tour-link";

export default function HomePage() {
  return (
    <MobileShell title="Today" wallpaper="today" header={<TodayHeader />}>
      <div className="space-y-4">
        <SystemSkillsNotice />
        {/* Three sessions in, still only on this phone: one quiet line. */}
        <SignInNudge place="home" />
        {/* The first week on this phone: the tour again, one tap away. */}
        <TourLink />
        <HomeDashboard />
        {/* Under the last card, where the wallpaper shows: the third door. */}
        <SkillsGate className="pt-2" />
      </div>
    </MobileShell>
  );
}

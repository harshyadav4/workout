import { MobileShell } from "@/components/layout/mobile-shell";
import { AreaView } from "@/features/diet/area-view";
import { DietToday, DietTodayHeader } from "@/features/diet/diet-today";
import { SignInNudge } from "@/features/auth/sign-in-nudge";
import { HomeDashboard } from "@/features/home/home-dashboard";
import { InjuryCheckInNotice } from "@/features/injuries/injury-check-in";
import { TodayHeader } from "@/features/home/today-header";
import { SkillsGate, SystemSkillsNotice } from "@/features/skills/skill-doors";
import { TourLink } from "@/features/tour/tour-link";

export default function HomePage() {
  return (
    <MobileShell title="Today" header={<AreaView workout={<TodayHeader />} diet={<DietTodayHeader />} />}>
      <AreaView
        diet={<DietToday />}
        workout={
      <div className="space-y-4">
        {/* At most one notice above the workout: the first with something to say. */}
        <div className="one-notice">
          {/* Once a week at most, and it takes the place of the others that week. */}
          <InjuryCheckInNotice />
          <SystemSkillsNotice />
          {/* Three sessions in, still only on this phone: one quiet line. */}
          <SignInNudge place="home" />
          {/* The first week on this phone: the tour again, one tap away. */}
          <TourLink />
        </div>
        <HomeDashboard />
        {/* Under the last card: the third door. */}
        <SkillsGate className="pt-2" />
      </div>
        }
      />
    </MobileShell>
  );
}

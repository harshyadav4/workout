import { MobileShell } from "@/components/layout/mobile-shell";
import { AreaView } from "@/features/diet/area-view";
import { DietTargetsRow } from "@/features/diet/diet-targets-card";
import { BodyGroup, WeightToday } from "@/features/profile/measurements-card";
import {
  AccountSection,
  AppSection,
  DataSection,
  GoalRow,
  ProfileHeader
} from "@/features/profile/profile-details";

// A Server Component with the client leaves below it, like the other three
// pages. One short list, in the order people come here for it: who you are, the
// one reading taken often, your body, the app, your data, and the account last.
// Every form stays in a bottom sheet until it is asked for.
export default function ProfilePage() {
  return (
    <MobileShell title="You">
      <div className="space-y-6">
        <ProfileHeader />
        <div className="space-y-6" data-tour="profile-body">
          <WeightToday />
          <BodyGroup goal={<AreaView workout={<GoalRow />} diet={<DietTargetsRow />} />} />
        </div>
        <AppSection />
        <DataSection />
        <AccountSection />
      </div>
    </MobileShell>
  );
}

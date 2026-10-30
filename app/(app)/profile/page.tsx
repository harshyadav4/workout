import { MobileShell } from "@/components/layout/mobile-shell";
import { AreaView } from "@/features/diet/area-view";
import { DietTargetsCard } from "@/features/diet/diet-targets-card";
import { InstallCard } from "@/features/pwa/install-card";
import { MeasurementsCard } from "@/features/profile/measurements-card";
import {
  AccountSection,
  DataSection,
  GoalsSection,
  HelpSection,
  ProfileHeader,
  SettingsSection
} from "@/features/profile/profile-details";

// A Server Component with the client leaves below it, like the other three
// pages. One section per job, in the order people come here for them: who
// you are, your goals, your body, the app, your data, and the account last.
// The install card goes first, above everything: it renders nothing once the
// app is installed, and until then it is the one thing worth doing here.
export default function ProfilePage() {
  return (
    <MobileShell title="You" wallpaper="you">
      <InstallCard />
      <ProfileHeader />
      <AreaView workout={<GoalsSection />} diet={<DietTargetsCard />} />
      <MeasurementsCard />
      <SettingsSection />
      <DataSection />
      <HelpSection />
      <AccountSection />
    </MobileShell>
  );
}

import { MobileShell } from "@/components/layout/mobile-shell";
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
export default function ProfilePage() {
  return (
    <MobileShell title="You" wallpaper="you">
      <ProfileHeader />
      <GoalsSection />
      <MeasurementsCard />
      <SettingsSection />
      <DataSection />
      <HelpSection />
      <AccountSection />
    </MobileShell>
  );
}

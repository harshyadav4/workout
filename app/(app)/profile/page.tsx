import { MobileShell } from "@/components/layout/mobile-shell";
import { MeasurementsCard } from "@/features/profile/measurements-card";
import { ProfileDetails } from "@/features/profile/profile-details";

// A Server Component with the client leaves below it, like the other three
// pages — this was the only page that marked itself "use client".
export default function ProfilePage() {
  return (
    <MobileShell title="Profile" subtitle="Athlete details">
      <ProfileDetails />
      <MeasurementsCard />
    </MobileShell>
  );
}

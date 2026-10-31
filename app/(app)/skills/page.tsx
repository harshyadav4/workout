import { MobileShell } from "@/components/layout/mobile-shell";
import { SkillsDashboard } from "@/features/skills/skills-dashboard";

export default function SkillsPage() {
  return (
    <MobileShell title="Skills">
      <SkillsDashboard />
    </MobileShell>
  );
}

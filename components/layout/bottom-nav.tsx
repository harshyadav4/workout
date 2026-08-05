"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CalendarDays, Home, UserCircle2 } from "lucide-react";

import { useWorkoutStore } from "@/features/workout/workout-store";
import { isRecordingDue } from "@/lib/body-metrics";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "Home", icon: Home },
  { href: "/plan", label: "Plan", icon: CalendarDays },
  { href: "/progress", label: "Progress", icon: BarChart3 },
  { href: "/profile", label: "Profile", icon: UserCircle2 }
];

export function BottomNav() {
  const pathname = usePathname();
  const measurements = useWorkoutStore((state) => state.measurements);
  const profile = useWorkoutStore((state) => state.profile);
  const recordingDue = isRecordingDue(measurements, profile);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/5 bg-background/95 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 backdrop-blur-xl">
      <div className="mx-auto grid max-w-md grid-cols-4 gap-2">
        {items.map((item) => {
          const active =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          // Only the Profile tab carries a dot, and only for something the user
          // asked to be reminded about — a cadence they set themselves.
          const dot = item.href === "/profile" && recordingDue;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl text-xs font-medium transition-colors",
                active ? "bg-primary/15 text-primary" : "text-muted-foreground"
              )}
            >
              <span className="relative">
                <Icon className="h-5 w-5" />
                {dot ? (
                  <span
                    className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full bg-warning ring-2 ring-background"
                    aria-hidden
                  />
                ) : null}
              </span>
              <span>
                {item.label}
                {dot ? <span className="sr-only"> — a reading is due</span> : null}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

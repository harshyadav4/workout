"use client";

import { useEffect, useState } from "react";

import { useAuth } from "@/features/auth/use-auth";
import { useTour } from "@/features/tour/tour-store";
import { RankBadge, RankUpNotice } from "@/features/home/hunter-rank";
import { useWorkoutStore } from "@/features/workout/workout-store";

// Date keys are plain YYYY-MM-DD days, so format in UTC — the day never shifts
// under a timezone that way.
const LONG_DAY = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC"
});

function greetingFor(hour: number) {
  if (hour < 12) {
    return "Morning";
  }
  if (hour < 17) {
    return "Afternoon";
  }
  return "Evening";
}

/** user_metadata is provider-controlled and typed `any` — narrow, don't cast. */
function firstName(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const first = value.trim().split(/\s+/)[0];
  return first || undefined;
}

/**
 * The date and a greeting, in place of a page title, and the hunter rank on
 * the right. The date is the one the store is pointed at, so it agrees with the
 * day card under it. The greeting reads the clock after mount: the server has
 * no idea what time it is for you.
 */
export function TodayHeader() {
  const { user } = useAuth();
  const activeDate = useWorkoutStore((state) => state.activeDate);
  const profileName = useWorkoutStore((state) => state.profile.name);
  const [greeting, setGreeting] = useState("Today");

  useEffect(() => {
    setGreeting(greetingFor(new Date().getHours()));
  }, []);

  // In the tour, the sample's name: the signed-in name over Alex's numbers
  // would read as if the sample were your own history.
  const touring = useTour().active;
  const name = touring
    ? firstName(profileName)
    : firstName(user?.user_metadata?.full_name) ?? firstName(profileName);

  return (
    <div>
      {/* The rank rides on the date line, so the greeting keeps the full width. */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">
          {LONG_DAY.format(new Date(`${activeDate}T00:00:00Z`))}
        </p>
        <RankBadge name={name} />
      </div>
      <h1 className="mt-1.5 font-display text-[34px] font-extrabold leading-none tracking-tight">
        {name ? `${greeting}, ${name}.` : `${greeting}.`}
      </h1>
      <RankUpNotice />
    </div>
  );
}

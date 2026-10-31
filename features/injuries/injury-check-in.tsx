"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";

import { ListSheet, SheetDone } from "@/components/ui/list";
import { readPainSkip, skipPainQuestion } from "@/features/injuries/check-in-skip";
import { PainScore } from "@/features/injuries/pain-score";
import { useWorkoutStore } from "@/features/workout/workout-store";
import { activeInjuries, injuryName, isCheckInDue, isHighPain, painQuestion } from "@/lib/injuries";
import type { Injury } from "@/lib/types";
import { todayKey } from "@/lib/utils";

/**
 * The weekly question on Today, for an injury with no workout running. With a
 * workout, its Start asks instead (injury-workout-rows), so this stays away. It
 * goes in `.one-notice`, where only the first notice with something to say shows.
 */
export function InjuryCheckInNotice() {
  const injuries = useWorkoutStore((state) => state.injuries);
  const painLogs = useWorkoutStore((state) => state.painLogs);
  const logPain = useWorkoutStore((state) => state.logPain);

  // After mount: the server has no storage, and the first render must match it.
  const [mounted, setMounted] = useState(false);
  const [closed, setClosed] = useState(0);
  const [asking, setAsking] = useState<Injury>();
  const [score, setScore] = useState<number>();

  useEffect(() => setMounted(true), []);

  const today = todayKey();
  const due = mounted
    ? activeInjuries(injuries).find(
        (injury) =>
          !(injury.workout && injury.workout.endDate >= today) &&
          isCheckInDue(injury, painLogs, today, readPainSkip(injury.id))
      )
    : undefined;

  const sheet = (
    <ListSheet
      open={Boolean(asking)}
      onOpenChange={(open) => {
        if (!open) {
          setAsking(undefined);
        }
      }}
      title={asking ? painQuestion(asking, "this week") : ""}
      description={asking ? injuryName(asking) : undefined}
    >
      {asking ? (
        <>
          <PainScore
            label="Pain this week"
            value={score}
            onChange={(value) => {
              setScore(value);
              logPain(asking.id, value, today);
              if (!isHighPain(value)) {
                setAsking(undefined);
              }
            }}
          />
          {score !== undefined && isHighPain(score) ? (
            <>
              <p className="notice-line mt-3 font-medium">
                That is a lot of pain. It is worth asking your doctor or a physio.
              </p>
              <SheetDone />
            </>
          ) : null}
        </>
      ) : null}
    </ListSheet>
  );

  if (!due) {
    return asking ? sheet : null;
  }

  return (
    <div className="notice-line" data-closed={closed}>
      <p className="min-w-0 flex-1">
        {painQuestion(due, "this week")}{" "}
        <button
          type="button"
          className="font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => {
            setScore(undefined);
            setAsking(due);
          }}
        >
          Log it
        </button>
      </p>
      <button
        type="button"
        aria-label="Hide this for a week"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
        onClick={() => {
          skipPainQuestion(due.id, today);
          setClosed((count) => count + 1);
        }}
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
      {sheet}
    </div>
  );
}

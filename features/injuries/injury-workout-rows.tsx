"use client";

import { Check } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ListGroup, ListRow, ListSheet } from "@/components/ui/list";
import { readPainSkip, skipPainQuestion } from "@/features/injuries/check-in-skip";
import { PainScore } from "@/features/injuries/pain-score";
import { useWorkoutStore } from "@/features/workout/workout-store";
import {
  activeInjuries,
  frequencyWords,
  injuryName,
  isCheckInDue,
  isHighPain,
  latestPain,
  painQuestion
} from "@/lib/injuries";
import type { Injury, InjuryWorkout, ScheduledSession } from "@/lib/types";

const ACTION = "key-quiet h-11 rounded-full px-4 text-[13.5px] font-semibold";

function hint(session: ScheduledSession, workout: InjuryWorkout) {
  const count = session.exercises.length;
  const sets = session.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0);
  const words = frequencyWords(workout.frequency);
  return `${count} exercise${count === 1 ? "" : "s"} · ${sets} set${sets === 1 ? "" : "s"} · ${
    workout.frequency.kind === "every" ? words.toLowerCase() : words
  }`;
}

interface Row {
  injury: Injury;
  session: ScheduledSession;
  workout: InjuryWorkout;
}

/**
 * The injury's workout on Today: its own row, under the day's main button, on the
 * days its frequency gives. Rest days too. Once a week its Start asks the pain
 * score first, because before exercise the score is taken in the same state each
 * week. The workout itself runs like any other once it has started.
 */
export function InjuryWorkoutRows() {
  const injuries = useWorkoutStore((state) => state.injuries);
  const painLogs = useWorkoutStore((state) => state.painLogs);
  const sessions = useWorkoutStore((state) => state.scheduledSessions);
  const activeDate = useWorkoutStore((state) => state.activeDate);
  const startSession = useWorkoutStore((state) => state.startSession);
  const logPain = useWorkoutStore((state) => state.logPain);

  const [asking, setAsking] = useState<Row>();
  const [score, setScore] = useState<number>();

  const rows = activeInjuries(injuries).flatMap((injury): Row[] => {
    const workout = injury.workout;
    const session =
      workout &&
      sessions.find(
        (item) =>
          item.date === activeDate && item.sessionTemplateId === workout.sessionTemplateId && item.type === "workout"
      );
    return workout && session ? [{ injury, workout, session }] : [];
  });

  if (rows.length === 0) {
    return null;
  }

  const start = (row: Row) => {
    if (isCheckInDue(row.injury, painLogs, activeDate, readPainSkip(row.injury.id))) {
      setScore(undefined);
      setAsking(row);
    } else {
      startSession(row.session.id);
    }
  };

  const last = asking ? latestPain(painLogs, asking.injury.id)?.score : undefined;

  return (
    <>
      {rows.map((row) => (
        <ListGroup key={row.injury.id} title={`For your ${injuryName(row.injury).toLowerCase()}`}>
          <ListRow
            label={row.session.sessionName}
            hint={hint(row.session, row.workout)}
            action={
              row.session.status === "completed" ? (
                <span className="flex h-11 items-center gap-1 text-[13.5px] font-medium">
                  <Check className="h-4 w-4 text-[var(--l2)]" strokeWidth={2.4} aria-hidden />
                  Done
                </span>
              ) : row.session.status === "active" ? (
                <button type="button" className={ACTION} onClick={() => startSession(row.session.id)}>
                  Continue
                </button>
              ) : (
                <button
                  type="button"
                  aria-label={`Start ${row.session.sessionName}`}
                  className={ACTION}
                  onClick={() => start(row)}
                >
                  Start
                </button>
              )
            }
          />
        </ListGroup>
      ))}

      <ListSheet
        open={Boolean(asking)}
        onOpenChange={(open) => {
          if (!open) {
            setAsking(undefined);
          }
        }}
        title={asking ? painQuestion(asking.injury) : ""}
        description={
          asking
            ? `${injuryName(asking.injury)}${last === undefined ? "" : ` · ${last} of 10 last time`}`
            : undefined
        }
      >
        {asking ? (
          <>
            <p className="mb-2 text-[13.5px] font-semibold text-muted-foreground">Before you start</p>
            <PainScore label="Pain before the exercises" value={score} onChange={setScore} />
            {score !== undefined && isHighPain(score) ? (
              <p className="notice-line mt-3 font-medium">
                That is a lot of pain. It is worth asking your doctor before you do these.
              </p>
            ) : null}
            <Button
              className="mt-4 w-full"
              disabled={score === undefined}
              onClick={() => {
                if (score !== undefined) {
                  logPain(asking.injury.id, score, activeDate);
                }
                startSession(asking.session.id);
                setAsking(undefined);
              }}
            >
              Start exercises
            </Button>
            <button
              type="button"
              className="mt-1 h-11 w-full text-sm font-medium text-muted-foreground"
              onClick={() => {
                skipPainQuestion(asking.injury.id, activeDate);
                startSession(asking.session.id);
                setAsking(undefined);
              }}
            >
              Skip this week
            </button>
          </>
        ) : null}
      </ListSheet>
    </>
  );
}

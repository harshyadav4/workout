"use client";

import { CloudUpload, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { nudgeFor, markNudgeDone, readNudgeDone, type Nudge } from "@/features/auth/nudge-rule";
import { useAuth } from "@/features/auth/use-auth";
import { useTour } from "@/features/tour/tour-store";
import { useWorkoutStore } from "@/features/workout/workout-store";

/**
 * Guest mode's two asks (features/auth/nudge-rule): a card on the first
 * finished session, and a quiet line on Home once three sessions live only on
 * this phone. "Sign in with Google" goes straight to Google — no page in
 * between — and whatever the guest logged moves into the account on return.
 */
export function SignInNudge({ place }: { place: "finish-card" | "home" }) {
  const { user, signIn } = useAuth();
  const touring = useTour().active;
  const sessions = useWorkoutStore((state) => new Set(state.logs.map((log) => log.date)).size);
  // A session finished today *with work logged* — Finish with nothing ticked
  // leaves nothing to save, and "Save this session" would be a strange ask.
  // Read here too, so Home's quiet line steps aside on the day the card asks.
  const finishedSessionToday = useWorkoutStore(
    (state) =>
      state.scheduledSessions.some((session) => session.date === state.activeDate && session.status === "completed") &&
      state.logs.some((log) => log.date === state.activeDate)
  );
  // Read after mount: the server has no storage, and a first render that
  // disagreed with the HTML would be a hydration error.
  const [answered, setAnswered] = useState<Record<Nudge, boolean>>({ finish: true, reminder: true });
  const [error, setError] = useState<string>();

  useEffect(() => {
    setAnswered({ finish: readNudgeDone("finish"), reminder: readNudgeDone("reminder") });
  }, []);

  const nudge = nudgeFor(
    {
      signedIn: Boolean(user),
      touring,
      sessions,
      finishedToday: finishedSessionToday,
      finishAnswered: answered.finish,
      reminderDismissed: answered.reminder
    },
    place
  );

  if (!nudge) {
    return null;
  }

  const done = () => {
    markNudgeDone(nudge);
    setAnswered((current) => ({ ...current, [nudge]: true }));
  };

  const continueWithGoogle = async () => {
    setError(undefined);
    try {
      markNudgeDone(nudge);
      await signIn();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not open Google sign-in.");
    }
  };

  if (nudge === "reminder") {
    return (
      <div className="notice-line" role="status">
        <p className="min-w-0 flex-1">
          {sessions} workouts are on this phone only.{" "}
          <button
            type="button"
            onClick={() => void continueWithGoogle()}
            className="font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Sign in
          </button>{" "}
          to save them.
        </p>
        <button
          type="button"
          aria-label="Hide this message"
          onClick={done}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4 border-t border-sep pt-4">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <CloudUpload className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        Save this workout
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        It is on this phone only. Sign in to keep it safe.
      </p>
      {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
      <div className="mt-3 flex gap-2">
        <Button className="flex-1" onClick={() => void continueWithGoogle()}>
          Sign in with Google
        </Button>
        <Button variant="secondary" className="flex-1" onClick={done}>
          Later
        </Button>
      </div>
    </div>
  );
}

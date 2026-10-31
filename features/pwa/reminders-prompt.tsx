"use client";

import { BellRing, CalendarClock, Flame, Scale, Timer, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/use-auth";
import {
  DEFAULT_REMINDERS,
  loadReminderSettings,
  pushSupported,
  saveReminderSettings,
  subscribePush
} from "@/features/pwa/push";
import { useInstall } from "@/features/pwa/use-install";
import { useTour } from "@/features/tour/tour-store";

/**
 * The second card after "Install Arise": why to allow notifications, in the
 * same plaque, once the install card is gone. A push can only reach a device
 * that said yes, so an account that never visits the Reminders card on You is
 * unreachable — and the nudges for someone who has not started exist for
 * exactly that account. Yes turns on the three that matter at the start:
 * workout today, streak at risk, and the nudges when away. The rest wait on You.
 */

const DISMISS_KEY = "arise.reminders.prompt-dismissed";

/** What the phone gets — the reasons, as the install card gives its steps. */
const REASONS = [
  { icon: Timer, text: "Rest done, even with the phone locked" },
  { icon: CalendarClock, text: "Your workout, an hour before you usually start" },
  { icon: Flame, text: "A nudge when a planned day slips" },
  { icon: Scale, text: "Weigh-in and tape when they are due" }
];

export function RemindersPrompt() {
  const { user } = useAuth();
  const { active: touring } = useTour();
  const install = useInstall();
  const [state, setState] = useState<"hidden" | "ask" | "busy" | "done" | "blocked">("hidden");

  // Install first, then this: on iPhone notifications exist only in the
  // installed app anyway, and two plaques asking for things at once is a wall.
  const installDone = install.kind === "installed" || install.kind === "unavailable";

  useEffect(() => {
    if (!user || touring || !installDone || !pushSupported()) {
      setState("hidden");
      return;
    }
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      dismissed = true;
    }
    if (dismissed || Notification.permission === "denied") {
      return;
    }
    let live = true;
    // Asked only of an account with no settings yet: anyone who has been to
    // the card has already answered, one way or the other.
    loadReminderSettings().then((saved) => {
      if (live && !saved) {
        setState("ask");
      }
    });
    return () => {
      live = false;
    };
  }, [user, touring, installDone]);

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Asked again next visit; harmless.
    }
    setState("hidden");
  };

  const accept = async () => {
    setState("busy");
    try {
      const permission =
        Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
      if (permission !== "granted") {
        setState("blocked");
        return;
      }
      await subscribePush();
      await saveReminderSettings({ ...DEFAULT_REMINDERS, workout: true, streak: true, away: true });
      dismiss();
      setState("done");
    } catch {
      setState("blocked");
    }
  };

  if (state === "hidden") {
    return null;
  }

  if (state === "done") {
    return (
      <p className="notice-line text-muted-foreground" role="status">
        <BellRing className="h-4 w-4 shrink-0" aria-hidden />
        Reminders are on. Change them any time on You.
      </p>
    );
  }

  return (
    <div className="plaque relative rounded-3xl p-4">
      <button
        type="button"
        aria-label="Hide this message"
        onClick={dismiss}
        className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-start gap-3 pr-8">
        <BellRing className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0">
          <p className="text-base font-medium">Turn on reminders</p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Arise can tap you on the shoulder — one card a day at most, and you choose which on You.
          </p>
        </div>
      </div>
      <ul className="mt-4 space-y-3 text-sm">
        {REASONS.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-start gap-3">
            <Icon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
            {text}
          </li>
        ))}
      </ul>
      {state === "blocked" ? (
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Notifications are blocked for this app. Allow them in the browser settings, then turn reminders
          on from You.
        </p>
      ) : null}
      <Button className="mt-4 w-full" disabled={state === "busy"} onClick={() => void accept()}>
        <BellRing className="h-4 w-4" />
        {state === "busy" ? "Setting up…" : "Allow notifications"}
      </Button>
    </div>
  );
}

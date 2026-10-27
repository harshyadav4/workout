"use client";

import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { useAuth } from "@/features/auth/use-auth";
import {
  DEFAULT_REMINDERS,
  loadReminderSettings,
  pushSupported,
  saveReminderSettings,
  subscribePush,
  type ReminderSettings
} from "@/features/pwa/push";
import { cn } from "@/lib/utils";

/**
 * The Reminders card on You: two times and six switches, saved to the
 * account. The server sends them (supabase/functions/send-daily-reminders),
 * so they reach a locked phone — which means they need the account and a push
 * subscription, the same one Rest alerts use.
 */

const SWITCHES: { key: keyof Omit<ReminderSettings, "timezone" | "morningTime" | "eveningTime">; label: string; hint: string; when: "morning" | "evening" }[] = [
  { key: "workout", label: "Workout today", hint: "An hour before your usual start, from your last session. At the morning time until then.", when: "morning" },
  { key: "weight", label: "Weigh-in due", hint: "Every day it is due, until you log one. Follows your cadence.", when: "morning" },
  { key: "measurement", label: "Measurements due", hint: "Same, for the tape.", when: "morning" },
  { key: "plan", label: "Plan ending", hint: "A week before your schedule runs out, and the day before.", when: "morning" },
  { key: "away", label: "Nudges when away", hint: "A few days without training, or a new account that has not started. Three at most, then quiet.", when: "morning" },
  { key: "streak", label: "Streak at risk", hint: "A planned day with nothing logged yet.", when: "evening" },
  { key: "recap", label: "Weekly recap", hint: "Sunday: sessions, volume, records.", when: "evening" }
];

export function RemindersCard() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<ReminderSettings>(DEFAULT_REMINDERS);
  const [loaded, setLoaded] = useState(false);
  const [note, setNote] = useState<string>();

  useEffect(() => {
    if (!user) {
      setLoaded(false);
      return;
    }
    let active = true;
    loadReminderSettings().then((saved) => {
      if (active) {
        if (saved) {
          setSettings(saved);
        }
        setLoaded(true);
      }
    });
    return () => {
      active = false;
    };
  }, [user]);

  const anyOn = SWITCHES.some((item) => settings[item.key]);

  const save = async (next: ReminderSettings) => {
    setSettings(next);
    setNote(undefined);
    const turningOn = SWITCHES.some((item) => next[item.key] && !settings[item.key]);
    if (turningOn) {
      // The first switch asks for notifications and the push address, like
      // Rest alerts. Without either the setting saves but nothing can arrive.
      try {
        const permission =
          Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
        if (permission !== "granted") {
          setNote("Notifications are blocked for this app. Allow them in the browser settings.");
        } else if (!(await subscribePush())) {
          setNote(
            pushSupported()
              ? "This device could not register for notifications. Try again from the installed app."
              : "Install the app to receive reminders on this phone."
          );
        }
      } catch {
        setNote("Notifications are not available here.");
      }
    }
    const ok = await saveReminderSettings(next);
    if (!ok) {
      setNote("Could not save. Check your connection and try again.");
    }
  };

  if (!user) {
    return (
      <div className="rounded-xl bg-muted px-4 py-3">
        <p className="text-sm font-semibold">Reminders</p>
        <p className="mt-0.5 text-xs text-muted-foreground">Sign in to get reminders on this phone.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-xl bg-muted p-3">
      <div className="px-1">
        <p className="text-sm font-semibold">Reminders</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Sent to this phone at the times below, even when it is locked.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs font-medium text-muted-foreground">
          Morning
          <Input
            type="time"
            className="mt-1"
            value={settings.morningTime}
            disabled={!loaded}
            onChange={(event) => event.target.value && void save({ ...settings, morningTime: event.target.value })}
          />
        </label>
        <label className="text-xs font-medium text-muted-foreground">
          Evening
          <Input
            type="time"
            className="mt-1"
            value={settings.eveningTime}
            disabled={!loaded}
            onChange={(event) => event.target.value && void save({ ...settings, eveningTime: event.target.value })}
          />
        </label>
      </div>
      {SWITCHES.map((item) => {
        const on = settings[item.key];
        return (
          <button
            key={item.key}
            type="button"
            role="switch"
            aria-checked={on}
            disabled={!loaded}
            onClick={() => void save({ ...settings, [item.key]: !on })}
            className="flex min-h-14 w-full items-center justify-between gap-3 rounded-lg bg-card/60 px-3 py-2.5 text-left transition-colors active:bg-secondary disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span>
              <span className="block text-sm font-semibold">
                {item.label}
                <span className="ml-1.5 text-[11px] font-medium text-muted-foreground">{item.when}</span>
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{item.hint}</span>
            </span>
            <span aria-hidden className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors", on ? "bg-primary" : "well")}>
              <span
                className={cn(
                  "absolute top-1 h-5 w-5 rounded-full bg-card shadow-quiet transition-transform",
                  on ? "translate-x-6" : "translate-x-1"
                )}
              />
            </span>
          </button>
        );
      })}
      {note ? (
        <p className="px-1 text-xs text-warning" role="status">
          {note}
        </p>
      ) : anyOn ? (
        <p className="px-1 text-xs text-muted-foreground">
          Times follow this phone's clock ({settings.timezone.replace(/_/g, " ")}).
        </p>
      ) : null}
    </div>
  );
}

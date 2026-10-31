"use client";

import { Smartphone } from "lucide-react";
import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { ListRow, ListSheetRow, ListSwitch, SheetDone, SheetRows } from "@/components/ui/list";
import { useAuth } from "@/features/auth/use-auth";
import {
  DEFAULT_REMINDERS,
  loadReminderSettings,
  pushSupported,
  saveReminderSettings,
  subscribePush,
  type ReminderSettings
} from "@/features/pwa/push";

/**
 * The Phone reminders row on You, and its sheet: two times and six switches,
 * saved to the account. The server sends them
 * (supabase/functions/send-daily-reminders), so they reach a locked phone —
 * which means they need the account and a push subscription, the same one Rest
 * alerts use.
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

export function RemindersRow() {
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
    return <ListRow icon={Smartphone} label="Phone reminders" value="Sign in first" />;
  }

  return (
    <ListSheetRow
      icon={Smartphone}
      label="Phone reminders"
      value={loaded ? (anyOn ? "On" : "Off") : undefined}
      description="Sent to this phone at the times below, even when it is locked."
    >
      <div className="grid grid-cols-2 gap-3">
        <label className="text-[13.5px] font-medium text-muted-foreground">
          Morning
          <Input
            type="time"
            className="mt-1.5"
            value={settings.morningTime}
            disabled={!loaded}
            onChange={(event) => event.target.value && void save({ ...settings, morningTime: event.target.value })}
          />
        </label>
        <label className="text-[13.5px] font-medium text-muted-foreground">
          Evening
          <Input
            type="time"
            className="mt-1.5"
            value={settings.eveningTime}
            disabled={!loaded}
            onChange={(event) => event.target.value && void save({ ...settings, eveningTime: event.target.value })}
          />
        </label>
      </div>
      <div className="mt-2">
        <SheetRows>
          {SWITCHES.map((item) => {
            const on = settings[item.key];
            return (
              <ListSwitch
                key={item.key}
                label={
                  <>
                    {item.label}
                    <span className="ml-1.5 text-[11px] font-medium text-muted-foreground">{item.when}</span>
                  </>
                }
                hint={item.hint}
                on={on}
                disabled={!loaded}
                onToggle={() => void save({ ...settings, [item.key]: !on })}
              />
            );
          })}
        </SheetRows>
      </div>
      {note ? (
        <p className="mt-2 text-[13px] text-warning" role="status">
          {note}
        </p>
      ) : anyOn ? (
        <p className="mt-2 text-[13px] text-muted-foreground">
          Times follow this phone's clock ({settings.timezone.replace(/_/g, " ")}).
        </p>
      ) : null}
      <SheetDone />
    </ListSheetRow>
  );
}

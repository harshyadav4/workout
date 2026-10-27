import assert from "node:assert/strict";

import {
  awayMessage,
  eveningMessage,
  isDue,
  localClock,
  measurementDue,
  morningMessage,
  workoutReminderTime,
  type ReminderInput
} from "./reminders";

// -- the clock ----------------------------------------------------------------

{
  const clock = localClock(new Date("2026-10-28T02:30:00Z"), "Asia/Kolkata");
  assert.deepEqual(clock, { date: "2026-10-28", weekday: 3, time: "08:00" }, "UTC+5:30, a Wednesday");
  const ny = localClock(new Date("2026-10-28T02:30:00Z"), "America/New_York");
  assert.equal(ny.date, "2026-10-27", "still Tuesday evening in New York");
  assert.equal(ny.time, "22:30");
  assert.equal(localClock(new Date("2026-10-28T00:00:00Z"), "UTC").time, "00:00", "midnight is 00, never 24");
}

// -- is it time ------------------------------------------------------------------

{
  const at = (time: string) => ({ date: "2026-10-28", weekday: 3, time });
  assert.equal(isDue(at("07:29"), "07:30"), false, "not yet");
  assert.equal(isDue(at("07:30"), "07:30"), true, "on the minute");
  assert.equal(isDue(at("09:15"), "07:30"), true, "a late run still sends within the window");
  assert.equal(isDue(at("10:30"), "07:30"), false, "three hours on, it is too late for a morning card");
}

// -- an hour before the last start ------------------------------------------------

{
  // Started 18:05 in Kolkata (12:35Z) → reminder at 17:05.
  assert.equal(workoutReminderTime("2026-10-26T12:35:00.000Z", "Asia/Kolkata", "07:30"), "17:05");
  assert.equal(workoutReminderTime(undefined, "Asia/Kolkata", "07:30"), "07:30", "no history: the morning time");
  assert.equal(workoutReminderTime("not a date", "Asia/Kolkata", "07:30"), "07:30");
  assert.equal(workoutReminderTime("2026-10-26T00:20:00.000Z", "UTC", "07:30"), "23:20", "wraps past midnight");
}

// -- due, the same rule as the app -------------------------------------------------

{
  assert.equal(measurementDue(undefined, "weekly", "2026-10-28"), true, "never logged is due");
  assert.equal(measurementDue("2026-10-22", "weekly", "2026-10-28"), false, "six days: not yet");
  assert.equal(measurementDue("2026-10-21", "weekly", "2026-10-28"), true, "seven days: due");
  assert.equal(measurementDue("2026-10-21", "off", "2026-10-28"), false, "off is never due");
  assert.equal(measurementDue(undefined, null, "2026-10-28"), false, "no cadence chosen is off");
}

// -- the morning card ----------------------------------------------------------------

const all = { workout: true, weight: true, measurement: true, plan: true, streak: true, recap: true };
const base: ReminderInput = {
  today: "2026-10-28",
  weekday: 3,
  switches: all,
  sent: new Set()
};

{
  const only = morningMessage({
    ...base,
    todaySession: { name: "Push", status: "planned", exercises: 6, sets: 18 }
  });
  assert.deepEqual(only, { kinds: ["workout"], title: "Push today", body: "6 exercises, 18 sets", url: "/" });

  const combined = morningMessage({
    ...base,
    todaySession: { name: "Push", status: "planned", exercises: 6, sets: 18 },
    lastWeightDate: "2026-10-19",
    weightCadence: "weekly",
    scheduleEndDate: "2026-11-04"
  });
  assert.deepEqual(combined?.kinds, ["workout", "weight", "plan"], "one card carries everything due");
  assert.equal(combined?.title, "Push today");
  assert.equal(combined?.body, "6 exercises, 18 sets · Weigh-in due · Your plan ends in a week");

  const weighOnly = morningMessage({ ...base, lastWeightDate: "2026-10-19", weightCadence: "weekly" });
  assert.deepEqual(weighOnly, { kinds: ["weight"], title: "Weigh-in due", body: "Last one 9 days ago.", url: "/profile" });

  assert.equal(
    morningMessage({ ...base, todaySession: { name: "Push", status: "completed", exercises: 6, sets: 18 } }),
    undefined,
    "a finished session is not announced"
  );
  assert.equal(
    morningMessage({
      ...base,
      sent: new Set(["weight"]),
      lastWeightDate: "2026-10-19",
      weightCadence: "weekly"
    }),
    undefined,
    "sent today already: nothing more today — tomorrow it comes back while still due"
  );
  assert.equal(morningMessage({ ...base, scheduleEndDate: "2026-11-03" }), undefined, "six days out is not a reminder day");
  assert.equal(morningMessage({ ...base, scheduleEndDate: "2026-10-29" })?.title, "Your plan ends tomorrow");
  assert.equal(
    morningMessage({ ...base, switches: { ...all, weight: false }, lastWeightDate: undefined, weightCadence: "weekly" }),
    undefined,
    "a switch that is off is silent"
  );
}

// -- the evening card ----------------------------------------------------------------

{
  const open = eveningMessage({ ...base, todaySession: { name: "Push", status: "planned", exercises: 6, sets: 18 } });
  assert.deepEqual(open, {
    kinds: ["streak"],
    title: "Your Push session is still open",
    body: "Twenty minutes keeps the streak.",
    url: "/"
  });
  assert.equal(
    eveningMessage({ ...base, todaySession: { name: "Push", status: "active", exercises: 6, sets: 18 }, loggedToday: true }),
    undefined,
    "something logged today: no nag"
  );
  const sunday = eveningMessage({ ...base, today: "2026-11-01", weekday: 0, week: { sessions: 4, volumeKg: 12400, prs: 1 } });
  assert.deepEqual(sunday, { kinds: ["recap"], title: "This week: 4 sessions", body: "12,400 kg · 1 record", url: "/progress" });
  assert.equal(
    eveningMessage({ ...base, today: "2026-11-01", weekday: 0, week: { sessions: 0, volumeKg: 0, prs: 0 } })?.title,
    "A week off"
  );
  assert.equal(eveningMessage({ ...base, week: { sessions: 4, volumeKg: 12400, prs: 1 } }), undefined, "recap is Sunday only");
}

// -- with a name on it ---------------------------------------------------------------

{
  const named = { ...base, name: "Harsh Yadav" };
  assert.equal(
    morningMessage({ ...named, todaySession: { name: "Push", status: "planned", exercises: 6, sets: 18 } })?.title,
    "Harsh, Push today",
    "first name, and the session name keeps its case"
  );
  assert.equal(
    morningMessage({ ...named, lastWeightDate: undefined, weightCadence: "weekly" })?.title,
    "Harsh, weigh-in due"
  );
  assert.equal(
    eveningMessage({ ...named, todaySession: { name: "Push", status: "planned", exercises: 6, sets: 18 } })?.title,
    "Harsh, your Push session is still open"
  );
  assert.equal(
    eveningMessage({ ...named, today: "2026-11-01", weekday: 0, week: { sessions: 4, volumeKg: 12400, prs: 1 } })?.title,
    "Harsh, this week: 4 sessions"
  );
  assert.equal(
    morningMessage({ ...named, name: "  ", lastWeightDate: undefined, weightCadence: "weekly" })?.title,
    "Weigh-in due",
    "no name, no comma"
  );
}

// -- away ------------------------------------------------------------------------------

{
  const on = { away: true };
  const fresh = { name: "Harsh", today: "2026-10-28", switches: on, sentInGap: new Set<string>(), hasPlan: true, sessionName: "Push" };

  assert.equal(awayMessage({ ...fresh, signedUpOn: "2026-10-28" }), undefined, "the day they sign up: nothing");
  assert.deepEqual(awayMessage({ ...fresh, signedUpOn: "2026-10-27" }), {
    kinds: ["away-1"],
    title: "Harsh, your first session is one tap away",
    body: "Push is set up. Start when you are ready.",
    url: "/"
  });
  assert.equal(
    awayMessage({ ...fresh, signedUpOn: "2026-10-27", hasPlan: false })?.body,
    "Build a plan in two minutes, or let the AI write one."
  );
  assert.equal(awayMessage({ ...fresh, signedUpOn: "2026-10-27", sentInGap: new Set(["away-1"]) }), undefined, "once");
  assert.equal(awayMessage({ ...fresh, signedUpOn: "2026-10-24" })?.kinds[0], "away-3", "day 4: the 3-day nudge, not the 1-day one");
  assert.equal(
    awayMessage({ ...fresh, signedUpOn: "2026-10-24", sentInGap: new Set(["away-3"]) }),
    undefined,
    "a missed day-1 is not sent late once day 3 has gone out"
  );
  assert.equal(awayMessage({ ...fresh, signedUpOn: "2026-10-01", sentInGap: new Set(["away-7"]) }), undefined, "after day 7: silence");

  const lapsed = { ...fresh, signedUpOn: "2026-01-01", sessionName: "Pull" };
  assert.equal(awayMessage({ ...lapsed, lastSetDate: "2026-10-26" }), undefined, "two days off is rest, not away");
  assert.deepEqual(awayMessage({ ...lapsed, lastSetDate: "2026-10-23" }), {
    kinds: ["away-3"],
    title: "Harsh, 5 days since Pull",
    body: "Twenty minutes gets you back.",
    url: "/"
  });
  assert.equal(awayMessage({ ...lapsed, lastSetDate: "2026-10-21", sentInGap: new Set(["away-3"]) })?.kinds[0], "away-7");
  assert.equal(
    awayMessage({ ...lapsed, lastSetDate: "2026-09-01", sentInGap: new Set(["away-3", "away-7", "away-14"]) }),
    undefined,
    "three nudges, then nothing until they train"
  );
  assert.equal(
    awayMessage({ ...lapsed, lastSetDate: "2026-10-24", sentInGap: new Set() })?.kinds[0],
    "away-3",
    "a new set resets the gap: the log since that date is empty, so the cycle starts over"
  );
  assert.equal(awayMessage({ ...lapsed, lastSetDate: "2026-10-23", switches: { away: false } }), undefined, "off is off");
  assert.equal(
    awayMessage({ ...lapsed, name: undefined, lastSetDate: "2026-10-23", sessionName: undefined })?.title,
    "5 days since your last session"
  );
}

console.log("reminder rule checks passed");

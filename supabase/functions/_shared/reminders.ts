/**
 * The daily reminders, as rules with no I/O: what to say, and whether now is
 * the moment. The sender (../send-daily-reminders) gathers the inputs from
 * the database and ships the result; the tests next to this file run the
 * rules with tsx. No Deno and no app imports, so both can load it.
 */

export type ReminderKind = "workout" | "weight" | "measurement" | "plan" | "streak" | "recap" | AwayKind;

/** One per threshold, so each goes once per gap (see awayMessage). */
export type AwayKind = "away-1" | "away-3" | "away-7" | "away-14";

export interface ReminderSwitches {
  workout: boolean;
  weight: boolean;
  measurement: boolean;
  plan: boolean;
  streak: boolean;
  recap: boolean;
  /** Nudges when away: a fresh account that never trained, or a gap after the last set. */
  away?: boolean;
}

export interface LocalClock {
  /** YYYY-MM-DD in the user's zone. */
  date: string;
  /** 0 = Sunday, in the user's zone. */
  weekday: number;
  /** "HH:MM" in the user's zone. */
  time: string;
}

/** The user's local date, weekday and clock for an instant. */
export function localClock(now: Date, timezone: string): LocalClock {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short"
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    weekday: weekdays.indexOf(get("weekday")),
    // Some ICU builds say "24" at midnight even with h23.
    time: `${get("hour").replace(/^24$/, "00")}:${get("minute")}`
  };
}

const minutesOf = (time: string) => {
  const [h, m] = time.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
};

const clockOf = (minutes: number) => {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, "0")}:${String(wrapped % 60).padStart(2, "0")}`;
};

/** How long after its time a reminder may still go out: a sender that ran late sends, one hours late does not. */
export const DUE_WINDOW_MINUTES = 180;

/**
 * Whether `time` has arrived — now or within the window after it. The sender
 * runs every minute, but a slow run or a paused project must not drop the day,
 * and must not send a morning message at midnight either.
 */
export function isDue(clock: LocalClock, time: string): boolean {
  const now = minutesOf(clock.time);
  const at = minutesOf(time);
  return now >= at && now < at + DUE_WINDOW_MINUTES;
}

/**
 * When the workout reminder goes: an hour before the last session's local
 * start time. "You usually start about now" is worth more than a fixed
 * morning slot — and it is when the gym bag gets packed. The morning time
 * until there is a started session to learn from.
 */
export function workoutReminderTime(
  lastStartedAt: string | undefined,
  timezone: string,
  morningTime: string
): string {
  if (!lastStartedAt) {
    return morningTime;
  }
  const started = new Date(lastStartedAt);
  if (Number.isNaN(started.getTime())) {
    return morningTime;
  }
  return clockOf(minutesOf(localClock(started, timezone).time) - 60);
}

// -- what is due -------------------------------------------------------------

export type Cadence = "off" | "weekly" | "biweekly" | "monthly" | null | undefined;

const CADENCE_DAYS: Record<"weekly" | "biweekly" | "monthly", number> = {
  weekly: 7,
  biweekly: 14,
  monthly: 30
};

const dayNumber = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
};

export const daysBetween = (from: string, to: string) => Math.round(dayNumber(to) - dayNumber(from));

/** The same rule as lib/body-metrics dueState: never logged is due; else cadence days since the last. */
export function measurementDue(lastDate: string | undefined, cadence: Cadence, today: string): boolean {
  if (!cadence || cadence === "off") {
    return false;
  }
  if (!lastDate) {
    return true;
  }
  return daysBetween(lastDate, today) >= CADENCE_DAYS[cadence];
}

// -- the messages --------------------------------------------------------------

export interface TodaySession {
  name: string;
  status: "planned" | "active" | "completed";
  exercises: number;
  sets: number;
}

export interface ReminderInput {
  /** The profile name; the first word opens the title ("Harsh, Push today"). */
  name?: string;
  today: string;
  weekday: number;
  switches: ReminderSwitches;
  /** Kinds already sent today, so none repeats within the day. */
  sent: ReadonlySet<string>;
  todaySession?: TodaySession;
  lastWeightDate?: string;
  weightCadence?: Cadence;
  lastTapeDate?: string;
  measurementCadence?: Cadence;
  /** The schedule's end date (YYYY-MM-DD). */
  scheduleEndDate?: string;
  /** Anything logged today — a set, a finished session. */
  loggedToday?: boolean;
  /** This week so far, Monday to today, for the Sunday recap. */
  week?: { sessions: number; volumeKg: number; prs: number };
}

export interface ReminderMessage {
  kinds: ReminderKind[];
  title: string;
  body: string;
  /** Where a tap lands. */
  url: string;
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

const join = (lines: string[]) => lines.filter(Boolean).join(" · ");

/**
 * "Harsh, push today" — the name first, the headline's first letter lowered
 * when it is a plain word and not a session name. A notification with a name
 * on it reads as a message, not a system line.
 */
function address(name: string | undefined, headline: string, keepCase: boolean): string {
  const first = name?.trim().split(/\s+/)[0];
  if (!first) {
    return headline;
  }
  return `${first}, ${keepCase ? headline : headline.charAt(0).toLowerCase() + headline.slice(1)}`;
}

/** The morning card: workout today, and anything due, in one notification. */
export function morningMessage(input: ReminderInput): ReminderMessage | undefined {
  const items: { kind: ReminderKind; headline: string; detail: string; url: string; keepCase?: boolean }[] = [];
  const { switches, sent, todaySession: session } = input;

  if (switches.workout && !sent.has("workout") && session && session.status !== "completed") {
    items.push({
      kind: "workout",
      headline: `${session.name} today`,
      detail: `${plural(session.exercises, "exercise")}, ${plural(session.sets, "set")}`,
      url: "/",
      keepCase: true
    });
  }
  if (switches.weight && !sent.has("weight") && measurementDue(input.lastWeightDate, input.weightCadence, input.today)) {
    const since = input.lastWeightDate ? daysBetween(input.lastWeightDate, input.today) : undefined;
    items.push({
      kind: "weight",
      headline: "Weigh-in due",
      detail: since === undefined ? "Log your first weight on You." : `Last one ${plural(since, "day")} ago.`,
      url: "/profile"
    });
  }
  if (
    switches.measurement &&
    !sent.has("measurement") &&
    measurementDue(input.lastTapeDate, input.measurementCadence, input.today)
  ) {
    const since = input.lastTapeDate ? daysBetween(input.lastTapeDate, input.today) : undefined;
    items.push({
      kind: "measurement",
      headline: "Measurements due",
      detail: since === undefined ? "Take the tape to You." : `Last ones ${plural(since, "day")} ago.`,
      url: "/profile"
    });
  }
  if (switches.plan && !sent.has("plan") && input.scheduleEndDate) {
    const left = daysBetween(input.today, input.scheduleEndDate);
    if (left === 7 || left === 1) {
      items.push({
        kind: "plan",
        headline: left === 7 ? "Your plan ends in a week" : "Your plan ends tomorrow",
        detail: "Add sessions or extend it in Plan.",
        url: "/plan"
      });
    }
  }

  if (items.length === 0) {
    return undefined;
  }
  const [first, ...rest] = items;
  return {
    kinds: items.map((item) => item.kind),
    title: address(input.name, first.headline, Boolean(first.keepCase)),
    body: join([first.detail, ...rest.map((item) => item.headline)]),
    url: first.url
  };
}

/** The evening card: a planned day with nothing logged, and on Sunday the week. */
export function eveningMessage(input: ReminderInput): ReminderMessage | undefined {
  const items: { kind: ReminderKind; headline: string; detail: string; url: string; keepCase?: boolean }[] = [];
  const { switches, sent, todaySession: session } = input;

  if (
    switches.streak &&
    !sent.has("streak") &&
    session &&
    session.status !== "completed" &&
    !input.loggedToday
  ) {
    items.push({
      kind: "streak",
      headline: `Your ${session.name} session is still open`,
      detail: "Twenty minutes keeps the streak.",
      url: "/"
    });
  }
  if (switches.recap && !sent.has("recap") && input.weekday === 0 && input.week) {
    const { sessions, volumeKg, prs } = input.week;
    items.push({
      kind: "recap",
      headline: sessions === 0 ? "A week off" : `This week: ${plural(sessions, "session")}`,
      detail:
        sessions === 0
          ? "Next week starts tomorrow."
          : join([`${Math.round(volumeKg).toLocaleString("en-US")} kg`, prs > 0 ? plural(prs, "record") : ""]),
      url: "/progress"
    });
  }

  if (items.length === 0) {
    return undefined;
  }
  const [first, ...rest] = items;
  return {
    kinds: items.map((item) => item.kind),
    title: address(input.name, first.headline, false),
    body: join([first.detail, ...rest.map((item) => item.headline)]),
    url: first.url
  };
}

// -- away -----------------------------------------------------------------------

/** Days since sign-in that get a nudge, for an account that never logged a set. */
export const FRESH_DAYS = [1, 3, 7] as const;
/** Days since the last set that get a nudge. Three, then silence until they train. */
export const AWAY_DAYS = [3, 7, 14] as const;

export interface AwayInput {
  name?: string;
  today: string;
  switches: Pick<ReminderSwitches, "away">;
  /** YYYY-MM-DD the account was created. */
  signedUpOn?: string;
  /** YYYY-MM-DD of the last logged set; absent when there is none yet. */
  lastSetDate?: string;
  /** Away kinds already sent in this gap — since the last set, or since sign-in. */
  sentInGap: ReadonlySet<string>;
  /** The name of the last trained session, or of the next planned one, for the copy. */
  sessionName?: string;
  /** Whether the account has any session template to start from. */
  hasPlan: boolean;
}

/**
 * The nudge for someone who is not training. At most three per gap, each at
 * its own threshold, "at or past" rather than "exactly" so a missed morning
 * still sends the next day. The gap resets with the next set: `sentInGap`
 * holds only what went out since then.
 */
export function awayMessage(input: AwayInput): ReminderMessage | undefined {
  if (!input.switches.away) {
    return undefined;
  }
  const fresh = !input.lastSetDate;
  const since = fresh ? input.signedUpOn : input.lastSetDate;
  if (!since) {
    return undefined;
  }
  const days = daysBetween(since, input.today);
  const thresholds: readonly number[] = fresh ? FRESH_DAYS : AWAY_DAYS;
  // The highest threshold reached that has not gone out yet. Past the last
  // one, nothing more: three nudges is a reminder, a fourth is a nag.
  const due = [...thresholds].reverse().find((threshold) => days >= threshold);
  if (due === undefined) {
    return undefined;
  }
  const kind = `away-${due}` as AwayKind;
  if (input.sentInGap.has(kind)) {
    return undefined;
  }

  if (fresh) {
    return {
      kinds: [kind],
      title: address(input.name, "Your first session is one tap away", false),
      body: input.hasPlan
        ? `${input.sessionName ?? "Your plan"} is set up. Start when you are ready.`
        : "Build a plan in two minutes, or let the AI write one.",
      url: input.hasPlan ? "/" : "/plan?mode=build"
    };
  }
  const gap = `${plural(days, "day")} since ${input.sessionName ? `${input.sessionName}` : "your last session"}`;
  return {
    kinds: [kind],
    title: address(input.name, gap, false),
    body: "Twenty minutes gets you back.",
    url: "/"
  };
}

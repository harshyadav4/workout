/**
 * The light Solo Leveling layer, worked out from real numbers: a hunter rank
 * that rises and falls with how you train now, and "level up" on a new best.
 * Nothing here is a score the app invents from nowhere — it is your own
 * schedule, your own logs, compared with your own month before.
 *
 * Pure, so it is tested.
 */
import { daysBetween, shiftKey, weekStartKey } from "@/lib/progress-metrics";
import type { ScheduledSession, WorkoutLog } from "@/lib/types";

export type Rank = "E" | "D" | "C" | "B" | "A" | "S";

/**
 * Lowest first. `score` is the level a week must reach to count toward this
 * rank; `weeks` is how many such weeks it takes to get there from the one
 * below: two to three months a rank, so E to S is a year at the very fastest.
 * S is rare but human: twelve weeks in a row of every planned session, best
 * sets up about 2% a month, and a little more work than the month before.
 * Holding the same weights forever stops at A.
 */
export const RANKS: readonly { rank: Rank; score: number; weeks: number }[] = [
  { rank: "E", score: 0, weeks: 0 },
  { rank: "D", score: 30, weeks: 9 },
  { rank: "C", score: 45, weeks: 10 },
  { rank: "B", score: 60, weeks: 10 },
  { rank: "A", score: 75, weeks: 11 },
  { rank: "S", score: 90, weeks: 12 }
];

/**
 * Weeks in a row below your rank's level before it drops one. Two, for every
 * rank: a planned deload week must not cost anyone their rank.
 */
const weeksToFall = (_index: number) => 2;

/** The month that counts, and the month it is held against. */
const WINDOW_DAYS = 28;
/** No rank above E until there is this much history to judge. */
const MIN_HISTORY_DAYS = 14;
/** Without a schedule, this many training days a week counts as showing up fully. */
const DEFAULT_DAYS_PER_WEEK = 3;
/** How far back the weekly replay starts. Two years covers the climb to S. */
const MAX_WEEKS = 104;

export interface RankParts {
  /** 0 to 1: days trained against days planned (or 3 a week with no plan). */
  showingUp: number;
  /** 0 to 1, 0.6 is "holding": best sets against the month before. */
  strength: number;
  /** 0 to 1, 0.6 is "holding": total kg against the month before. */
  volume: number;
  planned: number;
  trained: number;
  /** Average best-set ratio across exercises done in both months; absent with none. */
  strengthRatio?: number;
  volumeRatio?: number;
}

export interface HunterRank {
  rank: Rank;
  /** 0 to 100, from the four weeks ending today. */
  score: number;
  parts: RankParts;
  /** Below this rank's level now; another such week and it may drop. */
  slipping: boolean;
  /** Absent at S. */
  next?: {
    rank: Rank;
    /** The score a week needs to count toward it. */
    score: number;
    weeksDone: number;
    weeksNeeded: number;
    /** weeksDone / weeksNeeded, 0 to 1. */
    progress: number;
    /** This week, so far, counts toward it. */
    onTrack: boolean;
    /** The Sunday it is reached if every week from this one counts. Only when on track. */
    eta?: string;
  };
  /** One plain line: why the rank is where it is, or what is missing. */
  reason: string;
}

const clamp = (value: number) => Math.max(0, Math.min(1, value));

/**
 * A ratio against the month before, as 0 to 1. Holding level is 0.6, so
 * keeping what you have is a pass and only growth reaches the top. `drop` is
 * how far below level reads as zero, `rise` how far above reads as full.
 */
function trendScore(ratio: number | undefined, drop: number, rise: number) {
  if (ratio === undefined) {
    return 0.6;
  }
  return ratio >= 1 ? 0.6 + clamp((ratio - 1) / rise) * 0.4 : clamp(0.6 - ((1 - ratio) / drop) * 0.6);
}

const inRange = (date: string, start: string, end: string) => date >= start && date <= end;

/** The score on one day, from the four weeks ending on it against the four before. */
export function rankParts(logs: WorkoutLog[], scheduled: ScheduledSession[], day: string): RankParts {
  const start = shiftKey(day, -(WINDOW_DAYS - 1));
  const prevEnd = shiftKey(start, -1);
  const prevStart = shiftKey(prevEnd, -(WINDOW_DAYS - 1));

  const current = logs.filter((log) => inRange(log.date, start, day));
  const previous = logs.filter((log) => inRange(log.date, prevStart, prevEnd));

  // Days, not sessions: a session moved to another day still counts, and two
  // on one day is one day of showing up. Rest days are not planned work.
  const trained = new Set(current.map((log) => log.date)).size;
  const planned = new Set(
    scheduled
      .filter((session) => session.type === "workout" && session.exercises.length > 0 && inRange(session.date, start, day))
      .map((session) => session.date)
  ).size;
  const expected = planned > 0 ? planned : (WINDOW_DAYS / 7) * DEFAULT_DAYS_PER_WEEK;

  // Best set per exercise in each month; only exercises in both are compared,
  // so starting a new lift never reads as getting weaker.
  const best = (rows: WorkoutLog[]) => {
    const map = new Map<string, number>();
    rows.forEach((log) => {
      if ((log.peakWeight ?? 0) > 0) {
        map.set(log.workoutId, Math.max(map.get(log.workoutId) ?? 0, log.peakWeight ?? 0));
      }
    });
    return map;
  };
  const now = best(current);
  const before = best(previous);
  const ratios = [...now].filter(([id]) => before.has(id)).map(([id, weight]) => weight / (before.get(id) ?? 1));
  const strengthRatio = ratios.length ? ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length : undefined;

  const volumeNow = current.reduce((sum, log) => sum + log.totalVolume, 0);
  const volumeBefore = previous.reduce((sum, log) => sum + log.totalVolume, 0);
  const volumeRatio = volumeBefore > 0 ? volumeNow / volumeBefore : undefined;

  return {
    showingUp: clamp(trained / expected),
    // A best set 10% down is zero, 3% up is full — about what a trained lifter
    // can add in a month. Volume swings more from week to week, so it gets
    // more room either way. A month with no training holds nothing: zero.
    strength: trained === 0 ? 0 : trendScore(strengthRatio, 0.1, 0.03),
    volume: trained === 0 ? 0 : trendScore(volumeRatio, 0.2, 0.05),
    planned,
    trained,
    strengthRatio,
    volumeRatio
  };
}

export function scoreOf(parts: RankParts) {
  return Math.round(100 * (0.5 * parts.showingUp + 0.3 * parts.strength + 0.2 * parts.volume));
}

function rankIndexFor(score: number) {
  let index = 0;
  RANKS.forEach((step, position) => {
    if (score >= step.score) {
      index = position;
    }
  });
  return index;
}

function reasonFor(parts: RankParts, rank: number, aim: number, enoughHistory: boolean) {
  if (!enoughHistory) {
    return "Your first two weeks set the starting line. Keep training.";
  }
  const missed = parts.planned > 0 ? Math.max(0, parts.planned - parts.trained) : 0;
  const why =
    missed > 0
      ? `${missed} planned session${missed === 1 ? "" : "s"} missed in the last 4 weeks.`
      : parts.planned === 0 && parts.showingUp < 1
        ? "Train about 3 days a week to raise your score."
        : parts.strength < 0.6
          ? "Your best sets are lighter than the month before."
          : parts.volume < 0.6
            ? "Less total work than the month before."
            : undefined;
  if (aim < rank) {
    const weeks = weeksToFall(rank);
    return `${why ?? "Your score is below this rank."} ${weeks === 1 ? "One more week" : `${weeks} weeks`} like this drops a rank.`;
  }
  if (aim > rank) {
    return why ? `${why} Still on track.` : "This week counts toward the next rank. Keep it up.";
  }
  return why ?? (parts.strength < 0.85 ? "Every session done. Push your best sets up to climb." : "Every session done, and your lifts are going up.");
}

/**
 * The rank today, replayed week by week from the first log, with nothing
 * stored, so every phone agrees.
 *
 * Each finished week scores the four weeks ending on its Sunday. A week at the
 * next rank's level earns one week toward it, and enough of them promote you.
 * A week below your own rank's level costs one earned week, and two in a row
 * drop you a rank. This week is still running, so it never moves the rank: it
 * only says whether it is on track.
 */
export function hunterRank(logs: WorkoutLog[], scheduled: ScheduledSession[], today: string): HunterRank {
  const first = logs.reduce<string | undefined>((earliest, log) => (!earliest || log.date < earliest ? log.date : earliest), undefined);
  const enough = (day: string) => first !== undefined && daysBetween(first, day) >= MIN_HISTORY_DAYS;
  const aimOn = (day: string) => (enough(day) ? rankIndexFor(scoreOf(rankParts(logs, scheduled, day))) : 0);

  const thisWeek = weekStartKey(today);
  let index = 0;
  let earned = 0;
  let below = 0;
  if (first) {
    let week = weekStartKey(first);
    const earliest = shiftKey(thisWeek, -7 * MAX_WEEKS);
    if (week < earliest) week = earliest;
    for (; week < thisWeek; week = shiftKey(week, 7)) {
      const aim = aimOn(shiftKey(week, 6));
      if (aim > index) {
        below = 0;
        earned += 1;
        if (index + 1 < RANKS.length && earned >= RANKS[index + 1].weeks) {
          index += 1;
          earned = 0;
        }
      } else if (aim < index) {
        earned = Math.max(0, earned - 1);
        below += 1;
        if (below >= weeksToFall(index)) {
          index -= 1;
          earned = 0;
          below = 0;
        }
      } else {
        below = 0;
      }
    }
  }

  // Until something is logged today, today is not a missed day yet: the live
  // score ends yesterday.
  const live = logs.some((log) => log.date === today) ? today : shiftKey(today, -1);
  const parts = rankParts(logs, scheduled, live);
  const score = scoreOf(parts);
  const aim = enough(live) ? rankIndexFor(score) : 0;
  const upcoming = RANKS[index + 1];
  const onTrack = aim > index;
  const next = upcoming
    ? {
        rank: upcoming.rank,
        score: upcoming.score,
        weeksDone: earned,
        weeksNeeded: upcoming.weeks,
        progress: earned / upcoming.weeks,
        onTrack,
        // This week is the first of the weeks still to go.
        eta: onTrack ? shiftKey(thisWeek, 7 * (upcoming.weeks - earned) - 1) : undefined
      }
    : undefined;

  return {
    rank: RANKS[index].rank,
    score,
    parts,
    slipping: aim < index,
    next,
    reason: reasonFor(parts, index, aim, enough(live))
  };
}

/** The heaviest top set on this exercise before `today`. Zero with no history. */
export function previousBest(logs: WorkoutLog[], workoutId: string, today: string): number {
  return logs
    .filter((log) => log.workoutId === workoutId && log.date < today)
    .reduce((peak, log) => Math.max(peak, log.peakWeight ?? 0), 0);
}

/**
 * A newly logged set beats every earlier day on that exercise, and every set
 * already logged on it today, so a run of heavier sets levels up once per new
 * high and not on every set after. Never on a first-ever lift: that is a
 * baseline, not a record — the same rule as `summarizeSession`.
 */
export function isLevelUp(weight: number, before: number, todayBest: number): boolean {
  return before > 0 && weight > before && weight > todayBest;
}

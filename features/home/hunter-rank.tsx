"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DRAWER_CONTENT
} from "@/components/ui/dialog";
import { MeasurementOrb, RankCrest, TreasureChest } from "@/features/home/artifacts";
import { useWorkoutStore } from "@/features/workout/workout-store";
import { hunterRank, RANKS, type Rank } from "@/lib/hunter";
import { formatDayKey } from "@/lib/progress-metrics";
import { cn } from "@/lib/utils";

function useHunterRank() {
  const logs = useWorkoutStore((state) => state.logs);
  const scheduled = useWorkoutStore((state) => state.scheduledSessions);
  // `activeDate`, never `new Date()`: the same day the rest of Home is on.
  const today = useWorkoutStore((state) => state.activeDate);
  return useMemo(() => hunterRank(logs, scheduled, today), [logs, scheduled, today]);
}

/**
 * The rank as a small System chip — the letter, a hairline, the word — on the
 * date line. A chip that looks like this gets tapped, so it opens the whole
 * story: the rank, the progress, the ladder and this week's score.
 */
export function RankBadge({ name }: { name?: string }) {
  const { rank } = useHunterRank();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Hunter rank ${rank}. How ranks work`}
        className="rank-chip inline-flex h-8 shrink-0 items-center gap-2 rounded-[9px] px-3 leading-none transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="rank-letter font-display text-[19px] font-extrabold">{rank}</span>
        <span className="h-3.5 w-px bg-brand/30" aria-hidden />
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Rank</span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className={`${DRAWER_CONTENT} max-h-[88dvh] overflow-y-auto`}>
          <DialogHeader className="sr-only">
            <DialogTitle>Hunter rank {rank}</DialogTitle>
            <DialogDescription>Your status: rank, progress to the next one, and this week&apos;s score.</DialogDescription>
          </DialogHeader>
          <RankSheet name={name} />
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Where the rank stands and where it is going: the score, a mana bar of the
 * weeks earned toward the next rank, when it lands if every week from here
 * counts, and one plain line on why — including what is holding it back.
 */
export function RankProgress() {
  const { rank, score, next, reason, slipping, parts } = useHunterRank();
  const progress = next ? next.progress : 1;
  const percent = Math.round(progress * 100);

  return (
    <div className="mt-4 border-t border-border pt-3">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="flex items-center gap-2 font-semibold">
          <RankCrest rank={rank} className="h-6 w-6" />
          <span>
            Hunter rank <span className="text-brand">{rank}</span>
          </span>
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">Score {score} / 100</span>
      </div>
      <div
        className="well mt-2 h-1.5 overflow-hidden rounded-full"
        role="progressbar"
        aria-label={next ? `Progress to rank ${next.rank}` : "Top rank"}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div className="mana-fill h-full rounded-full" style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-2 text-xs font-medium tabular-nums">
        {next ? (
          <>
            <span className="text-brand">{percent}%</span> to {next.rank} · {next.weeksDone} of {next.weeksNeeded} weeks
            {next.onTrack && next.eta ? (
              <span className="text-muted-foreground"> · by {formatDayKey(next.eta)} if you keep this up</span>
            ) : score === 0 ? null : (
              <span className="text-muted-foreground">
                {" "}
                · paused: a week counts at {next.score}+, you are at {score}
              </span>
            )}
          </>
        ) : (
          <span className="text-brand">The top rank. Hold it every week.</span>
        )}
      </p>
      <p className={cn("mt-1 text-xs", slipping ? "text-warning" : "text-muted-foreground")}>{reason}</p>
      <RankGuide rank={rank} parts={parts} />
    </div>
  );
}

const LADDER_COPY: Record<Rank, string> = {
  E: "Where everyone starts",
  D: "About 2 months",
  C: "About 2.5 months more",
  B: "About 2.5 months more",
  A: "About 2.5 months more",
  S: "About 3 months more, at near-perfect weeks"
};

type Parts = ReturnType<typeof hunterRank>["parts"];

/** The three parts of the score, as stats: what each is worth, what you have, how to raise it. */
function stats(parts: Parts) {
  return [
    {
      label: "Showing up",
      worth: 50,
      value: parts.showingUp,
      how: parts.planned > 0 ? "Do every session your schedule plans." : "Train about 3 days a week."
    },
    { label: "Strength", worth: 30, value: parts.strength, how: "Beat last month's best sets, even by a little." },
    { label: "Volume", worth: 20, value: parts.volume, how: "Do a bit more total work than last month." }
  ];
}

function ScoreBars({ parts }: { parts: Parts }) {
  return (
    <div className="space-y-2.5">
      {stats(parts).map((stat) => (
        <div key={stat.label}>
          <div className="flex items-baseline justify-between text-xs">
            <span className="font-medium">{stat.label}</span>
            <span className="tabular-nums text-muted-foreground">
              {Math.round(stat.value * stat.worth)} / {stat.worth}
            </span>
          </div>
          <div className="well mt-1 h-1.5 overflow-hidden rounded-full" aria-hidden>
            <div className="mana-fill h-full rounded-full" style={{ width: `${stat.value * 100}%` }} />
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">{stat.how}</p>
        </div>
      ))}
    </div>
  );
}

function RankLadder({ rank }: { rank: Rank }) {
  return (
    <ol className="space-y-1">
      {[...RANKS].reverse().map((step) => {
        const current = step.rank === rank;
        return (
          <li
            key={step.rank}
            className={cn("flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-xs", current ? "bg-brand/12 ring-1 ring-brand/40" : "")}
          >
            <RankCrest rank={step.rank} className="h-5 w-5" />
            <span className={cn("w-4 font-display text-sm font-extrabold", current ? "text-brand" : "")}>{step.rank}</span>
            <span className="flex-1 text-muted-foreground">{LADDER_COPY[step.rank]}</span>
            <span className="tabular-nums text-muted-foreground">{step.weeks > 0 ? `${step.score}+ · ${step.weeks} wk` : "start"}</span>
          </li>
        );
      })}
    </ol>
  );
}

const RULE =
  "Every week gets a score out of 100 from your last 4 weeks. A week at the next rank's level counts toward it; enough of them and you rank up. Two weeks below your rank in a row drop it one.";

/** "How ranks work", folded away under the bar on the This week card. */
function RankGuide({ rank, parts }: { rank: Rank; parts: Parts }) {
  return (
    <details className="group mt-3 rounded-xl bg-muted px-3 py-1">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-xs font-semibold [&::-webkit-details-marker]:hidden">
        How ranks work
        <span className="text-muted-foreground transition-transform group-open:rotate-180" aria-hidden>
          ▾
        </span>
      </summary>
      <div className="pb-3">
        <p className="text-xs text-muted-foreground">{RULE}</p>
        <div className="mt-3">
          <RankLadder rank={rank} />
        </div>
        <p className="mb-2 mt-4 text-xs font-semibold">Your score this week</p>
        <ScoreBars parts={parts} />
      </div>
    </details>
  );
}

const TITLES: Record<Rank, string> = {
  E: "Fresh Recruit",
  D: "Regular",
  C: "Iron Regular",
  B: "Veteran Lifter",
  A: "Elite Hunter",
  S: "Apex Hunter"
};

/** A spaced-capitals label over a soft line in the accent: the sheet's one genre touch in type. */
function SheetLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <p className="text-center text-[10px] font-bold uppercase tracking-[0.3em] text-brand">{children}</p>
      <div className="mt-2 h-px bg-gradient-to-r from-transparent via-brand/40 to-transparent" />
    </div>
  );
}

/**
 * The rank sheet, opened from the chip. The shape of a status screen — a
 * heading, the measuring orb beside name, title and rank, then EXP, stats and
 * the ladder — in the app's own materials: the rounded sheet, its panels and
 * plain words. Every number is the one the rank is built from.
 */
function RankSheet({ name }: { name?: string }) {
  const { rank, score, next, reason, slipping, parts } = useHunterRank();
  const percent = Math.round((next ? next.progress : 1) * 100);

  return (
    <div>
      <p className="pr-8 text-center text-[13px] font-semibold uppercase tracking-[0.3em] pl-8">Status</p>
      <div className="mt-3 h-px bg-gradient-to-r from-transparent via-brand/40 to-transparent" />

      <div className="mt-4 flex items-center gap-4">
        <MeasurementOrb rank={rank} className="h-[84px] w-[74px]" />
        <dl className="min-w-0 flex-1 space-y-1.5 text-sm">
          {[
            ["Name", name ?? "Hunter"],
            ["Title", TITLES[rank]],
            ["Rank", `${rank}-rank`]
          ].map(([term, value]) => (
            <div key={term} className="flex items-baseline gap-3">
              <dt className="w-11 shrink-0 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{term}</dt>
              <dd className={cn("truncate font-semibold capitalize", term === "Rank" ? "text-brand" : "")}>{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <SheetLabel>EXP</SheetLabel>
      <div className="mt-3">
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-semibold">{next ? `To ${next.rank}-rank` : "You are at the top"}</span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {next ? `${next.weeksDone} of ${next.weeksNeeded} weeks` : "Hold it every week"}
          </span>
        </div>
        <div className="well mt-2 h-2 overflow-hidden rounded-full" aria-hidden>
          <div className="mana-fill h-full rounded-full" style={{ width: `${percent}%` }} />
        </div>
        <p className="mt-1.5 text-xs tabular-nums">
          <span className="font-semibold text-brand">{percent}%</span>
          {next ? (
            next.onTrack && next.eta ? (
              <span className="text-muted-foreground"> · by {formatDayKey(next.eta)} if you keep this up</span>
            ) : score === 0 ? null : (
              <span className="text-muted-foreground"> · paused: a week counts at {next.score}+, you are at {score}</span>
            )
          ) : null}
        </p>
      </div>

      <SheetLabel>Stats</SheetLabel>
      <div className="mt-3">
        <ScoreBars parts={parts} />
        <div className="mt-3 flex items-baseline justify-between rounded-lg bg-muted px-3 py-2">
          <span className="text-sm font-semibold">Total</span>
          <span className="font-display text-lg font-extrabold tabular-nums">
            {score} <span className="text-xs font-semibold text-muted-foreground">/ 100</span>
          </span>
        </div>
        <p className={cn("mt-2 text-xs", slipping ? "text-warning" : "text-muted-foreground")}>{reason}</p>
      </div>

      <SheetLabel>Rank ladder</SheetLabel>
      <p className="mt-3 text-xs text-muted-foreground">{RULE}</p>
      <div className="mt-3">
        <RankLadder rank={rank} />
      </div>
    </div>
  );
}

/** The last rank this phone has shown, so a new one is announced once. */
const SEEN_KEY = "gymflow.rankSeen";
const order = (rank: Rank) => RANKS.findIndex((step) => step.rank === rank);

/**
 * "New rank": the chest opens, once, on the first visit after a rank up. A
 * drop is noted silently — the card under it already says why. The first time
 * a phone ever sees a rank it only remembers it, so an existing account is not
 * greeted with a promotion it earned months ago.
 */
export function RankUpNotice() {
  const { rank } = useHunterRank();
  const [shown, setShown] = useState<Rank>();

  useEffect(() => {
    try {
      const seen = localStorage.getItem(SEEN_KEY) as Rank | null;
      if (seen && order(seen) >= 0 && order(rank) > order(seen)) {
        setShown(rank);
        return;
      }
      localStorage.setItem(SEEN_KEY, rank);
    } catch {
      // No storage, no announcement; the rank itself still shows.
    }
  }, [rank]);

  if (!shown) {
    return null;
  }

  const close = () => {
    try {
      localStorage.setItem(SEEN_KEY, shown);
    } catch {
      // Shown again next visit; harmless.
    }
    setShown(undefined);
  };

  return (
    <div className="system-pop plaque mt-4 flex items-center gap-4 rounded-3xl p-4" role="status">
      <TreasureChest className="h-14 w-16" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand">New rank</p>
        <p className="mt-0.5 font-display text-xl font-extrabold leading-tight tracking-tight">You are {shown}-rank</p>
        <p className="mt-0.5 text-xs text-muted-foreground">Weeks of showing up did this. Hold it.</p>
      </div>
      <Button size="sm" variant="secondary" onClick={close}>
        Nice
      </Button>
    </div>
  );
}

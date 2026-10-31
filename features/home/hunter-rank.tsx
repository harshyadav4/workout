"use client";

import { ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { ProgressArc } from "@/components/ui/progress-arc";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DRAWER_CONTENT
} from "@/components/ui/dialog";
import { RankCrest } from "@/features/home/artifacts";
import { SessionRing } from "@/features/home/session-ring";
import { useTour } from "@/features/tour/tour-store";
import { useWorkoutStore } from "@/features/workout/workout-store";
import { hunterRank, RANKS, type Rank } from "@/lib/hunter";
import { formatDayKey } from "@/lib/progress-metrics";
import { StatusSkillsDoor, useSkillsFound } from "@/features/skills/skill-doors";
import { InfoNote } from "@/components/ui/info-note";
import { cn } from "@/lib/utils";

function useHunterRank() {
  const logs = useWorkoutStore((state) => state.logs);
  const scheduled = useWorkoutStore((state) => state.scheduledSessions);
  // `activeDate`, never `new Date()`: the same day the rest of Home is on.
  const today = useWorkoutStore((state) => state.activeDate);
  return useMemo(() => hunterRank(logs, scheduled, today), [logs, scheduled, today]);
}

/**
 * The rank beside the greeting: the letter in a thin ring of the weeks earned
 * toward the next one. It looks tappable, so it opens the whole story: the rank,
 * the progress, the ladder and this week's score.
 */
export function RankBadge({ name }: { name?: string }) {
  const { rank, next } = useHunterRank();
  const [open, setOpen] = useState(false);
  // Until Skills is found, the crest breathes — the only hint there is one.
  const skillsFound = useSkillsFound();
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Hunter rank ${rank}. Show how ranks work`}
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          !skillsFound && "skills-hint"
        )}
      >
        <SessionRing value={next ? next.progress : 1} size={44} stroke={3}>
          <span className="font-heading text-[22px]">{rank}</span>
        </SessionRing>
      </button>
      <RankDialog name={name} rank={rank} open={open} onOpenChange={setOpen} />
    </>
  );
}

/**
 * The rank on You: the arc, the letter under it, and how far the next rank is.
 * Tapping it opens the same story as the chip on Today.
 */
export function RankArc({ name }: { name?: string }) {
  const { rank, next } = useHunterRank();
  const [open, setOpen] = useState(false);
  const caption = next ? `${next.weeksDone} of ${next.weeksNeeded} weeks to ${next.rank}` : "The top rank";
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Hunter rank ${rank}. ${caption}. Show how ranks work`}
        className="mx-auto block w-full max-w-[300px] rounded-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="relative block">
          <ProgressArc fraction={next ? next.progress : 1} />
          <span className="absolute inset-x-0 bottom-0 block text-center">
            <span className="block text-[13.5px] text-muted-foreground">Rank</span>
            <span className="block font-heading text-[92px] leading-[0.95]">{rank}</span>
          </span>
        </span>
        <span className="mt-3 block text-center text-[13.5px] text-muted-foreground">{caption}</span>
      </button>
      <RankDialog name={name} rank={rank} open={open} onOpenChange={setOpen} />
    </>
  );
}

function RankDialog({
  name,
  rank,
  open,
  onOpenChange
}: {
  name?: string;
  rank: Rank;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${DRAWER_CONTENT} max-h-[88dvh] overflow-y-auto`}>
        <DialogHeader className="sr-only">
          <DialogTitle>Hunter rank {rank}</DialogTitle>
          <DialogDescription>Your rank, progress, and score this week.</DialogDescription>
        </DialogHeader>
        <RankSheet name={name} />
      </DialogContent>
    </Dialog>
  );
}

/**
 * Where the rank stands and where it is going, as one row in This week: the bar
 * of weeks earned, when it lands if every week from here counts, and the reason
 * only when it is slipping. A tap opens the rest, so the card stays one card.
 */
export function RankProgress() {
  const { rank, score, next, reason, slipping } = useHunterRank();
  const name = useWorkoutStore((state) => state.profile.name);
  const [open, setOpen] = useState(false);
  const progress = next ? next.progress : 1;
  const percent = Math.round(progress * 100);

  return (
    <>
      <button
        type="button"
        data-icon=""
        onClick={() => setOpen(true)}
        className="list-row flex min-h-[54px] w-full items-center gap-3 py-2.5 pl-4 pr-3.5 text-left transition-colors active:bg-hi focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <RankCrest rank={rank} className="h-5 w-5" />
        <span className="min-w-0 flex-1">
          <span className="block text-[15.5px] font-medium">Rank {rank}</span>
          <span className="mt-px block text-[13px] tabular-nums text-muted-foreground">
            {next ? (
              <>
                {next.weeksDone} of {next.weeksNeeded} weeks to {next.rank}
                {next.onTrack && next.eta
                  ? ` · by ${formatDayKey(next.eta)}`
                  : score === 0
                    ? ""
                    : ` · paused, needs ${next.score}+`}
              </>
            ) : (
              "Top rank. Train like this to keep it."
            )}
          </span>
          <span
            className="mt-1.5 block h-1 overflow-hidden rounded-full bg-track"
            role="progressbar"
            aria-label={next ? `Progress to rank ${next.rank}` : "Top rank"}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
          >
            <span className="mana-fill block h-full rounded-full" style={{ width: `${percent}%` }} />
          </span>
          {slipping ? <span className="mt-1.5 block text-[13px] text-warning">{reason}</span> : null}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden />
      </button>
      <RankDialog name={name?.trim().split(/\s+/)[0]} rank={rank} open={open} onOpenChange={setOpen} />
    </>
  );
}

const LADDER_COPY: Record<Rank, string> = {
  E: "The start rank",
  D: "About 2 months",
  C: "About 2.5 months more",
  B: "About 2.5 months more",
  A: "About 2.5 months more",
  S: "About 3 months more, near-perfect weeks"
};

type Parts = ReturnType<typeof hunterRank>["parts"];

/** The three parts of the score, as stats: what each is worth, what you have, how to raise it. */
function stats(parts: Parts) {
  return [
    {
      label: "Consistency",
      worth: 50,
      value: parts.showingUp,
      how: parts.planned > 0 ? "Do every workout in your plan." : "Train about 3 days a week."
    },
    { label: "Strength", worth: 30, value: parts.strength, how: "Lift a bit heavier than last month." },
    { label: "Weight lifted", worth: 20, value: parts.volume, how: "Lift a bit more in total than last month." }
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
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-track" aria-hidden>
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
            className={cn("flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-xs", current ? "bg-hi" : "")}
          >
            <RankCrest rank={step.rank} className="h-5 w-5" />
            <span className="w-4 text-sm font-semibold">{step.rank}</span>
            <span className="flex-1 text-muted-foreground">{LADDER_COPY[step.rank]}</span>
            <span className="tabular-nums text-muted-foreground">{step.weeks > 0 ? `${step.score}+ · ${step.weeks} wk` : "start"}</span>
          </li>
        );
      })}
    </ol>
  );
}

const RULE =
  "Ranks go from E (lowest) to S (highest). Each week scores 0–100 from your last 4 weeks. Enough weeks at the next rank's score move you up 1 rank. 2 weeks in a row below your rank's score move you down 1 rank.";

const TITLES: Record<Rank, string> = {
  E: "Fresh Recruit",
  D: "Regular",
  C: "Iron Regular",
  B: "Veteran Lifter",
  A: "Elite Hunter",
  S: "Apex Hunter"
};

function SheetLabel({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-5 text-[13.5px] font-semibold text-muted-foreground">{children}</h3>;
}

/**
 * The rank sheet, opened from the ring. The shape of a status screen — the
 * letter beside name, title and rank, then EXP, stats and the ladder — in plain
 * rows. Every number is the one the rank is built from.
 */
function RankSheet({ name }: { name?: string }) {
  const { rank, score, next, reason, slipping, parts } = useHunterRank();
  const percent = Math.round((next ? next.progress : 1) * 100);

  return (
    <div>
      <div className="flex items-center gap-5 pr-8">
        <span className="font-heading text-[84px] leading-none" aria-hidden>
          {rank}
        </span>
        <dl className="min-w-0 flex-1 space-y-1.5 text-sm">
          {[
            ["Name", name ?? "Hunter"],
            ["Title", TITLES[rank]],
            ["Rank", `${rank}-rank`]
          ].map(([term, value]) => (
            <div key={term} className="flex items-baseline gap-3">
              <dt className="w-11 shrink-0 text-[12.5px] text-muted-foreground">{term}</dt>
              <dd className="truncate font-medium capitalize">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* The first of the three doors to Skills (features/skills/skill-doors). */}
      <StatusSkillsDoor />

      <SheetLabel>EXP</SheetLabel>
      <div className="mt-3">
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-semibold">{next ? `To ${next.rank}-rank` : "You have the top rank"}</span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {next ? `${next.weeksDone} of ${next.weeksNeeded} weeks` : "Keep it every week"}
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-track" aria-hidden>
          <div className="mana-fill h-full rounded-full" style={{ width: `${percent}%` }} />
        </div>
        <p className="mt-1.5 text-xs tabular-nums">
          <span className="font-semibold">{percent}%</span>
          {next ? (
            next.onTrack && next.eta ? (
              <span className="text-muted-foreground"> · by {formatDayKey(next.eta)} at this pace</span>
            ) : score === 0 ? null : (
              <span className="text-muted-foreground"> · paused, needs {next.score}+</span>
            )
          ) : null}
        </p>
      </div>

      <SheetLabel>Stats</SheetLabel>
      <div className="mt-3">
        <ScoreBars parts={parts} />
        <div className="mt-3 flex items-baseline justify-between border-t border-sep pt-2.5">
          <span className="text-sm font-semibold">Total</span>
          <span className="text-lg font-semibold tabular-nums">
            {score} <span className="text-xs font-semibold text-muted-foreground">/ 100</span>
          </span>
        </div>
        <p className={cn("mt-2 text-xs", slipping ? "text-warning" : "text-muted-foreground")}>{reason}</p>
      </div>

      <SheetLabel>Rank ladder</SheetLabel>
      <InfoNote
        className="mt-2"
        heading={<p className="text-xs font-semibold">How ranks work</p>}
        note={<p>{RULE}</p>}
      />
      <div className="mt-2">
        <RankLadder rank={rank} />
      </div>
    </div>
  );
}

/** The last rank this phone has shown, so a new one is announced once. */
const SEEN_KEY = "gymflow.rankSeen";
const order = (rank: Rank) => RANKS.findIndex((step) => step.rank === rank);

/**
 * "New rank", once, on the first visit after a rank up. A drop is noted silently
 * — the row under it already says why. The first time a phone ever sees a rank
 * it only remembers it, so an existing account is not greeted with a promotion
 * it earned months ago.
 */
export function RankUpNotice() {
  const { rank } = useHunterRank();
  const [shown, setShown] = useState<Rank>();
  // The tour's sample has its own rank. Announced, it congratulated an empty
  // account on Alex's C-rank; remembered, it hid the user's own next rank-up.
  const touring = useTour().active;

  useEffect(() => {
    if (touring) {
      setShown(undefined);
      return;
    }
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
  }, [rank, touring]);

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
    <div className="system-pop plaque mt-4 flex items-center gap-3 rounded-3xl p-4" role="status">
      <RankCrest rank={shown} className="h-9 w-9" />
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] font-medium text-muted-foreground">New rank</p>
        <p className="font-heading text-[26px] leading-tight">You are {shown}-rank</p>
        <p className="mt-0.5 text-[13px] text-muted-foreground">Your regular workouts earned it.</p>
      </div>
      <Button size="sm" variant="secondary" onClick={close}>
        Close
      </Button>
    </div>
  );
}

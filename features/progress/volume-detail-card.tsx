"use client";

import { percentChange, type ProgressSummary } from "@/lib/progress-metrics";
import { Panel } from "@/features/progress/panel";
import { formatVolume } from "@/lib/utils";

/**
 * Volume is a product, so this card shows its factors rather than the product
 * again. Tonnage up with weight-per-rep flat is *more* work; tonnage flat with
 * weight-per-rep up is *better* work. The total alone cannot tell those apart,
 * which is the whole reason a lifter distrusts a single volume number.
 */
export function VolumeDetailCard({
  summary,
  previous
}: {
  summary: ProgressSummary;
  previous?: ProgressSummary;
}) {
  if (summary.sessions === 0) {
    return null;
  }

  const rows = [
    {
      label: "Weight lifted / week",
      value: formatVolume(summary.volumePerWeek),
      unit: "kg",
      change: previous ? percentChange(summary.volumePerWeek, previous.volumePerWeek) : undefined
    },
    {
      label: "Weight per session",
      value: formatVolume(summary.sessionVolume),
      unit: "kg",
      change: previous ? percentChange(summary.sessionVolume, previous.sessionVolume) : undefined
    },
    {
      label: "Average weight per rep",
      value: summary.weightPerRep.toFixed(1),
      unit: "kg",
      change: previous ? percentChange(summary.weightPerRep, previous.weightPerRep) : undefined
    },
    {
      label: "Reps per set",
      value: summary.repsPerSet.toFixed(1),
      change: previous ? percentChange(summary.repsPerSet, previous.repsPerSet) : undefined
    },
    {
      label: "Sets per session",
      value: summary.setsPerSession.toFixed(1),
      change: previous ? percentChange(summary.setsPerSession, previous.setsPerSession) : undefined
    }
  ];

  return (
    <Panel
      title="What made the total"
      caption={readOf(summary, previous)}
      note={
        <>
          Total weight lifted = weight × reps × sets. (A rep is one repetition.) This card splits the total into those parts.
          If the total goes up but the weight per rep stays the same, you did <em>more</em> work.
          If the weight per rep goes up, you got <em>stronger</em>. The total alone cannot show the
          difference.
        </>
      }
    >
      <div className="grid grid-cols-2 gap-2">
        {rows.map((row) => (
          <div key={row.label} className="well rounded-lg p-3">
            <p className="text-xs font-semibold text-muted-foreground">
              {row.label}
            </p>
            <p className="mt-1.5 text-lg font-semibold leading-none">
              {row.value}
              {row.unit ? (
                <span className="ml-1 text-xs font-medium text-muted-foreground">{row.unit}</span>
              ) : null}
            </p>
            {row.change === undefined ? null : (
              <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                {row.change >= 0 ? "+" : ""}
                {row.change.toFixed(0)}% vs before
              </p>
            )}
          </div>
        ))}
      </div>
    </Panel>
  );
}

/** One sentence naming which factor actually moved — the thing a grid of five numbers hides. */
function readOf(summary: ProgressSummary, previous?: ProgressSummary) {
  if (!previous || previous.sessions === 0) {
    return "The parts of your total: how heavy, how many reps, and how many sets.";
  }

  const load = percentChange(summary.weightPerRep, previous.weightPerRep) ?? 0;
  const work = percentChange(summary.sets, previous.sets) ?? 0;

  if (Math.abs(load) < 2 && Math.abs(work) < 2) {
    return "Weight and sets stayed about the same as the period before.";
  }

  if (load >= 2 && work >= 2) {
    return "Heavier weights and more sets. Strong progress — make sure you rest enough.";
  }

  if (load >= 2) {
    return "You lifted heavier with the same number of sets. You are getting stronger.";
  }

  if (work >= 2) {
    return "You did more sets at a similar weight. More work, not heavier work.";
  }

  return "Both weight and sets went down. Fine for an easy week; if not planned, get back on track.";
}

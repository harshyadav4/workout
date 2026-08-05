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
      label: "Tonnage / week",
      value: formatVolume(summary.volumePerWeek),
      unit: "kg",
      change: previous ? percentChange(summary.volumePerWeek, previous.volumePerWeek) : undefined
    },
    {
      label: "Per session",
      value: formatVolume(summary.sessionVolume),
      unit: "kg",
      change: previous ? percentChange(summary.sessionVolume, previous.sessionVolume) : undefined
    },
    {
      label: "Load / rep",
      value: summary.weightPerRep.toFixed(1),
      unit: "kg",
      change: previous ? percentChange(summary.weightPerRep, previous.weightPerRep) : undefined
    },
    {
      label: "Reps / set",
      value: summary.repsPerSet.toFixed(1),
      change: previous ? percentChange(summary.repsPerSet, previous.repsPerSet) : undefined
    },
    {
      label: "Sets / session",
      value: summary.setsPerSession.toFixed(1),
      change: previous ? percentChange(summary.setsPerSession, previous.setsPerSession) : undefined
    }
  ];

  return (
    <Panel
      title="Under the tonnage"
      caption={readOf(summary, previous)}
      note={
        <>
          Volume is a product, so these are its factors rather than the product again. Tonnage up
          with load-per-rep flat is <em>more</em> work; tonnage flat with load-per-rep up is{" "}
          <em>better</em> work. A single volume number cannot tell those apart, which is the whole
          reason a lifter distrusts one.
        </>
      }
    >
      <div className="grid grid-cols-2 gap-2">
        {rows.map((row) => (
          <div key={row.label} className="rounded-2xl bg-secondary/40 p-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              {row.label}
            </p>
            <p className="mt-1.5 text-lg font-semibold leading-none">
              {row.value}
              {row.unit ? (
                <span className="ml-1 text-xs font-medium text-muted-foreground">{row.unit}</span>
              ) : null}
            </p>
            {row.change === undefined ? null : (
              <p className="mt-1 font-mono text-[11px] tabular-nums text-muted-foreground">
                {row.change >= 0 ? "+" : ""}
                {row.change.toFixed(0)}% vs previous
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
    return "The factors behind the total: how much you lifted, how heavy, and how often.";
  }

  const load = percentChange(summary.weightPerRep, previous.weightPerRep) ?? 0;
  const work = percentChange(summary.sets, previous.sets) ?? 0;

  if (Math.abs(load) < 2 && Math.abs(work) < 2) {
    return "Load and set count both held steady — this block repeated the last one.";
  }

  if (load >= 2 && work >= 2) {
    return "Heavier and more of it. Watch recovery before adding a third variable.";
  }

  if (load >= 2) {
    return "The bar got heavier while set count held — progression came from load.";
  }

  if (work >= 2) {
    return "More sets at a similar load — progression came from volume, not intensity.";
  }

  return "Both load and set count came down. A deload, or a block that got away from you.";
}

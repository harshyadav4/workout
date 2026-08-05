"use client";

import { useState } from "react";

import { CHART, EmptyChart } from "@/features/progress/chart-theme";
import type { MuscleVolume } from "@/lib/progress-metrics";
import type { MuscleId } from "@/lib/types";
import { cn, formatVolume } from "@/lib/utils";
import { Panel } from "@/features/progress/panel";

const PAGE = 10;

/**
 * Every muscle you own, ordered by how much of the volume reached it.
 *
 * The ranked list replaced a radar and a most/least pair: all three answered
 * "where does the focus go", and only this one does it at the resolution the
 * taxonomy actually has. Rows select, so the ranking is also a way in.
 */
export function MuscleRankCard({
  muscleVolume,
  selectedMuscleId,
  onSelectMuscle
}: {
  muscleVolume: MuscleVolume[];
  selectedMuscleId?: MuscleId;
  onSelectMuscle: (muscleId: MuscleId) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const worked = muscleVolume.filter((muscle) => muscle.volume > 0);
  const peak = muscleVolume[0]?.share ?? 0;
  const selectedRank = muscleVolume.findIndex((muscle) => muscle.muscleId === selectedMuscleId);

  // Always keep the selection on screen, even when it ranks below the fold.
  const visible = expanded ? muscleVolume : muscleVolume.slice(0, PAGE);
  const shown =
    selectedRank >= PAGE && !expanded ? [...visible, muscleVolume[selectedRank]] : visible;

  return (
    <Panel
      title="The focus order"
      caption={`${worked.length} of ${muscleVolume.length} muscles saw work in this range`}
      note={
        <>
          Share of the range&apos;s volume that reached each muscle, every lift weighted by how hard
          it works it. This replaced a radar and a most/least pair — all three answered &ldquo;where
          does the focus go&rdquo;, and only this one does it at the resolution the taxonomy actually
          has. Rows select, so the ranking is also a way in.
        </>
      }
    >
      {worked.length === 0 ? (
          <EmptyChart>Nothing logged in this range.</EmptyChart>
        ) : (
          <>
            <ol className="space-y-2">
              {shown.map((muscle) => {
                const rank = muscleVolume.indexOf(muscle) + 1;
                const selected = muscle.muscleId === selectedMuscleId;

                return (
                  <li key={muscle.muscleId}>
                    <button
                      type="button"
                      aria-pressed={selected}
                      onClick={() => onSelectMuscle(muscle.muscleId)}
                      className={cn(
                        "flex min-h-[44px] w-full items-center gap-2.5 rounded-xl px-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        selected ? "bg-primary/15" : "hover:bg-white/[0.03]"
                      )}
                    >
                      <span className="w-5 shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
                        {rank}
                      </span>
                      <span
                        className={cn(
                          "w-24 shrink-0 truncate text-sm",
                          selected ? "font-semibold" : ""
                        )}
                      >
                        {muscle.name}
                      </span>
                      <span className="h-1.5 flex-1 rounded-full bg-white/5">
                        <span
                          className="block h-full rounded-full"
                          style={{
                            width: `${peak > 0 ? Math.max((muscle.share / peak) * 100, muscle.share > 0 ? 3 : 0) : 0}%`,
                            backgroundColor: selected ? CHART.accent : CHART.quiet
                          }}
                        />
                      </span>
                      <span className="w-11 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
                        {muscle.share.toFixed(1)}%
                      </span>
                      <span className="hidden w-14 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground xs:block">
                        {formatVolume(muscle.volume)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>

            <button
              type="button"
              onClick={() => setExpanded((current) => !current)}
              className="mt-3 min-h-[44px] w-full rounded-xl bg-white/[0.03] text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {expanded ? "Show the top 10" : `Show all ${muscleVolume.length} muscles`}
            </button>
          </>
        )}
    </Panel>
  );
}

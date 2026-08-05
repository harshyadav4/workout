"use client";

import { useState } from "react";

import { CHART, EmptyChart } from "@/features/progress/chart-theme";
import { TopSetChart } from "@/features/progress/strength-cards";
import {
  DIRECT_ENGAGEMENT,
  buildExerciseTotals,
  buildStrengthGrowth,
  buildTopSetSeries,
  muscleEngagement
} from "@/lib/progress-metrics";
import type { MuscleId, WorkoutLog } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Panel } from "@/features/progress/panel";

/**
 * Strength for a muscle, kept per lift — never averaged across them.
 *
 * A single "lats strength" line would plot the heaviest set of whatever lift you
 * happened to do that day: 200 kg on deadlift days, 60 kg on pulldown days, a
 * sawtooth that says nothing about the muscle. Top sets are only comparable
 * inside one lift, so the row is the unit and the line opens per row.
 */
export function MuscleLiftsCard({
  name,
  muscleId,
  logs
}: {
  name: string;
  muscleId: MuscleId;
  logs: WorkoutLog[];
}) {
  const [openId, setOpenId] = useState<string>();

  const growth = new Map(buildStrengthGrowth(logs).map((item) => [item.workoutId, item]));
  const engagement = new Map<string, number>();
  logs.forEach((log) => {
    engagement.set(
      log.workoutId,
      Math.max(engagement.get(log.workoutId) ?? 0, muscleEngagement(log, muscleId))
    );
  });

  const rows = buildExerciseTotals(logs);

  return (
    <Panel
      title={`The lifts that build ${name}`}
      caption="Heaviest first — tap one for its top set over time"
      note={
        <>
          A single &ldquo;{name} strength&rdquo; line would plot the heaviest set of whatever lift
          you happened to do that day: 200 kg on deadlift days, 60 kg on pulldown days, a sawtooth
          that says nothing about the muscle. Top sets only compare inside one lift, so the row is
          the unit and the line opens per row. Lifts are tagged direct at 50+ engagement, indirect
          below it.
        </>
      }
    >
      <div className="space-y-1.5">
        {rows.length === 0 ? (
          <EmptyChart>No lift in this range worked {name}.</EmptyChart>
        ) : null}

        {rows.map((row) => {
          const trend = growth.get(row.workoutId);
          const open = openId === row.workoutId;
          const direct = (engagement.get(row.workoutId) ?? 0) >= DIRECT_ENGAGEMENT;
          const gained = (trend?.changePercent ?? 0) >= 0;

          return (
            <div key={row.workoutId} className="rounded-2xl bg-secondary/40">
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpenId(open ? undefined : row.workoutId)}
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="truncate text-sm font-medium">{row.name}</span>
                    <span
                      className={cn(
                        "shrink-0 font-mono text-[9px] uppercase tracking-[0.12em]",
                        direct ? "text-foreground/70" : "text-muted-foreground"
                      )}
                    >
                      {direct ? "direct" : "indirect"}
                    </span>
                  </span>
                  <span className="mt-0.5 block font-mono text-[11px] tabular-nums text-muted-foreground">
                    {trend
                      ? `${trend.first} → ${trend.last} kg · ${row.sessions} sessions`
                      : `${row.topSet} kg top set · ${row.sessions} session${row.sessions === 1 ? "" : "s"}`}
                  </span>
                </span>

                <span
                  className="shrink-0 font-mono text-xs tabular-nums"
                  style={{ color: trend ? (gained ? "#3fbf6f" : "#e8785a") : CHART.axis }}
                >
                  {trend ? `${gained ? "+" : ""}${trend.changePercent.toFixed(0)}%` : "—"}
                </span>
              </button>

              {open ? (
                <div className="px-2 pb-2">
                  <TopSetChart points={buildTopSetSeries(logs, row.workoutId)} />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

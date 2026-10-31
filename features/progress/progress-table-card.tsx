"use client";

import { useState } from "react";

import { EmptyChart } from "@/features/progress/chart-theme";
import { buildTableRows, formatDayKey, weekStartKey } from "@/lib/progress-metrics";
import type { WorkoutLog } from "@/lib/types";
import { formatVolume } from "@/lib/utils";
import { Segmented } from "@/components/ui/segmented";
import { Panel } from "@/features/progress/panel";

const PAGE = 12;

/** "14 sets · 140 reps · top 90": a run has no reps and no load, so it does not list them. */
function rowFacts(sets: number, reps: number, topSet: number) {
  return [
    `${sets} ${sets === 1 ? "set" : "sets"}`,
    reps > 0 ? `${reps} reps` : null,
    topSet > 0 ? `top ${topSet}` : null
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Every chart above, as rows.
 *
 * This is the table-view twin: no number on this page is reachable only by
 * hovering a chart, which is also the only way the charts work for a keyboard
 * or a screen reader. Once the shapes have said where to look, this is the view
 * you actually read.
 */
export function ProgressTableCard({ logs }: { logs: WorkoutLog[] }) {
  const [grain, setGrain] = useState<"session" | "week">("session");
  const [expanded, setExpanded] = useState(false);
  const [openKey, setOpenKey] = useState<string>();

  const rows = buildTableRows(logs, grain);
  const shown = expanded ? rows : rows.slice(0, PAGE);

  return (
    <Panel
      title="Every workout"
      caption="Newest first · tap a row to open it"
      action={
        <Segmented
          quiet
          size="sm"
          aria-label="Row grouping"
          className="w-[132px] shrink-0"
          options={[
            { id: "session" as const, label: "Day" },
            { id: "week" as const, label: "Week" }
          ]}
          value={grain}
          onChange={setGrain}
        />
      }
    >
      {rows.length === 0 ? (
          <EmptyChart>Nothing logged in this range.</EmptyChart>
        ) : (
          <>
            <ul className="rows">
              {shown.map((row) => {
                const open = openKey === row.key;

                return (
                  <li key={row.key} className="py-2.5 first:pt-0">
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => setOpenKey(open ? undefined : row.key)}
                      className="flex w-full items-start gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-medium">
                          {grain === "week" ? "Week of " : ""}
                          {formatDayKey(row.key)}
                        </span>
                        <span className="block truncate text-[13px] text-muted-foreground">{row.detail}</span>
                      </span>
                      <span className="shrink-0 text-right tabular-nums">
                        <span className="block text-[15px]">{row.volume > 0 ? `${formatVolume(row.volume)} kg` : "—"}</span>
                        <span className="block text-[12.5px] text-muted-foreground">
                          {rowFacts(row.sets, row.reps, row.topSet)}
                        </span>
                      </span>
                    </button>

                    {open ? <SessionDetail logs={logs} grain={grain} rowKey={row.key} /> : null}
                  </li>
                );
              })}
            </ul>

            {rows.length > PAGE ? (
              <button
                type="button"
                onClick={() => setExpanded((current) => !current)}
                className="mt-3 min-h-[44px] w-full rounded-full text-[13.5px] font-medium text-muted-foreground transition-colors hover:text-foreground active:bg-hi focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {expanded ? "Show fewer" : `Show all ${rows.length} rows`}
              </button>
            ) : null}
          </>
        )}
    </Panel>
  );
}

/**
 * The session behind a row: every lift, as logged. This is "pull up any workout
 * I did" — the rows are already in date order, so the list is the picker and a
 * separate session browser would be a second source of truth for the same logs.
 */
function SessionDetail({
  logs,
  grain,
  rowKey
}: {
  logs: WorkoutLog[];
  grain: "session" | "week";
  rowKey: string;
}) {
  const entries = logs
    .filter((log) => (grain === "week" ? weekStartKey(log.date) === rowKey : log.date === rowKey))
    .sort((a, b) => b.date.localeCompare(a.date) || b.totalVolume - a.totalVolume);

  return (
    <div className="pt-2">
      <ul className="space-y-1.5">
        {entries.map((log, index) => (
          <li key={log.id ?? `${log.date}-${log.workoutId}-${index}`} className="flex items-baseline gap-3">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{log.name}</span>
              <span className="block text-xs tabular-nums text-muted-foreground">
                {grain === "week" ? `${formatDayKey(log.date)} · ` : ""}
                {log.totalSets ?? 0} {log.totalSets === 1 ? "set" : "sets"} · {log.totalReps ?? 0} reps
                {log.peakWeight ? ` · heaviest ${log.peakWeight} kg` : ""}
              </span>
            </span>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {formatVolume(log.totalVolume)} kg
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

"use client";

import { Fragment, useState } from "react";

import { EmptyChart } from "@/features/progress/chart-theme";
import { buildTableRows, formatDayKey, weekStartKey } from "@/lib/progress-metrics";
import type { WorkoutLog } from "@/lib/types";
import { cn, formatVolume } from "@/lib/utils";
import { Panel } from "@/features/progress/panel";

const PAGE = 12;

const COLUMNS = 5;

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
      title="The numbers"
      caption="Newest first — tap a row to open that session"
      note={
        <>
          Every figure the charts above draw, as rows. This is the table-view twin: nothing on this
          page is reachable only by hovering a chart, which is also the only way the charts work for
          a keyboard or a screen reader. Once the shapes have said where to look, this is the view
          you actually read.
        </>
      }
      action={
        <div
          role="group"
          aria-label="Row grouping"
          className="mt-1 flex shrink-0 gap-1 rounded-full bg-secondary/50 p-1"
        >
          {(["session", "week"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={grain === option}
              onClick={() => setGrain(option)}
              className={cn(
                "min-h-[36px] rounded-full px-3 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                grain === option ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              )}
            >
              {option === "session" ? "Day" : "Week"}
            </button>
          ))}
        </div>
      }
    >
      {rows.length === 0 ? (
          <EmptyChart>Nothing logged in this range.</EmptyChart>
        ) : (
          <>
            <div className="-mx-1 overflow-x-auto px-1 [mask-image:linear-gradient(to_right,black_calc(100%-14px),transparent)]">
              <table className="w-full min-w-[26rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-white/5 text-left font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    <th scope="col" className="pb-2 pr-3 font-normal">
                      {grain === "week" ? "Week" : "Day"}
                    </th>
                    <th scope="col" className="pb-2 pr-3 text-right font-normal">
                      Sets
                    </th>
                    <th scope="col" className="pb-2 pr-3 text-right font-normal">
                      Reps
                    </th>
                    <th scope="col" className="pb-2 pr-3 text-right font-normal">
                      Volume
                    </th>
                    <th scope="col" className="pb-2 text-right font-normal">
                      Top set
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((row) => {
                    const open = openKey === row.key;

                    return (
                      <Fragment key={row.key}>
                        <tr
                          onClick={() => setOpenKey(open ? undefined : row.key)}
                          className={cn(
                            "cursor-pointer border-b border-white/5 transition-colors",
                            open ? "bg-white/[0.03]" : "hover:bg-white/[0.02]"
                          )}
                        >
                          <th scope="row" className="py-2.5 pr-3 text-left font-normal">
                            <button
                              type="button"
                              aria-expanded={open}
                              className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              <span className="block font-medium">
                                {grain === "week" ? "w/c " : ""}
                                {formatDayKey(row.key)}
                              </span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {row.detail}
                              </span>
                            </button>
                          </th>
                          <td className="py-2.5 pr-3 text-right font-mono tabular-nums">
                            {row.sets}
                          </td>
                          <td className="py-2.5 pr-3 text-right font-mono tabular-nums">
                            {row.reps}
                          </td>
                          <td className="py-2.5 pr-3 text-right font-mono tabular-nums">
                            {formatVolume(row.volume)}
                          </td>
                          <td className="py-2.5 text-right font-mono tabular-nums">
                            {row.topSet ? `${row.topSet}` : "—"}
                          </td>
                        </tr>

                        {open ? (
                          <tr className="border-b border-white/5">
                            <td colSpan={COLUMNS} className="px-0 pb-3">
                              <SessionDetail logs={logs} grain={grain} rowKey={row.key} />
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {rows.length > PAGE ? (
              <button
                type="button"
                onClick={() => setExpanded((current) => !current)}
                className="mt-3 min-h-[44px] w-full rounded-xl bg-white/[0.03] text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
    <div className="rounded-2xl bg-secondary/40 p-3">
      <ul className="space-y-1.5">
        {entries.map((log, index) => (
          <li key={log.id ?? `${log.date}-${log.workoutId}-${index}`} className="flex items-baseline gap-3">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{log.name}</span>
              <span className="block font-mono text-[11px] tabular-nums text-muted-foreground">
                {grain === "week" ? `${formatDayKey(log.date)} · ` : ""}
                {log.totalSets ?? 0} × {log.totalReps ?? 0} reps
                {log.peakWeight ? ` · top ${log.peakWeight} kg` : ""}
              </span>
            </span>
            <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
              {formatVolume(log.totalVolume)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

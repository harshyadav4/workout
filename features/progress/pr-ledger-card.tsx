"use client";

import { useState } from "react";

import { CHART, EmptyChart } from "@/features/progress/chart-theme";
import { Panel } from "@/features/progress/panel";
import { formatDayKey } from "@/lib/progress-metrics";
import type { PREntry } from "@/lib/progress-trends";

const PAGE = 8;

/**
 * Every day a lift beat itself, newest first.
 *
 * A list rather than a timeline: forty dots on an axis would be less readable
 * than forty rows, and the rows are their own table view.
 *
 * The number that earns the card is the gap at the top. "No lift has set a
 * record in five weeks" is the most actionable line on this page, and nothing
 * else here can say it — `StrengthGrowthCard` compares first to latest and a
 * long plateau looks identical to steady progress in that shape.
 *
 * All-time by construction, which is why it takes unscoped logs. Narrowed to a
 * window, "record" would quietly mean "heaviest since the range started".
 */
export function PRLedgerCard({ entries, days }: { entries: PREntry[]; days?: number }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? entries : entries.slice(0, PAGE);

  return (
    <Panel
      title="Records"
      caption={
        days === undefined
          ? "No records yet"
          : days === 0
            ? "New record today"
            : `${days} days since the last record`
      }
      note={
        <>
          A record is your heaviest weight ever on an exercise. The first time you do an exercise
          is a start point, not a record. This list ignores the range.
        </>
      }
    >
      {entries.length === 0 ? (
        <EmptyChart>Lift more than last time on an exercise to set one.</EmptyChart>
      ) : (
        <>
          <ol className="rows">
            {shown.map((entry) => (
              <li
                key={`${entry.date}-${entry.workoutId}`}
                className="flex items-baseline gap-3 py-2"
              >
                <span className="w-14 shrink-0 text-xs tabular-nums text-muted-foreground">
                  {formatDayKey(entry.date)}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">{entry.name}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {entry.from} →{" "}
                  <span className="font-semibold" style={{ color: CHART.accent }}>
                    {entry.to} kg
                  </span>
                </span>
              </li>
            ))}
          </ol>

          {entries.length > PAGE ? (
            <button
              type="button"
              onClick={() => setExpanded((current) => !current)}
              className="mt-2 min-h-[44px] w-full rounded-full text-[13.5px] font-medium text-muted-foreground transition-colors hover:text-foreground active:bg-hi focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {expanded ? "Show fewer" : `All ${entries.length} records`}
            </button>
          ) : null}
        </>
      )}
    </Panel>
  );
}

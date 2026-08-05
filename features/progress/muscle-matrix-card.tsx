"use client";

import { useState } from "react";

import { HEAT, REST_CELL } from "@/features/progress/chart-theme";
import { Panel } from "@/features/progress/panel";
import { formatColumnKey, type MuscleMatrix } from "@/lib/progress-trends";
import type { MuscleId } from "@/lib/types";
import { cn } from "@/lib/utils";

const PAGE = 12;

/**
 * Thirty muscles down, time across.
 *
 * The chart a year of logs unlocks and twelve weeks cannot, because the finding
 * is **drift**: a row that ran hot until March and has been blank since. Nothing
 * else on this page can say that — the focus order collapses the whole range
 * into one bar per muscle, so a muscle you dropped in spring and a muscle you
 * train fortnightly look identical in it.
 *
 * Cells shade by share of their own column, not raw volume, so a light month and
 * a heavy month are read on the same scale and the colour always means "how much
 * of that month's work went here".
 *
 * Untouched rows are kept. An empty row is the finding, and filtering it out
 * would delete exactly the muscles this card exists to surface.
 *
 * ponytail: CSS grid. This is a 30×12 table of coloured squares — the same
 * construction the year spine already uses, and no charting library draws it
 * better than `grid-template-columns`.
 */
export function MuscleMatrixCard({
  matrix,
  selectedMuscleId,
  onSelectMuscle
}: {
  matrix: MuscleMatrix;
  selectedMuscleId?: MuscleId;
  onSelectMuscle: (muscleId: MuscleId) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const worked = matrix.rows.filter((row) => row.total > 0);
  const neglected = matrix.rows.filter((row) => row.total === 0);
  const rows = expanded ? matrix.rows : matrix.rows.slice(0, PAGE);

  return (
    <Panel
      title={matrix.bucket === "month" ? "Muscle × month" : "Muscle × week"}
      caption={
        neglected.length > 0
          ? `${neglected.length} muscles saw no work at all in this range`
          : "Every muscle saw work in this range"
      }
      note={
        <>
          One row per muscle, one column per {matrix.bucket}. A cell is shaded by how much of that{" "}
          {matrix.bucket}&apos;s volume reached the muscle — so a light month and a heavy month are
          read on the same scale, and the colour always means share rather than tonnage. Rows you
          never trained stay in the list on purpose: a blank row is the thing worth seeing. Tap any
          row to open that muscle above.
        </>
      }
    >
      <div className="-mx-1 overflow-x-auto px-1 [mask-image:linear-gradient(to_right,black_calc(100%-14px),transparent)]">
        <div className="w-max">
          <div className="mb-1 flex gap-[3px]">
            {/* A spacer, not padding: the label column sits inside the same
                gapped flex row, so padding put every header 3px off. */}
            <span className="w-[84px] shrink-0" aria-hidden />
            {matrix.columns.map((column) => (
              <span
                key={column}
                className={cn(
                  "shrink-0 text-center font-mono text-[10px] uppercase text-muted-foreground",
                  matrix.bucket === "month" ? "w-[24px]" : "w-[15px]"
                )}
              >
                {formatColumnKey(column, matrix.bucket)}
              </span>
            ))}
          </div>

          {rows.map((row) => {
            const selected = row.muscleId === selectedMuscleId;

            return (
              <button
                key={row.muscleId}
                type="button"
                aria-pressed={selected}
                onClick={() => onSelectMuscle(row.muscleId)}
                className={cn(
                  "flex w-full min-h-[26px] items-center gap-[3px] rounded-md pr-1 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected ? "bg-primary/15" : "hover:bg-white/[0.03]"
                )}
              >
                <span
                  className={cn(
                    "w-[84px] shrink-0 truncate pr-2 text-[11px]",
                    selected ? "font-semibold" : "text-muted-foreground"
                  )}
                >
                  {row.name}
                </span>
                {row.cells.map((cell) => (
                  <span
                    key={cell.key}
                    className={cn(
                      "h-[15px] shrink-0 rounded-[3px]",
                      matrix.bucket === "month" ? "w-[24px]" : "w-[15px]"
                    )}
                    style={{
                      backgroundColor:
                        cell.level > 0 ? HEAT[Math.min(cell.level, HEAT.length) - 1] : REST_CELL
                    }}
                    title={`${row.name} · ${formatColumnKey(cell.key, matrix.bucket)} · ${cell.share.toFixed(1)}% of that ${matrix.bucket}`}
                  />
                ))}
              </button>
            );
          })}
        </div>
      </div>

      {matrix.rows.length > PAGE ? (
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="mt-2 min-h-[44px] w-full rounded-xl bg-white/[0.03] text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {expanded
            ? `Show the top ${PAGE}`
            : `All ${matrix.rows.length} muscles · ${worked.length} trained`}
        </button>
      ) : null}
    </Panel>
  );
}

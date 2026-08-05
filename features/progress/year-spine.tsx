"use client";

import { useState } from "react";

import { HEAT, REST_CELL } from "@/features/progress/chart-theme";
import {
  formatDayKey,
  formatMonthKey,
  type CalendarWeek,
  type ProgressRange
} from "@/lib/progress-metrics";
import type { Streaks } from "@/lib/progress-trends";
import { formatVolume } from "@/lib/utils";

const CELL = "h-[13px] w-[13px] rounded-[3px]";

function cellColor(level: number) {
  return level > 0 ? HEAT[Math.min(level, HEAT.length) - 1] : REST_CELL;
}

/** The spine draws `view.calendar`, which is scoped — so the heading says so. */
const SPINE_LABELS: Record<ProgressRange, string> = {
  "4w": "Four weeks",
  "12w": "Twelve weeks",
  "1y": "The year",
  all: "All time",
  custom: "Picked dates"
};

/**
 * The signature, promoted.
 *
 * It was the ninth card down, 11px cells, scrolling sideways inside a rounded
 * box — the one view on the page that shows every day at once, packaged like the
 * twelfth-most-important thing on it. Now it breaks the container: no card, no
 * border, edge to edge, at the top of the page where the year is the first thing
 * you see.
 *
 * The readout is the other repair. Every cell's value used to live in a `title`
 * attribute, which is a hover affordance — on the phone this page is built for,
 * there is no hover, so not one of the 365 cells could be read. Tapping the grid
 * now names the day above it. `title` stays for pointer devices.
 */
export function YearSpine({
  weeks,
  streaks,
  range
}: {
  weeks: CalendarWeek[];
  streaks: Streaks;
  range: ProgressRange;
}) {
  const [picked, setPicked] = useState<{ date: string; volume: number }>();

  const percent = Math.round((streaks.trainedDays / Math.max(streaks.totalDays, 1)) * 100);

  return (
    <section className="-mx-4">
      <div className="flex items-baseline justify-between gap-3 px-4">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
          {SPINE_LABELS[range]}
        </h2>
        {/* The readout replaces a hover tooltip that a touch device can never
            reach. It holds the last tap rather than clearing on release, so the
            number survives your finger leaving the screen. */}
        <p className="truncate font-mono text-[11px] tabular-nums text-muted-foreground">
          {picked
            ? picked.volume > 0
              ? `${formatDayKey(picked.date)} · ${formatVolume(picked.volume)} kg`
              : `${formatDayKey(picked.date)} · rest`
            : `${streaks.trainedDays} of ${streaks.totalDays} days · ${percent}%`}
        </p>
      </div>

      {/* ponytail: one delegated click for 365 cells. A button per cell would be
          365 focus stops to tab through before reaching the rest of the page. */}
      <div
        className="mt-2 overflow-x-auto px-4 [mask-image:linear-gradient(to_right,transparent,black_16px,black_calc(100%-16px),transparent)]"
        onClick={(event) => {
          const cell = (event.target as HTMLElement).closest<HTMLElement>("[data-date]");
          if (cell?.dataset.date) {
            setPicked({ date: cell.dataset.date, volume: Number(cell.dataset.volume ?? 0) });
          }
        }}
      >
        <div className="w-max pb-1">
          <div className="mb-1 flex gap-[3px]">
            {weeks.map((week, index) => {
              const month = formatMonthKey(week.start);
              const isNew = index === 0 || month !== formatMonthKey(weeks[index - 1].start);
              return (
                <div
                  key={`month-${week.start}`}
                  className="w-[13px] overflow-visible whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground"
                >
                  {isNew ? month : ""}
                </div>
              );
            })}
          </div>

          <div
            className="flex gap-[3px]"
            role="img"
            aria-label={`Training calendar: ${streaks.trainedDays} sessions across ${streaks.totalDays} days. Every value is also in the table at the foot of this page.`}
          >
            {weeks.map((week) => (
              <div key={week.start} className="flex flex-col gap-[3px]">
                {week.days.map((day, index) =>
                  day ? (
                    <div
                      key={day.date}
                      data-date={day.date}
                      data-volume={day.volume}
                      className={`${CELL} cursor-pointer`}
                      style={{ backgroundColor: cellColor(day.level) }}
                      title={
                        day.volume > 0
                          ? `${day.date} · ${formatVolume(day.volume)} kg`
                          : `${day.date} · rest`
                      }
                    />
                  ) : (
                    <div key={`${week.start}-${index}`} className={CELL} />
                  )
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2 px-4">
        <Streak label="On a streak" value={`${streaks.currentWeeks}w`} />
        <Streak label="Best run" value={`${streaks.longestWeeks}w`} />
        <Streak label="Showed up" value={`${percent}%`} />
      </div>
    </section>
  );
}

/** Weeks, not days — see `buildStreaks`. A day streak rewards never resting. */
function Streak({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/[0.03] px-3 py-2">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-mono text-base font-semibold tabular-nums leading-none">{value}</p>
    </div>
  );
}

"use client";

import { CHART } from "@/features/progress/chart-theme";

/**
 * One measure, one target range, one line.
 *
 * Replaces two different shapes that were answering the same question on the
 * same scale: a horizontal bar with a `ReferenceArea` for the six groups, and a
 * 180px radial gauge for the one selected muscle. Both plotted "hard sets a week
 * against 10–20", and having them look nothing alike meant the drill-down number
 * and the group number never read as the same measurement.
 *
 * A gauge for a single number is mostly circle. Bullets stack, so six of them
 * cost less vertical space than the one dial did and can be compared down the
 * column, which is the reading that matters.
 *
 * State is named in text as well as coloured — "under", "in band", "over" — so
 * the band is never carried by hue alone.
 */
export function Bullet({
  label,
  value,
  band,
  ceiling,
  unit = ""
}: {
  label: string;
  value: number;
  band: { low: number; high: number };
  ceiling: number;
  unit?: string;
}) {
  const max = Math.max(ceiling, band.high, value) || 1;
  const pct = (input: number) => `${Math.min((input / max) * 100, 100)}%`;
  const inBand = value >= band.low && value <= band.high;
  const state = value < band.low ? "under" : value > band.high ? "over" : "in band";

  return (
    <div className="py-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-xs">{label}</span>
        <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
          {value.toFixed(1)}
          {unit} · {state}
        </span>
      </div>

      <div
        className="relative mt-1.5 h-2.5 rounded-full bg-white/[0.04]"
        role="img"
        aria-label={`${label}: ${value.toFixed(1)}${unit}, ${state} of the ${band.low} to ${band.high} range`}
      >
        {/* The target range sits behind the measure, the way a bullet chart's
            qualitative band does — context first, value on top of it. */}
        <span
          className="absolute inset-y-0 rounded-full bg-white/[0.07]"
          style={{ left: pct(band.low), width: pct(band.high - band.low) }}
          aria-hidden
        />
        <span
          className="absolute inset-y-0.5 left-0 rounded-full"
          style={{
            width: pct(value),
            backgroundColor: inBand ? CHART.accent : CHART.quiet
          }}
          aria-hidden
        />
      </div>
    </div>
  );
}

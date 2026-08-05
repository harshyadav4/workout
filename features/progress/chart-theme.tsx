"use client";

import type { TooltipContentProps } from "recharts";

/**
 * Chart colours, validated with the dataviz palette validator against the glass
 * card surface `#0d1420` in dark mode — lightness band, chroma floor, adjacent
 * CVD separation, normal-vision floor and contrast all pass.
 *
 * They are close cousins of `--primary` and `--accent` rather than the tokens
 * themselves: the raw tokens are tuned for large UI surfaces and sit above the
 * band a mark needs. Next to each other on screen they read as the same family.
 */
export const CHART = {
  series: ["#e8642a", "#12a2b8", "#7b6ae0", "#2aa25e"],
  accent: "#e8642a",
  /**
   * Context marks — the ones the reader is meant to look past, but still has to
   * be able to see. These carry meaning (a rest day, an unselected muscle, a
   * lift that did not gain), so they are graphical objects at 3.25:1 against the
   * card, not decoration. The old `#44526a` sat at 2.35:1 and vanished.
   */
  quiet: "#566788",
  grid: "rgba(255,255,255,0.06)",
  /** 5.98:1 on the card. Tick labels are 10px text and owe the full 4.5:1. */
  axis: "rgba(226,232,240,0.60)",
  surface: "#0d1420"
} as const;

/**
 * The consistency calendar's ordinal ramp: one hue, quiet → hot.
 *
 * It runs mid-to-bright rather than dark-to-bright, which looks wrong written
 * down and is right on screen: the card is near-black, so a dark first step
 * lands in the surface's own luminance and a light training day becomes
 * indistinguishable from a rest day. The old ramp started at `#743a1b`, which
 * was 1.85:1 against `REST_CELL` — the single most important reading in the
 * chart ("did I show up") was the one you could not make. Step 1 now clears
 * 3.03:1 against the rest cell, and each step clears 1.29:1 against the step
 * below it.
 */
export const HEAT = ["#a95023", "#c86024", "#e37129", "#fb8f45"] as const;
export const REST_CELL = "rgba(255,255,255,0.05)";

/**
 * Every mark on this page draws instantly.
 *
 * recharts animates on mount *and on every data change*, so one tap on a range
 * chip re-animates eight charts at once — motion that carries no information,
 * costs a frame budget, and is unguarded by the `prefers-reduced-motion` rule
 * `globals.css` already applies to everything else. Off is the honest default
 * for a dashboard you re-filter constantly.
 */
export const animationProps = { isAnimationActive: false } as const;

/**
 * Identity for the six muscle groups — the page's only categorical palette.
 *
 * Kept apart from `CHART.series` on purpose. Those three roles are *quantitative*
 * and mean the same thing on every chart: orange is the value you are reading,
 * `series[1]` teal is the baseline it is measured against, `quiet` is context.
 * Letting a group borrow teal would make "baseline" mean "back" on one card and
 * "your four-week average" on the next.
 *
 * A group's colour is a lookup, so the split and the drift chart agree with each
 * other. All six clear 3:1 against the card surface; every chart that uses them
 * also prints the value, so hue is never the only channel.
 */
export const GROUP_COLORS: Record<string, string> = {
  chest: "#e8642a",
  back: "#12a2b8",
  shoulders: "#e0b23c",
  arms: "#7b6ae0",
  core: "#2aa25e",
  legs: "#e0619a"
};

const COMPACT = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

export function formatCompact(value: number) {
  return COMPACT.format(value);
}

export function formatKg(value: number) {
  return `${Math.round(value)} kg`;
}

/** Signed, so a delta always declares its direction. */
export function formatSigned(value: number, digits = 0) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;
}

/** Hairline, solid, one step off the surface — a grid is not data. */
export const gridProps = {
  stroke: CHART.grid,
  vertical: false
} as const;

export const axisProps = {
  axisLine: false,
  tickLine: false,
  tick: { fill: CHART.axis, fontSize: 10, fontFamily: "var(--font-mono)" },
  minTickGap: 24
} as const;

/**
 * One tooltip for every chart on the page.
 *
 * Values lead and labels follow — the reader already knows which series they
 * are pointing at and wants the number. Series identity rides a short stroke of
 * the mark's colour, never coloured text.
 */
export function ChartTooltip({
  active,
  payload,
  label,
  format = formatCompact,
  labelFormat,
  unit
}: Partial<TooltipContentProps<number, string>> & {
  format?: (value: number) => string;
  labelFormat?: (label: string) => string;
  unit?: string;
}) {
  if (!active || !payload?.length) {
    return null;
  }

  const heading = typeof label === "string" && labelFormat ? labelFormat(label) : String(label ?? "");

  return (
    <div className="rounded-2xl border border-white/10 bg-[#111b2a]/95 px-3 py-2 shadow-glow backdrop-blur">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {heading}
      </p>
      {payload.map((entry) => (
        <div key={`${entry.name}`} className="mt-1 flex items-center gap-2">
          <span
            className="h-0.5 w-3 rounded-full"
            style={{ backgroundColor: entry.color ?? CHART.accent }}
            aria-hidden
          />
          <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
            {format(Number(entry.value ?? 0))}
            {unit ? <span className="text-muted-foreground">{unit}</span> : null}
          </span>
          {payload.length > 1 ? (
            <span className="text-xs text-muted-foreground">{entry.name}</span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/** Shown wherever a range holds no logs, in place of an empty axis. */
export function EmptyChart({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-secondary/40 px-4 py-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

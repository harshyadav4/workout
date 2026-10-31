"use client";

import { createContext, useContext } from "react";
import type { TooltipContentProps } from "recharts";

/**
 * Chart colours. `accent` for the value you are reading (a section's own colour,
 * see `SECTION_THEMES`), `series[1]`, a cool blue, for the baseline it is measured
 * against, `quiet` for context. `series` is fixed: it passes the dataviz validator
 * on both surfaces (lightness band, chroma floor, adjacent CVD and contrast).
 */
export const CHART = {
  series: ["#bf6e3e", "#5188cd", "#9d8d26", "#ae6aa8"],
  accent: "rgb(var(--s-strength))",
  /**
   * Context marks — the ones the reader is meant to look past, but still has to
   * be able to see. These carry meaning (a rest day, an unselected muscle, a
   * lift that did not gain), so they are graphical objects at 3.25:1 against the
   * card, not decoration. The old `#44526a` sat at 2.35:1 and vanished.
   */
  quiet: "#566788",
  grid: "var(--chart-grid)",
  /** 5.98:1 on the card. Tick labels are 10px text and owe the full 4.5:1. */
  axis: "var(--chart-axis)",
  surface: "hsl(var(--chart-surface))",
  /** A wash behind the marks: the column under a finger, the picked range, an empty bar. */
  wash: "var(--chart-rest)"
} as const;

export const REST_CELL = "var(--chart-rest)";

/**
 * The ref for a calendar's sideways scroller: the newest days are what you came
 * for, and they sit at the far end. Give the scroller a `key` of its column count,
 * so a longer range lands there too.
 */
export function scrollToNewest(row: HTMLDivElement | null) {
  if (row) {
    row.scrollLeft = row.scrollWidth;
  }
}

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
 * Kept apart from `CHART.series` on purpose, so "baseline" never means "back".
 * A group's colour is a lookup, so a lift, its split and the drift chart agree
 * with each other. The fixed order passes the dataviz validator on both surfaces;
 * every chart that uses them also prints the value or names the row, so hue is
 * never the only channel.
 */
export const GROUP_COLORS: Record<string, string> = {
  chest: "#388cf0",
  back: "#00a29b",
  shoulders: "#b48400",
  arms: "#a56cde",
  core: "#37a643",
  legs: "#d85891"
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
  tick: { fill: CHART.axis, fontSize: 10, fontFamily: "var(--font-sans)" },
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
    <div className="plaque-solid rounded-xl px-3 py-2">
      <p className="text-xs font-semibold text-muted-foreground">
        {heading}
      </p>
      {payload.map((entry) => (
        <div key={`${entry.name}`} className="mt-1 flex items-center gap-2">
          <span
            className="h-0.5 w-3 rounded-full"
            style={{ backgroundColor: entry.color ?? CHART.accent }}
            aria-hidden
          />
          <span className="text-sm font-semibold tabular-nums text-foreground">
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
  return <p className="px-1 py-5 text-center text-sm text-muted-foreground">{children}</p>;
}

/**
 * Each card's own colour, so you always know which one you are inside. The tokens
 * are bare channels (globals.css) because every shade is the one hue at another
 * opacity, and each theme has its own steps: both trios pass the dataviz validator
 * with no WARN, on their own surface.
 *
 * `heat` is a calendar's ordinal ramp, quiet to strong. As opacity it reads the
 * same on both grounds: more training is always more contrast, and step 1 clears
 * the rest cell, because "did I show up" is the most important thing a calendar
 * says.
 */
export type SectionId = "strength" | "consistency" | "body" | "cardio" | "science";

export interface SectionTheme {
  accent: string;
  /** The selected card's fill. */
  tint: string;
  heat: readonly string[];
}

function sectionTheme(token: string): SectionTheme {
  return {
    accent: `rgb(var(${token}))`,
    tint: `rgb(var(${token}) / 0.14)`,
    heat: [0.5, 0.66, 0.83, 1].map((alpha) => `rgb(var(${token}) / ${alpha})`)
  };
}

export const SECTION_THEMES: Record<SectionId, SectionTheme> = {
  strength: sectionTheme("--s-strength"),
  consistency: sectionTheme("--s-consistency"),
  body: sectionTheme("--s-body"),
  cardio: sectionTheme("--s-cardio"),
  science: sectionTheme("--s-science")
};

const SectionContext = createContext<SectionTheme>(SECTION_THEMES.strength);

/** Wraps one section; every chart inside draws in its colour. */
export function SectionColors({ section, children }: { section: SectionId; children: React.ReactNode }) {
  return <SectionContext.Provider value={SECTION_THEMES[section]}>{children}</SectionContext.Provider>;
}

/** The current section's colours. */
export function useSection() {
  return useContext(SectionContext);
}

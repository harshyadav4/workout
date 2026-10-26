"use client";

import { ArrowUpRight, CalendarCheck, ChevronRight, Dumbbell, Minus, PersonStanding, TriangleAlert } from "lucide-react";

import { CHART } from "@/features/progress/chart-theme";
import type { Ring, RingTone } from "@/lib/progress-scores";
import { cn } from "@/lib/utils";

export type RingId = "strength" | "consistency" | "body";

export const RING_META: { id: RingId; label: string; icon: typeof Dumbbell }[] = [
  { id: "strength", label: "Strength", icon: Dumbbell },
  { id: "consistency", label: "Consistency", icon: CalendarCheck },
  { id: "body", label: "Muscles", icon: PersonStanding }
];

const TONE: Record<RingTone, { color: string; word: string; icon: typeof Minus }> = {
  good: { color: "hsl(var(--success))", word: "Going well", icon: ArrowUpRight },
  steady: { color: CHART.accent, word: "Steady", icon: Minus },
  low: { color: "hsl(var(--warning))", word: "Needs work", icon: TriangleAlert }
};

const SIZE = 84;
const STROKE = 8;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * The three rings: the first thing on Progress, and its navigation.
 *
 * A ring is a button. Tapping one opens its detail below; tapping it again goes
 * back to the summary. Tone is a word and an icon as well as a colour, so the
 * rings read the same to someone who cannot tell green from blue.
 */
export function ScoreRings({
  rings,
  selected,
  onSelect
}: {
  rings: Record<RingId, Ring>;
  selected?: RingId;
  onSelect: (id?: RingId) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2" role="group" aria-label="Progress rings">
      {RING_META.map(({ id, label }) => {
        const ring = rings[id];
        const tone = TONE[ring.tone];
        const ToneIcon = tone.icon;
        const active = selected === id;

        return (
          <button
            key={id}
            type="button"
            aria-pressed={active}
            aria-label={`${label}: ${ring.value}. ${ring.sentence} ${active ? "Tap to go back to the summary." : "Tap for details."}`}
            onClick={() => onSelect(active ? undefined : id)}
            className={cn(
              // Press feedback: the ring gives under your thumb, like a button does.
              "flex min-h-[44px] flex-col items-center rounded-xl px-1 pb-2.5 pt-3 transition-[transform,colors] duration-150 active:scale-[0.96] motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active ? "bg-brand/10 ring-1 ring-brand/40" : "bg-card ring-1 ring-border"
            )}
          >
            <span className="relative block" style={{ width: SIZE, height: SIZE }}>
              <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden>
                <circle
                  cx={SIZE / 2}
                  cy={SIZE / 2}
                  r={RADIUS}
                  fill="none"
                  stroke="hsl(var(--muted))"
                  strokeWidth={STROKE}
                />
                {ring.ready && ring.fill > 0 ? (
                  <circle
                    cx={SIZE / 2}
                    cy={SIZE / 2}
                    r={RADIUS}
                    fill="none"
                    stroke={tone.color}
                    strokeWidth={STROKE}
                    strokeLinecap="round"
                    strokeDasharray={CIRCUMFERENCE}
                    strokeDashoffset={CIRCUMFERENCE * (1 - Math.min(1, ring.fill))}
                    transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
                    className="transition-[stroke-dashoffset] duration-500 motion-reduce:transition-none"
                  />
                ) : null}
              </svg>
              <span className="absolute inset-0 flex items-center justify-center font-display text-base font-extrabold tabular-nums tracking-tight">
                {ring.value}
              </span>
            </span>

            <span className="mt-2 text-sm font-bold">{label}</span>
            <span
              className={cn(
                "mt-0.5 flex items-center gap-1 text-xs",
                ring.ready ? "text-muted-foreground" : "text-muted-foreground/80"
              )}
            >
              {ring.ready ? (
                <>
                  <ToneIcon className="h-3 w-3" style={{ color: tone.color }} aria-hidden />
                  {tone.word}
                </>
              ) : (
                "Not yet"
              )}
            </span>
            {/* The words that say "this opens something" — a ring alone reads as
                a number to look at, not a thing to press. */}
            <span className="mt-1.5 flex items-center text-xs font-semibold text-brand">
              {active ? "Open" : "Details"}
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** What each ring means, in one sentence each — the summary's reading of the rings. */
export function RingNotes({
  rings,
  onSelect
}: {
  rings: Record<RingId, Ring>;
  onSelect: (id: RingId) => void;
}) {
  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-card">
      {RING_META.map(({ id, label, icon: Icon }) => (
        <li key={id}>
          <button
            type="button"
            onClick={() => onSelect(id)}
            className="flex min-h-[44px] w-full items-center gap-3 px-3.5 py-3 text-left transition-colors active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Icon
              className="mt-0.5 h-4 w-4 shrink-0"
              style={{ color: TONE[rings[id].tone].color }}
              aria-hidden
            />
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold text-muted-foreground">{label}</span>
              <span className="mt-0.5 block text-sm leading-snug">{rings[id].sentence}</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );
}

/** The selected ring's sentence, under the tabs, while its detail is open. */
export function RingHeader({ ring }: { ring: Ring }) {
  return <p className="text-sm leading-snug text-muted-foreground">{ring.sentence}</p>;
}

export type ProgressView = "summary" | RingId;

const VIEW_TABS: { id: ProgressView; label: string }[] = [
  { id: "summary", label: "Summary" },
  ...RING_META.map(({ id, label }) => ({ id, label }))
];

/**
 * Named tabs under the rings. The rings open the same views, but a row of
 * tabs is the one control everyone already knows switches what is below —
 * and it shows at a glance that Strength, Consistency and Body each hold more.
 */
export function ViewTabs({
  view,
  onChange
}: {
  view: ProgressView;
  onChange: (view: ProgressView) => void;
}) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 scrollbar-hide">
      <div className="flex w-max gap-1 border-b border-border" role="tablist" aria-label="Progress section">
        {VIEW_TABS.map((tab) => {
          const active = view === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(tab.id)}
              className={cn(
                "-mb-px min-h-[44px] whitespace-nowrap border-b-2 px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active ? "border-brand text-foreground" : "border-transparent text-muted-foreground"
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

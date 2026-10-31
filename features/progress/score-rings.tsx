"use client";

import { ChevronRight, X } from "lucide-react";

import { SECTION_THEMES, type SectionId } from "@/features/progress/chart-theme";
import { SessionRing } from "@/features/home/session-ring";
import type { Ring } from "@/lib/progress-scores";
import type { ProgressRange } from "@/lib/progress-metrics";

export type RingId = "strength" | "consistency" | "body";

export interface RingCardMeta<Id extends string> {
  id: Id;
  label: string;
  /** Whose colour the card and everything inside it wear. */
  section: SectionId;
}

export const RING_META: RingCardMeta<RingId>[] = [
  { id: "strength", label: "Strength", section: "strength" },
  { id: "consistency", label: "Consistency", section: "consistency" },
  { id: "body", label: "Muscles", section: "body" }
];

/** The range, as the end of a sentence. */
const HERO_RANGE: Record<ProgressRange, string> = {
  "4w": "in the last 4 weeks",
  "12w": "in the last 12 weeks",
  "1y": "in the last year",
  all: "since you started",
  custom: "in these dates"
};

/** The page's one sentence: the answer to "am I getting anywhere". */
export function overviewLine(ring: Ring, range: ProgressRange) {
  if (!ring.ready) {
    return "Your progress starts here.";
  }
  const when = HERO_RANGE[range];
  return ring.tone === "good"
    ? `You got stronger ${when}.`
    : ring.tone === "low"
      ? `Your lifts came down ${when}.`
      : `You held your strength ${when}.`;
}

/** The big line at the top: the page's answer, or the name of the open card. */
export function ProgressHero({ title, sentence, color }: { title: string; sentence: string; color?: string }) {
  return (
    <section className="px-1 pt-1">
      <h2
        className="font-heading text-[40px] leading-[1.05] [text-wrap:balance]"
        style={color ? { color } : undefined}
      >
        {title}
      </h2>
      <p className="mt-2 text-[14.5px] leading-snug text-muted-foreground">{sentence}</p>
    </section>
  );
}

/**
 * The three cards, and the only way in: all of a Progress page sits behind one of
 * them. A tap opens that card's charts below; a tap on the open one comes back.
 * Each has its own colour, which every chart inside it keeps, so you always know
 * where you are. Only the two states that ask something of you get a word.
 */
export function RingCards<Id extends string>({
  cards,
  rings,
  selected,
  onSelect,
  label: groupLabel,
  tour
}: {
  cards: RingCardMeta<Id>[];
  rings: Record<Id, Ring>;
  selected?: Id;
  onSelect: (id?: Id) => void;
  label: string;
  tour: string;
}) {
  return (
    <div className="grid grid-cols-3 gap-2" role="group" aria-label={groupLabel} data-tour={tour}>
      {cards.map(({ id, label, section }) => {
        const ring = rings[id];
        const theme = SECTION_THEMES[section];
        const active = selected === id;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={active}
            aria-label={`${label}: ${ring.value}. ${ring.sentence} ${active ? "Tap to close." : "Tap to open."}`}
            onClick={() => onSelect(active ? undefined : id)}
            className="plaque relative flex min-h-[44px] flex-col items-center rounded-3xl px-1 pb-3 pt-3.5 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style={active ? { backgroundColor: theme.tint, boxShadow: `inset 0 0 0 1.5px ${theme.accent}` } : undefined}
          >
            {active ? <X className="absolute right-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" aria-hidden /> : null}
            <SessionRing value={ring.ready ? ring.fill : 0} size={66} stroke={5} color={theme.accent}>
              <span className="text-[14.5px] font-semibold tabular-nums tracking-[-0.01em]">{ring.value}</span>
            </SessionRing>
            <span className="mt-2 flex items-center text-[13.5px] font-medium">
              {label}
              {active ? null : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />}
            </span>
            {!ring.ready ? (
              <span className="text-[12px] text-muted-foreground">Not yet</span>
            ) : ring.tone === "low" ? (
              <span className="text-[12px] font-medium text-warning">Needs work</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function ProgressCards({
  rings,
  selected,
  onSelect
}: {
  rings: Record<RingId, Ring>;
  selected?: RingId;
  onSelect: (id?: RingId) => void;
}) {
  return <RingCards cards={RING_META} rings={rings} selected={selected} onSelect={onSelect} label="Progress cards" tour="progress-rings" />;
}

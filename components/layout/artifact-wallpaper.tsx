"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Each page's wallpaper: the app's artifacts as hairline outlines, scattered
 * over the whole screen behind the cards. A different six per page, so the
 * texture says where you are — training on Today, the path on Plan, what you
 * earned on Progress, you and your gear on You.
 *
 * It is alive in place: every artifact glows and dims on its own beat, and
 * every load lays the field out afresh — new spots, new shapes. Nothing moves
 * while you look. The many are faint; three rare ones glow in the accent.
 *
 * Nothing overlaps: the screen is a grid of cells, each piece owns one and
 * sits inside it with a margin, so not even a glow touches a neighbour. Every
 * load deals the pieces to fresh cells and fresh spots: the server draws
 * them in order (it cannot know the shuffle), the client shuffles on mount,
 * and the whole field fades in only after that, so the swap is never seen. Drawn here — a couple of kilobytes,
 * themed, and ours. The
 * cards are solid, so nothing read or typed ever sits on it.
 */
export type WallpaperSet = "today" | "plan" | "progress" | "you";

/** Every glyph sits in a 16 × 16 box. */
const GLYPHS = {
  dumbbell: "M5.5 8 H10.5 M1.5 6.5 V9.5 M13.5 6.5 V9.5 M3 4.5 H5.5 V11.5 H3 Z M10.5 4.5 H13 V11.5 H10.5 Z",
  kettlebell: "M5.5 5.5 A2.5 2.5 0 0 1 10.5 5.5 M4.6 6.5 H11.4 M4.4 6.8 A5 5 0 1 0 11.6 6.8",
  potion: "M6 1.5 H10 M6.8 1.5 V5.2 A5 5 0 1 0 9.2 5.2 V1.5 M4 10.5 Q8 9.3 12 10.5",
  hourglass: "M4 2 H12 M4 14 H12 M5 2 C5 6 11 6 11 8 C11 10 5 10 5 14 M11 2 C11 6 5 6 5 8 C5 10 11 10 11 14",
  flame: "M8 14.5 C4.5 14.5 3 12 3 9.8 C3 7 5.5 5.5 6 2 C8 4 9.5 5 9.5 7.5 C10.5 6.8 11 6 11 5 C12.5 6.5 13 8.3 13 9.8 C13 12.3 11.3 14.5 8 14.5 Z",
  sword: "M12.5 1.5 L14.5 3.5 L6 12 L4 10 Z M3 9 L7 13 M2 14 L4.5 11.5",
  calendar: "M2.5 4 H13.5 V13.5 H2.5 Z M2.5 6.5 H13.5 M5.5 2.5 V5 M10.5 2.5 V5 M5 9 H6.5 M8 9 H9.5 M5 11.5 H6.5",
  scroll: "M3 3 H13 V13 H3 Z M1.5 2.5 V13.5 M14.5 2.5 V13.5 M5 6 H11 M5 8.5 H9.5 M5 11 H8",
  map: "M2 4 L6 2.5 L10 4 L14 2.5 V12 L10 13.5 L6 12 L2 13.5 Z M6 2.5 V12 M10 4 V13.5",
  quill: "M13.5 2.5 C8 3.5 5 7.5 4 12.5 M13.5 2.5 C12 7 9 10 5 11.5 M3 14 L4.5 12",
  compass: "M8 1.8 A6.2 6.2 0 1 0 8 14.2 A6.2 6.2 0 1 0 8 1.8 Z M10.5 5.5 L9 9 L5.5 10.5 L7 7 Z",
  checklist: "M3 3.5 L4.2 4.7 L6.2 2.7 M8 3.7 H13.5 M3 8 L4.2 9.2 L6.2 7.2 M8 8.2 H13.5 M3.5 12.5 H5.5 M8 12.7 H13.5",
  trophy: "M5 2.5 H11 V6 A3 3 0 0 1 5 6 Z M5 3.5 H3 A2 2 0 0 0 5 7 M11 3.5 H13 A2 2 0 0 1 11 7 M8 9 V11.5 M5.5 13.5 H10.5 M6.5 11.5 H9.5 V13.5",
  medal: "M5 1.5 L8 6 L11 1.5 M8 6.5 A4 4 0 1 0 8 14.5 A4 4 0 1 0 8 6.5 Z",
  star: "M8 1.5 L10 6 L14.5 6.3 L11 9.3 L12.2 14 L8 11.5 L3.8 14 L5 9.3 L1.5 6.3 L6 6 Z",
  gem: "M8 4 L13 7.5 L8 14.5 L3 7.5 Z M3 7.5 H13 M6 2.5 L8 1 L10 2.5",
  crest: "M8 1.5 L13.5 3.5 V7.5 C13.5 11 11 13.5 8 14.5 C5 13.5 2.5 11 2.5 7.5 V3.5 Z M8 5 L10 8 L8 11 L6 8 Z",
  chart: "M2.5 13.5 H13.5 M4 13.5 V9 M7 13.5 V6 M10 13.5 V7.5 M13 13.5 V3.5",
  helmet: "M2.5 10 C2.5 5.5 5 2.5 8 2.5 C11 2.5 13.5 5.5 13.5 10 V13 H10 V10 H6 V13 H2.5 Z M8 2.5 V7",
  shield: "M8 1.5 L13.5 3.5 V7.5 C13.5 11 11 13.5 8 14.5 C5 13.5 2.5 11 2.5 7.5 V3.5 Z M8 4 V12 M4.5 7 H11.5",
  scale: "M2.5 4 H13.5 V13.5 H2.5 Z M5 8.5 A3 3 0 0 1 11 8.5 M8 8.5 L9.5 7",
  tape: "M7 2.5 A5.5 5.5 0 1 0 7 13.5 H14 M7 6 A2 2 0 1 0 7 10 A2 2 0 1 0 7 6 Z M10 13.5 V12 M12 13.5 V12",
  heart: "M8 13.5 C3 10 2 7.5 2 5.8 C2 4 3.4 2.5 5.2 2.5 C6.4 2.5 7.4 3.2 8 4.2 C8.6 3.2 9.6 2.5 10.8 2.5 C12.6 2.5 14 4 14 5.8 C14 7.5 13 10 8 13.5 Z",
  key: "M5.5 4 A3.5 3.5 0 1 0 5.5 11 A3.5 3.5 0 1 0 5.5 4 Z M8.5 7.5 H14 M12 7.5 V10 M14 7.5 V9.5"
} as const;

type Glyph = keyof typeof GLYPHS;

const SETS: Record<WallpaperSet, [Glyph, Glyph, Glyph, Glyph, Glyph, Glyph]> = {
  today: ["potion", "dumbbell", "flame", "kettlebell", "hourglass", "sword"],
  plan: ["calendar", "scroll", "map", "quill", "compass", "checklist"],
  progress: ["trophy", "star", "chart", "crest", "medal", "gem"],
  you: ["helmet", "heart", "scale", "shield", "tape", "key"]
};

type Find = { glyph: Glyph; x: number; y: number; turn: number };

const COLUMNS = 4;
const ROWS = 8;
/** One piece per cell; three of them rare. */
const PIECES = COLUMNS * ROWS - 1;
const RARE_COUNT = 3;

/**
 * A spot inside one cell, clear of its edges. The box a piece may sit in is
 * the cell less the piece's own size and a margin, all in percent of the
 * screen: about 8% across and 5% down for a 28px glyph on a phone.
 */
function inCell(set: WallpaperSet, cell: number, random: () => number): Find {
  const glyphs = SETS[set];
  const width = 100 / COLUMNS;
  const height = 100 / ROWS;
  const left = (cell % COLUMNS) * width;
  const top = Math.floor(cell / COLUMNS) * height;
  return {
    glyph: glyphs[Math.floor(random() * glyphs.length)],
    x: left + 2 + random() * (width - 11),
    y: top + 1 + random() * (height - 6),
    turn: Math.round(random() * 40 - 20)
  };
}

/** A repeatable stand-in for `Math.random`, for the first render only. */
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };
}

/** One artifact in its cell: placed once per load, then it only glows and dims there. */
function Piece({ set, cell, rare, delay, duration }: { set: WallpaperSet; cell: number; rare: boolean; delay: number; duration: number }) {
  const [find, setFind] = useState(() => inCell(set, cell, seeded(cell + 1)));
  // A new cell (the shuffle on mount) means a new spot; the field is still hidden then.
  useEffect(() => setFind(inCell(set, cell, Math.random)), [set, cell]);
  return (
    <span
      className={cn("absolute", rare ? "artifact-rare h-7 w-7" : "artifact-common h-[22px] w-[22px]")}
      style={{ left: `${find.x}%`, top: `${find.y}%`, animationDelay: `${delay}s`, animationDuration: `${duration}s` }}
    >
      <svg viewBox="0 0 16 16" className="h-full w-full" style={{ transform: `rotate(${find.turn}deg)` }}>
        <path
          d={GLYPHS[find.glyph]}
          fill="none"
          stroke="currentColor"
          strokeWidth={rare ? 1 : 0.9}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

/** Cell numbers, one per piece, shuffled — or in order before mount. */
function deal(shuffle: boolean) {
  const cells = Array.from({ length: COLUMNS * ROWS }, (_, index) => index);
  if (shuffle) {
    for (let index = cells.length - 1; index > 0; index -= 1) {
      const other = Math.floor(Math.random() * (index + 1));
      [cells[index], cells[other]] = [cells[other], cells[index]];
    }
  }
  return cells.slice(0, PIECES);
}

export function ArtifactWallpaper({ set }: { set: WallpaperSet }) {
  const [cells, setCells] = useState(() => deal(false));
  // Hidden until the shuffle is in, then faded up.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setCells(deal(true));
    setReady(true);
  }, []);

  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-0 -z-10 overflow-hidden transition-opacity duration-500 print:hidden",
        ready ? "opacity-100" : "opacity-0"
      )}
      aria-hidden
    >
      {cells.map((cell, index) => {
        const rare = index < RARE_COUNT;
        // Each on its own beat — the rare ones 3s and a beat apart, the many
        // 5 to 9s from different starting points — so the field changes a
        // little at a time and never all at once.
        return (
          <Piece
            key={index}
            set={set}
            cell={cell}
            rare={rare}
            delay={rare ? -index : -((index * 1.37) % 9)}
            duration={rare ? 3 : 5 + ((index * 7) % 5)}
          />
        );
      })}
    </div>
  );
}

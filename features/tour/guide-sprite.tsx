"use client";

import { useId } from "react";

import { cn } from "@/lib/utils";

/**
 * The tour's guide: a small wisp of the System — a glowing blue spirit with
 * big eyes and a flame for a tail. Drawn here, not borrowed: it has to blink,
 * look at what it explains and fly between tabs, which no picture can, and an
 * SVG of our own carries no licence to track.
 *
 * Moods change only the motion: `idle` floats, `talking` hops once when the
 * text changes (keyed by the caller), `flying` leans into the move. Every
 * motion lives in globals.css under "tour guide", each with its own
 * reduced-motion rule, so the sprite stands still for anyone who asked.
 */
export type GuideMood = "idle" | "talking" | "flying";

/** Where to look, as a direction: x and y each in -1…1. */
export interface Gaze {
  x: number;
  y: number;
}

/** How far the pupils travel inside the eye, in viewBox units. */
const PUPIL_TRAVEL = 2.2;

export function GuideSprite({
  mood = "idle",
  gaze = { x: 0, y: 0 },
  size = 56,
  className
}: {
  mood?: GuideMood;
  gaze?: Gaze;
  size?: number;
  className?: string;
}) {
  // Gradient ids must be unique per instance, or two sprites share one glow.
  const id = useId().replace(/:/g, "");
  const length = Math.hypot(gaze.x, gaze.y) || 1;
  const scale = Math.min(1, length);
  const dx = (gaze.x / length) * scale * PUPIL_TRAVEL;
  const dy = (gaze.y / length) * scale * PUPIL_TRAVEL;

  return (
    <span
      className={cn(
        "guide-sprite inline-block",
        mood === "idle" && "guide-float",
        mood === "talking" && "guide-hop",
        mood === "flying" && "guide-fly",
        className
      )}
      style={{ display: "inline-block", width: size, height: size * 1.15 }}
      aria-hidden
    >
      <svg viewBox="0 0 64 74" width="100%" height="100%" overflow="visible">
        <defs>
          <radialGradient id={`${id}-body`} cx="45%" cy="38%" r="65%">
            <stop offset="0%" stopColor="#e6fbff" />
            <stop offset="38%" stopColor="#7fd8ff" />
            <stop offset="78%" stopColor="#2a9cf0" />
            <stop offset="100%" stopColor="#1763c9" />
          </radialGradient>
          <radialGradient id={`${id}-glow`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#5cc8ff" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#5cc8ff" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`${id}-tail`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4fbfff" />
            <stop offset="100%" stopColor="#4fbfff" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* The aura: soft light around it, readable on dark and light pages. */}
        <circle cx="32" cy="30" r="31" fill={`url(#${id}-glow)`} />

        {/* The flame tail, which sways. */}
        <g className="guide-tail">
          {/* One spirit flame, curling up at the tip, with a small flick beside it. */}
          <path
            d="M20 42 C 18 54, 26 64, 40 66 C 47 67, 51 63, 50 58 C 46 62, 39 61, 36 56 C 33 51, 38 47, 44 44 Z"
            fill={`url(#${id}-tail)`}
          />
          <path d="M26 46 C 24 54, 27 60, 31 63 C 29 57, 30 52, 32 48 Z" fill="#bff0ff" opacity="0.5" />
        </g>

        {/* The body: a soft round drop. */}
        <path
          d="M32 6 C 48 6, 56 18, 56 30 C 56 42, 46 50, 32 50 C 18 50, 8 42, 8 30 C 8 18, 16 6, 32 6 Z"
          fill={`url(#${id}-body)`}
        />
        {/* A gloss highlight, top left: what makes it read as glowing glass. */}
        <ellipse cx="22" cy="17" rx="7" ry="4.5" fill="#ffffff" opacity="0.55" transform="rotate(-25 22 17)" />

        {/* Cheeks. */}
        <ellipse cx="17" cy="36" rx="4" ry="2.4" fill="#ff8fb8" opacity="0.55" />
        <ellipse cx="47" cy="36" rx="4" ry="2.4" fill="#ff8fb8" opacity="0.55" />

        {/* Eyes: white, a dark pupil that follows the gaze, and a sparkle. */}
        <g className="guide-blink">
          <ellipse cx="24" cy="29" rx="6" ry="7.5" fill="#ffffff" />
          <ellipse cx="40" cy="29" rx="6" ry="7.5" fill="#ffffff" />
          <g transform={`translate(${dx.toFixed(2)} ${dy.toFixed(2)})`}>
            <ellipse cx="24" cy="30" rx="3.6" ry="4.6" fill="#0d1b3d" />
            <ellipse cx="40" cy="30" rx="3.6" ry="4.6" fill="#0d1b3d" />
            <circle cx="25.4" cy="28" r="1.4" fill="#ffffff" />
            <circle cx="41.4" cy="28" r="1.4" fill="#ffffff" />
          </g>
        </g>

        {/* Mouth: a small smile, a little "o" that opens and shuts while it talks. */}
        {mood === "talking" ? (
          <ellipse className="guide-chatter" cx="32" cy="40" rx="2.6" ry="2.2" fill="#0d1b3d" />
        ) : (
          <path d="M28.5 39 Q 32 42.5, 35.5 39" stroke="#0d1b3d" strokeWidth="1.8" strokeLinecap="round" fill="none" />
        )}
      </svg>
    </span>
  );
}

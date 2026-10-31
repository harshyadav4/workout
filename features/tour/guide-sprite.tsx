"use client";

import { useId } from "react";

import { cn } from "@/lib/utils";

/**
 * The tour's guide: a small warm light of the System, cream at its heart and
 * coral at its edge, with dark eyes and a wisp for a tail. Drawn here, not
 * borrowed: it has to blink, look at what it explains and fly between tabs,
 * which no picture can, and an SVG of our own carries no licence to track.
 *
 * Its colours are the app's warm light (`--l1` to `--l3`) and the ink on it
 * (`--on-warm`), so it follows the theme and any later change of palette.
 *
 * Moods change only the motion: `idle` floats, `talking` hops once when the
 * text changes (keyed by the caller), `flying` leans into the move, `still`
 * rests, for a small sprite that stays on screen. Every motion lives in
 * globals.css under "tour guide", each with its own reduced-motion rule, so
 * the sprite stands still for anyone who asked.
 */
export type GuideMood = "idle" | "talking" | "flying" | "still";

/** Where to look, as a direction: x and y each in -1…1. */
export interface Gaze {
  x: number;
  y: number;
}

/** How far the face turns toward what it looks at, in viewBox units. */
const FACE_TRAVEL = 2.6;

/** The body: a soft round light, a little fuller than a circle at its sides. */
const BODY = "M32 7.5 C 44 7.5, 53 17, 53 28.5 C 53 40.5, 44 49.5, 32 49.5 C 20 49.5, 11 40.5, 11 28.5 C 11 17, 20 7.5, 32 7.5 Z";

/** The tail: leaves the body's lower left, sweeps under it and flicks up at the tip. */
const TAIL = "M14.6 39.5 C 18.5 49, 26 60, 38 63.5 C 43 65, 48 64.5, 51.5 61 C 46.5 61.8, 41.5 59.5, 39 55 C 37.5 52, 38 49, 40 46 Z";

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
  const dx = (gaze.x / length) * scale * FACE_TRAVEL;
  const dy = (gaze.y / length) * scale * FACE_TRAVEL;

  return (
    <span
      className={cn(
        "guide-sprite inline-block",
        mood === "idle" && "guide-float",
        mood === "talking" && "guide-hop",
        mood === "flying" && "guide-fly",
        mood === "still" && "guide-still",
        className
      )}
      style={{ display: "inline-block", width: size, height: size * 1.15 }}
      aria-hidden
    >
      <svg viewBox="0 0 64 74" width="100%" height="100%" overflow="visible">
        <defs>
          <radialGradient id={`${id}-body`} cx="46%" cy="36%" r="82%">
            <stop offset="0%" style={{ stopColor: "var(--l1)" }} />
            <stop offset="62%" style={{ stopColor: "var(--l2)" }} />
            <stop offset="100%" style={{ stopColor: "var(--l3)" }} />
          </radialGradient>
          {/* White over the warm colours: the pale heart, in either theme. */}
          <radialGradient id={`${id}-heart`} cx="46%" cy="36%" r="58%">
            <stop offset="0%" stopColor="white" stopOpacity="0.86" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`${id}-glow`} cx="50%" cy="50%" r="50%">
            <stop offset="74%" style={{ stopColor: "var(--l2)", stopOpacity: 0.2 }} />
            <stop offset="100%" style={{ stopColor: "var(--l2)", stopOpacity: 0 }} />
          </radialGradient>
          <linearGradient id={`${id}-tail`} x1="0.1" y1="0" x2="0.9" y2="1">
            <stop offset="0%" style={{ stopColor: "var(--l2)" }} />
            <stop offset="50%" style={{ stopColor: "var(--l3)", stopOpacity: 0.8 }} />
            <stop offset="100%" style={{ stopColor: "var(--l3)", stopOpacity: 0 }} />
          </linearGradient>
        </defs>

        {/* The aura: a little soft light just past the edge, not a halo. */}
        <circle cx="32" cy="28.5" r="26" fill={`url(#${id}-glow)`} />

        {/* The tail, which sways. */}
        <g className="guide-tail">
          <path d={TAIL} fill={`url(#${id}-tail)`} />
        </g>

        <path d={BODY} fill={`url(#${id}-body)`} />
        <path d={BODY} fill={`url(#${id}-heart)`} />

        {/* The face turns toward what the guide looks at. */}
        <g transform={`translate(${dx.toFixed(2)} ${dy.toFixed(2)})`}>
          <g className="guide-blink">
            <ellipse cx="25.8" cy="27.5" rx="2.6" ry="3.5" style={{ fill: "var(--on-warm)" }} />
            <ellipse cx="38.2" cy="27.5" rx="2.6" ry="3.5" style={{ fill: "var(--on-warm)" }} />
          </g>
          {/* No mouth at rest: a small "o" opens and shuts while it talks. */}
          {mood === "talking" ? (
            <ellipse className="guide-chatter" cx="32" cy="35.6" rx="1.7" ry="1.4" style={{ fill: "var(--on-warm)" }} />
          ) : null}
        </g>
      </svg>
    </span>
  );
}

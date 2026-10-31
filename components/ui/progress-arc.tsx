import { useId, type ReactNode } from "react";

const CENTER_X = 160;
const CENTER_Y = 162;
const RADIUS = 146;

/** Warm light along a line, faint to full. Colours from globals.css, so it follows the skin. */
export function WarmGradient({ id }: { id: string }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" style={{ stopColor: "var(--l1)" }} />
      <stop offset="0.6" style={{ stopColor: "var(--l2)" }} />
      <stop offset="1" style={{ stopColor: "var(--l3)" }} />
    </linearGradient>
  );
}

/** The small sun at the tip of an arc. A radial gradient, not a blur: iOS Safari ignores `filter` inside an SVG. */
function Sun({ id, x, y, radius = 6 }: { id: string; x: number; y: number; radius?: number }) {
  return (
    <>
      <defs>
        <radialGradient id={`${id}-glow`}>
          <stop offset="0" style={{ stopColor: "var(--l2)", stopOpacity: 0.7 }} />
          <stop offset="1" style={{ stopColor: "var(--l2)", stopOpacity: 0 }} />
        </radialGradient>
      </defs>
      <circle cx={x.toFixed(2)} cy={y.toFixed(2)} r={radius * 3.3} fill={`url(#${id}-glow)`} />
      <circle cx={x.toFixed(2)} cy={y.toFixed(2)} r={radius} style={{ fill: "var(--sun)" }} />
    </>
  );
}

/**
 * The arc: how the app draws progress. A thin line, warm light up to where you
 * are, and a small sun at the tip.
 */
export function ProgressArc({
  fraction,
  label,
  className
}: {
  /** 0 to 1. */
  fraction: number;
  /** What a screen reader hears. Absent: decorative, the words are beside it. */
  label?: string;
  className?: string;
}) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const share = Math.max(0, Math.min(1, fraction));
  const angle = Math.PI * (1 - share);
  const tipX = CENTER_X + RADIUS * Math.cos(angle);
  const tipY = CENTER_Y - RADIUS * Math.sin(angle);
  const start = `M${CENTER_X - RADIUS} ${CENTER_Y} A${RADIUS} ${RADIUS} 0 0 1`;

  return (
    <svg
      viewBox="0 0 320 168"
      // Visible overflow: at either end of the arc the sun's glow passes the frame.
      className={className ?? "block h-auto w-full overflow-visible"}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    >
      <defs>
        <WarmGradient id={`${id}-line`} />
      </defs>
      <path d={`${start} ${CENTER_X + RADIUS} ${CENTER_Y}`} fill="none" stroke="var(--track)" strokeWidth="1.5" />
      {share > 0 ? (
        <path
          d={`${start} ${tipX.toFixed(2)} ${tipY.toFixed(2)}`}
          className="arc-draw"
          pathLength={1}
          fill="none"
          stroke={`url(#${id}-line)`}
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      ) : null}
      <Sun id={id} x={tipX} y={tipY} />
    </svg>
  );
}

/** The horizon's drawing width. Whatever sits on it uses these units. */
export const HORIZON_WIDTH = 390;
const HORIZON_RADIUS = 420;
const HORIZON_TOP = 26;
const HORIZON_EDGE = 14;

/** Where the horizon runs at `x`. */
export function horizonY(x: number) {
  const fromCentre = x - HORIZON_WIDTH / 2;
  return HORIZON_TOP + HORIZON_RADIUS - Math.sqrt(HORIZON_RADIUS * HORIZON_RADIUS - fromCentre * fromCentre);
}

/**
 * The same light across the whole screen, drawn as a horizon: the week on Today,
 * the sets during a workout. `children` draw on it, in its units.
 */
export function HorizonArc({
  litTo,
  height = 96,
  label,
  children
}: {
  /** How far the light has come, in horizon units. */
  litTo: number;
  height?: number;
  label: string;
  children?: ReactNode;
}) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  // Held clear of the edges, so the sun is never cut in half at the start or the end.
  const tip = Math.max(HORIZON_EDGE, Math.min(HORIZON_WIDTH - HORIZON_EDGE, litTo));
  const start = `M0 ${horizonY(0).toFixed(2)} A${HORIZON_RADIUS} ${HORIZON_RADIUS} 0 0 1`;

  return (
    <svg viewBox={`0 0 ${HORIZON_WIDTH} ${height}`} className="block h-auto w-full overflow-visible" role="img" aria-label={label}>
      <defs>
        <WarmGradient id={`${id}-line`} />
      </defs>
      <path d={`${start} ${HORIZON_WIDTH} ${horizonY(HORIZON_WIDTH).toFixed(2)}`} fill="none" stroke="var(--track)" strokeWidth="1.5" />
      {litTo > 0 ? (
        <path
          d={`${start} ${tip.toFixed(2)} ${horizonY(tip).toFixed(2)}`}
          className="arc-draw"
          pathLength={1}
          fill="none"
          stroke={`url(#${id}-line)`}
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      ) : null}
      {children}
      <Sun id={id} x={tip} y={horizonY(tip)} />
    </svg>
  );
}

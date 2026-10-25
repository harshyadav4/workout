import { useId, type ReactNode } from "react";

/**
 * Sets done, as a ring that fills: the mana ring. The track is a well, the fill
 * is the key's own gradient with a glow on it, and the number sits in the
 * middle. Rounded caps, so one set out of seventeen still reads as a mark and
 * not a sliver.
 */
export function SessionRing({
  value,
  size = 92,
  stroke = 10,
  label,
  children
}: {
  /** 0 to 1. */
  value: number;
  size?: number;
  stroke?: number;
  label: string;
  children?: ReactNode;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, value));
  // Two rings on one screen (the card and the sticky strip) need two gradients.
  const gradientId = `mana-${useId().replace(/:/g, "")}`;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={label}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" style={{ stopColor: "hsl(var(--key-top))" }} />
            <stop offset="100%" style={{ stopColor: "hsl(var(--key-bottom))" }} />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--well))"
          strokeWidth={stroke}
        />
        {clamped > 0 ? (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={`url(#${gradientId})`}
            className="mana-glow"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - clamped)}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: "stroke-dashoffset 300ms ease-out" }}
          />
        ) : null}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        {children}
      </div>
    </div>
  );
}

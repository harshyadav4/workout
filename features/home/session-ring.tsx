import { useId, type ReactNode } from "react";

/**
 * A share of something, as a thin ring that fills with warm light, with the
 * number in the middle. Rounded caps, so one set out of seventeen still reads as
 * a mark and not a sliver.
 */
export function SessionRing({
  value,
  size = 84,
  stroke = 3,
  color,
  label,
  children
}: {
  /** 0 to 1. */
  value: number;
  size?: number;
  stroke?: number;
  /** One colour in place of the warm light. */
  color?: string;
  /** What a screen reader hears. Absent: decorative, the words are beside it. */
  label?: string;
  children?: ReactNode;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, value));
  // Two rings on one screen need two gradients.
  const gradientId = `light-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        width={size}
        height={size}
        {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" style={{ stopColor: "hsl(var(--key-top))" }} />
            <stop offset="100%" style={{ stopColor: "hsl(var(--key-bottom))" }} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--track)" strokeWidth={stroke} />
        {clamped > 0 ? (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color ?? `url(#${gradientId})`}
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

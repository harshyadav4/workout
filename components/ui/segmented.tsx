"use client";

import { useRef, type TouchEvent as ReactTouchEvent } from "react";

import { cn } from "@/lib/utils";

export interface SegmentOption<T extends string> {
  id: T;
  label: string;
}

/** A swipe on the control this long moves the selection one step. */
const SWIPE_PX = 40;

/**
 * A segmented control, the way the OS draws one: a well, and one raised key
 * that slides to whichever segment is chosen instead of each segment lighting
 * on its own. `role="tablist"` when the segments switch what the screen shows,
 * `"group"` when they set a value. A horizontal swipe on the control moves
 * the selection one step; a swipe on the page is the screen's own business
 * (components/ui/use-swipe-tabs).
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  role = "group",
  size = "md",
  dense,
  quiet,
  className,
  ...rest
}: {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (next: T) => void;
  role?: "group" | "tablist";
  /** Row height: md is 44px, sm is 40px. */
  size?: "sm" | "md";
  /** Smaller labels, for five segments across a phone. */
  dense?: boolean;
  /** A soft key, for a control right above the page's main button: one thing stays white. */
  quiet?: boolean;
  className?: string;
} & Omit<React.HTMLAttributes<HTMLDivElement>, "onChange" | "role">) {
  const count = options.length;
  const index = options.findIndex((option) => option.id === value);
  // The browser may end a sideways touch with touchcancel once it treats it
  // as a pan, so the last move is kept and both end events read it.
  const touch = useRef<{ x: number; y: number; lastX: number; lastY: number } | null>(null);

  const onTouchStart = (event: ReactTouchEvent<HTMLDivElement>) => {
    const { clientX, clientY } = event.touches[0];
    touch.current = { x: clientX, y: clientY, lastX: clientX, lastY: clientY };
  };
  const onTouchMove = (event: ReactTouchEvent<HTMLDivElement>) => {
    if (touch.current) {
      touch.current.lastX = event.touches[0].clientX;
      touch.current.lastY = event.touches[0].clientY;
    }
  };
  const onTouchEnd = () => {
    const start = touch.current;
    touch.current = null;
    if (!start) {
      return;
    }
    const dx = start.lastX - start.x;
    const dy = start.lastY - start.y;
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy) * 1.5) {
      return;
    }
    const next = options[Math.min(count - 1, Math.max(0, index + (dx < 0 ? 1 : -1)))];
    if (next && next.id !== value) {
      onChange(next.id);
    }
  };

  return (
    <div
      role={role}
      className={cn("well relative grid gap-1 rounded-full p-1", className)}
      style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      {...rest}
    >
      <span
        aria-hidden
        className={cn("segment-thumb pointer-events-none absolute bottom-1 left-1 top-1 rounded-full", quiet ? "bg-track" : "key", index < 0 && "hidden")}
        style={{
          width: `calc((100% - 0.5rem - ${(count - 1) * 0.25}rem) / ${count})`,
          transform: `translateX(calc(${Math.max(0, index)} * (100% + 0.25rem)))`
        }}
      />
      {options.map((option, position) => {
        const selected = position === index;
        return (
          <button
            key={option.id}
            type="button"
            role={role === "tablist" ? "tab" : undefined}
            aria-selected={role === "tablist" ? selected : undefined}
            aria-pressed={role === "group" ? selected : undefined}
            onClick={() => onChange(option.id)}
            className={cn(
              "relative z-10 rounded-full font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              size === "sm" ? "h-10" : "h-11",
              dense ? "text-xs" : size === "sm" ? "text-[13px]" : "text-sm",
              selected ? (quiet ? "text-foreground" : "text-primary-foreground") : "text-muted-foreground"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

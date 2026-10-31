import type { MeterTone } from "@/lib/diet-metrics";
import { cn } from "@/lib/utils";

/**
 * One thin progress bar. Its length says how far along you are, so it needs no
 * traffic light: warm light, or a card's own colour inside a card, and red only
 * past a limit, where the words beside it say "over" too. A mark can show a second
 * value on the same bar.
 */
export function MeterBar({
  label,
  value,
  target,
  percent,
  tone,
  color,
  markerPercent,
  className
}: {
  label: string;
  value: number;
  target?: number;
  percent: number;
  tone: MeterTone;
  /** One colour in place of the warm light. */
  color?: string;
  markerPercent?: number;
  className?: string;
}) {
  const over = tone === "over";
  return (
    <div className={cn("relative", className)}>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={target ?? 0}
        aria-valuenow={value}
        className="h-1 w-full overflow-hidden rounded-full bg-track"
      >
        <div
          className={cn("h-full rounded-full transition-[width] duration-300 ease-out", over ? "bg-danger" : !color && "mana-fill")}
          style={{ width: `${percent}%`, backgroundColor: over ? undefined : color }}
        />
      </div>
      {markerPercent !== undefined ? (
        <span
          aria-hidden
          className="absolute -top-[3px] h-2.5 w-0.5 -translate-x-1/2 rounded-full bg-foreground"
          style={{ left: `${Math.max(1, Math.min(99, markerPercent))}%` }}
        />
      ) : null}
    </div>
  );
}

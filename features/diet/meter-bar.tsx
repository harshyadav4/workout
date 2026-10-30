import type { MeterTone } from "@/lib/diet-metrics";
import { cn } from "@/lib/utils";

const TONE_FILL: Record<MeterTone, string> = {
  none: "bg-muted-foreground/40",
  low: "bg-danger",
  mid: "bg-warning",
  good: "bg-success",
  over: "bg-danger"
};

/** One progress bar, coloured by how far along it is, with an optional mark for a second value. */
export function MeterBar({
  label,
  value,
  target,
  percent,
  tone,
  markerPercent,
  className
}: {
  label: string;
  value: number;
  target?: number;
  percent: number;
  tone: MeterTone;
  markerPercent?: number;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={target ?? 0}
        aria-valuenow={value}
        className="well h-2.5 w-full overflow-hidden rounded-full"
      >
        <div
          className={cn("h-full rounded-full transition-[width,background-color] duration-300 ease-out", TONE_FILL[tone])}
          style={{ width: `${percent}%` }}
        />
      </div>
      {markerPercent !== undefined ? (
        <span
          aria-hidden
          className="absolute -top-0.5 h-3.5 w-0.5 -translate-x-1/2 rounded-full bg-foreground"
          style={{ left: `${Math.max(1, Math.min(99, markerPercent))}%` }}
        />
      ) : null}
    </div>
  );
}

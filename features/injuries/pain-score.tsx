"use client";

import { cn } from "@/lib/utils";

const SCORES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/** The 0 to 10 pain score. One tap for each number, with no slider to drag. */
export function PainScore({
  value,
  onChange,
  label
}: {
  value?: number;
  onChange: (score: number) => void;
  /** What the buttons are for, for a screen reader. */
  label: string;
}) {
  return (
    <div>
      <div role="group" aria-label={label} className="grid grid-cols-6 gap-1.5">
        {SCORES.map((score) => (
          <button
            key={score}
            type="button"
            aria-pressed={score === value}
            aria-label={`${score} of 10`}
            className={cn(
              "h-11 rounded-2xl text-base font-medium tabular-nums",
              score === value ? "key" : "key-quiet"
            )}
            onClick={() => onChange(score)}
          >
            {score}
          </button>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between px-0.5 text-[13px] text-muted-foreground">
        <span>0 No pain</span>
        <span>10 The worst</span>
      </div>
    </div>
  );
}

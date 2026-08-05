"use client";

import BackBody from "@/features/body/back";
import {
  MUSCLE_HEAT_STEPS,
  MUSCLE_IDLE_COLOR,
  type BodyMuscleHighlight
} from "@/features/body/body-map-shared";
import FrontBody from "@/features/body/front";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { MuscleId } from "@/lib/types";

/** The shades only mean something if the scale is on screen next to them. */
function HeatLegend() {
  return (
    <div className="mt-3 flex items-center justify-center gap-3">
      <div className="flex items-center gap-1.5">
        <span
          className="h-3 w-3 rounded-full"
          style={{ backgroundColor: MUSCLE_IDLE_COLOR }}
          aria-hidden
        />
        <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Not worked</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Light</span>
        <span className="flex overflow-hidden rounded-full" role="img" aria-label="Light to heavy">
          {MUSCLE_HEAT_STEPS.map((step) => (
            <span key={step.color} className="h-3 w-5" style={{ backgroundColor: step.color }} />
          ))}
        </span>
        <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Heavy</span>
      </div>
    </div>
  );
}

export function MuscleMapCard({
  title,
  description,
  highlights,
  selectedMuscleId,
  selectedMuscleName,
  selectedMuscleDescription,
  onSelectMuscle,
  footer
}: {
  title: string;
  description: string;
  highlights: BodyMuscleHighlight[];
  selectedMuscleId?: MuscleId;
  selectedMuscleName?: string;
  selectedMuscleDescription?: string;
  onSelectMuscle?: (muscleId?: string) => void;
  /** Replaces the default selected-muscle plaque where the caller has more to say. */
  footer?: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-[24px] bg-background p-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/10 bg-[#F7ECD9] p-3">
              {/* slate-600, not slate-400: these two sit on the cream panel,
                  where 400 measures 2.19:1. The legend's 400s below are on the
                  dark panel and stay. */}
              <p className="mb-3 text-center text-[11px] font-medium uppercase tracking-[0.2em] text-slate-600">
                Front
              </p>
              <FrontBody
                className="mx-auto h-[16.5rem] w-auto max-w-full"
                highlights={highlights}
                onSelectMuscle={onSelectMuscle}
                selectedMuscleId={selectedMuscleId}
              />
            </div>
            <div className="rounded-2xl border border-white/10 bg-[#F7ECD9] p-3">
              <p className="mb-3 text-center text-[11px] font-medium uppercase tracking-[0.2em] text-slate-600">
                Back
              </p>
              <BackBody
                className="mx-auto h-[16.5rem] w-auto max-w-full"
                highlights={highlights}
                onSelectMuscle={onSelectMuscle}
                selectedMuscleId={selectedMuscleId}
              />
            </div>
          </div>
          <HeatLegend />
        </div>
        {footer ?? (
          <div className="mt-4 rounded-3xl bg-secondary/50 p-4">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
              Selected Muscle
            </p>
            <p className="mt-2 text-lg font-semibold">{selectedMuscleName ?? "Tap a muscle"}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {selectedMuscleDescription ?? "Choose a body region to inspect how current programming is distributed."}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

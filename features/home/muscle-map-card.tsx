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
    <div className="mt-3 flex items-center justify-center gap-4 text-[11px] font-medium text-muted-foreground">
      <div className="flex items-center gap-1.5">
        <span
          className="h-3 w-3 rounded-full"
          style={{ backgroundColor: MUSCLE_IDLE_COLOR }}
          aria-hidden
        />
        <span>Not worked</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span>Light</span>
        <span className="flex overflow-hidden rounded-full" role="img" aria-label="Light to heavy">
          {MUSCLE_HEAT_STEPS.map((step) => (
            <span key={step.color} className="h-3 w-5" style={{ backgroundColor: step.color }} />
          ))}
        </span>
        <span>Heavy</span>
      </div>
    </div>
  );
}

/**
 * The two figures on one well, front and back side by side, with the legend
 * under them. The figure is drawn in the skin's own greys, so it belongs to the
 * card instead of sitting on it like a sticker.
 */
export function MuscleMapCard({
  title,
  description,
  highlights,
  selectedMuscleId,
  selectedMuscleName,
  selectedMuscleDescription,
  onSelectMuscle,
  footer,
  tourId
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
  /** The guided tour's `data-tour` marker, on the figures: the whole card is taller than a phone. */
  tourId?: string;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="well rounded-xl p-3" data-tour={tourId}>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="mb-2 text-center text-[11px] font-semibold text-muted-foreground">Front</p>
              <FrontBody
                className="mx-auto h-[16.5rem] w-auto max-w-full"
                highlights={highlights}
                onSelectMuscle={onSelectMuscle}
                selectedMuscleId={selectedMuscleId}
              />
            </div>
            <div>
              <p className="mb-2 text-center text-[11px] font-semibold text-muted-foreground">Back</p>
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
          <div className="mt-3 rounded-lg bg-muted p-4">
            <p className="text-xs font-semibold text-muted-foreground">Selected muscle</p>
            <p className="mt-1.5 font-display text-xl font-bold tracking-tight">
              {selectedMuscleName ?? "Tap a muscle"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {selectedMuscleDescription ?? "Tap a muscle to see how much work it gets."}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

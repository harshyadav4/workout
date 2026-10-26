"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWorkoutStore } from "@/features/workout/workout-store";
import { labelFor, latestFor, metricsToPrompt, unitFor } from "@/lib/body-metrics";
import type { BodyMetric } from "@/lib/types";

/**
 * Asks for a measurement at the end of a session.
 *
 * The tape half of this app's whole premise was collected by accident: the only
 * surface was a dot on the Profile tab, so `MuscleGirthCard` returned null
 * forever and the one chart no competitor has was invisible by default.
 *
 * This is the moment to ask — the session is done, the phone is already in your
 * hand, and you have just earned the right to see the number move. Three fields,
 * every one skippable, and it appears **once per cadence period** rather than
 * after every session, because the cadence is what the user asked for.
 */
export function MeasurementPrompt() {
  const measurements = useWorkoutStore((state) => state.measurements);
  const profile = useWorkoutStore((state) => state.profile);
  const logMeasurement = useWorkoutStore((state) => state.logMeasurement);

  const [drafts, setDrafts] = useState<Partial<Record<BodyMetric, string>>>({});
  const [dismissed, setDismissed] = useState(false);

  const due = metricsToPrompt(measurements, profile);

  if (dismissed || due.length === 0) {
    return null;
  }

  const save = () => {
    due.forEach((metric) => {
      const value = Number(drafts[metric]);
      // `Number("")` is 0, so an untouched field would record a zero — the same
      // bug the measurements card was built to avoid.
      if (drafts[metric]?.trim() && Number.isFinite(value) && value > 0) {
        logMeasurement(metric, value);
      }
    });
    setDismissed(true);
  };

  const anyEntered = due.some((metric) => drafts[metric]?.trim());

  return (
    <div className="mt-4 rounded-xl bg-muted p-4">
      <p className="font-display text-lg font-bold tracking-tight">Add your measurements</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Fill in only the ones you have.
      </p>

      <div className="mt-3 space-y-2">
        {due.map((metric) => {
          const last = latestFor(measurements, metric);
          return (
            <label key={metric} className="block">
              <span className="text-xs font-medium text-muted-foreground">
                {labelFor(metric)}
                {last ? ` · last ${last.value}${unitFor(metric)}` : ""}
              </span>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.1"
                className="mt-1 w-full"
                placeholder={unitFor(metric)}
                value={drafts[metric] ?? ""}
                onChange={(event) =>
                  setDrafts((current) => ({ ...current, [metric]: event.target.value }))
                }
              />
            </label>
          );
        })}
      </div>

      <div className="mt-3 flex gap-2">
        <Button className="flex-1" disabled={!anyEntered} onClick={save}>
          Save
        </Button>
        <Button variant="ghost" onClick={() => setDismissed(true)}>
          Not now
        </Button>
      </div>
    </div>
  );
}

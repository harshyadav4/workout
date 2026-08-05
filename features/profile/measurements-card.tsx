"use client";

import { Check } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useWorkoutStore } from "@/features/workout/workout-store";
import {
  BODY_METRICS,
  CADENCES,
  TAPE_METRICS,
  changeFor,
  dueState,
  labelFor,
  latestFor,
  unitFor,
  type DueState
} from "@/lib/body-metrics";
import type { BodyMetric, MeasurementCadence } from "@/lib/types";

/** "Due now" / "3 days late" / "next in 5 days" — or nothing when it is off. */
function dueLabel(state: DueState): string | null {
  if (state.due === null) {
    return null;
  }
  if (!state.lastDate) {
    return "Nothing recorded yet";
  }
  const days = state.daysUntil ?? 0;
  if (days > 0) {
    return `Next in ${days} day${days === 1 ? "" : "s"}`;
  }
  return days === 0 ? "Due today" : `${Math.abs(days)} days late`;
}

function CadencePicker({
  label,
  hint,
  value,
  onChange
}: {
  label: string;
  hint: string | null;
  value: MeasurementCadence | undefined;
  onChange: (next: MeasurementCadence) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-xs text-muted-foreground">
        {label}
        {hint ? <span className="text-foreground"> · {hint}</span> : null}
      </p>
      <div className="grid grid-cols-4 gap-1 rounded-full bg-background p-1">
        {CADENCES.map((item) => {
          const active = (value ?? "off") === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(item.id)}
              className={`rounded-full py-3 text-xs font-medium transition active:scale-[0.98] ${
                active ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function MeasurementsCard() {
  const measurements = useWorkoutStore((state) => state.measurements);
  const profile = useWorkoutStore((state) => state.profile);
  const logMeasurement = useWorkoutStore((state) => state.logMeasurement);
  const setProfile = useWorkoutStore((state) => state.setProfile);

  // One draft for the whole card, committed together: people measure everything
  // in one go, so eleven separate save buttons would be eleven taps for one act.
  const [draft, setDraft] = useState<Partial<Record<BodyMetric, string>>>({});
  const [heightDraft, setHeightDraft] = useState("");
  const [savedCount, setSavedCount] = useState(0);

  const weightState = dueState(measurements, ["weight"], profile.weightCadence);
  const tapeState = dueState(measurements, TAPE_METRICS, profile.measurementCadence);
  const dueNow = [
    weightState.due ? "a weigh-in" : null,
    tapeState.due ? "measurements" : null
  ].filter(Boolean);

  const edit = (metric: BodyMetric, value: string) => {
    setDraft((current) => ({ ...current, [metric]: value }));
    setSavedCount(0);
  };

  // A blank field means "not measured today", not zero — which is also why
  // nothing here writes on keystroke. `Number("")` is 0, so a per-keystroke
  // write turns clearing a field into recording a zero.
  const parse = (raw: string | undefined): number | undefined => {
    const value = Number(raw);
    return raw?.trim() && Number.isFinite(value) && value > 0 ? value : undefined;
  };

  const save = () => {
    let written = 0;

    for (const [metric, raw] of Object.entries(draft) as [BodyMetric, string][]) {
      const value = parse(raw);
      if (value !== undefined) {
        logMeasurement(metric, value);
        written += 1;
      }
    }

    const height = parse(heightDraft);
    if (height !== undefined) {
      setProfile({ heightCm: height });
    }

    setDraft({});
    setHeightDraft("");
    setSavedCount(written);
  };

  const pending =
    Object.values(draft).some((value) => value?.trim()) || Boolean(heightDraft.trim());

  return (
    <Card>
      <CardHeader>
        <CardTitle>Body</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {dueNow.length > 0 ? (
          <p className="rounded-2xl bg-warning/15 px-4 py-3 text-sm text-warning">
            Time for {dueNow.join(" and ")}.
          </p>
        ) : null}

        <div className="space-y-3 rounded-3xl bg-secondary/50 p-4">
          <CadencePicker
            label="How often do you weigh in?"
            hint={dueLabel(weightState)}
            value={profile.weightCadence}
            onChange={(weightCadence) => setProfile({ weightCadence })}
          />
          <CadencePicker
            label="How often do you measure?"
            hint={dueLabel(tapeState)}
            value={profile.measurementCadence}
            onChange={(measurementCadence) => setProfile({ measurementCadence })}
          />
          <p className="text-xs text-muted-foreground">
            Checked when you open the app — nothing is sent to your phone. Any one measurement
            counts as measuring, so recording just your chest clears the reminder.
          </p>
        </div>

        <label className="block text-xs text-muted-foreground">
          Height (cm)
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            className="mt-1"
            value={heightDraft}
            placeholder={profile.heightCm ? String(profile.heightCm) : "—"}
            onChange={(event) => {
              setHeightDraft(event.target.value);
              setSavedCount(0);
            }}
          />
        </label>

        <div className="space-y-2">
          {BODY_METRICS.map((item) => {
            const latest = latestFor(measurements, item.id);
            const change = changeFor(measurements, item.id);
            return (
              <div key={item.id} className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{labelFor(item.id)}</p>
                  <p className="font-mono text-xs tabular-nums text-muted-foreground">
                    {latest ? `${latest.value} ${unitFor(item.id)}` : "—"}
                    {change !== undefined
                      ? ` · ${change > 0 ? "+" : ""}${change.toFixed(1)}`
                      : ""}
                  </p>
                </div>
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={0.1}
                  aria-label={`Today's ${labelFor(item.id)} in ${unitFor(item.id)}`}
                  placeholder={unitFor(item.id)}
                  className="w-24 shrink-0"
                  value={draft[item.id] ?? ""}
                  onChange={(event) => edit(item.id, event.target.value)}
                />
              </div>
            );
          })}
        </div>

        <Button className="w-full" onClick={save} disabled={!pending}>
          Save today&apos;s readings
        </Button>
        {savedCount > 0 ? (
          <p className="flex items-center justify-center gap-1.5 text-sm text-success">
            <Check className="h-4 w-4" />
            Saved {savedCount} reading{savedCount === 1 ? "" : "s"}
          </p>
        ) : null}
        <p className="text-center text-xs text-muted-foreground">
          Leave a field blank to skip it. A second reading on the same day replaces the first.
        </p>
      </CardContent>
    </Card>
  );
}

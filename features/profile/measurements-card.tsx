"use client";

import { Check, ChevronDown } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { useWorkoutStore } from "@/features/workout/workout-store";
import {
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

/** The cadence in words, for the closed Reminders row. */
function cadenceLabel(value: MeasurementCadence | undefined) {
  return CADENCES.find((item) => item.id === (value ?? "off"))?.label ?? "Off";
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
      <p className="mb-2 text-xs font-medium text-muted-foreground">
        {label}
        {hint ? <span className="text-foreground"> · {hint}</span> : null}
      </p>
      <Segmented size="sm" options={CADENCES} value={value ?? "off"} onChange={onChange} />
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
  // Null is "untouched", so the field shows the saved height as a value, not
  // as a faint placeholder that reads like an empty field.
  const [heightDraft, setHeightDraft] = useState<string | null>(null);
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

    const height = parse(heightDraft ?? undefined);
    if (height !== undefined) {
      setProfile({ heightCm: height });
    }
    setDraft({});
    setHeightDraft(null);
    setSavedCount(written);
  };

  const pending =
    Object.values(draft).some((value) => value?.trim()) || Boolean(heightDraft?.trim());

  const row = (metric: BodyMetric) => {
    const latest = latestFor(measurements, metric);
    const change = changeFor(measurements, metric);
    return (
      <div key={metric} className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{labelFor(metric)}</p>
          <p className="text-xs tabular-nums text-muted-foreground">
            {latest ? `Last: ${latest.value} ${unitFor(metric)}` : "No reading yet"}
            {change !== undefined ? ` · ${change > 0 ? "+" : ""}${change.toFixed(1)}` : ""}
          </p>
        </div>
        <Input
          type="number"
          inputMode="decimal"
          min={0}
          step={0.1}
          aria-label={`Today's ${labelFor(metric)} in ${unitFor(metric)}`}
          placeholder={unitFor(metric)}
          className="w-24 shrink-0"
          value={draft[metric] ?? ""}
          onChange={(event) => edit(metric, event.target.value)}
        />
      </div>
    );
  };
  const tapeCount = TAPE_METRICS.length;
  const tapeRecorded = TAPE_METRICS.filter((metric) => latestFor(measurements, metric)).length;

  return (
    <section className="space-y-2" data-tour="profile-body">
      <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Body</h2>
      <Card>
        <CardContent className="mt-0 space-y-4">
          {dueNow.length > 0 ? (
            <p className="rounded-lg bg-warning/15 px-4 py-3 text-sm font-medium text-warning">
              It is time for {dueNow.join(" and ")}.
            </p>
          ) : null}

          {/* The weigh-in first: it is the one reading most people take. */}
          {row("weight")}

          <label className="flex items-center gap-3">
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">Height</span>
              <span className="block text-xs text-muted-foreground">
                {profile.heightCm ? "In cm" : "Not set yet"}
              </span>
            </span>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              aria-label="Height in cm"
              placeholder="cm"
              className="w-24 shrink-0"
              value={heightDraft ?? (profile.heightCm ? String(profile.heightCm) : "")}
              onChange={(event) => {
                setHeightDraft(event.target.value);
                setSavedCount(0);
              }}
            />
          </label>

          {/* Eleven tape sites are a monthly job for a few people, not the
              first thing everyone sees. One tap opens them. */}
          <details className="group rounded-xl bg-muted">
            <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
              <span>
                <span className="block text-sm font-semibold">Tape measurements</span>
                <span className="block text-xs text-muted-foreground">
                  {tapeRecorded > 0 ? `${tapeRecorded} of ${tapeCount} recorded` : `${tapeCount} body sites, in cm`}
                </span>
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <div className="space-y-2 px-4 pb-4">{TAPE_METRICS.map((metric) => row(metric))}</div>
          </details>

          <Button className="w-full" onClick={save} disabled={!pending}>
            Save readings
          </Button>
          {savedCount > 0 ? (
            <p className="flex items-center justify-center gap-1.5 text-sm text-success">
              <Check className="h-4 w-4" />
              Saved {savedCount} reading{savedCount === 1 ? "" : "s"}
            </p>
          ) : null}
          <p className="text-center text-xs text-muted-foreground">
            Leave a field blank to skip it.
          </p>

          <details className="group rounded-xl bg-muted">
            <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
              <span>
                <span className="block text-sm font-semibold">Reminders</span>
                <span className="block text-xs text-muted-foreground">
                  Weigh-in: {cadenceLabel(profile.weightCadence)} · Tape: {cadenceLabel(profile.measurementCadence)}
                </span>
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <div className="space-y-3 px-4 pb-4">
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
                Reminders show in the app, not as phone notifications.
              </p>
            </div>
          </details>
        </CardContent>
      </Card>
    </section>
  );
}

"use client";

import { Bell, Ruler, UserRound } from "lucide-react";
import { useEffect, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ListGroup, ListRow, ListSheet, ListSheetRow, SheetDone } from "@/components/ui/list";
import { WarmGradient } from "@/components/ui/progress-arc";
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
import type { BodyMeasurement, BodyMetric, MeasurementCadence, Sex } from "@/lib/types";

/** The Sex control's segments. "unset" is the fourth: not answering is allowed. */
type SexChoice = Sex | "unset";
const SEX_OPTIONS: { id: SexChoice; label: string }[] = [
  { id: "male", label: "Male" },
  { id: "female", label: "Female" },
  { id: "other", label: "Other" },
  { id: "unset", label: "Not set" }
];

/** A plausible year of birth: four digits, not in the future, nobody over 120. */
function parseBirthYear(raw: string | null | undefined, today = new Date()): number | undefined {
  const value = Number(raw);
  const thisYear = today.getFullYear();
  return raw?.trim() && Number.isInteger(value) && value >= thisYear - 120 && value <= thisYear ? value : undefined;
}

// A blank field means "not measured today", not zero — which is also why
// nothing here writes on keystroke. `Number("")` is 0, so a per-keystroke
// write turns clearing a field into recording a zero.
function parseReading(raw: string | null | undefined): number | undefined {
  const value = Number(raw);
  return raw?.trim() && Number.isFinite(value) && value > 0 ? value : undefined;
}

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

/** The cadence in words, for the closed Check-ins row. */
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
      <p className="mb-2 text-[13.5px] font-medium text-muted-foreground">
        {label}
        {hint ? <span className="text-foreground"> · {hint}</span> : null}
      </p>
      <Segmented size="sm" aria-label={label} options={CADENCES} value={value ?? "off"} onChange={onChange} />
    </div>
  );
}

// -- weight today ------------------------------------------------------------------

const TREND_POINTS = 14;
const TREND_WIDTH = 108;
const TREND_HEIGHT = 40;
const TREND_PAD = 6;

/** The last few weigh-ins as one small line. Nothing to draw until there are two. */
function WeightTrend({ measurements }: { measurements: BodyMeasurement[] }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const points = measurements
    .filter((item) => item.metric === "weight")
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-TREND_POINTS);

  if (points.length < 2) {
    return <span className="min-w-0 flex-1" aria-hidden />;
  }

  const values = points.map((point) => point.value);
  const low = Math.min(...values);
  const span = Math.max(...values) - low || 1;
  const xy = values.map((value, index) => [
    TREND_PAD + (index * (TREND_WIDTH - TREND_PAD * 2)) / (values.length - 1),
    TREND_PAD + (TREND_HEIGHT - TREND_PAD * 2) * (1 - (value - low) / span)
  ]);
  const [endX, endY] = xy[xy.length - 1];

  return (
    <svg
      viewBox={`0 0 ${TREND_WIDTH} ${TREND_HEIGHT}`}
      className="h-10 min-w-0 flex-1"
      role="img"
      aria-label={`Your last ${values.length} weigh-ins, from ${values[0]} to ${values[values.length - 1]} kg`}
    >
      <defs>
        <WarmGradient id={id} />
      </defs>
      <path
        d={xy.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ")}
        fill="none"
        stroke={`url(#${id})`}
        strokeWidth="1.8"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={endX.toFixed(1)} cy={endY.toFixed(1)} r="2.6" style={{ fill: "var(--sun)" }} />
    </svg>
  );
}

/**
 * The one reading most people take, so the one form left open on the page. Its
 * Save is the page's only filled button: everything else here is rarely needed.
 */
export function WeightToday() {
  const measurements = useWorkoutStore((state) => state.measurements);
  const cadence = useWorkoutStore((state) => state.profile.weightCadence);
  const logMeasurement = useWorkoutStore((state) => state.logMeasurement);
  const [draft, setDraft] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!saved) {
      return;
    }
    const timer = window.setTimeout(() => setSaved(false), 1600);
    return () => window.clearTimeout(timer);
  }, [saved]);

  const latest = latestFor(measurements, "weight");
  const change = changeFor(measurements, "weight");
  const due = dueState(measurements, ["weight"], cadence).due;
  const value = parseReading(draft);

  return (
    <Card>
      {/* No browser validation: its `step` would refuse a reading like 72.55. */}
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (value !== undefined) {
            logMeasurement("weight", value);
            setDraft("");
            setSaved(true);
          }
        }}
      >
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor="weight-today" className="text-[15.5px] font-medium">
            Weight today
          </label>
          <span className="text-[13.5px] tabular-nums text-muted-foreground">
            {latest ? `Last ${latest.value} kg` : "No reading yet"}
            {change !== undefined ? ` · ${change > 0 ? "+" : ""}${change.toFixed(1)}` : ""}
          </span>
        </div>
        {due ? <p className="mt-1 text-[13px] font-medium text-warning">It is time for a weigh-in.</p> : null}
        <div className="mt-1.5 flex items-center gap-2">
          <span className="flex shrink-0 items-baseline gap-1">
            {/* A bare number, not a boxed field: a box here would be a box in a box. */}
            <input
              id="weight-today"
              type="number"
              inputMode="decimal"
              min={0}
              step={0.1}
              enterKeyHint="done"
              autoCorrect="off"
              spellCheck={false}
              placeholder={latest ? String(latest.value) : "0.0"}
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                setSaved(false);
              }}
              className="w-[4.75rem] rounded-md bg-transparent text-[32px] font-medium tabular-nums tracking-[-0.03em] outline-none placeholder:text-muted-foreground/50 focus-visible:ring-2 focus-visible:ring-ring"
            />
            <span className="text-sm text-muted-foreground">kg</span>
          </span>
          <WeightTrend measurements={measurements} />
          <Button type="submit" size="sm" disabled={value === undefined} className="h-11 w-[76px] shrink-0 px-0">
            {saved ? "Saved" : "Save"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

// -- body ---------------------------------------------------------------------------

/** Left and right of the same place share a row: fewer rows to scroll, easier to compare. */
const TAPE_PAIRS: { label: string; left: BodyMetric; right: BodyMetric }[] = [
  { label: "Arm", left: "armL", right: "armR" },
  { label: "Thigh", left: "thighL", right: "thighR" },
  { label: "Calf", left: "calfL", right: "calfR" }
];

/** Anything not paired. Worked out, so a new site can never be left off the sheet. */
const TAPE_SINGLES = TAPE_METRICS.filter((metric) =>
  TAPE_PAIRS.every((pair) => pair.left !== metric && pair.right !== metric)
);

/**
 * Eleven tape sites are a monthly job for a few people, not the first thing
 * everyone sees. The draft lives on the row, not in the sheet, so closing the
 * sheet by accident keeps what was typed.
 */
function TapeRow() {
  const measurements = useWorkoutStore((state) => state.measurements);
  const cadence = useWorkoutStore((state) => state.profile.measurementCadence);
  const logMeasurement = useWorkoutStore((state) => state.logMeasurement);
  const [open, setOpen] = useState(false);
  // One draft for the whole sheet, committed together: people measure everything
  // in one go, so eleven separate save buttons would be eleven taps for one act.
  const [draft, setDraft] = useState<Partial<Record<BodyMetric, string>>>({});
  const [savedCount, setSavedCount] = useState(0);

  const recorded = TAPE_METRICS.filter((metric) => latestFor(measurements, metric)).length;
  const pending = Object.values(draft).some((value) => value?.trim());
  const due = dueState(measurements, TAPE_METRICS, cadence).due;

  const save = () => {
    let written = 0;
    for (const [metric, raw] of Object.entries(draft) as [BodyMetric, string][]) {
      const value = parseReading(raw);
      if (value !== undefined) {
        logMeasurement(metric, value);
        written += 1;
      }
    }
    setDraft({});
    setSavedCount(written);
    setOpen(false);
  };

  const field = (metric: BodyMetric, className: string) => {
    const latest = latestFor(measurements, metric);
    return (
      <Input
        type="number"
        inputMode="decimal"
        min={0}
        step={0.1}
        aria-label={`Today's ${labelFor(metric)} in ${unitFor(metric)}`}
        placeholder={latest ? String(latest.value) : "—"}
        className={`h-10 px-2.5 text-right placeholder:text-muted-foreground/60 ${className}`}
        value={draft[metric] ?? ""}
        onChange={(event) => {
          const { value } = event.target;
          setDraft((current) => ({ ...current, [metric]: value }));
          setSavedCount(0);
        }}
      />
    );
  };

  return (
    <>
      <ListRow
        icon={Ruler}
        label="Tape measurements"
        hint={
          pending ? (
            <span className="text-warning">Not saved yet</span>
          ) : savedCount > 0 ? (
            <span className="text-success">
              Saved {savedCount} reading{savedCount === 1 ? "" : "s"}
            </span>
          ) : undefined
        }
        value={due ? <span className="font-medium text-warning">Due</span> : recorded > 0 ? `${recorded} of ${TAPE_METRICS.length}` : `${TAPE_METRICS.length} sites`}
        onClick={() => setOpen(true)}
      />
      <ListSheet
        open={open}
        onOpenChange={setOpen}
        title="Tape measurements"
        description="In cm. The faint number is your last reading. Leave a field blank to skip it."
      >
        <div className="divide-y divide-sep">
          {TAPE_SINGLES.map((metric) => (
            <label key={metric} className="flex min-h-[52px] items-center justify-between gap-3 py-1.5">
              <span className="text-[15.5px] font-medium">{labelFor(metric)}</span>
              {field(metric, "w-24 shrink-0")}
            </label>
          ))}
        </div>
        <div className="mt-3">
          <div className="grid grid-cols-[minmax(0,1fr)_5.5rem_5.5rem] gap-2 pb-1 text-[12.5px] text-muted-foreground">
            <span />
            <span className="pr-2.5 text-right">Left</span>
            <span className="pr-2.5 text-right">Right</span>
          </div>
          <div className="divide-y divide-sep border-t border-sep">
            {TAPE_PAIRS.map((pair) => (
              <div key={pair.label} className="grid min-h-[52px] grid-cols-[minmax(0,1fr)_5.5rem_5.5rem] items-center gap-2 py-1.5">
                <span className="text-[15.5px] font-medium">{pair.label}</span>
                {field(pair.left, "w-full")}
                {field(pair.right, "w-full")}
              </div>
            ))}
          </div>
        </div>
        <Button className="mt-4 w-full" disabled={!pending} onClick={save}>
          Save readings
        </Button>
      </ListSheet>
    </>
  );
}

/**
 * Three facts: height, and the two the formulas on Progress need and nothing
 * else reads. Most people set them once. Height and the year are typed, so they
 * go through Save; sex is a control, so it writes on tap like the cadences.
 */
function AboutRow() {
  const profile = useWorkoutStore((state) => state.profile);
  const setProfile = useWorkoutStore((state) => state.setProfile);
  const [open, setOpen] = useState(false);
  // Null is "untouched", so a field shows the saved value as a value, not as a
  // faint placeholder that reads like an empty field.
  const [heightDraft, setHeightDraft] = useState<string | null>(null);
  const [birthDraft, setBirthDraft] = useState<string | null>(null);

  const sexLabel = profile.sex ? SEX_OPTIONS.find((option) => option.id === profile.sex)?.label : undefined;
  const facts = [profile.heightCm ? `${profile.heightCm} cm` : undefined, profile.birthYear, sexLabel].filter(Boolean);

  const pending = Boolean(heightDraft?.trim()) || Boolean(birthDraft?.trim());
  const birthYear = parseBirthYear(birthDraft);
  const birthWrong = Boolean(birthDraft?.trim()) && birthYear === undefined;

  const finish = () => {
    const height = parseReading(heightDraft);
    if (height !== undefined) {
      setProfile({ heightCm: height });
    }
    if (birthYear !== undefined) {
      setProfile({ birthYear });
    }
    setHeightDraft(null);
    setBirthDraft(null);
    setOpen(false);
  };

  return (
    <>
      <ListRow icon={UserRound} label="About you" value={facts.length > 0 ? facts.join(" · ") : "Not set"} onClick={() => setOpen(true)} />
      <ListSheet
        open={open}
        onOpenChange={setOpen}
        title="About you"
        description="Used for body-fat, strength standards and calories on Progress. Nothing else."
      >
        <div className="space-y-4">
          <label className="block">
            <span className="text-[13.5px] font-medium text-muted-foreground">Height (cm)</span>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              className="mt-2"
              placeholder="cm"
              value={heightDraft ?? (profile.heightCm ? String(profile.heightCm) : "")}
              onChange={(event) => setHeightDraft(event.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-[13.5px] font-medium text-muted-foreground">Year of birth</span>
            <Input
              type="number"
              inputMode="numeric"
              min={1900}
              max={new Date().getFullYear()}
              className="mt-2"
              placeholder="YYYY"
              aria-invalid={birthWrong}
              value={birthDraft ?? (profile.birthYear ? String(profile.birthYear) : "")}
              onChange={(event) => setBirthDraft(event.target.value)}
            />
            {birthWrong ? <span className="mt-1.5 block text-[13px] text-danger">Enter a year like 1994.</span> : null}
          </label>
          <div>
            <p className="mb-2 text-[13.5px] font-medium text-muted-foreground">Sex</p>
            <Segmented
              size="sm"
              aria-label="Sex"
              options={SEX_OPTIONS}
              value={profile.sex ?? "unset"}
              onChange={(next) => setProfile({ sex: next === "unset" ? undefined : next })}
            />
          </div>
        </div>
        <Button className="mt-5 w-full" disabled={birthWrong} onClick={finish}>
          {pending ? "Save" : "Done"}
        </Button>
      </ListSheet>
    </>
  );
}

/** How often to weigh in and measure. Not called Reminders: the phone's reminders are another row. */
function CheckInsRow() {
  const measurements = useWorkoutStore((state) => state.measurements);
  const profile = useWorkoutStore((state) => state.profile);
  const setProfile = useWorkoutStore((state) => state.setProfile);
  const weightState = dueState(measurements, ["weight"], profile.weightCadence);
  const tapeState = dueState(measurements, TAPE_METRICS, profile.measurementCadence);

  return (
    <ListSheetRow
      icon={Bell}
      label="Check-ins"
      value={
        (profile.weightCadence ?? "off") === "off" && (profile.measurementCadence ?? "off") === "off"
          ? "Off"
          : `${cadenceLabel(profile.weightCadence)} · ${cadenceLabel(profile.measurementCadence)}`
      }
      description="Reminders show in the app, not as phone notifications."
    >
      <div className="space-y-4">
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
      </div>
      <SheetDone />
    </ListSheetRow>
  );
}

/** The goal comes in from the page: it is the workout's or the diet's, depending on the side. */
export function BodyGroup({ goal }: { goal: React.ReactNode }) {
  return (
    <ListGroup title="Body">
      {goal}
      <TapeRow />
      <AboutRow />
      <CheckInsRow />
    </ListGroup>
  );
}

"use client";

import { Target } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ListSheetRow } from "@/components/ui/list";
import { useDietStore } from "@/features/diet/diet-store";
import type { DietSettings } from "@/lib/diet-types";
import { useWorkoutStore } from "@/features/workout/workout-store";
import { buildComposition } from "@/lib/body-composition";
import { suggestLeanGoal, trainingMonths } from "@/lib/diet-body-goal";
import { PROTEIN_G_PER_KG } from "@/lib/energy";
import { earliestLogDate } from "@/lib/progress-metrics";

const SUGGESTED_G_PER_KG = 1.8;

/** Empty clears a target. Kept as text until Save, because `Number("")` is 0 and 0 is no target at all. */
function parseTarget(text: string): number | undefined {
  const value = Number(text);
  return text.trim() && Number.isFinite(value) && value > 0 ? Math.round(value) : undefined;
}

const BODY_FIELDS: { key: keyof DietSettings; label: string; placeholder: string }[] = [
  { key: "leanGoalKg", label: "Lean mass goal (kg)", placeholder: "70" },
  { key: "bodyFatGoalPercent", label: "Body fat goal (%)", placeholder: "15" }
];

const FIELDS: { key: keyof DietSettings; label: string; placeholder: string }[] = [
  { key: "kcalTarget", label: "Calories a day", placeholder: "2200" },
  { key: "proteinTargetG", label: "Protein a day (g)", placeholder: "130" },
  { key: "carbsTargetG", label: "Carbs a day (g)", placeholder: "250" },
  { key: "fatTargetG", label: "Fat a day (g)", placeholder: "65" }
];

/** The row on You, on the Diet side, where the workout side has its goal weight. */
export function DietTargetsRow() {
  const kcal = useDietStore((state) => state.settings.kcalTarget);
  return (
    <ListSheetRow icon={Target} label="Diet targets" value={kcal ? `${kcal} kcal` : "Not set"}>
      {(close) => <DietTargetsForm onDone={close} />}
    </ListSheetRow>
  );
}

/** The daily targets. They only draw lines and fill bars: nothing is enforced. */
function DietTargetsForm({ onDone }: { onDone: () => void }) {
  const settings = useDietStore((state) => state.settings);
  const setDietSettings = useDietStore((state) => state.setDietSettings);
  const weightKg = useWorkoutStore((state) => state.profile.weightKg);
  const measurements = useWorkoutStore((state) => state.measurements);
  const profile = useWorkoutStore((state) => state.profile);
  const logs = useWorkoutStore((state) => state.logs);
  const today = useDietStore((state) => state.activeDate);
  const [draft, setDraft] = useState<Record<keyof DietSettings, string>>(
    () =>
      Object.fromEntries(
        [...FIELDS, ...BODY_FIELDS].map(({ key }) => [key, settings[key] ? String(settings[key]) : ""])
      ) as Record<keyof DietSettings, string>
  );

  const suggestion = weightKg > 0 ? Math.round(weightKg * SUGGESTED_G_PER_KG) : undefined;
  const dirty = [...FIELDS, ...BODY_FIELDS].some((field) => parseTarget(draft[field.key]) !== settings[field.key]);

  // Worked out from the user's own tape, weight and training history.
  const composition = useMemo(() => buildComposition(measurements, profile), [measurements, profile]);
  const suggested = useMemo(
    () =>
      composition
        ? suggestLeanGoal({
            composition,
            weightKg: profile.weightKg,
            heightCm: profile.heightCm,
            sex: profile.sex,
            months: trainingMonths(earliestLogDate(logs), today)
          })
        : undefined,
    [composition, logs, profile, today]
  );

  const field = ({ key, label, placeholder }: (typeof FIELDS)[number]) => (
    <label key={key} className="block text-xs font-medium text-muted-foreground">
      {label}
      <Input
        className="mt-1"
        type="number"
        inputMode="numeric"
        min={0}
        placeholder={key === "proteinTargetG" && suggestion ? String(suggestion) : key === "leanGoalKg" && suggested ? String(suggested.leanKg) : placeholder}
        value={draft[key]}
        onChange={(event) => {
          const { value } = event.target;
          setDraft((current) => ({ ...current, [key]: value }));
        }}
      />
    </label>
  );

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {suggestion
          ? `Lifters often aim for ${PROTEIN_G_PER_KG.low} to ${PROTEIN_G_PER_KG.high} g of protein per kg. At your weight, ${suggestion} g is a fair start.`
          : `Lifters often aim for ${PROTEIN_G_PER_KG.low} to ${PROTEIN_G_PER_KG.high} g of protein per kg of bodyweight.`}
      </p>
      <div className="grid grid-cols-2 gap-3">{FIELDS.map(field)}</div>

      <div className="border-t border-sep pt-3">
        <p className="text-sm font-semibold">Body goal</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Weight alone counts muscle and fat together. Set the lean mass you want, how lean you want to be, or both. Body goals on Intake then
          shows your roadmap. Lean mass is everything except fat, so it includes muscle, bone and water.
        </p>
        <div className="mt-2 grid grid-cols-2 gap-3">{BODY_FIELDS.map(field)}</div>
        {composition && suggested ? (
          <p className="mt-2 text-xs text-muted-foreground">
            You are about {composition.leanMassKg.toFixed(1)} kg lean at {composition.bodyFatPercent.toFixed(0)} % body fat.{" "}
            {suggested.capped
              ? `${suggested.leanKg} kg is near the natural limit for your height.`
              : `A year of training could add about ${suggested.kgPerYear} kg, so ${suggested.leanKg} kg is a fair goal.`}{" "}
            <button
              type="button"
              className="font-semibold text-brand"
              onClick={() => setDraft((current) => ({ ...current, leanGoalKg: String(suggested.leanKg) }))}
            >
              Use {suggested.leanKg} kg
            </button>
          </p>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">Add your sex, height, waist and neck on You, and the app works out your lean mass and a fair goal.</p>
        )}
      </div>

      <Button
        className="w-full"
        onClick={() => {
          if (dirty) {
            setDietSettings({
              kcalTarget: parseTarget(draft.kcalTarget),
              proteinTargetG: parseTarget(draft.proteinTargetG),
              carbsTargetG: parseTarget(draft.carbsTargetG),
              fatTargetG: parseTarget(draft.fatTargetG),
              leanGoalKg: parseTarget(draft.leanGoalKg),
              bodyFatGoalPercent: parseTarget(draft.bodyFatGoalPercent)
            });
          }
          onDone();
        }}
      >
        {dirty ? "Save targets" : "Done"}
      </Button>
    </div>
  );
}

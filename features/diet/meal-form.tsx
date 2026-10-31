"use client";

import { BookOpen, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { SHEET_FOOT } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ListRow, SheetRows } from "@/components/ui/list";
import { NumberInput } from "@/components/ui/number-input";
import { ThemedSelect } from "@/components/ui/select";
import { FoodPicker } from "@/features/diet/food-picker";
import type { Meal, MealIngredient } from "@/lib/diet-types";
import { ingredientFromFood, rescaleIngredient, totalsFromIngredients } from "@/lib/foods";
import { cn } from "@/lib/utils";

export type MealDraft = Omit<Meal, "id">;

export const EMPTY_MEAL: MealDraft = { name: "", kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, costInr: 0 };

/** Calories and cost, then the three macros under them, filling both rows. */
const NUMBER_FIELDS: { key: "kcal" | "proteinG" | "carbsG" | "fatG" | "costInr"; label: string; span: string }[] = [
  { key: "kcal", label: "Calories (kcal)", span: "col-span-3" },
  { key: "costInr", label: "Cost (₹)", span: "col-span-3" },
  { key: "proteinG", label: "Protein (g)", span: "col-span-2" },
  { key: "carbsG", label: "Carbs (g)", span: "col-span-2" },
  { key: "fatG", label: "Fat (g)", span: "col-span-2" }
];

/** Fields are typed as text and can pass through odd values: nothing negative or broken is saved. */
function clean(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * The one place a meal's numbers are entered: built from foods in the library,
 * typed by hand, or copied from a saved meal. Foods also bring micronutrients, so
 * a typed meal counts as "unknown" for those. Cost is always the user's, because
 * no library knows what their shop charges.
 */
export function MealForm({
  initial = EMPTY_MEAL,
  savedMeals,
  submitLabel,
  onSubmit,
  onLibraryChange,
  onDelete,
  deleteLabel,
  children
}: {
  initial?: MealDraft;
  /** Offered as a shortcut, for an extra meal that has been eaten before. */
  savedMeals?: Meal[];
  submitLabel: string;
  /** Returns an error to show under the name, or nothing when it was saved. */
  onSubmit: (draft: MealDraft) => string | undefined;
  /** So the dialog can hide its own ✕ while the library's Back is showing. */
  onLibraryChange?: (open: boolean) => void;
  /** The rare one: the last thing in the sheet, and it can be undone. */
  onDelete?: () => void;
  deleteLabel?: string;
  /** Extra fields, such as the time on Today. */
  children?: React.ReactNode;
}) {
  const [draft, setDraft] = useState<MealDraft>(initial);
  const [library, setLibrary] = useState(false);
  const [error, setError] = useState<string>();
  // Remounts the number fields when foods change the numbers underneath them.
  const [revision, setRevision] = useState(0);

  const setFoods = (ingredients: MealIngredient[], name?: string) => {
    setDraft((current) => {
      const { foodId: _foodId, grams: _grams, ...rest } = current;
      return {
        ...rest,
        ...(name ? { name } : {}),
        ...(ingredients.length > 0 ? totalsFromIngredients(ingredients) : { micros: undefined }),
        ingredients: ingredients.length > 0 ? ingredients : undefined
      };
    });
    setRevision((value) => value + 1);
  };

  const showLibrary = (open: boolean) => {
    setLibrary(open);
    onLibraryChange?.(open);
  };

  if (library) {
    return (
      <FoodPicker
        onBack={() => showLibrary(false)}
        onPick={(food, grams) => {
          // The name and price already typed stay. A first food names the meal.
          setFoods([...(draft.ingredients ?? []), ingredientFromFood(food, grams)], draft.name.trim() ? undefined : food.name);
          setError(undefined);
          showLibrary(false);
        }}
      />
    );
  }

  const save = () => {
    const name = draft.name.trim();
    if (!name) {
      setError("Type a name for this meal.");
      return;
    }
    setError(
      onSubmit({
        ...draft,
        name,
        kcal: Math.round(clean(draft.kcal)),
        proteinG: clean(draft.proteinG),
        carbsG: clean(draft.carbsG),
        fatG: clean(draft.fatG),
        costInr: clean(draft.costInr)
      })
    );
  };

  const foods = draft.ingredients ?? [];

  return (
    <div className="space-y-4">
      {savedMeals && savedMeals.length > 0 ? (
        <ThemedSelect
          aria-label="Use a saved meal"
          value=""
          onValueChange={(id) => {
            const meal = savedMeals.find((item) => item.id === id);
            if (meal) {
              const { id: _id, ...rest } = meal;
              setDraft(rest);
              setRevision((value) => value + 1);
              setError(undefined);
            }
          }}
          options={[
            { value: "", label: "Use a saved meal" },
            ...savedMeals.map((meal) => ({ value: meal.id, label: meal.name }))
          ]}
        />
      ) : null}
      <SheetRows>
        {foods.map((item, index) => (
          <div key={`${item.foodId}-${index}`} className="list-row flex min-h-[54px] items-center gap-2 py-1.5 pl-4 pr-1.5">
            <span className="min-w-0 flex-1 text-[15px]">{item.name}</span>
            <NumberInput
              aria-label={`Grams of ${item.name}`}
              className="h-10 w-[72px] shrink-0 px-3"
              min={1}
              value={item.grams}
              onValueChange={(grams) => setFoods(foods.map((other, position) => (position === index ? rescaleIngredient(other, grams) : other)))}
            />
            <span className="shrink-0 text-[13px] text-muted-foreground">g</span>
            <button
              type="button"
              aria-label={`Remove ${item.name}`}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors active:bg-hi"
              onClick={() => setFoods(foods.filter((_, position) => position !== index))}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
        <ListRow
          icon={BookOpen}
          label="Add a food from the library"
          hint={foods.length > 0 ? undefined : "Foods also bring micronutrients. A meal you only type counts as unknown for those."}
          onClick={() => showLibrary(true)}
        />
      </SheetRows>
      <label className="block text-xs font-medium text-muted-foreground">
        Name
        <Input
          className="mt-1"
          placeholder="Oats with milk"
          autoCapitalize="sentences"
          value={draft.name}
          onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
        />
        {error ? <span className="mt-1 block text-sm text-danger">{error}</span> : null}
      </label>
      {children}
      <div className="grid grid-cols-6 gap-3">
        {NUMBER_FIELDS.map((field) => (
          <label key={field.key} className={cn("block text-xs font-medium text-muted-foreground", field.span)}>
            {field.label}
            <NumberInput
              // Remounts when the library fills the form, so the new number shows.
              key={`${field.key}-${revision}`}
              className="mt-1"
              min={0}
              value={draft[field.key]}
              onValueChange={(value) => setDraft((current) => ({ ...current, [field.key]: value }))}
            />
          </label>
        ))}
      </div>
      {onDelete ? (
        <button
          type="button"
          className="h-11 w-full rounded-full text-sm font-medium text-muted-foreground transition-colors active:bg-hi"
          onClick={onDelete}
        >
          {deleteLabel}
        </button>
      ) : null}
      {/* Sticky: a meal of several foods puts the save a long scroll away. */}
      <div className={SHEET_FOOT}>
        <Button className="w-full" onClick={save}>
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}

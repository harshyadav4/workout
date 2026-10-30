"use client";

import { ChevronLeft } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { ThemedSelect } from "@/components/ui/select";
import { foodGroups, loadFoods, mealFromFood, searchFoods, type Food } from "@/lib/foods";

const RESULT_LIMIT = 40;

/**
 * The food library, as a view inside a dialog: the twin of ExercisePicker. Pick
 * a food, say how much, and the meal form fills in. The values are for the raw
 * food, so it says so: 100 g of rice weighs far more once cooked.
 */
export function FoodPicker({
  onBack,
  onPick
}: {
  onBack: () => void;
  onPick: (food: Food, grams: number) => void;
}) {
  const [list, setList] = useState<Food[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("");
  const [chosen, setChosen] = useState<Food | null>(null);
  const [grams, setGrams] = useState(100);

  useEffect(() => {
    let active = true;
    loadFoods()
      .then((data) => {
        if (active) {
          setList(data);
          setStatus("ready");
        }
      })
      .catch(() => {
        if (active) {
          setStatus("error");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const groups = useMemo(() => foodGroups(list).sort(), [list]);
  const results = useMemo(() => searchFoods(list, query, group || undefined), [list, query, group]);

  if (chosen) {
    const scaled = mealFromFood(chosen, grams);
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setChosen(null)}
            aria-label="Back to the food list"
            className="key-quiet flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <DialogTitle className="truncate">{chosen.name}</DialogTitle>
            <DialogDescription>Values are for the raw food.</DialogDescription>
          </div>
        </div>
        <label className="block text-xs font-medium text-muted-foreground">
          Weight in grams
          <NumberInput className="mt-1" min={1} value={grams} onValueChange={setGrams} />
        </label>
        <p className="rounded-xl bg-muted p-3 text-sm tabular-nums">
          {scaled.kcal} kcal · {scaled.proteinG} g protein · {scaled.carbsG} g carbs · {scaled.fatG} g fat
        </p>
        <Button className="w-full" disabled={grams <= 0} onClick={() => onPick(chosen, grams)}>
          Use this food
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to the meal"
          className="key-quiet flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div>
          <DialogTitle>Food library</DialogTitle>
          <DialogDescription>Indian Food Composition Tables 2017. Per 100 g, raw.</DialogDescription>
        </div>
      </div>
      <Input
        placeholder="Search: rice, paneer, egg"
        autoCapitalize="none"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <ThemedSelect
        aria-label="Food group"
        value={group}
        onValueChange={setGroup}
        options={[{ value: "", label: "All food groups" }, ...groups.map((value) => ({ value, label: value }))]}
      />
      {status === "error" ? (
        <p className="text-sm text-danger">The food list did not load. Check your connection.</p>
      ) : status === "loading" ? (
        <p className="py-4 text-center text-sm text-muted-foreground">Loading foods…</p>
      ) : results.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">No food matches. You can type the numbers yourself.</p>
      ) : (
        <ul className="space-y-1.5">
          {results.slice(0, RESULT_LIMIT).map((food) => (
            <li key={food.id}>
              <button
                type="button"
                onClick={() => {
                  setGrams(100);
                  setChosen(food);
                }}
                className="w-full rounded-lg bg-muted px-3 py-2.5 text-left active:bg-secondary"
              >
                <span className="block text-sm font-semibold">{food.name}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground tabular-nums">
                  {food.kcal} kcal · {food.proteinG} g protein · {food.carbsG} g carbs · {food.fatG} g fat
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {results.length > RESULT_LIMIT ? (
        <p className="text-center text-xs text-muted-foreground">
          Showing {RESULT_LIMIT} of {results.length}. Search to narrow it.
        </p>
      ) : null}
    </div>
  );
}

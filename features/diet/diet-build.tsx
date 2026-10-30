"use client";

import { ChevronLeft, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ThemedSelect } from "@/components/ui/select";
import { SwipeRow } from "@/components/ui/swipe-row";
import { usePendingRemoval } from "@/components/ui/use-pending-removal";
import { DietAiImportSheet } from "@/features/diet/diet-ai-import";
import { useDietStore } from "@/features/diet/diet-store";
import { EMPTY_MEAL, MealForm, type MealDraft } from "@/features/diet/meal-form";
import { MealNumbers } from "@/features/diet/meal-numbers";
import type { Meal, MealPlan } from "@/lib/diet-types";
import { formatMealTime, itemFromMeal, summarizeItems } from "@/lib/meal-schedule";

/** Where a new row lands, by how many are already there: breakfast, lunch, snack, dinner. */
const DEFAULT_TIMES = ["08:30", "13:30", "17:30", "20:30"];

interface PlanRow {
  /** The plan item's id when editing, which is what keeps today's ticks. */
  id: string;
  mealId: string;
  time: string;
}

const TAKEN = "You already have one with this name.";

/** The twin of PlanBuild: make meals, group them into a day's plan, or have an AI do it. */
export function DietBuild() {
  const meals = useDietStore((state) => state.meals);
  const mealPlans = useDietStore((state) => state.mealPlans);
  const addMeal = useDietStore((state) => state.addMeal);
  const updateMeal = useDietStore((state) => state.updateMeal);
  const deleteMeal = useDietStore((state) => state.deleteMeal);
  const createMealPlan = useDietStore((state) => state.createMealPlan);
  const updateMealPlan = useDietStore((state) => state.updateMealPlan);
  const deleteMealPlan = useDietStore((state) => state.deleteMealPlan);
  const removal = usePendingRemoval();

  const [aiOpen, setAiOpen] = useState(false);

  // -- the meal dialog
  const [mealOpen, setMealOpen] = useState(false);
  const [editingMeal, setEditingMeal] = useState<Meal | null>(null);
  const [mealLibrary, setMealLibrary] = useState(false);

  const openNewMeal = () => {
    setEditingMeal(null);
    setMealLibrary(false);
    setMealOpen(true);
  };

  const saveMeal = (draft: MealDraft) => {
    const saved = editingMeal
      ? updateMeal(editingMeal.id, { ...draft, id: editingMeal.id })
      : addMeal({ ...draft, id: crypto.randomUUID() });
    if (!saved) {
      return TAKEN;
    }
    setMealOpen(false);
    return undefined;
  };

  // -- the plan dialog
  const [planOpen, setPlanOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<MealPlan | null>(null);
  const [planName, setPlanName] = useState("");
  const [rows, setRows] = useState<PlanRow[]>([]);
  const [planError, setPlanError] = useState<string>();
  const [newMealInPlan, setNewMealInPlan] = useState(false);
  const [planLibrary, setPlanLibrary] = useState(false);

  const addRow = (mealId: string) =>
    setRows((current) => [
      ...current,
      { id: crypto.randomUUID(), mealId, time: DEFAULT_TIMES[current.length] ?? "20:30" }
    ]);

  const openNewPlan = () => {
    setEditingPlan(null);
    setPlanName("");
    setRows([]);
    setPlanError(undefined);
    setNewMealInPlan(false);
    setPlanOpen(true);
  };

  const openEditPlan = (plan: MealPlan) => {
    setEditingPlan(plan);
    setPlanName(plan.name);
    setRows(plan.items.map((item) => ({ id: item.id, mealId: item.mealId, time: item.time })));
    setPlanError(undefined);
    setNewMealInPlan(false);
    setPlanOpen(true);
  };

  /**
   * The numbers come from the meal as it is now, so editing a plan is how a new
   * price reaches it. A meal since deleted keeps the numbers the plan had.
   */
  const builtItems = useMemo(
    () =>
      rows.flatMap((row) => {
        const meal = meals.find((item) => item.id === row.mealId);
        const previous = editingPlan?.items.find((item) => item.id === row.id);
        if (meal) {
          return [{ ...itemFromMeal(meal, row.time), id: row.id }];
        }
        return previous ? [{ ...previous, time: row.time }] : [];
      }),
    [editingPlan, meals, rows]
  );
  const planTotals = summarizeItems(builtItems);

  const savePlan = () => {
    const name = planName.trim();
    if (!name) {
      setPlanError("Type a name for this plan.");
      return;
    }
    if (builtItems.length === 0) {
      setPlanError("Add at least one meal.");
      return;
    }
    if (rows.some((row) => !/^\d{2}:\d{2}$/.test(row.time))) {
      setPlanError("Give every meal a time.");
      return;
    }
    const plan: MealPlan = { id: editingPlan?.id ?? crypto.randomUUID(), name, items: builtItems, summary: planTotals };
    const saved = editingPlan ? updateMealPlan(editingPlan.id, plan) : createMealPlan(plan);
    if (!saved) {
      setPlanError(TAKEN);
      return;
    }
    setPlanOpen(false);
  };

  const mealOptions = meals.map((meal) => ({ value: meal.id, label: meal.name }));
  const shownMeals = meals.filter((meal) => !removal.hidden.has(meal.id));
  const shownPlans = mealPlans.filter((plan) => !removal.hidden.has(plan.id));

  return (
    <div className="space-y-4">
      <Card data-tour="diet-plan-build">
        <div className="space-y-2">
          {meals.length === 0 && mealPlans.length === 0 ? (
            <div className="pb-3">
              <h2 className="font-display text-[28px] font-extrabold leading-[1.1] tracking-tight">
                Plan your food once. Use it every day.
              </h2>
              <p className="mt-3 text-sm text-muted-foreground">
                Add your meals, group them into a day, then put that day on your calendar.
              </p>
            </div>
          ) : null}
          <Button size="lg" className="w-full" onClick={openNewPlan}>
            <Plus className="h-5 w-5" strokeWidth={2.5} />
            Add meal plan
          </Button>
          <Button variant="secondary" className="w-full" onClick={openNewMeal}>
            <Plus className="h-4 w-4" />
            Add meal
          </Button>
          <Button variant="secondary" className="w-full" onClick={() => setAiOpen(true)}>
            <Sparkles className="h-4 w-4 text-brand" />
            Build with AI
          </Button>
        </div>
      </Card>

      {shownPlans.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Your meal plans</CardTitle>
            <CardDescription>Put them on days in Schedule.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {shownPlans.map((plan) => {
              const remove = () => removal.remove(plan.id, `${plan.name} deleted`, () => deleteMealPlan(plan.id));
              return (
                <SwipeRow key={plan.id} className="rounded-xl" onDelete={remove}>
                  <div className="rounded-xl bg-muted p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="min-w-0 truncate font-display text-xl font-bold tracking-tight">{plan.name}</p>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          aria-label={`Edit ${plan.name}`}
                          className="key-quiet flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground"
                          onClick={() => openEditPlan(plan)}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete ${plan.name}`}
                          className="key-quiet flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground"
                          onClick={remove}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <MealNumbers totals={plan.summary} className="mt-1" />
                    <ul className="mt-3 space-y-1.5">
                      {plan.items.map((item) => (
                        <li key={item.id} className="flex items-baseline justify-between gap-3 text-sm">
                          <span className="min-w-0">{item.name}</span>
                          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{formatMealTime(item.time)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </SwipeRow>
              );
            })}
          </CardContent>
        </Card>
      ) : null}

      {shownMeals.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Your meals</CardTitle>
            <CardDescription>Editing a meal changes a plan when you next save that plan.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {shownMeals.map((meal) => {
              const remove = () => removal.remove(meal.id, `${meal.name} deleted`, () => deleteMeal(meal.id));
              return (
                <SwipeRow key={meal.id} className="rounded-xl" onDelete={remove}>
                  <div className="flex items-center justify-between gap-3 rounded-xl bg-muted py-2.5 pl-4 pr-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{meal.name}</p>
                      <MealNumbers totals={meal} className="mt-0.5" />
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        aria-label={`Edit ${meal.name}`}
                        className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground active:bg-secondary"
                        onClick={() => {
                          setEditingMeal(meal);
                          setMealLibrary(false);
                          setMealOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${meal.name}`}
                        className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground active:bg-secondary"
                        onClick={remove}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </SwipeRow>
              );
            })}
          </CardContent>
        </Card>
      ) : null}

      {/* The meal dialog. Remounted per meal, so the form starts from that meal. */}
      <Dialog open={mealOpen} onOpenChange={setMealOpen}>
        <DialogContent className="max-h-[88dvh] overflow-y-auto" hideClose={mealLibrary}>
          {mealLibrary ? null : (
            <DialogHeader>
              <DialogTitle>{editingMeal ? "Edit meal" : "Add meal"}</DialogTitle>
              <DialogDescription>Add foods from the library, or type the numbers. Add the cost for one serving.</DialogDescription>
            </DialogHeader>
          )}
          <MealForm
            key={editingMeal?.id ?? "new"}
            initial={editingMeal ?? EMPTY_MEAL}
            submitLabel="Save meal"
            onSubmit={saveMeal}
            onLibraryChange={setMealLibrary}
          />
        </DialogContent>
      </Dialog>

      {/* The plan dialog. A new meal swaps in place, not as a second dialog. */}
      <Dialog open={planOpen} onOpenChange={setPlanOpen}>
        <DialogContent className="max-h-[88dvh] overflow-y-auto" hideClose={newMealInPlan}>
          {newMealInPlan ? (
            <div className="space-y-4">
              {planLibrary ? null : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label="Back to the plan"
                    className="key-quiet flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
                    onClick={() => setNewMealInPlan(false)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <div>
                    <DialogTitle>New meal</DialogTitle>
                    <DialogDescription>It is saved to your meals and added to this plan.</DialogDescription>
                  </div>
                </div>
              )}
              <MealForm
                submitLabel="Add to plan"
                onLibraryChange={setPlanLibrary}
                onSubmit={(draft) => {
                  const id = crypto.randomUUID();
                  if (!addMeal({ ...draft, id })) {
                    return TAKEN;
                  }
                  addRow(id);
                  setNewMealInPlan(false);
                  return undefined;
                }}
              />
            </div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>{editingPlan ? "Edit meal plan" : "Add meal plan"}</DialogTitle>
                <DialogDescription>One day of eating. Choose each meal and its time.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <label className="block text-xs font-medium text-muted-foreground">
                  Name
                  <Input
                    className="mt-1"
                    placeholder="Training day, Rest day"
                    autoCapitalize="words"
                    value={planName}
                    onChange={(event) => {
                      setPlanName(event.target.value);
                      setPlanError(undefined);
                    }}
                  />
                </label>

                {rows.map((row) => {
                  const known = meals.some((meal) => meal.id === row.mealId);
                  const previous = editingPlan?.items.find((item) => item.id === row.id);
                  return (
                    <div key={row.id} className="rounded-xl bg-muted p-3">
                      <div className="flex items-center gap-2">
                        <ThemedSelect
                          aria-label="Meal"
                          className="min-w-0 flex-1"
                          value={row.mealId}
                          onValueChange={(mealId) =>
                            setRows((current) => current.map((item) => (item.id === row.id ? { ...item, mealId } : item)))
                          }
                          options={
                            known
                              ? mealOptions
                              : [{ value: row.mealId, label: previous?.name ?? "Deleted meal" }, ...mealOptions]
                          }
                        />
                        <button
                          type="button"
                          aria-label="Remove this meal"
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground active:bg-secondary"
                          onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <label className="mt-2 block text-xs font-medium text-muted-foreground">
                        Time
                        <Input
                          type="time"
                          className="mt-1"
                          value={row.time}
                          onChange={(event) =>
                            setRows((current) =>
                              current.map((item) => (item.id === row.id ? { ...item, time: event.target.value } : item))
                            )
                          }
                        />
                      </label>
                    </div>
                  );
                })}

                <div className="grid grid-cols-2 gap-2">
                  <Button variant="secondary" disabled={meals.length === 0} onClick={() => addRow(meals[0].id)}>
                    <Plus className="h-4 w-4" />
                    Add a meal
                  </Button>
                  <Button variant="secondary" onClick={() => setNewMealInPlan(true)}>
                    <Plus className="h-4 w-4" />
                    New meal
                  </Button>
                </div>

                {builtItems.length > 0 ? (
                  <MealNumbers totals={planTotals} className="rounded-xl bg-muted px-3 py-2" />
                ) : null}
                {planError ? <p className="text-center text-sm text-danger">{planError}</p> : null}
                <Button className="w-full" onClick={savePlan}>
                  Save meal plan
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <DietAiImportSheet open={aiOpen} onOpenChange={setAiOpen} />
    </div>
  );
}

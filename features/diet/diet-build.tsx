"use client";

import { ChevronLeft, Plus, Sparkles, X } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DRAWER_CONTENT, SHEET_FOOT } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ListGroup, ListRow, SheetRows } from "@/components/ui/list";
import { ThemedSelect } from "@/components/ui/select";
import { SwipeRow } from "@/components/ui/swipe-row";
import { usePendingRemoval } from "@/components/ui/use-pending-removal";
import { DietAiImportSheet } from "@/features/diet/diet-ai-import";
import { useDietStore } from "@/features/diet/diet-store";
import { EMPTY_MEAL, MealForm, type MealDraft } from "@/features/diet/meal-form";
import { MealLine, MealNumbers, planLine } from "@/features/diet/meal-numbers";
import type { Meal, MealPlan } from "@/lib/diet-types";
import { itemFromMeal, summarizeItems } from "@/lib/meal-schedule";

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
  // Deleted meals and plans hide at once and go after the Undo bar.
  const removal = usePendingRemoval();
  const removeMeal = (meal: Meal) => removal.remove(meal.id, `${meal.name} deleted`, () => deleteMeal(meal.id));
  const removePlan = (plan: MealPlan) => removal.remove(plan.id, `${plan.name} deleted`, () => deleteMealPlan(plan.id));

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

  const openEditMeal = (meal: Meal) => {
    setEditingMeal(meal);
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

  // Any change to the rows answers the error it may have been fixing.
  const changeRows = (change: (current: PlanRow[]) => PlanRow[]) => {
    setRows(change);
    setPlanError(undefined);
  };

  const addRow = (mealId: string) =>
    changeRows((current) => [
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
    <div className="space-y-5">
      {/* Onboarding copy, not a permanent header: once there is something to manage
          it only pushes the plans down. */}
      {meals.length === 0 && mealPlans.length === 0 ? (
        <div className="px-1 pt-3">
          <h2 className="font-heading text-[34px] leading-[1.08]">
            Plan your food once. Use it every day.
          </h2>
          <p className="mt-2.5 text-[15px] text-muted-foreground">
            Add your meals, group them into a day, then put that day on your calendar.
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2" data-tour="diet-plan-build">
        <Button className="w-full px-3" onClick={openNewPlan}>
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          Add meal plan
        </Button>
        <Button variant="secondary" className="w-full px-3" onClick={() => setAiOpen(true)}>
          <Sparkles className="h-4 w-4" />
          Build with AI
        </Button>
      </div>

      {shownPlans.length > 0 ? (
        <ListGroup title="Your meal plans">
          {shownPlans.map((plan) => (
            <SwipeRow key={plan.id} className="list-row" onDelete={() => removePlan(plan)}>
              <ListRow
                label={<span className="font-heading text-[23px] leading-tight">{plan.name}</span>}
                hint={<span className="tabular-nums">{planLine(plan)}</span>}
                onClick={() => openEditPlan(plan)}
              />
            </SwipeRow>
          ))}
        </ListGroup>
      ) : null}

      <ListGroup title="Your meals">
        <ListRow icon={Plus} label="Add meal" noChevron onClick={openNewMeal} />
        {shownMeals.map((meal) => (
          <SwipeRow key={meal.id} className="list-row" onDelete={() => removeMeal(meal)}>
            <ListRow
              label={meal.name}
              hint={
                <span className="tabular-nums">
                  <MealLine totals={meal} />
                </span>
              }
              onClick={() => openEditMeal(meal)}
            />
          </SwipeRow>
        ))}
      </ListGroup>

      {/* The meal dialog. Remounted per meal, so the form starts from that meal. */}
      <Dialog open={mealOpen} onOpenChange={setMealOpen}>
        <DialogContent className={`${DRAWER_CONTENT} max-h-[88dvh] overflow-y-auto`} hideClose={mealLibrary}>
          {mealLibrary ? null : (
            <DialogHeader className="pr-9">
              <DialogTitle>{editingMeal ? "Edit meal" : "Add meal"}</DialogTitle>
              <DialogDescription>
                {editingMeal
                  ? "A plan picks up the change when you next save that plan."
                  : "Add foods from the library, or type the numbers. Add the cost for one serving."}
              </DialogDescription>
            </DialogHeader>
          )}
          <MealForm
            key={editingMeal?.id ?? "new"}
            initial={editingMeal ?? EMPTY_MEAL}
            submitLabel="Save meal"
            onSubmit={saveMeal}
            onLibraryChange={setMealLibrary}
            deleteLabel="Delete meal"
            onDelete={
              editingMeal
                ? () => {
                    removeMeal(editingMeal);
                    setMealOpen(false);
                  }
                : undefined
            }
          />
        </DialogContent>
      </Dialog>

      {/* The plan dialog. A new meal swaps in place, not as a second dialog. */}
      <Dialog open={planOpen} onOpenChange={setPlanOpen}>
        <DialogContent className={`${DRAWER_CONTENT} max-h-[88dvh] overflow-y-auto`} hideClose={newMealInPlan}>
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
                  <div className="min-w-0">
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
              <DialogHeader className="pr-9">
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

                <SheetRows>
                  {rows.map((row) => {
                    const known = meals.some((meal) => meal.id === row.mealId);
                    const previous = editingPlan?.items.find((item) => item.id === row.id);
                    return (
                      <div key={row.id} className="list-row flex items-center gap-2 py-2 pl-4 pr-1.5">
                        {/* Wide enough for "08:30 AM" and the browser's own clock, in every browser. */}
                        <Input
                          type="time"
                          aria-label="Time"
                          className="w-[8.5rem] shrink-0 px-3"
                          value={row.time}
                          onChange={(event) =>
                            changeRows((current) =>
                              current.map((item) => (item.id === row.id ? { ...item, time: event.target.value } : item))
                            )
                          }
                        />
                        <ThemedSelect
                          aria-label="Meal"
                          className="min-w-0 flex-1 px-3"
                          value={row.mealId}
                          onValueChange={(mealId) =>
                            changeRows((current) => current.map((item) => (item.id === row.id ? { ...item, mealId } : item)))
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
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors active:bg-hi"
                          onClick={() => changeRows((current) => current.filter((item) => item.id !== row.id))}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}
                  <ListRow icon={Plus} label="Add a meal" noChevron disabled={meals.length === 0} onClick={() => addRow(meals[0].id)} />
                  <ListRow icon={Plus} label="New meal" noChevron onClick={() => setNewMealInPlan(true)} />
                </SheetRows>

                {builtItems.length > 0 ? <MealNumbers totals={planTotals} before={["The day"]} className="px-1" /> : null}

                {/* The rare one: the last thing in the sheet, and it can be undone. */}
                {editingPlan ? (
                  <button
                    type="button"
                    className="h-11 w-full rounded-full text-sm font-medium text-muted-foreground transition-colors active:bg-hi"
                    onClick={() => {
                      removePlan(editingPlan);
                      setPlanOpen(false);
                    }}
                  >
                    Delete meal plan
                  </button>
                ) : null}

                <div className={SHEET_FOOT}>
                  {planError ? <p className="mb-2 text-center text-sm text-danger">{planError}</p> : null}
                  <Button className="w-full" onClick={savePlan}>
                    Save meal plan
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <DietAiImportSheet open={aiOpen} onOpenChange={setAiOpen} />
    </div>
  );
}

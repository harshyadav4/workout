"use client";

import { AlertTriangle, Check, ClipboardCopy, ClipboardPaste, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useDietStore, useDietStoreApi } from "@/features/diet/diet-store";
import { MealNumbers } from "@/features/diet/meal-numbers";
import { useWorkoutStoreApi } from "@/features/workout/workout-store";
import { buildDietImport, parseAiDietPlan, type DietImport } from "@/lib/ai-diet-plan";
import { buildAiDietPrompt } from "@/lib/ai-diet-prompt";
import { averageIntake, dailyIntake } from "@/lib/diet-metrics";
import { formatMealTime } from "@/lib/meal-schedule";
import { loadFoods, type Food } from "@/lib/foods";
import { shiftKey } from "@/lib/progress-metrics";
import { todayKey } from "@/lib/utils";

type View = "start" | "paste" | "review" | "done";

const STEPS = [
  "Copy the question.",
  "Paste it into ChatGPT, Claude or Gemini. Answer its questions.",
  "Copy the plan it writes.",
  "Come back and tap Add my plan."
];

/**
 * Build with AI for diet: copy a question, have any AI chat write the plan,
 * paste its answer, check it, add it. The same four views as the workout sheet.
 */
export function DietAiImportSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const workoutStore = useWorkoutStoreApi();
  const dietStore = useDietStoreApi();
  const importPlan = useDietStore((state) => state.importAiDietPlan);
  const [view, setView] = useState<View>("start");
  const [copied, setCopied] = useState(false);
  const [pasted, setPasted] = useState("");
  const [error, setError] = useState<string>();
  const [plan, setPlan] = useState<DietImport>();
  // Loaded when the sheet opens, because the copy must happen inside the tap. If
  // it fails, plans still work: their meals just have no micronutrients.
  const [foods, setFoods] = useState<Food[]>([]);
  useEffect(() => {
    if (open) {
      loadFoods().then(setFoods).catch(() => undefined);
    }
  }, [open]);

  const reset = () => {
    setView("start");
    setCopied(false);
    setPasted("");
    setError(undefined);
    setPlan(undefined);
  };

  /** Called inside the tap, before any await, so iPhone Safari counts it as the user's gesture. */
  const copy = () => {
    const today = todayKey();
    const { profile, scheduledSessions } = workoutStore.getState();
    const { settings, scheduledMealDays } = dietStore.getState();
    const nextWeek = shiftKey(today, 6);
    const recent = dailyIntake(scheduledMealDays, { start: shiftKey(today, -27), end: today });
    const text = buildAiDietPrompt({
      heightCm: profile.heightCm,
      weightKg: profile.weightKg,
      goalWeightKg: profile.goalWeightKg,
      birthYear: profile.birthYear,
      sex: profile.sex,
      trainingDaysPerWeek: scheduledSessions.filter(
        (session) => session.type === "workout" && session.date >= today && session.date <= nextWeek
      ).length,
      settings,
      recentAverage: recent.length > 0 ? averageIntake(recent) : undefined,
      foodNames: foods.map((food) => food.name),
      today
    });
    setCopied(true);
    void navigator.clipboard.writeText(text).catch(() => {
      setCopied(false);
      setError("Your phone blocked the clipboard. Allow it and try again.");
    });
  };

  const check = (text: string) => {
    try {
      setPlan(buildDietImport(parseAiDietPlan(text), todayKey(), foods));
      setError(undefined);
      setView("review");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not read that answer.");
    }
  };

  const paste = async () => {
    setError(undefined);
    try {
      const text = await navigator.clipboard.readText();
      setPasted(text);
      check(text);
    } catch {
      setError("Your phone blocked the clipboard. Paste into the box below.");
    }
  };

  const missingCost = useMemo(
    () => plan?.mealPlans.some((item) => item.items.some((meal) => meal.costInr === 0)) ?? false,
    [plan]
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          reset();
        }
      }}
    >
      <DialogContent className="max-h-[88dvh] overflow-y-auto">
        {view === "start" ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-brand" />
                Build with AI
              </DialogTitle>
              <DialogDescription>An AI chat writes your meal plans and schedule, free.</DialogDescription>
            </DialogHeader>
            <ol className="space-y-2.5 text-sm">
              {STEPS.map((step, index) => (
                <li key={step} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/15 text-xs font-bold text-brand">
                    {index + 1}
                  </span>
                  <span className="pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
            <Button size="lg" className="mt-5 h-14 w-full" onClick={copy}>
              {copied ? <Check className="h-5 w-5" /> : <ClipboardCopy className="h-5 w-5" />}
              {copied ? "Copied" : "Copy the question"}
            </Button>
            {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
            <Button
              variant="secondary"
              className="mt-4 w-full"
              onClick={() => {
                setError(undefined);
                setView("paste");
              }}
            >
              Add my plan
            </Button>
          </>
        ) : view === "paste" ? (
          <>
            <DialogHeader>
              <DialogTitle>Add my plan</DialogTitle>
              <DialogDescription>Copy the plan from your AI chat, then paste it.</DialogDescription>
            </DialogHeader>
            <Button size="lg" className="h-16 w-full" onClick={() => void paste()}>
              <ClipboardPaste className="h-5 w-5" />
              Paste the answer
            </Button>
            <textarea
              aria-label="The AI answer"
              className="well mt-3 h-32 w-full rounded-xl p-3 text-sm"
              placeholder="Or paste the answer here"
              value={pasted}
              onChange={(event) => setPasted(event.target.value)}
            />
            <Button variant="secondary" className="mt-2 w-full" disabled={!pasted.trim()} onClick={() => check(pasted)}>
              Check this answer
            </Button>
            {error ? (
              <div className="mt-4 rounded-xl bg-danger/10 p-4 ring-1 ring-danger/25" role="alert">
                <p className="flex items-start gap-2 text-sm font-semibold">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
                  {error}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">Send this message to the AI, and ask it to fix the plan.</p>
              </div>
            ) : null}
          </>
        ) : view === "review" && plan ? (
          <>
            <DialogHeader>
              <DialogTitle>Check your plan</DialogTitle>
              <DialogDescription>
                The numbers are the AI&apos;s estimates. You can change them after you add the plan.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              {plan.mealPlans.map((item) => (
                <div key={item.id} className="rounded-xl bg-muted p-3">
                  <p className="font-semibold">{item.name}</p>
                  <MealNumbers totals={item.summary} />
                  <ul className="mt-2 space-y-1 text-sm">
                    {item.items.map((meal) => (
                      <li key={meal.id} className="flex justify-between gap-3">
                        <span className="min-w-0">{meal.name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{formatMealTime(meal.time)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {plan.mealScheduleConfig ? (
                <p className="text-sm text-muted-foreground">It also fills your diet calendar for 8 weeks. Days you have ticked do not change.</p>
              ) : (
                <p className="text-sm text-muted-foreground">It has no schedule. Put the plans on days in Schedule.</p>
              )}
              {missingCost ? <p className="text-sm text-warning">Some meals have no cost. Add it in Build to count your spend.</p> : null}
            </div>
            <Button
              size="lg"
              className="mt-4 w-full"
              onClick={() => {
                importPlan(plan);
                setView("done");
              }}
            >
              Add to my diet
            </Button>
            <Button variant="secondary" className="mt-2 w-full" onClick={() => setView("paste")}>
              Back
            </Button>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Check className="h-5 w-5 text-success" />
                Your plan is in
              </DialogTitle>
              <DialogDescription>Today&apos;s meals are on the Meals tab.</DialogDescription>
            </DialogHeader>
            <Button
              className="w-full"
              onClick={() => {
                onOpenChange(false);
                reset();
              }}
            >
              Done
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

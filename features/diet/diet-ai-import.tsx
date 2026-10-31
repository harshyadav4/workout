"use client";

import { AlertTriangle, Check, ClipboardCopy, ClipboardPaste } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DRAWER_CONTENT, SHEET_FOOT } from "@/components/ui/dialog";
import { ListRow, SheetRows } from "@/components/ui/list";
import { useDietStore, useDietStoreApi } from "@/features/diet/diet-store";
import { MealNumbers } from "@/features/diet/meal-numbers";
import { useWorkoutStoreApi } from "@/features/workout/workout-store";
import { injuryWorkoutIds, isInjurySession } from "@/lib/injuries";
import { buildDietImport, parseAiDietPlan, type DietImport } from "@/lib/ai-diet-plan";
import { buildAiDietPrompt } from "@/lib/ai-diet-prompt";
import { averageIntake, dailyIntake } from "@/lib/diet-metrics";
import { formatMealTime } from "@/lib/meal-schedule";
import { loadFoods, type Food } from "@/lib/foods";
import { shiftKey } from "@/lib/progress-metrics";
import { cn, todayKey } from "@/lib/utils";

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
  const [showBox, setShowBox] = useState(false);
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
    setShowBox(false);
    setError(undefined);
    setPlan(undefined);
  };

  /** Called inside the tap, before any await, so iPhone Safari counts it as the user's gesture. */
  const copy = () => {
    const today = todayKey();
    const { profile, scheduledSessions, injuries } = workoutStore.getState();
    const ownWorkouts = injuryWorkoutIds(injuries);
    const { settings, scheduledMealDays } = dietStore.getState();
    const nextWeek = shiftKey(today, 6);
    const recent = dailyIntake(scheduledMealDays, { start: shiftKey(today, -27), end: today });
    const text = buildAiDietPrompt({
      heightCm: profile.heightCm,
      weightKg: profile.weightKg,
      goalWeightKg: profile.goalWeightKg,
      birthYear: profile.birthYear,
      sex: profile.sex,
      // An injury's daily exercises are not training days to eat for.
      trainingDaysPerWeek: scheduledSessions.filter(
        (session) =>
          session.type === "workout" &&
          session.date >= today &&
          session.date <= nextWeek &&
          !isInjurySession(session, ownWorkouts)
      ).length,
      settings,
      recentAverage: recent.length > 0 ? averageIntake(recent) : undefined,
      foodNames: foods.map((food) => food.name),
      today
    });
    setCopied(true);
    setError(undefined);
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
      // Denied or unsupported: the box below is the way in.
      setShowBox(true);
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
      <DialogContent className={`${DRAWER_CONTENT} max-h-[88dvh] overflow-y-auto`}>
        {view === "start" ? (
          <>
            <DialogHeader className="pr-9">
              <DialogTitle>Build with AI</DialogTitle>
              <DialogDescription>An AI chat writes your meal plans and schedule, free.</DialogDescription>
            </DialogHeader>
            <ol className="space-y-2.5 text-[15px]">
              {STEPS.map((step, index) => (
                <li key={step} className="flex gap-3">
                  <span className="w-4 shrink-0 text-muted-foreground tabular-nums">{index + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            <Button size="lg" className="mt-5 w-full" onClick={copy}>
              {copied ? <Check className="h-5 w-5" /> : <ClipboardCopy className="h-5 w-5" />}
              {copied ? "Copied" : "Copy the question"}
            </Button>
            {copied ? (
              <p className="mt-3 text-center text-sm text-muted-foreground" role="status">
                Now paste it into your AI chat
              </p>
            ) : null}
            {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
            <Button
              variant="secondary"
              className="mt-2 w-full"
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
            <DialogHeader className="pr-9">
              <DialogTitle>Add my plan</DialogTitle>
              <DialogDescription>Copy the plan from your AI chat, then paste it.</DialogDescription>
            </DialogHeader>
            <Button size="lg" className="w-full" onClick={() => void paste()}>
              <ClipboardPaste className="h-5 w-5" />
              Paste the answer
            </Button>
            {error ? (
              <div className="mt-4 rounded-2xl bg-danger/10 p-4" role="alert">
                <p className="flex items-start gap-2 text-sm font-semibold">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
                  {error}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">Send this message to the AI, and ask it to fix the plan.</p>
              </div>
            ) : null}
            {showBox ? (
              <textarea
                aria-label="The AI answer"
                rows={6}
                placeholder="Press and hold here, then Paste"
                value={pasted}
                onChange={(event) => {
                  setPasted(event.target.value);
                  setError(undefined);
                }}
                className="well mt-4 w-full rounded-lg px-4 py-3 text-base text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
              />
            ) : (
              <button
                type="button"
                onClick={() => setShowBox(true)}
                className="mt-3 min-h-11 w-full text-center text-sm font-medium text-muted-foreground underline-offset-4 hover:underline"
              >
                Paste by hand
              </button>
            )}
            <div className="mt-4 flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setView("start")}>
                Back
              </Button>
              {showBox ? (
                <Button className="flex-1" disabled={!pasted.trim()} onClick={() => check(pasted)}>
                  Check plan
                </Button>
              ) : null}
            </div>
          </>
        ) : view === "review" && plan ? (
          <>
            <DialogHeader className="pr-9">
              <DialogTitle>Check your plan</DialogTitle>
              <DialogDescription>
                The numbers are the AI&apos;s estimates. You can change them after you add the plan.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-5">
              {plan.mealPlans.map((item) => (
                <section key={item.id}>
                  <h3 className="font-heading text-[23px] leading-tight">{item.name}</h3>
                  <MealNumbers totals={item.summary} className="mt-0.5" />
                  <SheetRows>
                    {item.items.map((meal) => (
                      <ListRow key={meal.id} label={meal.name} value={formatMealTime(meal.time)} />
                    ))}
                  </SheetRows>
                </section>
              ))}
              <p className="text-sm text-muted-foreground">
                {plan.mealScheduleConfig
                  ? "It also fills your diet calendar for 8 weeks. Days you have ticked do not change."
                  : "It has no schedule. Put the plans on days in Schedule."}
              </p>
              {missingCost ? <p className="text-sm text-warning">Some meals have no cost. Add it in Build to count your spend.</p> : null}
            </div>
            <div className={cn(SHEET_FOOT, "mt-4 flex gap-2")}>
              <Button variant="secondary" className="flex-1" onClick={() => setView("paste")}>
                Back
              </Button>
              <Button
                className="flex-1"
                onClick={() => {
                  importPlan(plan);
                  setView("done");
                }}
              >
                Add to my diet
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader className="pr-9">
              <DialogTitle className="flex items-center gap-2">
                <Check className="h-5 w-5 text-[var(--l2)]" strokeWidth={2.6} aria-hidden />
                Your plan is in
              </DialogTitle>
              <DialogDescription>Today&apos;s meals are on the Meals tab.</DialogDescription>
            </DialogHeader>
            <Button
              size="lg"
              className="mt-4 w-full"
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

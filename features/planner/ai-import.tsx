"use client";

import { AlertTriangle, Check, ClipboardCopy, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DRAWER_CONTENT
} from "@/components/ui/dialog";
import { ExercisePicker } from "@/features/planner/exercise-picker";
import { useWorkoutStore, useWorkoutStoreApi } from "@/features/workout/workout-store";
import {
  AiPlanError,
  buildPlanImport,
  choiceKey,
  matchExercise,
  normalize,
  parseAiPlan,
  WEEKDAYS,
  type AiPlan,
  type ExerciseChoice,
  type ExerciseMatch
} from "@/lib/ai-plan";
import { buildAiPrompt } from "@/lib/ai-prompt";
import { exerciseImageUrl, loadExercises, type Exercise } from "@/lib/exercises";
import { storeGif } from "@/lib/media";
import { formatDayKey } from "@/lib/progress-metrics";
import { cn, todayKey } from "@/lib/utils";

const NOTES_KEY = "gymflow.aiNotes";

type View = "start" | "paste" | "review" | "done";

const DAY_NAMES: Record<string, string> = {
  sun: "Sun",
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat"
};

/**
 * A whole-row switch. Native checkboxes were 20px targets inside the sheet,
 * easy to miss on a small phone.
 */
function Switch({
  checked,
  onChange,
  label,
  children
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="flex min-h-12 w-full items-center justify-between gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="min-w-0 flex-1">{children}</span>
      <span
        aria-hidden
        className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors", checked ? "bg-primary" : "well")}
      >
        <span
          className={cn(
            "absolute top-1 h-5 w-5 rounded-full bg-card shadow-quiet transition-transform",
            checked ? "translate-x-6" : "translate-x-1"
          )}
        />
      </span>
    </button>
  );
}

/**
 * "Build with AI": copy a prompt, let an outside assistant interview you and
 * write the plan, paste its JSON back, review, import.
 *
 * Nothing is written until Import. The import adds sessions and fills the
 * calendar the same way "Generate schedule" does — logged history, started and
 * finished days are never touched, and a session of yours is replaced only
 * when you switch that on for it.
 */
export function AiImportSheet({
  open,
  onOpenChange
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const store = useWorkoutStoreApi();
  const sessionTemplates = useWorkoutStore((state) => state.sessionTemplates);
  const importAiPlan = useWorkoutStore((state) => state.importAiPlan);
  const setTemplateMedia = useWorkoutStore((state) => state.setTemplateMedia);

  const [view, setView] = useState<View>("start");
  const [library, setLibrary] = useState<Exercise[]>([]);
  const [libraryError, setLibraryError] = useState(false);
  const [notes, setNotes] = useState("");
  const [copied, setCopied] = useState(false);
  const [pasted, setPasted] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<AiPlan | null>(null);
  const [choices, setChoices] = useState<Record<string, ExerciseChoice>>({});
  const [replace, setReplace] = useState<Set<string>>(new Set());
  const [applySchedule, setApplySchedule] = useState(true);
  const [picking, setPicking] = useState<string | null>(null);
  const [media, setMedia] = useState<{ done: number; failed: number; total: number }>({ done: 0, failed: 0, total: 0 });
  const [summary, setSummary] = useState<string>("");

  useEffect(() => {
    if (!open) {
      // Closed from any path (Done, the ✕, a tap outside): start fresh next time.
      reset();
      return;
    }
    try {
      setNotes(localStorage.getItem(NOTES_KEY) ?? "");
    } catch {
      // Storage can be unavailable; the notes box just starts empty.
    }
    loadExercises()
      .then(setLibrary)
      .catch(() => setLibraryError(true));
  }, [open]);

  const reset = () => {
    setView("start");
    setCopied(false);
    setPasted("");
    setError(null);
    setPlan(null);
    setChoices({});
    setReplace(new Set());
    setApplySchedule(true);
    setPicking(null);
    setMedia({ done: 0, failed: 0, total: 0 });
  };

  const saveNotes = (value: string) => {
    setNotes(value);
    try {
      localStorage.setItem(NOTES_KEY, value);
    } catch {
      // Kept for this visit only.
    }
  };

  const prompt = () => {
    const state = store.getState();
    return buildAiPrompt({
      library,
      sessions: state.sessionTemplates,
      logs: state.logs,
      profile: state.profile,
      today: todayKey(),
      notes
    });
  };

  const copyPrompt = async () => {
    const text = prompt();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // Clipboard refused (permissions, older browser): hand over a file.
      const blob = new Blob([text], { type: "text/plain" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "gymflow-ai-prompt.txt";
      link.click();
      URL.revokeObjectURL(link.href);
      setCopied(true);
    }
  };

  const check = () => {
    setError(null);
    try {
      const parsed = parseAiPlan(pasted);
      setPlan(parsed);
      setChoices({});
      setReplace(new Set());
      setApplySchedule(Boolean(parsed.schedule));
      setView("review");
    } catch (cause) {
      setError(cause instanceof AiPlanError ? cause.message : "That could not be read.");
    }
  };

  // The matcher's verdict per exercise, recomputed only when the plan changes.
  const matches = useMemo(() => {
    const result: Record<string, ExerciseMatch> = {};
    plan?.sessions.forEach((session, sessionIndex) =>
      session.exercises.forEach((item, exerciseIndex) => {
        result[choiceKey(sessionIndex, exerciseIndex)] = matchExercise(item, library);
      })
    );
    return result;
  }, [library, plan]);

  /** What will actually be imported for one exercise: the user's pick, else the matcher's. */
  const resolved = (key: string): Exercise | undefined =>
    key in choices ? choices[key].exercise : matches[key]?.exercise;

  const needsLook = plan
    ? Object.keys(matches).filter((key) => !(key in choices) && matches[key].status === "check").length
    : 0;

  const doImport = async () => {
    if (!plan) {
      return;
    }
    const state = store.getState();
    const built = buildPlanImport(plan, {
      library,
      choices,
      replace,
      applySchedule,
      existingTemplates: state.templates,
      existingSessions: state.sessionTemplates,
      today: todayKey()
    });
    importAiPlan(built);
    setSummary(
      `${built.sessions.length} session${built.sessions.length === 1 ? "" : "s"} added${
        built.scheduleConfig ? `, calendar filled ${formatDayKey(built.scheduleConfig.startDate)} to ${formatDayKey(built.scheduleConfig.endDate)}` : ""
      }.`
    );
    setView("done");

    // GIFs for exercises outside the library, one at a time. A failure leaves
    // that exercise without a demo; it never undoes the import.
    setMedia({ done: 0, failed: 0, total: built.media.length });
    for (const request of built.media) {
      try {
        const path = await storeGif(request.url);
        setTemplateMedia(request.templateId, path);
        setMedia((current) => ({ ...current, done: current.done + 1 }));
      } catch {
        setMedia((current) => ({ ...current, failed: current.failed + 1 }));
      }
    }
  };

  const clashes = plan
    ? plan.sessions.filter((session) =>
        sessionTemplates.some((existing) => normalize(existing.name) === normalize(session.name))
      )
    : [];

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className={`${DRAWER_CONTENT} max-h-[88dvh] overflow-y-auto`} hideClose={Boolean(picking)}>
        {picking ? (
          <ExercisePicker
            onBack={() => setPicking(null)}
            onPick={(exercise) => {
              setChoices((current) => ({ ...current, [picking]: { exercise } }));
              setPicking(null);
            }}
          />
        ) : view === "start" ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-brand" />
                Build with AI
              </DialogTitle>
              <DialogDescription>
                Copy a prompt into ChatGPT, Claude or Gemini. It asks about your goal, then writes
                sessions and a schedule as JSON. Paste that back here.
              </DialogDescription>
            </DialogHeader>
            <ol className="space-y-2 text-sm">
              {[
                "Copy the prompt below.",
                "Paste it into your AI assistant and answer its questions.",
                "When it sends the JSON, copy all of it.",
                "Come back and paste it on the next screen."
              ].map((step, index) => (
                <li key={step} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/15 text-xs font-bold text-brand">
                    {index + 1}
                  </span>
                  <span className="pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
            <label className="mt-4 block text-xs font-medium text-muted-foreground">
              Notes for the AI (optional, remembered on this phone)
              <textarea
                rows={4}
                value={notes}
                onChange={(event) => saveNotes(event.target.value)}
                placeholder="Goals, weak points, injuries, rules. Paste a longer personal brief here if you have one."
                className="well mt-1 w-full rounded-lg px-4 py-3 text-base text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
            <p className="mt-2 text-xs text-muted-foreground">
              The prompt also includes your height, weight, recent lifts, your existing sessions and
              the full exercise library, so the AI can use names the app has demos for.
            </p>
            {libraryError ? (
              <p className="mt-3 text-sm text-danger">The exercise library did not load. Check your connection.</p>
            ) : null}
            <div className="mt-4 space-y-2">
              <Button size="lg" className="w-full" disabled={library.length === 0} onClick={() => void copyPrompt()}>
                {copied ? <Check className="h-5 w-5" /> : <ClipboardCopy className="h-5 w-5" />}
                {copied ? "Copied. Copy again" : library.length === 0 ? "Loading library…" : "Copy prompt"}
              </Button>
              <Button variant="secondary" className="w-full" onClick={() => setView("paste")}>
                I have the JSON
              </Button>
            </div>
          </>
        ) : view === "paste" ? (
          <>
            <DialogHeader>
              <DialogTitle>Paste the AI&apos;s reply</DialogTitle>
              <DialogDescription>
                The whole reply is fine. The app finds the JSON in it.
              </DialogDescription>
            </DialogHeader>
            <textarea
              rows={10}
              value={pasted}
              onChange={(event) => {
                setPasted(event.target.value);
                setError(null);
              }}
              placeholder='{ "gymflow": "sessions/v1", "sessions": [ … ] }'
              className="well w-full rounded-lg px-4 py-3 font-mono text-base text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            />
            {error ? (
              <p className="mt-2 flex items-start gap-2 text-sm text-danger" role="alert">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {error}
              </p>
            ) : null}
            <div className="mt-4 flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setView("start")}>
                Back
              </Button>
              <Button className="flex-1" disabled={!pasted.trim() || library.length === 0} onClick={check}>
                Check it
              </Button>
            </div>
          </>
        ) : view === "review" && plan ? (
          <>
            <DialogHeader>
              <DialogTitle>Review the plan</DialogTitle>
              <DialogDescription>
                {plan.sessions.length} session{plan.sessions.length === 1 ? "" : "s"}
                {needsLook > 0 ? ` · ${needsLook} exercise${needsLook === 1 ? "" : "s"} to check` : " · every exercise matched"}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              {plan.sessions.map((session, sessionIndex) => {
                const clash = clashes.includes(session);
                return (
                  <div key={session.name} className="rounded-xl bg-muted p-3">
                    <div className="flex items-baseline justify-between gap-2 px-1">
                      <p className="font-display text-lg font-bold tracking-tight">{session.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {session.exercises.length} exercises
                        {session.progression && session.progression !== "off" ? ` · ${session.progression}` : ""}
                      </p>
                    </div>
                    {clash ? (
                      <div className="mt-2 rounded-lg bg-warning/10 px-3 py-1 text-sm">
                        <Switch
                          label={`Replace my ${session.name}`}
                          checked={replace.has(session.name)}
                          onChange={(on) =>
                            setReplace((current) => {
                              const next = new Set(current);
                              if (on) next.add(session.name);
                              else next.delete(session.name);
                              return next;
                            })
                          }
                        >
                          You already have &quot;{session.name}&quot;.{" "}
                          <span className="text-muted-foreground">
                            {replace.has(session.name) ? "Yours will be replaced." : `Imported as "${session.name} (AI)".`}
                          </span>
                        </Switch>
                      </div>
                    ) : null}
                    <div className="mt-2 space-y-1.5">
                      {session.exercises.map((item, exerciseIndex) => {
                        const key = choiceKey(sessionIndex, exerciseIndex);
                        const match = matches[key];
                        const exercise = resolved(key);
                        const decided = key in choices;
                        const status = decided ? (exercise ? "picked" : "custom") : match?.status;
                        return (
                          <div key={key} className="rounded-lg bg-card p-2">
                            <div className="flex items-center gap-3">
                              <div className="well h-12 w-12 shrink-0 overflow-hidden rounded-lg">
                                {exercise ? (
                                  <img src={exerciseImageUrl(exercise)} alt="" className="h-full w-full object-cover" loading="lazy" />
                                ) : null}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold capitalize">
                                  {exercise ? exercise.name : item.name}
                                </p>
                                <p className="truncate text-xs text-muted-foreground tabular-nums">
                                  {item.sets} × {item.seconds ? `${item.seconds}s` : item.reps}
                                  {item.weightKg ? ` · ${item.weightKg} kg` : ""}
                                  {exercise && normalize(exercise.name) !== normalize(item.name) ? ` · AI said "${item.name}"` : ""}
                                </p>
                              </div>
                              <Badge
                                variant={
                                  status === "exact" || status === "picked"
                                    ? "success"
                                    : status === "close"
                                      ? "default"
                                      : status === "check"
                                        ? "warning"
                                        : "secondary"
                                }
                              >
                                {status === "exact"
                                  ? "Matched"
                                  : status === "picked"
                                    ? "Picked"
                                    : status === "close"
                                      ? "Close"
                                      : status === "check"
                                        ? "Check"
                                        : item.gifUrl
                                          ? "Custom + GIF"
                                          : "Custom"}
                              </Badge>
                            </div>
                            {!decided && (match?.status === "check" || match?.status === "close" || match?.status === "none") ? (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {match.candidates
                                  .filter((candidate) => candidate.id !== exercise?.id)
                                  .map((candidate) => (
                                    <button
                                      key={candidate.id}
                                      type="button"
                                      onClick={() => setChoices((current) => ({ ...current, [key]: { exercise: candidate } }))}
                                      className="key-quiet h-9 max-w-full truncate rounded-full px-3 text-xs font-semibold capitalize"
                                    >
                                      {candidate.name}
                                    </button>
                                  ))}
                                <button
                                  type="button"
                                  onClick={() => setPicking(key)}
                                  className="key-quiet h-9 rounded-full px-3 text-xs font-semibold"
                                >
                                  Library…
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setChoices((current) => ({ ...current, [key]: {} }))}
                                  className="h-9 rounded-full px-3 text-xs font-semibold text-muted-foreground"
                                >
                                  Keep as custom
                                </button>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {plan.schedule ? (
                <div className="rounded-xl bg-muted p-3">
                  <div className="px-1">
                    <Switch
                      label="Fill my calendar with this schedule"
                      checked={applySchedule}
                      onChange={setApplySchedule}
                    >
                      <span className="block font-display text-lg font-bold tracking-tight">Schedule</span>
                      <span className="block text-xs text-muted-foreground">
                        {applySchedule ? "Fills your calendar" : "Not applied: sessions only"} ·{" "}
                        {plan.schedule.startDate ? formatDayKey(plan.schedule.startDate) : "from today"} to{" "}
                        {plan.schedule.endDate ? formatDayKey(plan.schedule.endDate) : "8 weeks later"}
                      </span>
                    </Switch>
                  </div>
                  <div className={cn("mt-2 grid grid-cols-7 gap-1 transition-opacity", applySchedule ? "" : "opacity-40")}>
                    {WEEKDAYS.slice(1)
                      .concat(WEEKDAYS[0])
                      .map((day) => {
                        const value =
                          plan.schedule?.mode === "rotation"
                            ? undefined
                            : plan.schedule?.days?.[day] ?? (plan.schedule?.restDays?.includes(day) ? "rest" : undefined);
                        return (
                          <div
                            key={day}
                            className={cn(
                              "flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-lg px-0.5 text-center",
                              value && value !== "rest" ? "bg-brand/12" : "well"
                            )}
                          >
                            <span className="text-[10px] font-semibold text-muted-foreground">{DAY_NAMES[day]}</span>
                            <span className="line-clamp-2 text-[10px] font-semibold leading-tight">
                              {value === "rest" ? "Rest" : value ?? (plan.schedule?.mode === "rotation" ? "" : "—")}
                            </span>
                          </div>
                        );
                      })}
                  </div>
                  {plan.schedule.mode === "rotation" ? (
                    <p className="mt-2 px-1 text-xs text-muted-foreground">
                      Rotation: {(plan.schedule.rotation ?? []).join(" → ")}
                    </p>
                  ) : null}
                  <p className="mt-2 px-1 text-xs text-muted-foreground">
                    Planned days in this range are replaced. Started and finished workouts stay, and so does
                    everything you have logged.
                  </p>
                </div>
              ) : null}
            </div>

            <div className="sticky bottom-0 mt-4 flex gap-2 border-t border-border bg-card pt-3">
              <Button variant="secondary" className="flex-1" onClick={() => setView("paste")}>
                Back
              </Button>
              <Button className="flex-1" onClick={() => void doImport()}>
                Import
              </Button>
            </div>
          </>
        ) : view === "done" ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Check className="h-5 w-5 text-success" strokeWidth={3} />
                Plan imported
              </DialogTitle>
              <DialogDescription>{summary}</DialogDescription>
            </DialogHeader>
            {media.total > 0 ? (
              <p className="text-sm text-muted-foreground" role="status">
                {media.done + media.failed < media.total
                  ? `Saving demo GIFs… ${media.done + media.failed} of ${media.total}`
                  : media.failed > 0
                    ? `${media.done} demo GIF${media.done === 1 ? "" : "s"} saved. ${media.failed} link${media.failed === 1 ? "" : "s"} did not work; those exercises have no demo.`
                    : `${media.done} demo GIF${media.done === 1 ? "" : "s"} saved.`}
              </p>
            ) : null}
            <Button size="lg" className="mt-4 w-full" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

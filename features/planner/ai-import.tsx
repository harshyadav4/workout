"use client";

import { AlertTriangle, Check, ClipboardCopy, ClipboardPaste, Sparkles, Upload } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

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
import { useAuth } from "@/features/auth/use-auth";
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

/** Where the old "Tell the AI about you" box kept its text; cleared on open. */
const RETIRED_NOTES_KEY = "gymflow.aiNotes";
/**
 * The checker speaks in field paths ("sessions[0] exercise 2 needs either reps
 * or seconds"); people need to know what to do. The technical line stays, small,
 * and goes into the fix-it message the AI understands.
 */
function friendly(message: string): { headline: string; advice: string } {
  if (/Nothing was pasted/.test(message)) {
    return { headline: "Nothing to paste.", advice: "Copy the full AI answer first." };
  }
  if (/file could not be read/.test(message)) {
    return { headline: "That file did not open.", advice: "Choose the AI plan file (.json or .txt)." };
  }
  if (/No JSON object|must be an object|incomplete or broken/.test(message)) {
    return {
      headline: "That text is not a plan.",
      advice: "Let the AI finish, then copy its plan box."
    };
  }
  return {
    headline: "The plan has a mistake.",
    advice: "Send the fix-it message below to the AI."
  };
}

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
  const [copied, setCopied] = useState(false);
  const [pasted, setPasted] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<AiPlan | null>(null);
  const [choices, setChoices] = useState<Record<string, ExerciseChoice>>({});
  const [replace, setReplace] = useState<Set<string>>(new Set());
  const [applySchedule, setApplySchedule] = useState(true);
  const [picking, setPicking] = useState<string | null>(null);
  const [media, setMedia] = useState<{ done: number; failed: number; total: number; guest?: boolean }>({ done: 0, failed: 0, total: 0 });
  // Storing a GIF needs an account: the file lives in the account's own folder.
  const { user } = useAuth();
  const [summary, setSummary] = useState<string>("");
  const [showBox, setShowBox] = useState(false);
  const [fixCopied, setFixCopied] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      // Closed from any path (Done, the ✕, a tap outside): start fresh next time.
      reset();
      return;
    }
    try {
      localStorage.removeItem(RETIRED_NOTES_KEY);
    } catch {
      // Storage can be unavailable; then there is nothing to clear either.
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
    setShowBox(false);
    setFixCopied(false);
  };

  const prompt = () => {
    const state = store.getState();
    return buildAiPrompt({
      library,
      sessions: state.sessionTemplates,
      logs: state.logs,
      profile: state.profile,
      today: todayKey()
    });
  };

  /**
   * Copy the question. Called inside the tap, before any await, so iPhone
   * Safari still counts it as the user's gesture. Which AI they paste it into
   * is theirs to choose; the app opens nothing.
   */
  const copyPrompt = () => {
    const text = prompt();
    setCopied(true);
    void navigator.clipboard.writeText(text).catch(() => {
      // Clipboard refused (permissions, older browser): hand over a file.
      const blob = new Blob([text], { type: "text/plain" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "arise-question-for-ai.txt";
      link.click();
      URL.revokeObjectURL(link.href);
    });
  };

  const pasteFromClipboard = async () => {
    setError(null);
    try {
      const text = await navigator.clipboard.readText();
      setPasted(text);
      checkText(text);
    } catch {
      // Denied or unsupported: the box below is the way in.
      setShowBox(true);
      setError("Your phone blocked the clipboard. Paste into the box below.");
    }
  };

  const check = () => checkText(pasted);

  /** The plan as a file the AI let them download: read it and check it like a paste. */
  const uploadFile = async (file: File | undefined) => {
    if (!file) {
      return;
    }
    setError(null);
    try {
      const text = await file.text();
      setPasted(text);
      checkText(text);
    } catch {
      setError("The file could not be read.");
    } finally {
      // Picking the same file again after fixing it must still fire a change.
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const checkText = (text: string) => {
    setError(null);
    try {
      const parsed = parseAiPlan(text);
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
      `${built.sessions.length} workout${built.sessions.length === 1 ? "" : "s"} added.${
        built.scheduleConfig ? ` Calendar set ${formatDayKey(built.scheduleConfig.startDate)} – ${formatDayKey(built.scheduleConfig.endDate)}.` : ""
      }`
    );
    setView("done");

    // GIFs for exercises outside the library, one at a time. A failure leaves
    // that exercise without a demo; it never undoes the import.
    if (!user) {
      // A guest: the plan is in, the demos wait for an account.
      setMedia({ done: 0, failed: 0, total: built.media.length, guest: true });
      return;
    }
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
                An AI chat writes your workouts and schedule, free.
              </DialogDescription>
            </DialogHeader>
            <ol className="space-y-2.5 text-sm">
              {[
                "Copy the question.",
                "Paste it into ChatGPT, Claude or Gemini. Answer its questions.",
                "Copy the plan, or save it as a file.",
                "Come back and tap Add my plan."
              ].map((step, index) => (
                <li key={step} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/15 text-xs font-bold text-brand">
                    {index + 1}
                  </span>
                  <span className="pt-0.5">{step}</span>
                </li>
              ))}
            </ol>

            {libraryError ? (
              <p className="mt-3 text-sm text-danger">The exercise list did not load. Check your connection.</p>
            ) : null}

            <Button size="lg" className="mt-5 h-14 w-full" disabled={library.length === 0} onClick={() => copyPrompt()}>
              {copied ? <Check className="h-5 w-5" /> : <ClipboardCopy className="h-5 w-5" />}
              {copied ? "Copied" : "Copy the question"}
            </Button>
            {copied ? (
              <p className="mt-3 flex items-center justify-center gap-1.5 text-sm text-success" role="status">
                <Check className="h-4 w-4" />
                Now paste it into your AI chat
              </p>
            ) : null}

            <Button variant="secondary" className="mt-4 w-full" onClick={() => setView("paste")}>
              Add my plan
            </Button>
          </>
        ) : view === "paste" ? (
          <>
            <DialogHeader>
              <DialogTitle>Add my plan</DialogTitle>
              <DialogDescription>Copy the plan from your AI chat, then paste it.</DialogDescription>
            </DialogHeader>

            <Button size="lg" className="h-16 w-full" disabled={library.length === 0} onClick={() => void pasteFromClipboard()}>
              <ClipboardPaste className="h-5 w-5" />
              Paste the answer
            </Button>
            <Button
              variant="secondary"
              className="mt-2 h-12 w-full"
              disabled={library.length === 0}
              onClick={() => fileInput.current?.click()}
            >
              <Upload className="h-4 w-4" />
              Upload a file
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept=".json,.txt,application/json,text/plain"
              className="hidden"
              onChange={(event) => void uploadFile(event.target.files?.[0])}
            />

            {error ? (
              <div className="mt-4 rounded-xl bg-danger/10 p-4 ring-1 ring-danger/25" role="alert">
                <p className="flex items-start gap-2 text-sm font-semibold">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
                  {friendly(error).headline}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{friendly(error).advice}</p>
                {friendly(error).headline.startsWith("The plan has") ? (
                  <Button
                    variant="secondary"
                    className="mt-3 w-full"
                    onClick={() => {
                      void navigator.clipboard
                        .writeText(
                          `Arise could not import your plan: ${error} Please fix that and send the complete plan again as one json code block, following every rule in the reply format.`
                        )
                        .then(() => setFixCopied(true))
                        .catch(() => setFixCopied(false));
                    }}
                  >
                    {fixCopied ? <Check className="h-4 w-4" /> : <ClipboardCopy className="h-4 w-4" />}
                    {fixCopied ? "Copied" : "Copy fix-it message"}
                  </Button>
                ) : null}
                <p className="mt-3 text-xs text-muted-foreground">Details: {error}</p>
              </div>
            ) : null}

            {showBox ? (
              <textarea
                rows={6}
                value={pasted}
                onChange={(event) => {
                  setPasted(event.target.value);
                  setError(null);
                }}
                placeholder="Press and hold here, then Paste"
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
                <Button className="flex-1" disabled={!pasted.trim() || library.length === 0} onClick={check}>
                  Check plan
                </Button>
              ) : null}
            </div>
          </>
        ) : view === "review" && plan ? (
          <>
            <DialogHeader>
              <DialogTitle>Review plan</DialogTitle>
              <DialogDescription>
                {plan.sessions.length} workout{plan.sessions.length === 1 ? "" : "s"}
                {needsLook > 0 ? ` · ${needsLook} exercise${needsLook === 1 ? "" : "s"} to check` : " · all exercises match"}
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
                          Replace my &quot;{session.name}&quot;{" "}
                          <span className="block text-xs text-muted-foreground">
                            {replace.has(session.name) ? "The new one replaces yours." : `Off: adds "${session.name} (AI)".`}
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
                                  {exercise && normalize(exercise.name) !== normalize(item.name) ? ` · AI name: "${item.name}"` : ""}
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
                                  Keep custom
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
                        {applySchedule ? "Fills your calendar" : "Off: workouts only"} ·{" "}
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
                    Replaces planned days only. Done workouts and logs stay.
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
            {media.guest ? (
              <p className="text-sm text-muted-foreground" role="status">
                <Link href="/login" className="font-semibold text-brand underline-offset-2 hover:underline">
                  Sign in
                </Link>{" "}
                and import again to save {media.total} demo GIF{media.total === 1 ? "" : "s"}.
              </p>
            ) : media.total > 0 ? (
              <p className="text-sm text-muted-foreground" role="status">
                {media.done + media.failed < media.total
                  ? `Saving demo GIFs… ${media.done + media.failed} of ${media.total}`
                  : media.failed > 0
                    ? `${media.done} demo GIF${media.done === 1 ? "" : "s"} saved. ${media.failed} did not load.`
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

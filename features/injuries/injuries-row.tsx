"use client";

import { Bandage, Check, ChevronLeft, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DRAWER_CONTENT, SHEET_FOOT } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ListRow, SheetDone, SheetRows } from "@/components/ui/list";
import { SwipeRow } from "@/components/ui/swipe-row";
import { usePendingRemoval } from "@/components/ui/use-pending-removal";
import { BodyPicker, type BodyPick } from "@/features/injuries/body-picker";
import { InjuryWorkoutForm } from "@/features/injuries/injury-workout-form";
import { PainChart, painChartPoints } from "@/features/injuries/pain-chart";
import { PainScore } from "@/features/injuries/pain-score";
import { useWorkoutStore } from "@/features/workout/workout-store";
import {
  activeInjuries,
  injuriesLoadedBy,
  injuryName,
  injuryWorkoutIds,
  injuryWorkoutLine,
  injuryWorkoutProgress,
  injuryWorkoutWeeks,
  isInjurySession,
  latestPain,
  painLogsFor,
  painTrend,
  shouldSeePhysio,
  type PainTrend
} from "@/lib/injuries";
import { formatDayKey, shiftKey } from "@/lib/progress-metrics";
import { offerUndo } from "@/lib/undo";
import type { Injury } from "@/lib/types";
import { cn, todayKey } from "@/lib/utils";

const FIELD_LABEL = "text-[13.5px] font-semibold text-muted-foreground";

const STOP_SIGNS = [
  "It started with a fall or an accident",
  "You cannot put weight on it",
  "You have numbness or weakness",
  "You have a fever, or pain that wakes you at night"
];

const TREND_WORDS: Record<PainTrend, string | undefined> = {
  new: undefined,
  better: "getting better",
  same: "about the same",
  worse: "getting worse"
};

type View =
  | { name: "list" }
  | { name: "healed" }
  | { name: "add" }
  | { name: "check" }
  | { name: "doctor" }
  | { name: "injury"; id: string }
  | { name: "workout"; id: string }
  | { name: "loads"; id: string };

/** How far ahead "May load it" looks: the two weeks someone can still act on. */
const LOAD_DAYS = 14;

interface Draft {
  pick?: BodyPick;
  score?: number;
  worse: string;
  ticked: number[];
}

const NEW_DRAFT: Draft = { worse: "", ticked: [] };

/** A sub-view has its own Back instead of the ✕, so one gesture means one thing. */
function Head({
  title,
  description,
  onBack
}: {
  title: string;
  description?: string;
  onBack?: () => void;
}) {
  if (!onBack) {
    return (
      <DialogHeader className="pr-9">
        <DialogTitle>{title}</DialogTitle>
        {description ? <DialogDescription>{description}</DialogDescription> : null}
      </DialogHeader>
    );
  }
  return (
    <div className="mb-3 flex items-center gap-2">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back"
        className="key-quiet flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <div className="min-w-0">
        <DialogTitle>{title}</DialogTitle>
        {description ? <DialogDescription>{description}</DialogDescription> : null}
      </div>
    </div>
  );
}

function injuryHint(injury: Injury, trend: PainTrend) {
  const since = `Since ${formatDayKey(injury.startDate)}`;
  // A stop sign means no advice from the app, and a trend reads like advice.
  if (injury.stopSign) {
    return `${since} · see a doctor first`;
  }
  const words = TREND_WORDS[trend];
  return words ? `${since} · ${words}` : since;
}

/**
 * The closed row says the one thing worth knowing. The name can shorten on a
 * narrow phone, and the score cannot.
 */
function rowValue(active: Injury[], score?: number) {
  if (active.length === 0) {
    return "None";
  }
  if (active.length > 1) {
    return `${active.length} injuries`;
  }
  return (
    <span className="flex max-w-[46vw] sm:max-w-[12rem]">
      <span className="truncate">{injuryName(active[0])}</span>
      {score === undefined ? null : <span className="shrink-0">&nbsp;· {score} of 10</span>}
    </span>
  );
}

/** Injuries on You: one row, and everything else behind it in one sheet. */
export function InjuriesRow() {
  const injuries = useWorkoutStore((state) => state.injuries);
  const painLogs = useWorkoutStore((state) => state.painLogs);
  const addInjury = useWorkoutStore((state) => state.addInjury);
  const logPain = useWorkoutStore((state) => state.logPain);
  const markInjuryHealed = useWorkoutStore((state) => state.markInjuryHealed);
  const reopenInjury = useWorkoutStore((state) => state.reopenInjury);
  const removeInjury = useWorkoutStore((state) => state.removeInjury);
  const setInjuryWorkout = useWorkoutStore((state) => state.setInjuryWorkout);
  const stopInjuryWorkout = useWorkoutStore((state) => state.stopInjuryWorkout);
  const sessions = useWorkoutStore((state) => state.scheduledSessions);
  const sessionTemplates = useWorkoutStore((state) => state.sessionTemplates);
  const templates = useWorkoutStore((state) => state.templates);

  const router = useRouter();
  const removal = usePendingRemoval();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>({ name: "list" });
  // Kept when the sheet closes: closing by mistake must not lose the form.
  const [draft, setDraft] = useState<Draft>(NEW_DRAFT);

  const shown = useMemo(() => injuries.filter((injury) => !removal.hidden.has(injury.id)), [injuries, removal.hidden]);
  const active = activeInjuries(shown);
  const healed = shown.filter((injury) => injury.healedDate);
  const today = todayKey();

  const openSheet = () => {
    setView({ name: "list" });
    setOpen(true);
  };

  /** The Undo bar sits under an open sheet, so anything that offers Undo closes it. */
  const remove = (injury: Injury) => {
    setOpen(false);
    removal.remove(injury.id, `${injuryName(injury)} deleted`, () => removeInjury(injury.id));
  };

  const heal = (injury: Injury) => {
    markInjuryHealed(injury.id);
    setOpen(false);
    offerUndo({
      label: `${injuryName(injury)} marked as healed`,
      undo: () => reopenInjury(injury.id),
      commit: () => undefined
    });
  };

  const save = (stopSign: boolean) => {
    const { pick, score, worse } = draft;
    if (!pick || score === undefined) {
      return;
    }
    const worseWith = worse.trim();
    addInjury(
      {
        id: crypto.randomUUID(),
        place: pick.place,
        ...(pick.side ? { side: pick.side } : {}),
        startDate: today,
        ...(worseWith ? { worseWith } : {}),
        ...(stopSign ? { stopSign: true } : {})
      },
      score
    );
    setDraft(NEW_DRAFT);
    setView({ name: "list" });
  };

  const duplicate = draft.pick
    ? active.some((injury) => injury.place === draft.pick?.place && injury.side === draft.pick?.side)
    : false;
  const singleScore = active.length === 1 ? latestPain(painLogs, active[0].id)?.score : undefined;
  const opened =
    view.name === "injury" || view.name === "workout" || view.name === "loads"
      ? shown.find((injury) => injury.id === view.id)
      : undefined;

  /** Exercises in the days ahead that may load this injury, once each, with the day they are on. */
  const loadedExercises = (injury: Injury) => {
    const own = injuryWorkoutIds(injuries);
    const until = shiftKey(today, LOAD_DAYS);
    const found = new Map<string, string>();
    for (const session of sessions) {
      if (session.date < today || session.date > until || session.status !== "planned" || isInjurySession(session, own)) {
        continue;
      }
      for (const exercise of session.exercises) {
        const muscles = templates.find((item) => item.id === exercise.workoutId)?.muscles ?? [];
        if (!found.has(exercise.templateName) && injuriesLoadedBy(muscles, [injury]).length > 0) {
          found.set(exercise.templateName, `${session.sessionName} · ${formatDayKey(session.date)}`);
        }
      }
    }
    return [...found.entries()];
  };
  const draftName = draft.pick ? injuryName(draft.pick).toLowerCase() : "";

  const body = () => {
    if (view.name === "add") {
      return (
        <>
          <Head title="Add an injury" onBack={() => setView({ name: "list" })} />
          <p className={FIELD_LABEL}>Tap where it hurts</p>
          <div className="mt-1.5">
            <BodyPicker value={draft.pick} onChange={(pick) => setDraft({ ...draft, pick })} />
          </div>
          {duplicate ? (
            <p className="mb-2 text-sm text-muted-foreground">You already have this one. Go back and log it there.</p>
          ) : null}
          <p className={cn(FIELD_LABEL, "mb-2 mt-2")}>How bad is it today?</p>
          <PainScore label="Pain today" value={draft.score} onChange={(score) => setDraft({ ...draft, score })} />
          <label className={cn(FIELD_LABEL, "mt-3 block")}>
            What makes it worse? (optional)
            <Input
              className="mt-1.5"
              autoCapitalize="sentences"
              placeholder="Long sitting, deep squats"
              maxLength={80}
              value={draft.worse}
              onChange={(event) => setDraft({ ...draft, worse: event.target.value })}
            />
          </label>
          <div className={`${SHEET_FOOT} mt-3`}>
            <Button
              className="w-full"
              disabled={!draft.pick || draft.score === undefined || duplicate}
              onClick={() => setView({ name: "check" })}
            >
              Next
            </Button>
          </div>
        </>
      );
    }

    if (view.name === "check") {
      return (
        <>
          <Head
            title="Any of these?"
            description={`These signs can need a doctor. Most ${draftName} pain has none of them.`}
            onBack={() => setView({ name: "add" })}
          />
          <SheetRows>
            {STOP_SIGNS.map((sign, index) => {
              const on = draft.ticked.includes(index);
              return (
                <button
                  key={sign}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  className="list-row flex min-h-[54px] w-full items-center gap-3 py-2 pl-4 pr-3.5 text-left"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      ticked: on ? draft.ticked.filter((item) => item !== index) : [...draft.ticked, index]
                    })
                  }
                >
                  <span
                    aria-hidden
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                      on ? "key" : "shadow-[inset_0_0_0_1.5px_currentColor] text-muted-foreground"
                    )}
                  >
                    {on ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
                  </span>
                  <span className="min-w-0 flex-1 text-[15px] font-medium">{sign}</span>
                </button>
              );
            })}
          </SheetRows>
          <Button
            className="mt-4 w-full"
            onClick={() => (draft.ticked.length > 0 ? setView({ name: "doctor" }) : save(false))}
          >
            {draft.ticked.length > 0 ? "Next" : "None of these. Save it"}
          </Button>
        </>
      );
    }

    if (view.name === "doctor") {
      return (
        <>
          <Head title="See a doctor first" />
          <p className="text-[15.5px] leading-normal">
            What you ticked can mean something that needs a proper check. Please see a doctor before you train this
            area.
          </p>
          <p className="mt-3 text-[13px] leading-snug text-muted-foreground">
            Arise will keep your log, so you can show it to them. It will not suggest anything for this injury.
          </p>
          <Button className="mt-4 w-full" onClick={() => save(true)}>
            Save my log
          </Button>
          <button
            type="button"
            className="mt-1 h-11 w-full text-sm font-medium text-muted-foreground"
            onClick={() => setView({ name: "check" })}
          >
            Change my answer
          </button>
        </>
      );
    }

    if (view.name === "workout" && opened?.workout) {
      const workout = opened.workout;
      const template = sessionTemplates.find((item) => item.id === workout.sessionTemplateId);
      const { done, total } = injuryWorkoutProgress(workout, sessions);
      return (
        <>
          <Head
            title={template?.name ?? "Workout for this"}
            description={`${injuryWorkoutLine(workout)} · done ${done} of ${total}`}
            onBack={() => setView({ name: "injury", id: opened.id })}
          />
          <InjuryWorkoutForm
            initial={workout.frequency}
            initialWeeks={injuryWorkoutWeeks(workout)}
            submitLabel="Save"
            onSubmit={(frequency, weeks) => {
              setInjuryWorkout(opened.id, workout.sessionTemplateId, frequency, weeks);
              setView({ name: "injury", id: opened.id });
            }}
          />
          <button
            type="button"
            className="mt-1 h-11 w-full text-sm font-medium text-muted-foreground"
            onClick={() => {
              stopInjuryWorkout(opened.id);
              setView({ name: "injury", id: opened.id });
            }}
          >
            Stop this workout
          </button>
        </>
      );
    }

    if (view.name === "loads" && opened) {
      return (
        <>
          <Head
            title="May load it"
            description="A hint from the muscles each exercise works. Your doctor or physio knows better."
            onBack={() => setView({ name: "injury", id: opened.id })}
          />
          <SheetRows>
            {loadedExercises(opened).map(([name, where]) => (
              <ListRow key={name} label={<span className="capitalize">{name}</span>} hint={where} />
            ))}
          </SheetRows>
        </>
      );
    }

    if (view.name === "injury" && opened) {
      const loaded = opened.healedDate ? [] : loadedExercises(opened);
      const logs = painLogsFor(painLogs, opened.id);
      const chart = painChartPoints(logs, today).length >= 2;
      const worse = opened.worseWith ? ` · worse with ${opened.worseWith.toLowerCase()}` : "";
      return (
        <>
          <Head
            title={injuryName(opened)}
            description={`Since ${formatDayKey(opened.startDate)}${worse}`}
            onBack={() => setView(opened.healedDate ? { name: "healed" } : { name: "list" })}
          />
          {opened.healedDate ? (
            <p className="mb-3 text-[15px] text-muted-foreground">Healed {formatDayKey(opened.healedDate)}</p>
          ) : (
            <>
              <p className={cn(FIELD_LABEL, "mb-2")}>How is it today?</p>
              <PainScore
                label="Pain today"
                value={logs.find((log) => log.date === today)?.score}
                onChange={(score) => logPain(opened.id, score)}
              />
            </>
          )}
          {chart ? (
            <>
              <p className={cn(FIELD_LABEL, "mb-1 mt-3")}>The last 8 weeks</p>
              <PainChart logs={logs} today={today} />
            </>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">Log it each week, and your trend shows here.</p>
          )}
          {opened.stopSign ? (
            <p className="notice-line mt-3 font-medium">Please see a doctor before you train this area.</p>
          ) : shouldSeePhysio(opened, painLogs) ? (
            <p className="notice-line mt-3 font-medium">It is worth seeing a physio about this.</p>
          ) : null}
          <div className="mt-2">
            <SheetRows>
              {opened.healedDate ? (
                <ListRow
                  label="It has come back"
                  noChevron
                  onClick={() => {
                    reopenInjury(opened.id);
                    setView({ name: "injury", id: opened.id });
                  }}
                />
              ) : (
                <>
                  {opened.workout ? (
                    <ListRow
                      label="Workout for this"
                      hint={injuryWorkoutLine(opened.workout)}
                      onClick={() => setView({ name: "workout", id: opened.id })}
                    />
                  ) : (
                    <ListRow
                      label="Workout for this"
                      value="Add"
                      // With the sheet still open: closing it first steps back in history,
                      // and that cancels this. Leaving the page closes it anyway.
                      onClick={() => router.push(`/plan?mode=build&injury=${encodeURIComponent(opened.id)}`)}
                    />
                  )}
                  {loaded.length > 0 ? (
                    <ListRow
                      label="May load it"
                      value={`${loaded.length} in your plan`}
                      onClick={() => setView({ name: "loads", id: opened.id })}
                    />
                  ) : null}
                  <ListRow label="It has healed" noChevron onClick={() => heal(opened)} />
                </>
              )}
            </SheetRows>
          </div>
          <button
            type="button"
            className="mt-1 h-11 w-full text-sm font-medium text-muted-foreground"
            onClick={() => remove(opened)}
          >
            Delete this injury
          </button>
        </>
      );
    }

    if (view.name === "healed") {
      return (
        <>
          <Head title="Healed" onBack={() => setView({ name: "list" })} />
          <SheetRows>
            {healed.map((injury) => (
              <SwipeRow key={injury.id} className="list-row" onDelete={() => remove(injury)}>
                <ListRow
                  label={injuryName(injury)}
                  hint={injury.healedDate ? `Healed ${formatDayKey(injury.healedDate)}` : undefined}
                  onClick={() => setView({ name: "injury", id: injury.id })}
                />
              </SwipeRow>
            ))}
          </SheetRows>
        </>
      );
    }

    return (
      <>
        <Head
          title="Injuries"
          description="A small pain is easier to fix early. Log it, and see if it is getting better."
        />
        {shown.length === 0 ? (
          <Button className="mt-2 w-full" onClick={() => setView({ name: "add" })}>
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            Add an injury
          </Button>
        ) : (
          <SheetRows>
            {active.map((injury) => {
              const score = latestPain(painLogs, injury.id)?.score;
              return (
                <SwipeRow key={injury.id} className="list-row" onDelete={() => remove(injury)}>
                  <ListRow
                    label={injuryName(injury)}
                    hint={injuryHint(injury, painTrend(painLogs, injury.id))}
                    value={score === undefined ? undefined : `${score} of 10`}
                    onClick={() => setView({ name: "injury", id: injury.id })}
                  />
                </SwipeRow>
              );
            })}
            <ListRow icon={Plus} label="Add an injury" noChevron onClick={() => setView({ name: "add" })} />
            {healed.length > 0 ? (
              <ListRow label="Healed" value={healed.length} onClick={() => setView({ name: "healed" })} />
            ) : null}
          </SheetRows>
        )}
        <p className="mt-3 text-[13px] leading-snug text-muted-foreground">
          Arise does not diagnose. If pain stays or gets worse, see a doctor or physio.
        </p>
        {shown.length > 0 ? <SheetDone /> : null}
      </>
    );
  };

  const isList = view.name === "list";
  const hasDescription =
    isList ||
    view.name === "check" ||
    view.name === "loads" ||
    (view.name === "workout" && Boolean(opened?.workout)) ||
    (view.name === "injury" && Boolean(opened));

  return (
    <>
      <ListRow icon={Bandage} label="Injuries" value={rowValue(active, singleScore)} onClick={openSheet} />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className={`${DRAWER_CONTENT} max-h-[88dvh] overflow-y-auto`}
          hideClose={!isList && view.name !== "doctor"}
          {...(hasDescription ? {} : { "aria-describedby": undefined })}
        >
          {body()}
        </DialogContent>
      </Dialog>
    </>
  );
}

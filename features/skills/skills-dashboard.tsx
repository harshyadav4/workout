"use client";

import { Check, ChevronLeft, Lock, Plus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DRAWER_CONTENT,
  SHEET_FOOT
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ListGroup, ListRow, ListSheet, SheetRows } from "@/components/ui/list";
import { NumberInput } from "@/components/ui/number-input";
import { Segmented } from "@/components/ui/segmented";
import { SwipeRow } from "@/components/ui/swipe-row";
import { usePendingRemoval } from "@/components/ui/use-pending-removal";
import { ExercisePicker } from "@/features/planner/exercise-picker";
import { useMarkSkillsFound } from "@/features/skills/skill-doors";
import { ExerciseDemoButton } from "@/features/workout/exercise-media-dialog";
import { useWorkoutStore } from "@/features/workout/workout-store";
import { deriveEngagement, loadExercises, type Exercise } from "@/lib/exercises";
import { datasetIdOf } from "@/lib/media";
import { SKILL_TEMPLATES, evaluateLevel, levelTarget, skillProgress, type SkillProgress } from "@/lib/skills";
import type { MuscleId, SkillGoal, SkillLevel, WorkoutTemplate } from "@/lib/types";
import { cn } from "@/lib/utils";

const HEADING ="font-heading text-[34px] leading-[1.08]";

const METRICS = [
  { id: "reps", label: "Reps" },
  { id: "time", label: "Hold" }
] as const;

/** Same movement: the same id, or the same library entry under another name. */
function sameExercise(a: string, b: string) {
  return a === b || (datasetIdOf(a) !== undefined && datasetIdOf(a) === datasetIdOf(b));
}

function formatDay(key: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${key}T00:00:00Z`)
  );
}

/** "12s of 20s": the best set on a level against its target. */
function bestOfTarget(best: number, level: SkillLevel) {
  const unit = level.metric === "time" ? "s" : "";
  return `${best}${unit} of ${level.target}${unit}`;
}

/** A library exercise as a workout template the plan can hold, muscles and all. */
async function templateForLevel(level: SkillLevel, existing: WorkoutTemplate[]): Promise<WorkoutTemplate | undefined> {
  const known = existing.find((item) => item.id === level.workoutId);
  if (known) {
    return known;
  }
  const datasetId = datasetIdOf(level.workoutId);
  const entry = datasetId ? (await loadExercises()).find((item) => item.id === datasetId) : undefined;
  if (!entry) {
    return undefined;
  }
  return {
    id: level.workoutId,
    dbId: entry.id,
    name: level.name,
    category: entry.bodyPart,
    equipment: entry.equipment,
    isPreset: false,
    muscles: Object.entries(deriveEngagement(entry)).map(([muscleId, engagement]) => ({
      muscleId: muscleId as MuscleId,
      engagement: engagement ?? 0
    }))
  };
}

/** The best set against the bar: how close the next level is. The words beside it say the number. */
function SkillBar({ ratio, className }: { ratio: number; className?: string }) {
  return (
    <span aria-hidden className={cn("block h-1 overflow-hidden rounded-full bg-track", className)}>
      <span className="mana-fill block h-full rounded-full" style={{ width: `${ratio * 100}%` }} />
    </span>
  );
}

/** One skill in the list: the level, the rung you are on, and how close the next one is. */
function SkillRow({ goal, onOpen }: { goal: SkillGoal; onOpen: () => void }) {
  const setLogs = useWorkoutStore((state) => state.setLogs);
  const progress = useMemo(() => skillProgress(goal, setLogs), [goal, setLogs]);
  const { current } = progress;

  return (
    <ListRow
      label={<span className="font-heading text-[23px] leading-tight">{goal.name}</span>}
      hint={
        <span className="block pb-1.5 tabular-nums">
          Level {progress.level} of {progress.total} · {current ? `Now: ${current.name}` : "Mastered"}
          {/* One width for the number, so the bars in a list can be compared. */}
          <span className="mt-2 flex items-center gap-2.5">
            <SkillBar ratio={progress.ratio} className="min-w-0 flex-1" />
            {current ? (
              <span className="min-w-[3.75rem] shrink-0 text-right text-[12.5px]">
                <span className="sr-only">Best set </span>
                {bestOfTarget(progress.best, current)}
              </span>
            ) : (
              <span className="min-w-[3.75rem] shrink-0 text-right text-[12.5px] font-semibold text-brand">MAX</span>
            )}
          </span>
        </span>
      }
      onClick={onOpen}
    />
  );
}

/** One rung of the ladder: cleared and when, the one you are on, or still locked. */
function LevelRow({
  level,
  number,
  cleared,
  isCurrent,
  clearedOn
}: {
  level: SkillLevel;
  number: number;
  cleared: boolean;
  isCurrent: boolean;
  clearedOn?: string;
}) {
  return (
    <li className="list-row flex min-h-12 items-center gap-3 py-2 pl-4 pr-4">
      <span className={cn("w-4 shrink-0 text-[13px] tabular-nums", isCurrent ? "font-semibold text-brand" : "text-muted-foreground")}>
        {number}
      </span>
      <span className={cn("min-w-0 flex-1 text-[15px]", isCurrent && "font-medium", !cleared && !isCurrent && "text-muted-foreground")}>
        {level.name}
      </span>
      <span className="shrink-0 text-[13px] tabular-nums text-muted-foreground">{levelTarget(level)}</span>
      {/* One width for all three, so the targets stay in a column. */}
      <span className="flex w-[4.25rem] shrink-0 items-center justify-end gap-1 text-[13px] tabular-nums text-muted-foreground">
        {cleared ? (
          <>
            <Check className="h-4 w-4 shrink-0 text-[var(--l2)]" strokeWidth={2.4} aria-label="Cleared" />
            {clearedOn ? formatDay(clearedOn) : ""}
          </>
        ) : isCurrent ? (
          <span className="font-medium text-brand">Now</span>
        ) : (
          <Lock className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} aria-label="Locked" />
        )}
      </span>
    </li>
  );
}

/** Inside the sheet, so a message from last time is gone when it opens again. */
function SkillDetail({ goal, progress, onRemove }: { goal: SkillGoal; progress: SkillProgress; onRemove: () => void }) {
  const setLogs = useWorkoutStore((state) => state.setLogs);
  const sessionTemplates = useWorkoutStore((state) => state.sessionTemplates);
  const templates = useWorkoutStore((state) => state.templates);
  const applySkillLevelToPlans = useWorkoutStore((state) => state.applySkillLevelToPlans);

  const results = useMemo(() => goal.levels.map((level) => evaluateLevel(level, setLogs)), [goal, setLogs]);
  const [message, setMessage] = useState<string>();

  // Offered when a session still has a rung below the one you are on, and not
  // the current one yet — "you have outgrown this; swap it in?"
  const current = progress.current;
  const planned = sessionTemplates.flatMap((session) => session.exercises.map((exercise) => exercise.workoutId));
  const below = goal.levels.slice(0, progress.currentIndex);
  const outgrown = [...new Set(planned.filter((id) => below.some((level) => sameExercise(id, level.workoutId))))];
  const canSwap = Boolean(current) && outgrown.length > 0 && !planned.some((id) => current && sameExercise(id, current.workoutId));

  const swap = async () => {
    if (!current) {
      return;
    }
    const template = await templateForLevel(current, templates);
    if (!template) {
      setMessage("Cannot load that exercise. Try again.");
      return;
    }
    const replaced = applySkillLevelToPlans({ replaceWorkoutIds: outgrown, level: current, template });
    setMessage(`${current.name} is now in ${replaced} ${replaced === 1 ? "place" : "places"} in your plan.`);
  };

  return (
    <div className="space-y-5">
      {current ? (
        <div>
          <div className="flex items-center gap-1">
            <div className="min-w-0 flex-1">
              <p className="text-[17px] font-medium leading-snug">Now: {current.name}</p>
              <p className="mt-0.5 text-[13px] tabular-nums text-muted-foreground">Target {levelTarget(current)}</p>
            </div>
            <ExerciseDemoButton workoutId={current.workoutId} name={current.name} />
          </div>
          <SkillBar ratio={progress.ratio} className="mt-3" />
          <p className="mt-2 text-[13px] tabular-nums text-muted-foreground">
            {progress.best > 0
              ? `Best set ${bestOfTarget(progress.best, current)} · every set must hit it`
              : `Add ${current.name} to a workout to start.`}
          </p>
        </div>
      ) : (
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[17px] font-medium leading-snug">You completed every level.</p>
            <span className="shrink-0 text-[13px] font-semibold text-brand">MAX</span>
          </div>
          <SkillBar ratio={1} className="mt-3" />
        </div>
      )}

      {canSwap || message ? (
        <div className="space-y-2">
          {canSwap ? (
            <Button className="w-full" onClick={swap}>
              Use in my plan
            </Button>
          ) : null}
          {message ? (
            <p role="status" className="text-[13px] text-muted-foreground">
              {message}
            </p>
          ) : null}
        </div>
      ) : null}

      <div>
        <h3 className="mb-1 text-[13.5px] font-semibold text-muted-foreground">Levels</h3>
        <SheetRows>
          <ol>
            {goal.levels.map((level, index) => (
              <LevelRow
                key={`${level.workoutId}-${index}`}
                level={level}
                number={index + 1}
                cleared={index < progress.level}
                isCurrent={index === progress.currentIndex}
                clearedOn={results[index].clearedOn}
              />
            ))}
          </ol>
        </SheetRows>
      </div>

      {/* The rare one: the last thing in the sheet, and it can be undone. */}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove goal ${goal.name}`}
        className="h-11 w-full rounded-full text-sm font-medium text-muted-foreground transition-colors active:bg-hi"
      >
        Remove goal
      </button>
    </div>
  );
}

/**
 * A skill's sheet: where it stands, what to do next, and the whole ladder. Stays
 * mounted with no goal: a Dialog that mounts already open is closed again by its
 * own history entry (useSheetHistory) under React's double effect in development.
 */
function SkillSheet({
  goal,
  open,
  onOpenChange,
  onRemove
}: {
  goal?: SkillGoal;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRemove: (goal: SkillGoal) => void;
}) {
  const setLogs = useWorkoutStore((state) => state.setLogs);
  const progress = useMemo(() => (goal ? skillProgress(goal, setLogs) : undefined), [goal, setLogs]);

  return (
    <ListSheet
      open={open && Boolean(goal)}
      onOpenChange={onOpenChange}
      title={goal?.name}
      description={progress && (progress.mastered ? "Mastered" : `Level ${progress.level} of ${progress.total}`)}
    >
      {goal && progress ? <SkillDetail goal={goal} progress={progress} onRemove={() => onRemove(goal)} /> : null}
    </ListSheet>
  );
}

/** A ladder of your own: a name, and exercises from the library, easiest first. */
function CustomSkillBuilder({
  name,
  setName,
  levels,
  setLevels,
  onBack,
  onDone
}: {
  name: string;
  setName: (name: string) => void;
  levels: SkillLevel[];
  setLevels: Dispatch<SetStateAction<SkillLevel[]>>;
  onBack: () => void;
  onDone: () => void;
}) {
  const addSkillGoal = useWorkoutStore((state) => state.addSkillGoal);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string>();

  // Back from the picker, the level just added is what you came to see. The
  // picker and this form share one scroll, so it could be under the foot.
  const newest = useRef<HTMLDivElement>(null);
  const justAdded = useRef(false);
  useEffect(() => {
    if (!picking && justAdded.current) {
      justAdded.current = false;
      newest.current?.scrollIntoView({ block: "center" });
    }
  }, [picking]);

  // Any change to the form answers the error it may have been fixing.
  const changeLevels = (change: (current: SkillLevel[]) => SkillLevel[]) => {
    setLevels(change);
    setError(undefined);
  };

  const patch = (index: number, change: Partial<SkillLevel>) =>
    changeLevels((current) => current.map((level, i) => (i === index ? { ...level, ...change } : level)));

  const addFromLibrary = (exercise: Exercise) => {
    const hold = /\b(hold|plank|l-sit|hang|handstand)\b/i.test(exercise.name);
    changeLevels((current) => [
      ...current,
      {
        workoutId: `db-${exercise.id}`,
        name: exercise.name.replace(/^\w/, (letter) => letter.toUpperCase()),
        metric: hold ? "time" : "reps",
        sets: 3,
        target: hold ? 20 : 8
      }
    ]);
    justAdded.current = true;
    setPicking(false);
  };

  const save = () => {
    if (!name.trim()) {
      setError("Type a name for the skill.");
      return;
    }
    if (levels.length === 0) {
      setError("Add 1 or more levels.");
      return;
    }
    addSkillGoal({ id: crypto.randomUUID(), name: name.trim(), levels, createdAt: new Date().toISOString() });
    onDone();
  };

  // The picker swaps in place, not as a second dialog (see ExercisePicker).
  if (picking) {
    return <ExercisePicker onBack={() => setPicking(false)} onPick={addFromLibrary} />;
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Back to new goal"
            className="key-quiet flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
            onClick={onBack}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <DialogTitle className="min-w-0">Custom skill</DialogTitle>
        </div>
        <DialogDescription>
          Each exercise is 1 level. To clear a level, do 1 workout where every set reaches its target. Add exercises, easiest first.
        </DialogDescription>
      </div>

      <label className="block text-xs font-medium text-muted-foreground">
        Skill name
        <Input
          className="mt-1"
          autoCapitalize="words"
          value={name}
          placeholder="Front lever"
          onChange={(event) => {
            setName(event.target.value);
            setError(undefined);
          }}
        />
      </label>

      <SheetRows>
        {levels.map((level, index) => (
          <div
            key={`${level.workoutId}-${index}`}
            ref={index === levels.length - 1 ? newest : undefined}
            className="list-row py-2 pl-4 pr-1.5"
          >
            <div className="flex min-h-10 items-center gap-3">
              <span className="w-4 shrink-0 text-[13px] tabular-nums text-muted-foreground">{index + 1}</span>
              <span className="min-w-0 flex-1 text-[15.5px] font-medium">{level.name}</span>
              <button
                type="button"
                aria-label={`Remove ${level.name}`}
                onClick={() => changeLevels((current) => current.filter((_, i) => i !== index))}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors active:bg-hi"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_4.25rem_4.25rem] items-end gap-2 pb-2 pl-7 pr-2.5">
              <Segmented
                quiet
                size="sm"
                aria-label={`How ${level.name} is measured`}
                options={METRICS}
                value={level.metric}
                onChange={(metric) => patch(index, { metric })}
              />
              <label className="block text-xs font-medium text-muted-foreground">
                Sets
                <NumberInput
                  min={1}
                  className="mt-1 px-0 text-center"
                  value={level.sets}
                  onValueChange={(sets) => patch(index, { sets: Math.max(1, Math.round(sets)) })}
                />
              </label>
              <label className="block text-xs font-medium text-muted-foreground">
                {level.metric === "time" ? "Seconds" : "Reps"}
                <NumberInput
                  min={1}
                  className="mt-1 px-0 text-center"
                  value={level.target}
                  onValueChange={(target) => patch(index, { target: Math.max(1, Math.round(target)) })}
                />
              </label>
            </div>
          </div>
        ))}
        <ListRow icon={Plus} label="Add level" noChevron onClick={() => setPicking(true)} />
      </SheetRows>

      <div className={SHEET_FOOT}>
        {error ? <p className="mb-2 text-center text-sm text-danger">{error}</p> : null}
        <Button className="w-full" onClick={save}>
          Save skill
        </Button>
      </div>
    </div>
  );
}

/** Pick a ready-made skill, or build one in the same sheet. */
function NewGoalSheet({
  open,
  onOpenChange,
  custom,
  onCustomChange
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  custom: boolean;
  onCustomChange: (custom: boolean) => void;
}) {
  const goals = useWorkoutStore((state) => state.skillGoals);
  const addSkillGoal = useWorkoutStore((state) => state.addSkillGoal);
  const available = SKILL_TEMPLATES.filter((skill) => !goals.some((goal) => goal.templateKey === skill.key));
  // The draft lives out here, outside the sheet: Back, Escape or a swipe closes
  // the whole sheet, even from the picker, and must not lose what was typed.
  const [name, setName] = useState("");
  const [levels, setLevels] = useState<SkillLevel[]>([]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${DRAWER_CONTENT} max-h-[88dvh] overflow-y-auto`} hideClose={custom}>
        {custom ? (
          <CustomSkillBuilder
            name={name}
            setName={setName}
            levels={levels}
            setLevels={setLevels}
            onBack={() => onCustomChange(false)}
            onDone={() => {
              setName("");
              setLevels([]);
              onOpenChange(false);
            }}
          />
        ) : (
          <>
            <DialogHeader className="pr-9">
              <DialogTitle>New goal</DialogTitle>
              <DialogDescription>Pick a goal to start.</DialogDescription>
            </DialogHeader>
            <SheetRows>
              {available.map((skill) => (
                <ListRow
                  key={skill.key}
                  label={skill.name}
                  hint={`${skill.levels.length} levels · up to ${skill.goal}`}
                  // A tap adds it at once, so a plus and not a chevron.
                  value={<Plus className="h-4 w-4" aria-hidden />}
                  noChevron
                  onClick={() => {
                    addSkillGoal({
                      id: crypto.randomUUID(),
                      name: skill.name,
                      templateKey: skill.key,
                      levels: skill.levels,
                      createdAt: new Date().toISOString()
                    });
                    onOpenChange(false);
                  }}
                />
              ))}
              <ListRow label="Custom skill" hint="Choose your own levels" onClick={() => onCustomChange(true)} />
            </SheetRows>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function SkillsDashboard() {
  const goals = useWorkoutStore((state) => state.skillGoals);
  const removeSkillGoal = useWorkoutStore((state) => state.removeSkillGoal);
  // Removals hide at once and commit after the Undo bar (components/ui/undo-bar).
  const removal = usePendingRemoval();
  // Whichever door led here, the window is found now.
  useMarkSkillsFound();

  // The goal stays set after `sheetOpen` goes false, so the sheet keeps its
  // words while it slides away.
  const [sheetGoalId, setSheetGoalId] = useState<string>();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [custom, setCustom] = useState(false);

  const shown = goals.filter((goal) => !removal.hidden.has(goal.id));
  const sheetGoal = goals.find((goal) => goal.id === sheetGoalId);
  const removeGoal = (goal: SkillGoal) =>
    removal.remove(goal.id, `${goal.name} removed`, () => removeSkillGoal(goal.id));

  return (
    <section className="space-y-5">
      {shown.length > 0 ? (
        <>
          <h2 className={cn(HEADING, "px-1 pt-3")}>Skills</h2>
          <ListGroup>
            {shown.map((goal) => (
              <SwipeRow key={goal.id} className="list-row" label="Remove" onDelete={() => removeGoal(goal)}>
                <SkillRow
                  goal={goal}
                  onOpen={() => {
                    setSheetGoalId(goal.id);
                    setSheetOpen(true);
                  }}
                />
              </SwipeRow>
            ))}
          </ListGroup>
        </>
      ) : (
        <div className="px-1 pt-3">
          <h2 className={HEADING}>No skills yet</h2>
          <p className="mt-2.5 text-[15px] text-muted-foreground">
            A skill is a hard exercise that you learn in levels, like a pull-up or a handstand.
          </p>
          <p className="mt-2 text-[15px] text-muted-foreground">
            Log a workout where every set reaches a level&apos;s target. Then the next level unlocks.
          </p>
        </div>
      )}

      <Button
        className="w-full"
        onClick={() => {
          setCustom(false);
          setAdding(true);
        }}
      >
        <Plus className="h-4 w-4" strokeWidth={2.5} />
        New goal
      </Button>

      <SkillSheet
        goal={sheetGoal}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onRemove={(goal) => {
          removeGoal(goal);
          setSheetOpen(false);
        }}
      />

      <NewGoalSheet open={adding} onOpenChange={setAdding} custom={custom} onCustomChange={setCustom} />
    </section>
  );
}

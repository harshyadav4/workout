"use client";

import { Check, ChevronDown, Lock, Plus, Swords, X } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DRAWER_CONTENT, Dialog, DialogContent } from "@/components/ui/dialog";
import { InfoNote } from "@/components/ui/info-note";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { ExercisePicker } from "@/features/planner/exercise-picker";
import { useMarkSkillsFound } from "@/features/skills/skill-doors";
import { ExerciseDemoButton } from "@/features/workout/exercise-media-dialog";
import { useWorkoutStore } from "@/features/workout/workout-store";
import { deriveEngagement, loadExercises, type Exercise } from "@/lib/exercises";
import { datasetIdOf } from "@/lib/media";
import { SKILL_TEMPLATES, evaluateLevel, levelTarget, skillProgress } from "@/lib/skills";
import type { MuscleId, SkillGoal, SkillLevel, WorkoutTemplate } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Same movement: the same id, or the same library entry under another name. */
function sameExercise(a: string, b: string) {
  return a === b || (datasetIdOf(a) !== undefined && datasetIdOf(a) === datasetIdOf(b));
}

function formatDay(key: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${key}T00:00:00Z`)
  );
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

/**
 * One skill, Solo Leveling style: the level, the rung you are on and how close
 * your best set is to clearing it, and the whole ladder behind a tap.
 */
function SkillCard({ goal }: { goal: SkillGoal }) {
  const setLogs = useWorkoutStore((state) => state.setLogs);
  const sessionTemplates = useWorkoutStore((state) => state.sessionTemplates);
  const templates = useWorkoutStore((state) => state.templates);
  const removeSkillGoal = useWorkoutStore((state) => state.removeSkillGoal);
  const applySkillLevelToPlans = useWorkoutStore((state) => state.applySkillLevelToPlans);

  const progress = useMemo(() => skillProgress(goal, setLogs), [goal, setLogs]);
  const results = useMemo(() => goal.levels.map((level) => evaluateLevel(level, setLogs)), [goal, setLogs]);
  const [open, setOpen] = useState(false);
  const [armed, setArmed] = useState(false);
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
    <Card className="system-pop">
      <div className="flex items-start gap-3">
        <span className="key flex h-11 w-11 shrink-0 items-center justify-center rounded-xl">
          <Swords className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-lg font-bold leading-tight tracking-tight">{goal.name}</p>
          <p className="text-xs text-muted-foreground">
            {progress.mastered ? "Mastered" : `Level ${progress.level} of ${progress.total}`}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-3 py-1 font-display text-sm font-extrabold tabular-nums",
            progress.mastered ? "bg-success/15 text-success" : "bg-brand/15 text-brand"
          )}
        >
          {progress.mastered ? "MAX" : `Lv ${progress.level}`}
        </span>
      </div>

      {current ? (
        <div className="mt-4">
          <div className="flex items-center gap-1">
            <p className="min-w-0 truncate text-sm font-semibold">Now: {current.name}</p>
            <ExerciseDemoButton workoutId={current.workoutId} name={current.name} />
            <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
              target {levelTarget(current)}
            </span>
          </div>
          {/* The best single set against the bar: how close the next level is. */}
          <div className="well mt-2 h-3 overflow-hidden rounded-full">
            <div className="mana-fill h-full rounded-full" style={{ width: `${Math.max(4, progress.ratio * 100)}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground tabular-nums">
            {progress.best > 0
              ? `Best set ${progress.best}${current.metric === "time" ? "s" : ""} of ${current.target}${current.metric === "time" ? "s" : ""} · every set must hit it`
              : `Add ${current.name} to a workout to start.`}
          </p>
        </div>
      ) : (
        <p className="mt-4 text-sm text-success">You completed every level.</p>
      )}

      {canSwap ? (
        <Button variant="secondary" className="mt-3 w-full" onClick={swap}>
          Use in my plan
        </Button>
      ) : null}
      {message ? <p className="mt-2 text-xs text-success">{message}</p> : null}

      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="mt-3 flex min-h-11 w-full items-center justify-between rounded-lg text-xs font-semibold text-muted-foreground"
      >
        All levels
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <ol className="space-y-1.5">
          {goal.levels.map((level, index) => {
            const cleared = index < progress.level;
            const isCurrent = index === progress.currentIndex;
            return (
              <li
                key={`${level.workoutId}-${index}`}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm",
                  isCurrent ? "bg-brand/10 ring-1 ring-brand/40" : "well"
                )}
              >
                <span className="w-5 shrink-0 text-xs font-bold text-muted-foreground tabular-nums">{index + 1}</span>
                <span className={cn("min-w-0 flex-1 truncate font-semibold", !cleared && !isCurrent && "text-muted-foreground")}>
                  {level.name}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{levelTarget(level)}</span>
                {cleared ? (
                  <span className="flex shrink-0 items-center gap-1 text-[11px] font-semibold text-brand">
                    <Check className="h-3.5 w-3.5" aria-label="Cleared" />
                    {results[index].clearedOn ? formatDay(results[index].clearedOn!) : ""}
                  </span>
                ) : isCurrent ? null : (
                  <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Locked" />
                )}
              </li>
            );
          })}
        </ol>
      ) : null}

      <button
        type="button"
        onClick={() => (armed ? removeSkillGoal(goal.id) : setArmed(true))}
        onBlur={() => setArmed(false)}
        className={cn(
          "mx-auto mt-2 flex min-h-11 items-center justify-center rounded-lg px-4 text-xs font-semibold",
          armed ? "bg-danger/15 text-danger ring-1 ring-danger/50" : "text-muted-foreground"
        )}
      >
        {armed ? `Tap again to remove ${goal.name}` : "Remove goal"}
      </button>
    </Card>
  );
}

/** A ladder of your own: a name, and exercises from the library, easiest first. */
function CustomSkillBuilder({ onDone }: { onDone: () => void }) {
  const addSkillGoal = useWorkoutStore((state) => state.addSkillGoal);
  const [name, setName] = useState("");
  const [levels, setLevels] = useState<SkillLevel[]>([]);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string>();

  const patch = (index: number, change: Partial<SkillLevel>) =>
    setLevels((current) => current.map((level, i) => (i === index ? { ...level, ...change } : level)));

  const addFromLibrary = (exercise: Exercise) => {
    const hold = /\b(hold|plank|l-sit|hang|handstand)\b/i.test(exercise.name);
    setLevels((current) => [
      ...current,
      {
        workoutId: `db-${exercise.id}`,
        name: exercise.name.replace(/^\w/, (letter) => letter.toUpperCase()),
        metric: hold ? "time" : "reps",
        sets: 3,
        target: hold ? 20 : 8
      }
    ]);
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

  return (
    <Card>
      <InfoNote
        heading={<p className="font-display text-lg font-bold tracking-tight">Custom skill</p>}
        note={<p>Each exercise is 1 level. To clear a level, do 1 workout where every set reaches its target.</p>}
      />
      <p className="mt-1 text-xs text-muted-foreground">Add exercises, easiest first.</p>
      <label className="mt-4 block text-xs text-muted-foreground">
        Skill name
        <Input className="mt-1" value={name} placeholder="Front lever" onChange={(event) => setName(event.target.value)} />
      </label>

      <ol className="mt-4 space-y-2">
        {levels.map((level, index) => (
          <li key={`${level.workoutId}-${index}`} className="well rounded-xl p-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-muted-foreground">Lv {index + 1}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{level.name}</span>
              <button
                type="button"
                aria-label={`Remove ${level.name}`}
                onClick={() => setLevels((current) => current.filter((_, i) => i !== index))}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <div className="col-span-3 grid grid-cols-2 gap-1 rounded-lg bg-card p-1">
                {(["reps", "time"] as const).map((metric) => (
                  <button
                    key={metric}
                    type="button"
                    aria-pressed={level.metric === metric}
                    onClick={() => patch(index, { metric })}
                    className={cn("h-9 rounded-md text-xs font-semibold", level.metric === metric ? "key" : "text-muted-foreground")}
                  >
                    {metric === "reps" ? "Reps" : "Hold (seconds)"}
                  </button>
                ))}
              </div>
              <label className="text-[11px] text-muted-foreground">
                Sets
                <NumberInput min={1} className="mt-1" value={level.sets} onValueChange={(sets) => patch(index, { sets: Math.max(1, Math.round(sets)) })} />
              </label>
              <label className="col-span-2 text-[11px] text-muted-foreground">
                {level.metric === "time" ? "Seconds per set" : "Reps per set"}
                <NumberInput min={1} className="mt-1" value={level.target} onValueChange={(target) => patch(index, { target: Math.max(1, Math.round(target)) })} />
              </label>
            </div>
          </li>
        ))}
      </ol>

      <Button variant="secondary" className="mt-3 w-full" onClick={() => setPicking(true)}>
        <Plus className="h-4 w-4" />
        Add level
      </Button>
      {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button onClick={save}>Save skill</Button>
      </div>

      <Dialog open={picking} onOpenChange={setPicking}>
        <DialogContent className={`${DRAWER_CONTENT} max-h-[85dvh] overflow-y-auto`}>
          <ExercisePicker onBack={() => setPicking(false)} onPick={addFromLibrary} />
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/** Pick a ready-made skill, or build one. */
function NewGoal({ onDone }: { onDone: () => void }) {
  const goals = useWorkoutStore((state) => state.skillGoals);
  const addSkillGoal = useWorkoutStore((state) => state.addSkillGoal);
  const [custom, setCustom] = useState(false);
  const available = SKILL_TEMPLATES.filter((skill) => !goals.some((goal) => goal.templateKey === skill.key));

  if (custom) {
    return <CustomSkillBuilder onDone={onDone} />;
  }

  return (
    <Card>
      <div className="flex items-center justify-between">
        <p className="font-display text-lg font-bold tracking-tight">New goal</p>
        <button type="button" aria-label="Close" onClick={onDone} className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <ul className="mt-3 space-y-2">
        {available.map((skill) => (
          <li key={skill.key}>
            <button
              type="button"
              onClick={() => {
                addSkillGoal({
                  id: crypto.randomUUID(),
                  name: skill.name,
                  templateKey: skill.key,
                  levels: skill.levels,
                  createdAt: new Date().toISOString()
                });
                onDone();
              }}
              className="well flex min-h-14 w-full items-center gap-3 rounded-xl px-4 py-3 text-left"
            >
              <Swords className="h-5 w-5 shrink-0 text-brand" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{skill.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {skill.levels.length} levels · up to {skill.goal}
                </span>
              </span>
              <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          </li>
        ))}
      </ul>
      <Button variant="secondary" className="mt-3 w-full" onClick={() => setCustom(true)}>
        Custom skill
      </Button>
    </Card>
  );
}

export function SkillsDashboard() {
  const goals = useWorkoutStore((state) => state.skillGoals);
  // Whichever door led here, the window is found now.
  useMarkSkillsFound();
  const [adding, setAdding] = useState(false);

  return (
    <section className="space-y-4">
      {goals.length === 0 && !adding ? (
        <Card>
          <InfoNote
            heading={<p className="font-display text-xl font-bold tracking-tight">No skills yet</p>}
            note={
              <>
                <p>A skill is a hard exercise that you learn in levels, like a pull-up or a handstand.</p>
                <p>Log a workout where every set reaches a level&apos;s target. Then the next level unlocks.</p>
              </>
            }
          />
          <p className="mt-1 text-sm text-muted-foreground">Pick a goal to start.</p>
        </Card>
      ) : null}

      {goals.map((goal) => (
        <SkillCard key={goal.id} goal={goal} />
      ))}

      {adding ? (
        <NewGoal onDone={() => setAdding(false)} />
      ) : (
        <Button size="lg" className="w-full" onClick={() => setAdding(true)}>
          <Plus className="h-5 w-5" />
          New goal
        </Button>
      )}
    </section>
  );
}

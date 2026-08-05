"use client";

import { useMemo, useState } from "react";

import { MuscleMapCard } from "@/features/home/muscle-map-card";
import { BodyWeightCard } from "@/features/progress/body-weight-card";
import { ConsistencyCard, RhythmCard } from "@/features/progress/consistency-cards";
import { CumulativeCard } from "@/features/progress/cumulative-card";
import { LoadCard } from "@/features/progress/load-card";
import { MuscleSplitCard, WeeklySetsCard } from "@/features/progress/muscle-cards";
import {
  MuscleDoseCard,
  MuscleHeroFooter,
  MuscleVolumeCard
} from "@/features/progress/muscle-detail";
import { MuscleGirthCard } from "@/features/progress/muscle-girth-card";
import { MuscleLiftsCard } from "@/features/progress/muscle-lifts-card";
import { MuscleMatrixCard } from "@/features/progress/muscle-matrix-card";
import { MuscleRankCard } from "@/features/progress/muscle-rank-card";
import { Panel, SectionRule } from "@/features/progress/panel";
import { PRLedgerCard } from "@/features/progress/pr-ledger-card";
import { ProgressFilters } from "@/features/progress/progress-filters";
import { ProgressHeadline } from "@/features/progress/progress-headline";
import { ProgressTableCard } from "@/features/progress/progress-table-card";
import { SplitDriftCard } from "@/features/progress/split-drift-card";
import { StrengthGrowthCard } from "@/features/progress/strength-cards";
import { TopSetWall } from "@/features/progress/top-set-wall";
import { VolumeDetailCard } from "@/features/progress/volume-detail-card";
import { VolumeTrendCard } from "@/features/progress/volume-trend-card";
import { YearSpine } from "@/features/progress/year-spine";
import { useWorkoutStore } from "@/features/workout/workout-store";
import {
  attributeToMuscle,
  bucketFor,
  buildCalendar,
  buildExerciseTotals,
  buildMuscleGroupVolume,
  buildMuscleVolume,
  buildRestStats,
  buildStrengthGrowth,
  buildTrend,
  buildWeekdayRhythm,
  buildWeeklySetsByGroup,
  earliestLogDate,
  filterByMuscle,
  filterByWindow,
  muscleWeeklySets,
  previousWindow,
  rangeWindow,
  summarize,
  type DateWindow,
  type ProgressRange
} from "@/lib/progress-metrics";
import {
  MATRIX_MIN_COLUMNS,
  buildCumulativeVolume,
  buildMuscleMatrix,
  buildPRLedger,
  buildRollingLoad,
  buildSplitDrift,
  buildStreaks,
  daysSincePR
} from "@/lib/progress-trends";
import type { MuscleId } from "@/lib/types";
import { buildMuscleHeat, normalizeMuscleHeat } from "@/lib/workout-helpers";

export function ProgressDashboard() {
  const logs = useWorkoutStore((state) => state.logs);
  const measurements = useWorkoutStore((state) => state.measurements);
  const activeDate = useWorkoutStore((state) => state.activeDate);
  const muscles = useWorkoutStore((state) => state.muscles);
  const selectedMuscleId = useWorkoutStore((state) => state.selectedMuscleId);
  const setSelectedMuscle = useWorkoutStore((state) => state.setSelectedMuscle);

  // A year is what this page is for; 12 weeks of it read as an empty history.
  const [range, setRange] = useState<ProgressRange>("1y");
  const [custom, setCustom] = useState<DateWindow>();
  const [workoutId, setWorkoutId] = useState<string>();

  const view = useMemo(() => {
    const window = rangeWindow(range, activeDate, earliestLogDate(logs), custom);
    const previous = previousWindow(range, window);
    const inWindow = filterByWindow(logs, window);
    // The exercise chip scopes every card below it, so no two numbers in the
    // whole-body section are ever measured over different slices.
    const scoped = workoutId ? inWindow.filter((log) => log.workoutId === workoutId) : inWindow;
    const bucket = bucketFor(window);
    // Chips come off the unscoped range: scoping them would delete every other
    // chip the moment you picked one, leaving no way back.
    const exercises = buildExerciseTotals(inWindow);

    return {
      window,
      scoped,
      bucket,
      exercises,
      scopedExercises: buildExerciseTotals(scoped),
      trend: buildTrend(scoped, bucket, window),
      summary: summarize(scoped, window),
      previousSummary: previous
        ? summarize(
            workoutId
              ? filterByWindow(logs, previous).filter((log) => log.workoutId === workoutId)
              : filterByWindow(logs, previous),
            previous
          )
        : undefined,
      growth: buildStrengthGrowth(scoped),
      calendar: buildCalendar(scoped, window),
      rhythm: buildWeekdayRhythm(scoped),
      rest: buildRestStats(scoped, window),
      weeklySets: buildWeeklySetsByGroup(scoped, window),
      groups: buildMuscleGroupVolume(scoped),
      muscleVolume: buildMuscleVolume(scoped),
      matrix: buildMuscleMatrix(scoped, window),
      drift: buildSplitDrift(scoped, window),
      streaks: buildStreaks(scoped, window),
      heat: normalizeMuscleHeat(buildMuscleHeat(scoped))
    };
  }, [activeDate, custom, logs, range, workoutId]);

  /**
   * The lifetime half. Separate memo on purpose: it depends on `logs` and the
   * window but never on the exercise chip, and keeping it out of `view` is what
   * stops someone wiring a scoped slice into a builder that cannot take one. A
   * PR filtered to twelve weeks is not a PR.
   */
  const lifetime = useMemo(() => {
    const window = rangeWindow(range, activeDate, earliestLogDate(logs), custom);
    const ledger = buildPRLedger(logs);

    return {
      load: buildRollingLoad(logs, window),
      ledger,
      sincePR: daysSincePR(ledger, activeDate),
      cumulative: buildCumulativeVolume(logs, window)
    };
  }, [activeDate, custom, logs, range]);

  const selected = muscles.find((muscle) => muscle.id === selectedMuscleId);

  // The drill-down: the same range, narrowed to the lifts that really work this
  // muscle. Its own zone below the figure, never mixed into the whole-body cards.
  const drilldown = useMemo(() => {
    if (!selected) {
      return undefined;
    }

    const muscleId = selected.id;
    // Two bases, on purpose. `attributed` carries every kilo that reached the
    // muscle, so the charts reconcile with the share in the plaque. `worked`
    // applies the 25-engagement floor, because "which lifts build this" and
    // "how many hard sets" are floored questions.
    const attributed = attributeToMuscle(view.scoped, muscleId);
    const worked = filterByMuscle(view.scoped, muscleId);
    const rank = view.muscleVolume.findIndex((muscle) => muscle.muscleId === muscleId);

    return {
      muscleId,
      name: selected.name,
      logs: worked,
      untouched: attributed.length === 0,
      trend: buildTrend(attributed, view.bucket, view.window),
      // Quartiles recompute over this muscle's days: the shading is relative to
      // how hard you usually work it, which is the question being asked here.
      calendar: buildCalendar(attributed, view.window),
      facts: {
        name: selected.name,
        rank: rank >= 0 ? rank + 1 : view.muscleVolume.length,
        total: view.muscleVolume.length,
        share: rank >= 0 ? view.muscleVolume[rank].share : 0,
        setsPerWeek: muscleWeeklySets(view.scoped, muscleId, view.window),
        sessions: new Set(attributed.map((log) => log.date)).size,
        rest: buildRestStats(attributed, view.window)
      }
    };
  }, [selected, view]);

  return (
    <section className="space-y-4">
      <MuscleMapCard
        title="Where the work lands"
        description="Shaded by how much of this range's volume reached each muscle. Tap one to open it."
        highlights={view.heat}
        selectedMuscleId={selected?.id}
        onSelectMuscle={setSelectedMuscle}
        footer={
          <MuscleHeroFooter
            facts={drilldown?.facts}
            onClear={() => setSelectedMuscle(undefined)}
          />
        }
      />

      <ProgressFilters
        range={range}
        // Opening the picker seeds it with whatever range you were already on,
        // so the first thing you see is the window you just left, editable.
        onRangeChange={(next) => {
          if (next === "custom") {
            setCustom(view.window);
          }
          setRange(next);
        }}
        window={view.window}
        onWindowChange={setCustom}
        today={activeDate}
        exercises={view.exercises}
        workoutId={workoutId}
        onWorkoutChange={setWorkoutId}
      />

      {drilldown ? (
        <div className="space-y-3">
          <SectionRule label={drilldown.name} hint="this muscle only" />

          {/* Measurements exist whether or not you trained the muscle in this
              range, so this sits outside the untouched branch. It returns null
              when the site has nothing recorded, so it never adds an empty card. */}
          <MuscleGirthCard
            name={drilldown.name}
            muscleId={drilldown.muscleId}
            measurements={measurements}
          />

          {/* Four empty cards is the complaint that started this page. One is enough. */}
          {drilldown.untouched ? (
            <UntouchedMuscle name={drilldown.name} range={range} />
          ) : (
            <>
              <MuscleDoseCard name={drilldown.name} setsPerWeek={drilldown.facts.setsPerWeek} />

              <MuscleVolumeCard
                name={drilldown.name}
                points={drilldown.trend}
                bucket={view.bucket}
              />

              <MuscleLiftsCard
                name={drilldown.name}
                muscleId={drilldown.muscleId}
                logs={drilldown.logs}
              />

              <ConsistencyCard
                weeks={drilldown.calendar}
                title={`When you trained ${drilldown.name}`}
                subject="days"
              />
            </>
          )}
        </div>
      ) : null}

      <ProgressHeadline
        range={range}
        summary={view.summary}
        previous={view.previousSummary}
        window={view.window}
        streaks={view.streaks}
        weeklySets={view.weeklySets}
        daysSincePR={lifetime.sincePR}
      />

      <YearSpine weeks={view.calendar} streaks={view.streaks} range={range} />

      <SectionRule label="Getting stronger" hint="per lift" />

      <TopSetWall logs={view.scoped} exercises={view.scopedExercises} />

      <StrengthGrowthCard growth={view.growth} />

      <PRLedgerCard entries={lifetime.ledger} days={lifetime.sincePR} />

      <SectionRule label="Where it goes" hint="the split" />

      {view.matrix.columns.length >= MATRIX_MIN_COLUMNS ? (
        <MuscleMatrixCard
          matrix={view.matrix}
          selectedMuscleId={selected?.id}
          onSelectMuscle={(muscleId: MuscleId) => setSelectedMuscle(muscleId)}
        />
      ) : null}

      <MuscleRankCard
        muscleVolume={view.muscleVolume}
        selectedMuscleId={selected?.id}
        onSelectMuscle={(muscleId: MuscleId) => setSelectedMuscle(muscleId)}
      />

      {view.drift.rows.length >= MATRIX_MIN_COLUMNS ? (
        <SplitDriftCard drift={view.drift} />
      ) : null}

      <MuscleSplitCard groups={view.groups} />

      <WeeklySetsCard sets={view.weeklySets} />

      <SectionRule label="How hard" hint="load and rhythm" />

      <VolumeTrendCard points={view.trend} bucket={view.bucket} />

      {/* Full history, not the selected range: a monthly measurement inside a
          one-month window is a single point and no trend at all. */}
      <BodyWeightCard measurements={measurements} />

      <LoadCard points={lifetime.load} />

      <VolumeDetailCard summary={view.summary} previous={view.previousSummary} />

      <RhythmCard rhythm={view.rhythm} rest={view.rest} />

      <CumulativeCard
        points={lifetime.cumulative.points}
        milestones={lifetime.cumulative.milestones}
        total={lifetime.cumulative.total}
      />

      <SectionRule label="The numbers" hint="every figure above" />

      <ProgressTableCard logs={view.scoped} />
    </section>
  );
}

function UntouchedMuscle({ name, range }: { name: string; range: ProgressRange }) {
  return (
    <Panel title={`${name} is untrained here`}>
      <p className="text-sm text-muted-foreground">
        Nothing you logged in this range works {name}.{" "}
        {range === "all"
          ? "Try another muscle from the order below — the ones with a bar have history."
          : "Widen the range, or pick a muscle with a bar in the order below."}
      </p>
    </Panel>
  );
}

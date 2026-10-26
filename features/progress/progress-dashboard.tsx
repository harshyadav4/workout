"use client";

import { useMemo, useState } from "react";

import { MuscleMapCard } from "@/features/home/muscle-map-card";
import { BodyWeightCard } from "@/features/progress/body-weight-card";
import { CardioProgress } from "@/features/progress/cardio-cards";
import { SessionTimeSection } from "@/features/progress/session-time-cards";
import { ConsistencyCard, RhythmCard } from "@/features/progress/consistency-cards";
import { CumulativeCard } from "@/features/progress/cumulative-card";
import { LoadCard } from "@/features/progress/load-card";
import {
  HeadStimulusCard,
  MuscleSplitCard,
  WeeklySetsCard
} from "@/features/progress/muscle-cards";
import {
  MuscleDoseCard,
  MuscleHeroFooter,
  MuscleVolumeCard
} from "@/features/progress/muscle-detail";
import { MuscleGirthCard } from "@/features/progress/muscle-girth-card";
import { MuscleLiftsCard } from "@/features/progress/muscle-lifts-card";
import { MuscleMatrixCard } from "@/features/progress/muscle-matrix-card";
import { MuscleRankCard } from "@/features/progress/muscle-rank-card";
import { Panel, Reveal, SectionRule } from "@/features/progress/panel";
import { PRLedgerCard } from "@/features/progress/pr-ledger-card";
import { ExerciseChips, ProgressFilters } from "@/features/progress/progress-filters";
import { ProgressHeadline, RANGE_LABELS } from "@/features/progress/progress-headline";
import { ProgressTableCard } from "@/features/progress/progress-table-card";
import { SplitDriftCard } from "@/features/progress/split-drift-card";
import { OneRepMaxCard } from "@/features/progress/one-rep-max-card";
import { StrengthGrowthCard } from "@/features/progress/strength-cards";
import { TopSetWall } from "@/features/progress/top-set-wall";
import { VolumeDetailCard } from "@/features/progress/volume-detail-card";
import { VolumeTrendCard } from "@/features/progress/volume-trend-card";
import { WeightRepsCard } from "@/features/progress/weight-reps-card";
import {
  BalanceCard,
  GrowthTimelineCard,
  RecoveryMapCard
} from "@/features/progress/muscle-insight-cards";
import { WinsCard } from "@/features/progress/wins-card";
import { YearSpine } from "@/features/progress/year-spine";
import { RingHeader, RingNotes, ScoreRings, ViewTabs, type RingId } from "@/features/progress/score-rings";
import { SectionColors } from "@/features/progress/chart-theme";
import {
  MilestonesCard,
  MonthCompareCard,
  RecordsMonthCard,
  StrengthRatioCard,
  WeeklyGoalCard,
  WeightChangeCard
} from "@/features/progress/extras-cards";
import {
  buildBalance,
  buildBestMonth,
  buildGroupSetsTimeline,
  buildMuscleRecovery,
  buildGoalEta,
  buildMilestones,
  buildMonthCompare,
  buildMonthlyWeightChange,
  buildRecordsPerMonth,
  buildStrengthRatios,
  buildWeeklySessions
} from "@/lib/progress-extras";
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
  buildHeadStimulus,
  buildLiftGroups,
  daysBetween,
  filterByMuscle,
  filterByWindow,
  muscleWeeklySets,
  previousWindow,
  rangeWindow,
  summarize,
  type DateWindow,
  type ProgressRange
} from "@/lib/progress-metrics";
import { latestFor } from "@/lib/body-metrics";
import { cardioSessions } from "@/lib/cardio-metrics";
import {
  buildWins,
  comparablePrevious,
  consistencyRing,
  mainLifts,
  musclesRing,
  usualWeeklySessions,
  plannedThisWeek,
  strengthRing
} from "@/lib/progress-scores";
import { timedSessions } from "@/lib/session-time";
import { equipmentInUse, suggestForHead } from "@/lib/suggestions";
import { todayKey } from "@/lib/utils";

// The baseline an acute:chronic ratio needs before it means anything.
const LOAD_BASELINE_WEEKS = 4;
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

type ProgressMode = "gym" | "cardio";

const MODES: { id: ProgressMode; label: string }[] = [
  { id: "gym", label: "Gym" },
  { id: "cardio", label: "Cardio" }
];

export function ProgressDashboard() {
  const logs = useWorkoutStore((state) => state.logs);
  const setLogs = useWorkoutStore((state) => state.setLogs);
  const cardio = useMemo(() => cardioSessions(setLogs, logs), [setLogs, logs]);
  const scheduled = useWorkoutStore((state) => state.scheduledSessions);
  const timed = useMemo(() => timedSessions(scheduled), [scheduled]);
  const measurements = useWorkoutStore((state) => state.measurements);
  const profile = useWorkoutStore((state) => state.profile);
  const activeDate = useWorkoutStore((state) => state.activeDate);
  const muscles = useWorkoutStore((state) => state.muscles);
  const templates = useWorkoutStore((state) => state.templates);
  const selectedMuscleId = useWorkoutStore((state) => state.selectedMuscleId);
  const setSelectedMuscle = useWorkoutStore((state) => state.setSelectedMuscle);

  // A year is what this page is for; 12 weeks of it read as an empty history.
  const [range, setRange] = useState<ProgressRange>("1y");
  const [custom, setCustom] = useState<DateWindow>();
  const [workoutId, setWorkoutId] = useState<string>();
  // The summary first, the detail on demand: the rings are the navigation, and
  // no ring open means the summary. The exercise chip only exists inside
  // Strength, so it is cleared on the way out rather than silently scoping the
  // other views.
  const [mode, setMode] = useState<ProgressMode>("gym");
  const [ringView, setRingView] = useState<RingId>();
  const openRing = (id?: RingId) => {
    setRingView(id);
    if (id !== "strength") {
      setWorkoutId(undefined);
    }
  };

  // Distinct training days, and the span they cover — the two units every
  // threshold below is expressed in.
  const sessionCount = useMemo(() => new Set(logs.map((log) => log.date)).size, [logs]);
  const weeksOfHistory = useMemo(() => {
    if (logs.length === 0) {
      return 0;
    }
    const dates = logs.map((log) => log.date).sort();
    return Math.floor(daysBetween(dates[0], todayKey()) / 7);
  }, [logs]);

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
    const summary = summarize(scoped, window);

    return {
      window,
      scoped,
      bucket,
      exercises,
      scopedExercises: buildExerciseTotals(scoped),
      trend: buildTrend(scoped, bucket, window),
      summary,
      previousSummary: comparablePrevious(
        summary,
        previous
          ? summarize(
              workoutId
                ? filterByWindow(logs, previous).filter((log) => log.workoutId === workoutId)
                : filterByWindow(logs, previous),
              previous
            )
          : undefined
      ),
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
  const headStimulus = useMemo(
    () =>
      buildHeadStimulus(
        view.scoped,
        view.window,
        muscles.map((muscle) => muscle.id)
      ),
    [view.scoped, view.window]
  );

  // Only for the head that was actually called out. Suggestions for a head that
  // is already well served are noise, and the callout is what earns the advice.
  const headSuggestions = useMemo(() => {
    if (!headStimulus.lowest) {
      return [];
    }
    return suggestForHead(headStimulus.lowest.muscleId, templates, {
      equipmentInUse: equipmentInUse(
        view.scoped.map((log) => log.workoutId),
        templates
      )
    });
  }, [headStimulus.lowest, templates, view.scoped]);

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

  // Your Plan's sessions this week when there is a plan, your usual week when
  // not — one number, so the ring and the weekly chart hold you to the same goal.
  const weeklyTarget = useMemo(
    () => plannedThisWeek(scheduled, activeDate) ?? usualWeeklySessions(logs, activeDate),
    [activeDate, logs, scheduled]
  );

  const rings = useMemo(
    () => ({
      strength: strengthRing(view.scoped),
      // The week and the goal are about today, whatever range is picked.
      consistency: consistencyRing(logs, activeDate, weeklyTarget),
      // Muscles, from training alone: a ring that waited on a goal weight said
      // "Not yet" to everyone who never weighs in.
      body: musclesRing(view.weeklySets)
    }),
    [activeDate, logs, view.scoped, view.weeklySets, weeklyTarget]
  );

  const liftGroups = useMemo(() => buildLiftGroups(logs), [logs]);
  const recovery = useMemo(() => buildMuscleRecovery(logs, activeDate), [activeDate, logs]);
  const balance = useMemo(() => buildBalance(view.scoped), [view.scoped]);

  // The extras: milestones and month-on-month are lifetime and calendar facts,
  // so they ignore the range; the rest follow it where a range means anything.
  const extras = useMemo(
    () => ({
      milestones: buildMilestones(logs, activeDate),
      monthCompare: buildMonthCompare(logs, activeDate),
      ratios: buildStrengthRatios(view.scoped, measurements, profile.weightKg),
      recordsPerMonth: buildRecordsPerMonth(logs, activeDate, liftGroups),
      weeklySessions: buildWeeklySessions(logs, activeDate, weeklyTarget),
      bestMonth: buildBestMonth(logs),
      eta: buildGoalEta(measurements, profile.goalWeightKg, activeDate),
      weightChange: buildMonthlyWeightChange(measurements),
      groupTimeline: buildGroupSetsTimeline(logs, activeDate)
    }),
    [activeDate, liftGroups, logs, measurements, profile.goalWeightKg, profile.weightKg, view.scoped, weeklyTarget]
  );

  const wins = useMemo(
    () =>
      buildWins({
        logs,
        window: view.window,
        measurements,
        goalWeightKg: profile.goalWeightKg,
        today: activeDate
      }),
    [activeDate, logs, measurements, profile.goalWeightKg, view.window]
  );

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
      <div className="well grid grid-cols-2 gap-1 rounded-xl p-1" role="tablist" aria-label="Progress view">
        {MODES.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={mode === item.id}
            onClick={() => setMode(item.id)}
            className={`h-11 rounded-lg text-sm font-semibold transition-colors ${
              mode === item.id ? "key" : "text-muted-foreground"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Cardio keeps its own 12 weeks and its own kinds; the range and lift
          filters are about lifting. */}
      {mode === "cardio" ? <CardioProgress sessions={cardio} today={activeDate} /> : null}

      {mode === "gym" ? (
        <>
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
            // Lift chips live inside Strength, under its header: elsewhere they
            // scoped cards that never said so.
            exercises={[]}
            workoutId={workoutId}
            onWorkoutChange={setWorkoutId}
          />

          <ScoreRings rings={rings} selected={ringView} onSelect={openRing} />

          <ViewTabs
            view={ringView ?? "summary"}
            onChange={(next) => openRing(next === "summary" ? undefined : next)}
          />

          {ringView ? (
            <RingHeader ring={rings[ringView]} />
          ) : (
            <>
              <RingNotes rings={rings} onSelect={openRing} />

              <WinsCard wins={wins} rangeLabel={range === "all" ? "All time" : `In the ${RANGE_LABELS[range]}`} />

              <MonthCompareCard rows={extras.monthCompare} />

              <MilestonesCard earned={extras.milestones.earned} next={extras.milestones.next} />

              <ProgressHeadline
                range={range}
                summary={view.summary}
                previous={view.previousSummary}
                window={view.window}
                streaks={view.streaks}
                weeklySets={view.weeklySets}
                daysSincePR={lifetime.sincePR}
                // The best of the main lifts, so the summary and the Strength ring
                // talk about the same lifts.
                topGain={[...mainLifts(view.scoped)].sort((a, b) => b.changePercent - a.changePercent)[0]}
              />
            </>
          )}
        </>
      ) : null}

      {mode === "gym" && ringView === "strength" ? (
        <SectionColors section="strength">
          <ExerciseChips
            exercises={view.exercises}
            workoutId={workoutId}
            onWorkoutChange={setWorkoutId}
          />

          <TopSetWall logs={view.scoped} exercises={view.scopedExercises} groupOf={liftGroups} />

          {/* Weight and reps need the per-set grain, like the estimate below. */}
          {setLogs.length > 0 ? (
            <WeightRepsCard
              setLogs={filterByWindow(setLogs, view.window)}
              exercises={view.scopedExercises}
              workoutId={workoutId}
            />
          ) : null}

          <Reveal
            ready={sessionCount >= 2}
            title="Strength growth"
            need={`${2 - sessionCount} more session${sessionCount === 1 ? "" : "s"} — growth needs a start and an end`}
          >
            <StrengthGrowthCard growth={view.growth} groupOf={liftGroups} />
          </Reveal>

          <StrengthRatioCard ratios={extras.ratios} groupOf={liftGroups} />

          {/* Gated on set_logs, not on session count: the estimate needs the per-set
              grain, and an account whose whole history predates that table has
              nothing to feed it however many sessions it has. */}
          {setLogs.length > 0 ? (
            <OneRepMaxCard
              // Scoped to the range like every other card here. Passing the whole
              // history alongside window-scoped exercises showed an all-time best
              // under a "four weeks" filter, with nothing in the caption saying so.
              setLogs={filterByWindow(setLogs, view.window)}
              exercises={view.scopedExercises}
            />
          ) : null}

          <Reveal
            ready={sessionCount >= 2}
            title="Personal records"
            need="a second session — the first time you do a lift is your starting point, not a record"
          >
            <PRLedgerCard entries={lifetime.ledger} days={lifetime.sincePR} />
          </Reveal>

          <RecordsMonthCard months={extras.recordsPerMonth} />

          <SectionRule label="How much" hint="weight lifted" />

          {/* Thresholds are in sessions, not logs: two exercises on a Tuesday is
              one session, and it is sessions the charts need more of. */}
          <Reveal
            ready={sessionCount >= 3}
            title="Weight lifted"
            need={`${3 - sessionCount} more session${3 - sessionCount === 1 ? "" : "s"}`}
          >
            <VolumeTrendCard points={view.trend} bucket={view.bucket} />
          </Reveal>

          <VolumeDetailCard summary={view.summary} previous={view.previousSummary} />

          {/* ACWR compares the last week against a four-week baseline. Before that
              baseline exists the ratio is arithmetic on nothing. */}
          <Reveal
            ready={weeksOfHistory >= LOAD_BASELINE_WEEKS}
            title="This week vs normal"
            need={`${LOAD_BASELINE_WEEKS - weeksOfHistory} more week${
              LOAD_BASELINE_WEEKS - weeksOfHistory === 1 ? "" : "s"
            } of training — the app needs to learn your normal week first`}
          >
            <LoadCard points={lifetime.load} />
          </Reveal>

          <CumulativeCard
            points={lifetime.cumulative.points}
            milestones={lifetime.cumulative.milestones}
            total={lifetime.cumulative.total}
          />

          <SectionRule label="All sessions" hint="every number above, as a list" />

          <ProgressTableCard logs={view.scoped} />
        </SectionColors>
      ) : null}

      {mode === "gym" && ringView === "consistency" ? (
        <SectionColors section="consistency">
          <YearSpine weeks={view.calendar} streaks={view.streaks} range={range} />

          <WeeklyGoalCard
            weeks={extras.weeklySessions}
            target={weeklyTarget}
            bestMonth={extras.bestMonth}
          />

          <Reveal
            ready={sessionCount >= 6}
            title="Your training week"
            need={`${6 - sessionCount} more session${6 - sessionCount === 1 ? "" : "s"} — a pattern needs a few weeks`}
          >
            <RhythmCard rhythm={view.rhythm} rest={view.rest} />
          </Reveal>

          <SectionRule label="Time" hint="how long, and when" />

          {/* All timed sessions, not the selected range: a few weeks of
              timing inside a 4W window is too thin to read. */}
          <SessionTimeSection sessions={timed} today={activeDate} />
        </SectionColors>
      ) : null}

      {mode === "gym" && ringView === "body" ? (
        <SectionColors section="body">
          {/* Today on the whole history: "what can I train now" does not change
              with the range chip. */}
          <RecoveryMapCard
            recovery={recovery}
            selectedMuscleId={selected?.id}
            onSelectMuscle={setSelectedMuscle}
          />

          <SectionRule label="Muscles" hint="where your training goes" />

          <MuscleMapCard
            title="Where the work lands"
            description="Brighter muscles got more of your training in this range. Tap one to see its details."
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
                // Volume attributed to this muscle, so the callout compares the two
                // halves of the same claim.
                logs={attributeToMuscle(logs, drilldown.muscleId)}
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

          <SectionRule label="Balance" hint="how you share work between muscles" />

          <BalanceCard pushPull={balance.pushPull} upperLower={balance.upperLower} />

          <WeeklySetsCard sets={view.weeklySets} />

          <GrowthTimelineCard weeks={extras.groupTimeline} />

          <MuscleRankCard
            muscleVolume={view.muscleVolume}
            selectedMuscleId={selected?.id}
            onSelectMuscle={(muscleId: MuscleId) => setSelectedMuscle(muscleId)}
          />

          <MuscleSplitCard groups={view.groups} />

          <Reveal
            ready={view.drift.rows.length >= MATRIX_MIN_COLUMNS}
            title="How your focus changed"
            need={`${MATRIX_MIN_COLUMNS - view.drift.rows.length} more period${
              MATRIX_MIN_COLUMNS - view.drift.rows.length === 1 ? "" : "s"
            } — the chart needs a few periods to compare`}
          >
            <SplitDriftCard drift={view.drift} />
          </Reveal>

          <Reveal
            ready={view.matrix.columns.length >= MATRIX_MIN_COLUMNS}
            title="Each muscle over time"
            need={`${MATRIX_MIN_COLUMNS - view.matrix.columns.length} more period${
              MATRIX_MIN_COLUMNS - view.matrix.columns.length === 1 ? "" : "s"
            } of training — the chart needs a few periods to compare`}
          >
            <MuscleMatrixCard
              matrix={view.matrix}
              selectedMuscleId={selected?.id}
              onSelectMuscle={(muscleId: MuscleId) => setSelectedMuscle(muscleId)}
            />
          </Reveal>

          {/* One level below the group band, which is where the finding actually
              lives: fourteen chest sets that were all flat pressing. */}
          <Reveal
            ready={sessionCount >= 3}
            title="Weekly sets per muscle part"
            need={`${3 - sessionCount} more session${3 - sessionCount === 1 ? "" : "s"} — the pattern needs a few sessions to show`}
          >
            <HeadStimulusCard report={headStimulus} suggestions={headSuggestions} />
          </Reveal>

          <SectionRule label="Bodyweight" hint="your weigh-ins" />

          {/* Weight is one part of the body story, not a gate on it: without a
              weigh-in this is one line, not an empty ring and two empty charts. */}
          {latestFor(measurements, "weight") ? (
            <>
            {/* Full history, not the selected range: a monthly measurement inside a
                one-month window is a single point and no trend at all. */}
            <BodyWeightCard
              measurements={measurements}
              goalWeightKg={profile.goalWeightKg}
              eta={extras.eta}
            />

            <WeightChangeCard
              months={extras.weightChange}
              goalWeightKg={profile.goalWeightKg}
              // From the weigh-ins themselves, not the profile copy of them.
              currentKg={latestFor(measurements, "weight")?.value}
            />
            </>
          ) : (
            <Panel title="Track your weight">
              <p className="text-sm text-muted-foreground">
                Add a weigh-in on Profile. Then this shows your weight trend, your goal, and the
                date you will likely reach it.
              </p>
            </Panel>
          )}
        </SectionColors>
      ) : null}
    </section>
  );
}

function UntouchedMuscle({ name, range }: { name: string; range: ProgressRange }) {
  return (
    <Panel title={`No ${name} training in this range`}>
      <p className="text-sm text-muted-foreground">
        None of your sessions in this range trained {name}.{" "}
        {range === "all"
          ? "Try another muscle from the list below. The muscles with a bar have history."
          : "Pick a longer time range, or a muscle with a bar in the list below."}
      </p>
    </Panel>
  );
}

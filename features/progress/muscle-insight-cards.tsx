"use client";

import { Line, LineChart, ReferenceArea, ResponsiveContainer, YAxis } from "recharts";

import BackBody from "@/features/body/back";
import { MUSCLE_IDLE_COLOR } from "@/features/body/body-map-shared";
import FrontBody from "@/features/body/front";
import { GROUP_COLORS, animationProps } from "@/features/progress/chart-theme";
import { Panel } from "@/features/progress/panel";
import type {
  BalancePair,
  GroupWeek,
  MuscleRecovery,
  RecoveryState
} from "@/lib/progress-extras";
import { GROUP_LABELS, GROUP_ORDER, WEEKLY_SET_TARGET } from "@/lib/progress-metrics";
import type { MuscleGroup, MuscleId } from "@/lib/types";

// -- recovery map --------------------------------------------------------------------

/**
 * States, not a ramp: these are four different answers to "can I train it
 * today", so they get four different colours — and every one is also named in
 * the list under the map, so none is read by colour alone.
 */
const RECOVERY: Record<RecoveryState, { color: string; label: string; hint: string }> = {
  recovering: { color: "#8a5fe0", label: "Recovering", hint: "trained in the last day" },
  ready: { color: "hsl(var(--success))", label: "Ready", hint: "rested 2–7 days" },
  due: { color: "hsl(var(--warning))", label: "Due", hint: "over 1 week" },
  never: { color: MUSCLE_IDLE_COLOR, label: "Not trained", hint: "not yet" }
};

const ORDER: RecoveryState[] = ["ready", "recovering", "due", "never"];

/**
 * The list under the map, in the map's own terms. A group is named whole only
 * when all its trained muscles agree; otherwise each muscle is named, so the
 * list never says "Shoulders: ready" next to a yellow side delt.
 */
function namesByState(recovery: MuscleRecovery[]) {
  const byState = new Map<RecoveryState, string[]>();
  const add = (state: RecoveryState, name: string) =>
    byState.set(state, [...(byState.get(state) ?? []), name]);

  GROUP_ORDER.forEach((group) => {
    const members = recovery.filter((muscle) => muscle.group === group);
    const trained = members.filter((muscle) => muscle.state !== "never");

    if (trained.length === 0) {
      add("never", GROUP_LABELS[group]);
      return;
    }

    const states = new Set(trained.map((muscle) => muscle.state));
    if (states.size === 1) {
      add(trained[0].state, GROUP_LABELS[group]);
    } else {
      trained.forEach((muscle) => add(muscle.state, muscle.name));
    }
  });

  return byState;
}

export function RecoveryMapCard({
  recovery,
  onSelectMuscle,
  selectedMuscleId
}: {
  recovery: MuscleRecovery[];
  onSelectMuscle?: (muscleId?: string) => void;
  selectedMuscleId?: MuscleId;
}) {
  // The maps read `--m-<id>` off their root; overriding it repaints each muscle
  // without touching the shared heat colouring the other maps use.
  const colors = Object.fromEntries(
    recovery.map((muscle) => [`--m-${muscle.muscleId}`, RECOVERY[muscle.state].color])
  ) as React.CSSProperties;

  const byState = namesByState(recovery);

  const ready = byState.get("ready") ?? [];

  return (
    <Panel
      title="Ready today"
      caption={
        ready.length > 0
          ? `Ready: ${ready.join(" · ")}`
          : "How rested each muscle is"
      }
      note={
        <>
          Color shows the days since an exercise last worked the muscle directly. A muscle needs
          about 48 hours to recover. Helper muscles, like triceps in a bench press, do not count.
        </>
      }
    >
      <div className="well rounded-xl p-3">
        <div className="grid grid-cols-2 gap-2">
          <FrontBody
            className="mx-auto h-[14rem] w-auto max-w-full"
            style={colors}
            onSelectMuscle={onSelectMuscle}
            selectedMuscleId={selectedMuscleId}
          />
          <BackBody
            className="mx-auto h-[14rem] w-auto max-w-full"
            style={colors}
            onSelectMuscle={onSelectMuscle}
            selectedMuscleId={selectedMuscleId}
          />
        </div>
      </div>

      <ul className="mt-3 space-y-2">
        {ORDER.filter((state) => (byState.get(state) ?? []).length > 0).map((state) => (
          <li key={state} className="flex items-start gap-2.5 text-sm">
            <span
              className="mt-1 h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: RECOVERY[state].color }}
              aria-hidden
            />
            <span>
              <span className="font-semibold">{RECOVERY[state].label}:</span>{" "}
              {(byState.get(state) ?? []).join(" · ")}
              <span className="text-muted-foreground"> ({RECOVERY[state].hint})</span>
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

// -- growth timeline ------------------------------------------------------------------

/**
 * Six small charts, one per group, on one shared scale — small multiples, not
 * six lines tangled on one axis. The shaded band is the 10–20 goal, so "is
 * this muscle getting enough" is a glance at whether the line sits in it.
 */
export function GrowthTimelineCard({ weeks }: { weeks: GroupWeek[] }) {
  const ceiling = Math.max(
    WEEKLY_SET_TARGET.high + 4,
    ...weeks.flatMap((week) => GROUP_ORDER.map((group) => week[group]))
  );
  const trained = GROUP_ORDER.filter((group) => weeks.some((week) => week[group] > 0));

  if (trained.length === 0) {
    return null;
  }

  return (
    <Panel
      title="Sets by week"
      caption={`Last ${weeks.length} weeks · band = goal ${WEEKLY_SET_TARGET.low}–${WEEKLY_SET_TARGET.high}`}
      note={
        <>
          1 small chart per muscle group. In the shaded band, the group gets enough sets to grow.
          Only full weeks show.
        </>
      }
    >
      <ul className="grid grid-cols-2 gap-x-3 gap-y-3">
        {GROUP_ORDER.map((group) => (
          <TimelineTile key={group} group={group} weeks={weeks} ceiling={ceiling} />
        ))}
      </ul>
    </Panel>
  );
}

function TimelineTile({ group, weeks, ceiling }: { group: MuscleGroup; weeks: GroupWeek[]; ceiling: number }) {
  const recent = weeks.slice(-4);
  const average = recent.length ? recent.reduce((sum, week) => sum + week[group], 0) / recent.length : 0;
  const onGoal = average >= WEEKLY_SET_TARGET.low && average <= WEEKLY_SET_TARGET.high;

  return (
    <li>
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: GROUP_COLORS[group] }} aria-hidden />
          {GROUP_LABELS[group]}
        </span>
        <span className={`text-xs tabular-nums ${onGoal ? "text-success" : "text-muted-foreground"}`}>
          {average.toFixed(0)}/wk
        </span>
      </div>
      <div
        className="mt-1 h-12"
        role="img"
        aria-label={`${GROUP_LABELS[group]}: about ${average.toFixed(0)} sets a week recently, ${onGoal ? "in goal range" : "not in goal range"}`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={weeks} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
            <YAxis hide domain={[0, ceiling]} />
            <ReferenceArea
              y1={WEEKLY_SET_TARGET.low}
              y2={WEEKLY_SET_TARGET.high}
              fill="currentColor"
              fillOpacity={0.07}
              stroke="none"
            />
            <Line
              {...animationProps}
              type="monotone"
              dataKey={group}
              stroke={GROUP_COLORS[group]}
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </li>
  );
}

// -- balance ---------------------------------------------------------------------------

export function BalanceCard({ pushPull, upperLower }: { pushPull?: BalancePair; upperLower?: BalancePair }) {
  if (!pushPull && !upperLower) {
    return null;
  }

  return (
    <Panel
      title="Balance"
      caption="Opposite sides compared"
      note={
        <>
          Push moves weight away from you (bench press); pull moves it toward you (rows). Much more
          push than pull can round your shoulders. 45–55% is balanced.
        </>
      }
    >
      <div className="space-y-4">
        {[pushPull, upperLower].map((item) =>
          item ? <BalanceBar key={item.left} item={item} /> : null
        )}
      </div>
    </Panel>
  );
}

/** Two colours from the section trio, so the halves differ for every reader. */
const LEFT = "#2f8deb";
const RIGHT = "#cf6f17";

function BalanceBar({ item }: { item: BalancePair }) {
  const left = Math.round(item.leftShare);
  const balanced = left >= 45 && left <= 55;

  return (
    <div>
      <div className="flex justify-between text-xs font-semibold">
        <span>
          {item.left} <span className="tabular-nums text-muted-foreground">{left}%</span>
        </span>
        <span>
          <span className="tabular-nums text-muted-foreground">{100 - left}%</span> {item.right}
        </span>
      </div>
      <div
        className="relative mt-1.5 flex h-3 overflow-hidden rounded-full"
        role="img"
        aria-label={`${item.left} ${left}%, ${item.right} ${100 - left}%`}
      >
        <span style={{ width: `${left}%`, backgroundColor: LEFT }} />
        {/* A surface gap between the halves, so they never merge. */}
        <span className="w-0.5 bg-card" />
        <span className="flex-1" style={{ backgroundColor: RIGHT }} />
        <span className="absolute inset-y-0 left-1/2 w-px bg-foreground/50" aria-hidden />
      </div>
      <p className={`mt-1.5 text-sm ${balanced ? "text-muted-foreground" : ""}`}>{item.sentence}</p>
    </div>
  );
}

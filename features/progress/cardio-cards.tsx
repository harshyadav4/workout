"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { CHART, ChartTooltip, EmptyChart, animationProps, axisProps, gridProps } from "@/features/progress/chart-theme";
import { Panel } from "@/features/progress/panel";
import { useDistanceUnit } from "@/features/workout/use-distance-unit";
import { type DistanceUnit, formatDistance, toUnit } from "@/lib/cardio";
import {
  type CardioSession,
  FASTEST_MIN_KM,
  cardioRecords,
  cardioTypes,
  paceTrend,
  weeklyDistance
} from "@/lib/cardio-metrics";
import { formatDayKey } from "@/lib/progress-metrics";
import { formatClock } from "@/lib/timer";
import { cn } from "@/lib/utils";

/** Seconds per km → "5:42" per the unit on screen. */
function paceLabel(secondsPerKm: number, unit: DistanceUnit) {
  const perUnit = Math.round(unit === "mi" ? secondsPerKm * 1.609344 : secondsPerKm);
  return `${Math.floor(perUnit / 60)}:${String(perUnit % 60).padStart(2, "0")}`;
}

function WeeklyDistanceCard({ sessions, today, unit }: { sessions: CardioSession[]; today: string; unit: DistanceUnit }) {
  const weeks = weeklyDistance(sessions, today, 12).map((week) => ({ ...week, value: Math.round(toUnit(week.km, unit) * 10) / 10 }));
  const thisWeek = weeks[weeks.length - 1];
  const lastWeek = weeks[weeks.length - 2];

  return (
    <Panel
      title="Weekly distance"
      caption={`This week ${formatDistance(thisWeek.km, unit)} · last week ${formatDistance(lastWeek.km, unit)}`}
      note={<>Every kind of cardio added up, per Monday-to-Sunday week, for the last 12 weeks. An empty week is a 0, not a gap.</>}
    >
      <ResponsiveContainer width="100%" height={170}>
        <BarChart data={weeks} margin={{ top: 8, right: 8, bottom: 0, left: -6 }}>
          <CartesianGrid {...gridProps} />
          <XAxis {...axisProps} dataKey="week" tickFormatter={formatDayKey} />
          <YAxis {...axisProps} width={34} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.04)" }}
            content={<ChartTooltip unit={unit} labelFormat={(key) => `Week of ${formatDayKey(key)}`} />}
          />
          <Bar dataKey="value" name="Distance" fill={CHART.accent} radius={[4, 4, 0, 0]} {...animationProps} />
        </BarChart>
      </ResponsiveContainer>
    </Panel>
  );
}

function PaceTrendCard({ sessions, workoutId, name, unit }: { sessions: CardioSession[]; workoutId: string; name: string; unit: DistanceUnit }) {
  const points = paceTrend(sessions, workoutId);

  return (
    <Panel
      title="Pace trend"
      caption={`${name} · min per ${unit} · lower is faster`}
      note={<>Each point is one session&apos;s pace: its whole time over its whole distance, so intervals count as one session. The axis runs fast at the top.</>}
    >
      {points.length < 2 ? (
        <EmptyChart>Two timed sessions of {name.toLowerCase()} are needed to draw a trend.</EmptyChart>
      ) : (
        <ResponsiveContainer width="100%" height={170}>
          <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -10 }}>
            <CartesianGrid {...gridProps} />
            <XAxis {...axisProps} dataKey="date" tickFormatter={formatDayKey} />
            {/* Reversed: a faster pace is a smaller number, and up should mean better. */}
            <YAxis {...axisProps} width={40} reversed domain={["dataMin - 15", "dataMax + 15"]} tickFormatter={(value: number) => paceLabel(value, unit)} />
            <Tooltip content={<ChartTooltip format={(value) => paceLabel(value, unit)} unit={`/${unit}`} labelFormat={formatDayKey} />} />
            <Line dataKey="pace" name="Pace" stroke={CHART.accent} strokeWidth={2} dot={{ r: 3, fill: CHART.accent }} {...animationProps} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </Panel>
  );
}

function RecordsCard({ sessions, name, unit }: { sessions: CardioSession[]; name: string; unit: DistanceUnit }) {
  const records = cardioRecords(sessions);
  const tiles = [
    {
      label: "Longest",
      value: records.longest ? formatDistance(records.longest.km, unit) : "—",
      when: records.longest?.date
    },
    {
      label: "Fastest pace",
      value: records.fastest?.pace ? `${paceLabel(records.fastest.pace, unit)} /${unit}` : "—",
      when: records.fastest?.date
    },
    {
      label: "Longest time",
      value: records.longestTime ? formatClock(records.longestTime.seconds) : "—",
      when: records.longestTime?.date
    },
    { label: "Total", value: formatDistance(records.totalKm, unit) }
  ];

  return (
    <Panel
      title="Records"
      caption={name}
      note={<>Your best single sessions of {name.toLowerCase()}. Fastest pace counts only sessions of at least {FASTEST_MIN_KM} km, so a short sprint does not stand as a record.</>}
    >
      <div className="grid grid-cols-2 gap-2">
        {tiles.map((tile) => (
          <div key={tile.label} className="well rounded-lg px-3 py-2.5">
            <p className="text-[11px] font-semibold text-muted-foreground">{tile.label}</p>
            <p className="mt-0.5 font-display text-lg font-extrabold tabular-nums tracking-tight">{tile.value}</p>
            {tile.when ? <p className="text-[11px] text-muted-foreground">{formatDayKey(tile.when)}</p> : null}
          </div>
        ))}
      </div>
    </Panel>
  );
}

/**
 * The Cardio tab. Distance is every kind added up; pace and records belong to
 * one kind at a time — 2:00 a km is a slow ride and an impossible run, so a
 * shared "fastest" would always just be the bike.
 */
export function CardioProgress({ sessions, today }: { sessions: CardioSession[]; today: string }) {
  const unit = useDistanceUnit();
  const types = useMemo(() => cardioTypes(sessions), [sessions]);
  const [picked, setPicked] = useState<string>();
  const current = types.find((type) => type.workoutId === picked) ?? types[0];

  if (!current) {
    return (
      <EmptyChart>
        No cardio yet. Add a run, a ride or any distance exercise to a session — set it to Distance in Build — and
        it shows up here.
      </EmptyChart>
    );
  }

  const ofType = sessions.filter((session) => session.workoutId === current.workoutId);

  return (
    <>
      <WeeklyDistanceCard sessions={sessions} today={today} unit={unit} />
      {types.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto scrollbar-hide" role="group" aria-label="Cardio type">
          {types.map((type) => (
            <button
              key={type.workoutId}
              type="button"
              aria-pressed={type.workoutId === current.workoutId}
              onClick={() => setPicked(type.workoutId)}
              className={cn(
                "min-h-11 shrink-0 rounded-full px-4 text-xs font-semibold capitalize transition-colors",
                type.workoutId === current.workoutId ? "key" : "key-quiet text-muted-foreground"
              )}
            >
              {type.name}
            </button>
          ))}
        </div>
      ) : null}
      <PaceTrendCard sessions={sessions} workoutId={current.workoutId} name={current.name} unit={unit} />
      <RecordsCard sessions={ofType} name={current.name} unit={unit} />
    </>
  );
}

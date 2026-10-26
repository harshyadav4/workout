"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import {
  CHART,
  ChartTooltip,
  EmptyChart,
  animationProps,
  axisProps,
  gridProps,
  useSection
} from "@/features/progress/chart-theme";
import { Panel } from "@/features/progress/panel";
import { formatDayKey } from "@/lib/progress-metrics";
import {
  type PartOfDay,
  type TimedSession,
  durationRecords,
  formatDuration,
  weeklyHours,
  whenYouTrain
} from "@/lib/session-time";

const PARTS: { id: PartOfDay; label: string; hours: string }[] = [
  { id: "morning", label: "Morning", hours: "5 am – noon" },
  { id: "afternoon", label: "Afternoon", hours: "noon – 5 pm" },
  { id: "evening", label: "Evening", hours: "5 – 10 pm" },
  { id: "night", label: "Night", hours: "10 pm – 5 am" }
];

/** Minutes after midnight → "6:10 PM". */
function clockLabel(minutes: number) {
  const hour = Math.floor(minutes / 60);
  const minute = String(minutes % 60).padStart(2, "0");
  return `${hour % 12 === 0 ? 12 : hour % 12}:${minute} ${hour < 12 ? "AM" : "PM"}`;
}

function DurationTrendCard({ sessions }: { sessions: TimedSession[] }) {
  const { accent } = useSection();
  const points = sessions.map((session) => ({ date: session.date, minutes: Math.round(session.seconds / 60) }));
  const average = points.length ? Math.round(points.reduce((sum, point) => sum + point.minutes, 0) / points.length) : 0;

  return (
    <Panel
      title="Session length"
      caption={`Average ${formatDuration(average * 60)} · minutes per session`}
      note={<>From Start to Finish — or to the last set and its rest, when Finish was tapped long after. Sessions from before timing existed are not on the chart.</>}
    >
      {points.length < 2 ? (
        <EmptyChart>Two timed sessions are needed to draw a trend. Every session from now on is timed.</EmptyChart>
      ) : (
        <ResponsiveContainer width="100%" height={170}>
          <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -10 }}>
            <CartesianGrid {...gridProps} />
            <XAxis {...axisProps} dataKey="date" tickFormatter={formatDayKey} />
            <YAxis {...axisProps} width={36} allowDecimals={false} />
            <ReferenceLine y={average} stroke={CHART.series[1]} strokeDasharray="4 4" />
            <Tooltip content={<ChartTooltip unit="min" labelFormat={formatDayKey} />} />
            <Line dataKey="minutes" name="Length" stroke={accent} strokeWidth={2} dot={{ r: 3, fill: accent }} {...animationProps} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </Panel>
  );
}

function WeeklyHoursCard({ sessions, today }: { sessions: TimedSession[]; today: string }) {
  const { accent } = useSection();
  const weeks = weeklyHours(sessions, today, 12);
  const thisWeek = weeks[weeks.length - 1];
  const lastWeek = weeks[weeks.length - 2];

  return (
    <Panel
      title="Time per week"
      caption={`This week ${thisWeek.hours} h · last week ${lastWeek.hours} h`}
      note={<>Hours of timed sessions per Monday-to-Sunday week, for the last 12 weeks.</>}
    >
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={weeks} margin={{ top: 8, right: 8, bottom: 0, left: -6 }}>
          <CartesianGrid {...gridProps} />
          <XAxis {...axisProps} dataKey="week" tickFormatter={formatDayKey} />
          <YAxis {...axisProps} width={34} />
          <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} content={<ChartTooltip unit="h" labelFormat={(key) => `Week of ${formatDayKey(key)}`} />} />
          <Bar dataKey="hours" name="Trained" fill={accent} radius={[4, 4, 0, 0]} {...animationProps} />
        </BarChart>
      </ResponsiveContainer>
    </Panel>
  );
}

function WhenYouTrainCard({ sessions }: { sessions: TimedSession[] }) {
  const { counts, usualStartMinutes } = whenYouTrain(sessions);
  const most = Math.max(...Object.values(counts), 1);

  return (
    <Panel
      title="When you train"
      caption={usualStartMinutes !== undefined ? `Usually starting around ${clockLabel(usualStartMinutes)}` : undefined}
      note={<>By the start time of each timed session, on this phone&apos;s clock. The usual start is the middle one of all your starts.</>}
    >
      <ul className="space-y-2">
        {PARTS.map((part) => (
          <li key={part.id} className="grid grid-cols-[6rem_1fr_2rem] items-center gap-3 text-sm">
            <span>
              <span className="block font-semibold">{part.label}</span>
              <span className="block text-xs text-muted-foreground">{part.hours}</span>
            </span>
            <span className="well h-3 overflow-hidden rounded-full">
              <span className="mana-fill block h-full rounded-full" style={{ width: `${(counts[part.id] / most) * 100}%` }} />
            </span>
            <span className="text-right text-xs font-semibold tabular-nums">{counts[part.id]}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function DurationRecordsCard({ sessions }: { sessions: TimedSession[] }) {
  const records = durationRecords(sessions);
  return (
    <Panel title="Session records" caption="Per session type" note={<>Average, longest and shortest length of each kind of session you have timed.</>}>
      <ul className="space-y-2">
        {records.map((record) => (
          <li key={record.name} className="well rounded-lg px-3 py-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-sm font-semibold">{record.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {record.count} {record.count === 1 ? "session" : "sessions"}
              </span>
            </div>
            <div className="mt-1.5 grid grid-cols-3 gap-2 text-xs tabular-nums">
              <span>
                <span className="block text-xs text-muted-foreground">Average</span>
                <span className="font-semibold">{formatDuration(record.average)}</span>
              </span>
              <span>
                <span className="block text-xs text-muted-foreground">Longest</span>
                <span className="font-semibold">{formatDuration(record.longest.seconds)}</span>
              </span>
              <span>
                <span className="block text-xs text-muted-foreground">Shortest</span>
                <span className="font-semibold">{formatDuration(record.shortest.seconds)}</span>
              </span>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** The Time section of Progress. Only timed sessions count; older ones are not zeros. */
export function SessionTimeSection({ sessions, today }: { sessions: TimedSession[]; today: string }) {
  if (sessions.length === 0) {
    return (
      <EmptyChart>
        Session times start with your next workout: tap Start, train, tap Finish, and how long it took shows up here.
      </EmptyChart>
    );
  }
  return (
    <>
      <DurationTrendCard sessions={sessions} />
      <WeeklyHoursCard sessions={sessions} today={today} />
      <WhenYouTrainCard sessions={sessions} />
      <DurationRecordsCard sessions={sessions} />
    </>
  );
}

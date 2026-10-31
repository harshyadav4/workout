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
  // A long history is a cloud of dots around the average: a line through 150
  // workouts of different kinds only draws a solid band.
  const dense = points.length > 30;

  return (
    <Panel
      title="Workout length"
      caption={`Average ${formatDuration(average * 60)} · in minutes`}
      note={<>Time from Start to Finish. If you tapped Finish late, it ends after your last set and its rest.</>}
    >
      {points.length < 2 ? (
        <EmptyChart>Do 2 timed workouts to see a trend.</EmptyChart>
      ) : (
        <ResponsiveContainer width="100%" height={170}>
          <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -10 }}>
            <CartesianGrid {...gridProps} />
            <XAxis {...axisProps} dataKey="date" tickFormatter={formatDayKey} />
            <YAxis {...axisProps} width={36} allowDecimals={false} />
            <ReferenceLine y={average} stroke={CHART.series[1]} strokeDasharray="4 4" />
            <Tooltip content={<ChartTooltip unit="min" labelFormat={formatDayKey} />} />
            <Line dataKey="minutes" name="Length" stroke={accent} strokeWidth={dense ? 0 : 2} dot={{ r: dense ? 1.75 : 2.5, fill: accent, strokeWidth: 0 }} {...animationProps} />
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
      note={<>Hours of timed workouts per week, Monday to Sunday, for the last 12 weeks.</>}
    >
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={weeks} margin={{ top: 8, right: 8, bottom: 0, left: -6 }}>
          <CartesianGrid {...gridProps} />
          <XAxis {...axisProps} dataKey="week" tickFormatter={formatDayKey} />
          <YAxis {...axisProps} width={34} />
          <Tooltip cursor={{ fill: CHART.wash }} content={<ChartTooltip unit="h" labelFormat={(key) => `Week of ${formatDayKey(key)}`} />} />
          <Bar dataKey="hours" name="Trained" fill={accent} radius={[4, 4, 0, 0]} {...animationProps} />
        </BarChart>
      </ResponsiveContainer>
    </Panel>
  );
}

function WhenYouTrainCard({ sessions }: { sessions: TimedSession[] }) {
  const { accent } = useSection();
  const { counts, usualStartMinutes } = whenYouTrain(sessions);
  const most = Math.max(...Object.values(counts), 1);

  return (
    <Panel
      title="When you train"
      caption={usualStartMinutes !== undefined ? `Usual start: ${clockLabel(usualStartMinutes)}` : undefined}
      note={<>From the start time of each timed workout, on this phone's clock. Your usual start is the middle value.</>}
    >
      <ul className="space-y-2">
        {PARTS.map((part) => (
          <li key={part.id} className="grid grid-cols-[6rem_1fr_2rem] items-center gap-3 text-sm">
            <span>
              <span className="block font-semibold">{part.label}</span>
              <span className="block text-xs text-muted-foreground">{part.hours}</span>
            </span>
            <span className="h-1.5 overflow-hidden rounded-full bg-track">
              <span className="block h-full rounded-full" style={{ width: `${(counts[part.id] / most) * 100}%`, backgroundColor: accent }} />
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
    <Panel title="Length records" caption="Per workout type">
      <ul className="rows">
        {records.map((record) => (
          <li key={record.name} className="py-2.5 first:pt-0 last:pb-0">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-[15px] font-medium">{record.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {record.count} {record.count === 1 ? "workout" : "workouts"}
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
        Tap Start and Finish on your next workout to time it.
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

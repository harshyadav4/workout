"use client";

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { Panel } from "@/features/progress/panel";

import {
  CHART,
  ChartTooltip,
  HEAT,
  REST_CELL,
  animationProps,
  axisProps
} from "@/features/progress/chart-theme";
import {
  formatMonthKey,
  type CalendarWeek,
  type RestStats,
  type WeekdayStat
} from "@/lib/progress-metrics";
import { formatVolume } from "@/lib/utils";

const CELL = "h-[11px] w-[11px] rounded-[3px]";

function cellColor(level: number) {
  return level > 0 ? HEAT[Math.min(level, HEAT.length) - 1] : REST_CELL;
}

/**
 * The year at a glance — the one view on this page that answers "did I show up"
 * without a number. Scrolls horizontally: 52 columns do not fit a phone, and
 * squeezing them to fit turns the cells into dust.
 *
 * Every cell's value is also in the table at the foot of the page, so nothing
 * here is reachable only by hovering.
 */
export function ConsistencyCard({
  weeks,
  title = "Consistency",
  subject = "sessions"
}: {
  weeks: CalendarWeek[];
  title?: string;
  /** What a filled cell counts, so the drill-down can say "lat sessions". */
  subject?: string;
}) {
  const trained = weeks.flatMap((week) => week.days).filter((day) => day && day.volume > 0).length;
  const days = weeks.flatMap((week) => week.days).filter(Boolean).length;

  return (
    <Panel
      title={title}
      caption={`${trained} ${subject} across ${days} days · ${Math.round((trained / Math.max(days, 1)) * 100)}%`}
      note={
        <>
          One cell per day, a column per week, darker for a heavier day. Shading comes off the
          quartiles of the days you actually trained rather than off your single heaviest day —
          against the maximum, one outlier session would flatten everything else to the palest step
          and a good year would read as a year off. Tap a cell to name it; every value is also in the
          table at the foot of this page.
        </>
      }
    >
      <div>
        <div className="-mx-1 overflow-x-auto px-1 [mask-image:linear-gradient(to_right,black_calc(100%-14px),transparent)]">
          <div className="w-max">
            <div className="mb-1 flex gap-[3px]">
              {weeks.map((week, index) => {
                const month = formatMonthKey(week.start);
                const isNew = index === 0 || month !== formatMonthKey(weeks[index - 1].start);
                return (
                  <div
                    key={`month-${week.start}`}
                    className="w-[11px] overflow-visible whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground"
                  >
                    {isNew ? month : ""}
                  </div>
                );
              })}
            </div>

            <div className="flex gap-[3px]">
              {weeks.map((week) => (
                <div key={week.start} className="flex flex-col gap-[3px]">
                  {week.days.map((day, index) =>
                    day ? (
                      <div
                        key={day.date}
                        className={CELL}
                        style={{ backgroundColor: cellColor(day.level) }}
                        title={
                          day.volume > 0
                            ? `${day.date} · ${formatVolume(day.volume)} kg`
                            : `${day.date} · rest`
                        }
                      />
                    ) : (
                      <div key={`${week.start}-${index}`} className={CELL} />
                    )
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-end gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Rest
          </span>
          <span className={CELL} style={{ backgroundColor: REST_CELL }} aria-hidden />
          {HEAT.map((color) => (
            <span key={color} className={CELL} style={{ backgroundColor: color }} aria-hidden />
          ))}
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Heavy
          </span>
        </div>
      </div>
    </Panel>
  );
}

/**
 * Which days you actually train, and which you take off.
 *
 * The two thinnest columns are drawn in the de-emphasis grey and named in the
 * line below — the story here is the gap, not the total, and a chart of seven
 * identical bars would bury it.
 */
export function RhythmCard({ rhythm, rest }: { rhythm: WeekdayStat[]; rest: RestStats }) {
  const total = rhythm.reduce((sum, day) => sum + day.sessions, 0);

  if (total === 0) {
    return null;
  }

  const quietDays = [...rhythm].sort((a, b) => a.sessions - b.sessions).slice(0, 2);
  const isQuiet = (label: string) => quietDays.some((day) => day.label === label);

  return (
    <Panel
      title="Rhythm"
      caption={leaveCopy(quietDays)}
      note={
        <>
          Sessions logged on each weekday across the range. The two thinnest columns are drawn in
          the de-emphasis grey and named in the line above — the story here is the gap, not the
          total, and seven similar bars would bury it. The four figures below are the gaps between
          sessions: a gap counts the days <em>off</em>, so back-to-back days read as zero.
        </>
      }
    >
        <ResponsiveContainer width="100%" height={130}>
          <BarChart data={rhythm} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
            <XAxis {...axisProps} dataKey="label" minTickGap={0} />
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
              content={<ChartTooltip format={(value) => `${value} sessions`} />}
            />
            <Bar
              {...animationProps}
              dataKey="sessions"
              name="Sessions"
              radius={[4, 4, 0, 0]}
              maxBarSize={24}
            >
              {rhythm.map((day) => (
                <Cell
                  key={day.label}
                  fill={isQuiet(day.label) ? CHART.quiet : CHART.accent}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Stat label="Sessions / week" value={rest.sessionsPerWeek.toFixed(1)} />
          <Stat label="Rest between" value={`${rest.averageGap.toFixed(1)} days`} />
          <Stat label="Longest layoff" value={`${rest.longestGap} days`} />
          <Stat
            label="Since last"
            value={rest.daysSinceLast === undefined ? "—" : `${rest.daysSinceLast} days`}
          />
        </div>
    </Panel>
  );
}

function leaveCopy(quietDays: WeekdayStat[]) {
  const off = quietDays.filter((day) => day.sessions === 0).map((day) => day.label);

  if (off.length === 2) {
    return `${off[0]} and ${off[1]} are your rest days — you never trained either in this range.`;
  }

  if (off.length === 1) {
    return `${off[0]} is the day you always take off.`;
  }

  return `You train every day of the week at some point; ${quietDays[0].label} is the one you skip most.`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-secondary/40 p-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1.5 text-lg font-semibold leading-none">{value}</p>
    </div>
  );
}

"use client";

import { useState, type PointerEvent } from "react";

import { daysBetween, formatDayKey, shiftKey } from "@/lib/progress-metrics";
import type { PainLog } from "@/lib/types";

const WEEKS = 8;
const WIDTH = 326;
const LEFT = 2;
const RIGHT = 26;
const TOP = 10;
const BOTTOM = 22;
/** The Muscles card's colour, so this reads the same here and on Progress. */
const ACCENT = "rgb(var(--s-body))";
const GRID = [0, 5, 10];

/** The scores of the last 8 weeks, or fewer than two if there is no line to draw. */
export function painChartPoints(logs: PainLog[], today: string): PainLog[] {
  const from = shiftKey(today, -7 * WEEKS);
  return logs.filter((log) => log.date >= from);
}

/**
 * One injury's scores over the last 8 weeks: one line and one 0 to 10 axis, with
 * the value under a finger named in words. Plain SVG, because this sits in a
 * sheet on You, which has no other reason to load the chart library. Pass an
 * injury's logs oldest first, and check `painChartPoints` for two or more first.
 */
export function PainChart({ logs, today, height = 118 }: { logs: PainLog[]; today: string; height?: number }) {
  const [active, setActive] = useState<number>();
  const points = painChartPoints(logs, today);

  if (points.length < 2) {
    return null;
  }

  const span = Math.max(daysBetween(points[0].date, today), 1);
  const x = (date: string) => LEFT + (daysBetween(points[0].date, date) * (WIDTH - LEFT - RIGHT)) / span;
  const y = (score: number) => TOP + ((10 - score) * (height - TOP - BOTTOM)) / 10;
  const last = points[points.length - 1];

  const point = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const at = ((event.clientX - box.left) / box.width) * WIDTH;
    let nearest = 0;
    points.forEach((item, index) => {
      if (Math.abs(x(item.date) - at) < Math.abs(x(points[nearest].date) - at)) {
        nearest = index;
      }
    });
    setActive(nearest);
  };

  const shown = active === undefined ? undefined : points[active];
  // The bubble slides over its own point as it nears an edge, so it stays inside.
  const across = shown ? x(shown.date) / WIDTH : 0;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${WIDTH} ${height}`}
        className="block h-auto w-full touch-pan-y overflow-visible"
        role="img"
        aria-label={`Pain score over time. Now ${last.score} of 10, first ${points[0].score} of 10.`}
        onPointerMove={point}
        onPointerDown={point}
        onPointerLeave={() => setActive(undefined)}
      >
        {GRID.map((value) => (
          <g key={value}>
            <line
              x1={LEFT}
              x2={WIDTH - RIGHT}
              y1={y(value)}
              y2={y(value)}
              stroke="var(--chart-grid)"
              strokeWidth="1"
            />
            <text x={WIDTH} y={y(value) + 4} textAnchor="end" fontSize="11.5" fill="var(--chart-axis)">
              {value}
            </text>
          </g>
        ))}
        <path
          d={points.map((item, index) => `${index ? "L" : "M"}${x(item.date).toFixed(1)} ${y(item.score).toFixed(1)}`).join(" ")}
          fill="none"
          stroke={ACCENT}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx={x(last.date)} cy={y(last.score)} r="4.5" fill={ACCENT} />
        {shown ? <circle cx={x(shown.date)} cy={y(shown.score)} r="4.5" fill={ACCENT} /> : null}
        <text x={LEFT} y={height - 4} fontSize="11.5" fill="var(--chart-axis)">
          {formatDayKey(points[0].date)}
        </text>
        <text x={WIDTH - RIGHT} y={height - 4} textAnchor="end" fontSize="11.5" fill="var(--chart-axis)">
          {formatDayKey(today)}
        </text>
      </svg>
      {shown ? (
        <div
          className="plaque-solid pointer-events-none absolute z-10 whitespace-nowrap rounded-xl px-2.5 py-1 text-[12.5px] font-medium tabular-nums"
          style={{
            left: `${across * 100}%`,
            top: `${(y(shown.score) / height) * 100}%`,
            transform: `translate(${-across * 100}%, -130%)`
          }}
        >
          {formatDayKey(shown.date)} · {shown.score} of 10
        </div>
      ) : null}
    </div>
  );
}

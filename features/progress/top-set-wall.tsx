"use client";

import { CHART, EmptyChart } from "@/features/progress/chart-theme";
import { Panel } from "@/features/progress/panel";
import { buildTopSetSeries, type ExerciseTotal, type TopSetPoint } from "@/lib/progress-metrics";
import type { WorkoutLog } from "@/lib/types";

const TILE = { width: 96, height: 34 };
const LIMIT = 15;

/**
 * Every lift's top set at once.
 *
 * Small multiples: fifteen shapes on one screen beat one big chart you have to
 * tap through fifteen times, and comparing trajectories is the entire question —
 * which lifts are climbing, which have gone flat, which are falling.
 *
 * Each tile is scaled to its own lift, never to a shared axis. A 4 kg gain on a
 * curl and a 40 kg gain on a deadlift are both real progress, and one shared
 * scale would flatten every accessory to a horizontal line. The tile shows the
 * *shape*; the number under it shows the *size*. Both are needed and neither is
 * enough alone.
 *
 * ponytail: hand-rolled `<polyline>`. The page already mounts eight recharts
 * containers; fifteen more `ResponsiveContainer`s — each with its own
 * ResizeObserver — to draw fifteen paths with no axes, no tooltip and no legend
 * would be a dependency doing nothing a `<svg>` does not.
 */
export function TopSetWall({
  logs,
  exercises
}: {
  logs: WorkoutLog[];
  exercises: ExerciseTotal[];
}) {
  const tiles = exercises
    .slice(0, LIMIT)
    .map((exercise) => ({
      exercise,
      points: buildTopSetSeries(logs, exercise.workoutId)
    }))
    .filter((tile) => tile.points.length >= 2)
    .map((tile) => {
      const first = tile.points[0].weight;
      const last = tile.points[tile.points.length - 1].weight;
      return { ...tile, first, last, change: first > 0 ? ((last - first) / first) * 100 : 0 };
    })
    .sort((a, b) => b.change - a.change);

  return (
    <Panel
      title="Every lift at once"
      caption="Top set over the range, one tile per lift"
      note={
        <>
          The heaviest set of each session, per lift, steepest gain first. Each tile is scaled to its
          own lift rather than to a shared axis — a 4 kg gain on a curl and a 40 kg gain on a
          deadlift are both real, and one scale would flatten every accessory to a flat line. Read
          the tile for the shape and the number for the size. Top set lifted, not an estimated 1RM:
          a log stores reps for the whole exercise rather than per set, so Epley here would be a
          guess wearing a formula.
        </>
      }
    >
      {tiles.length === 0 ? (
        <EmptyChart>
          Two sessions of the same lift are needed before there is a shape to draw.
        </EmptyChart>
      ) : (
        <ul className="grid grid-cols-2 gap-x-3 gap-y-2">
          {tiles.map((tile) => (
            <li key={tile.exercise.workoutId}>
              <p className="truncate text-[11px] font-medium" title={tile.exercise.name}>
                {tile.exercise.name}
              </p>
              <Sparkline points={tile.points} gained={tile.change >= 0} />
              <p className="font-mono text-[10px] tabular-nums text-muted-foreground">
                {tile.first}→{tile.last} kg{" "}
                <span style={{ color: tile.change >= 0 ? "#3fbf6f" : "#e8785a" }}>
                  {tile.change >= 0 ? "+" : ""}
                  {tile.change.toFixed(0)}%
                </span>
              </p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/**
 * The line, and the two points that bound it. No axis: a tile this size cannot
 * carry tick labels, and the kilos are printed underneath where they are legible.
 */
function Sparkline({ points, gained }: { points: TopSetPoint[]; gained: boolean }) {
  const weights = points.map((point) => point.weight);
  const low = Math.min(...weights);
  const high = Math.max(...weights);
  const span = high - low || 1;
  const inset = 3;

  const coords = points.map((point, index) => {
    const x = (index / (points.length - 1)) * (TILE.width - inset * 2) + inset;
    const y = TILE.height - inset - ((point.weight - low) / span) * (TILE.height - inset * 2);
    return [x, y] as const;
  });

  const stroke = gained ? CHART.accent : CHART.quiet;

  return (
    <svg
      viewBox={`0 0 ${TILE.width} ${TILE.height}`}
      className="my-1 h-[34px] w-full"
      preserveAspectRatio="none"
      role="img"
      aria-label={`${points.length} sessions, ${low} kg to ${high} kg`}
    >
      <polyline
        points={coords.map(([x, y]) => `${x},${y}`).join(" ")}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={coords[coords.length - 1][0]} cy={coords[coords.length - 1][1]} r={2} fill={stroke} />
    </svg>
  );
}

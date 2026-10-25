"use client";

import {
  Cell,
  LabelList,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip
} from "recharts";

import { Bullet } from "@/features/progress/bullet";
import {
  ChartTooltip,
  EmptyChart,
  GROUP_COLORS,
  animationProps,
  formatCompact
} from "@/features/progress/chart-theme";
import { Panel } from "@/features/progress/panel";
import {
  WEEKLY_SET_TARGET,
  type GroupSets,
  type HeadStimulusReport,
  type MuscleGroupVolume
} from "@/lib/progress-metrics";
import type { Suggestion } from "@/lib/suggestions";

/** Headroom past the band, so a group inside it never pins to the right edge. */
const SETS_HEADROOM = 6;

/**
 * Hard sets per muscle group per week, against the 10–20 band.
 *
 * The one chart here you can act on: a group left of the band is
 * under-stimulated, a group right of it is spending recovery you could put
 * somewhere else.
 *
 * Was a horizontal bar chart with a `ReferenceArea`; now six bullets. Same data,
 * a third of the height, and — the actual reason — the drill-down measures the
 * identical thing for one muscle and used to draw it as a 180px radial gauge.
 * One measurement rendered as two unrelated shapes reads as two measurements.
 */
/**
 * The same measurement one level down: sets per **head**, and the one your
 * selection is leaving behind.
 *
 * Group level hides the finding the per-muscle model exists to produce — that
 * all fourteen chest sets were flat pressing and the upper pec got none.
 *
 * **The wording is deliberate and is not decoration.** Per-head engagement comes
 * from regexes against exercise names, not from measurement, so this says which
 * region your selection is *biased toward*. It must never say a muscle
 * "received" a share of stimulus. The same standard is why this codebase does
 * not call ACWR injury risk.
 */
export function HeadStimulusCard({
  report,
  suggestions = []
}: {
  report: HeadStimulusReport;
  /** Lifts already in the library that lean toward the lowest head. */
  suggestions?: Suggestion[];
}) {
  if (report.heads.length === 0) {
    return null;
  }

  const ceiling = Math.max(
    ...report.heads.map((head) => head.setsPerWeek),
    WEEKLY_SET_TARGET.high + SETS_HEADROOM
  );

  return (
    <Panel
      title="Weekly sets per head"
      caption={`Against the same ${WEEKLY_SET_TARGET.low}–${WEEKLY_SET_TARGET.high} band`}
      note={
        <>
          Which heads your exercise <em>selection</em> leans on, not a measurement of stimulus.
          Engagement per head is derived from the exercise&apos;s name and the muscles its template
          declares — a regex, not a sensor — so read this as &ldquo;my choices are biased toward the
          front delt&rdquo; rather than as a share of anything received. Only heads you actually
          train appear: a muscle you have never worked is not under-stimulated, it is simply not
          part of your programme.
        </>
      }
    >
      <div className="space-y-0.5">
        {report.heads.map((head) => (
          <Bullet
            key={head.muscleId}
            label={head.name}
            value={head.setsPerWeek}
            band={WEEKLY_SET_TARGET}
            ceiling={ceiling}
          />
        ))}
      </div>

      {report.lowest ? (
        <p className="mt-3 rounded-xl bg-warning/10 px-3 py-2 text-xs leading-relaxed ring-1 ring-warning/25">
          <span className="font-semibold text-warning">
            {report.lowest.name}: {report.lowest.setsPerWeek.toFixed(1)} sets a week
          </span>{" "}
          <span className="text-muted-foreground">
            — the least of anything you train, and under the {WEEKLY_SET_TARGET.low}-set floor. Your
            selection is biased away from it.
          </span>
          {suggestions.length > 0 ? (
            <span className="mt-1.5 block text-muted-foreground">
              These lifts in your library bias toward it:{" "}
              <span className="text-foreground">
                {suggestions.map((item) => item.name).join(", ")}
              </span>
              .
            </span>
          ) : null}
        </p>
      ) : null}
    </Panel>
  );
}

export function WeeklySetsCard({ sets }: { sets: GroupSets[] }) {
  const worked = sets.some((group) => group.setsPerWeek > 0);
  const ceiling = Math.max(
    ...sets.map((group) => group.setsPerWeek),
    WEEKLY_SET_TARGET.high + SETS_HEADROOM
  );

  return (
    <Panel
      title="Weekly sets per group"
      caption={`Against the ${WEEKLY_SET_TARGET.low}–${WEEKLY_SET_TARGET.high} band`}
      note={
        <>
          A set counts for a muscle group when the lift works it at 50+ engagement, and half when it
          works it at 25+ — the usual direct/indirect convention, so a lateral raise is not counted
          as triceps work just because the triceps came along. Credit is the highest of a
          group&apos;s muscles rather than their sum, otherwise a four-set bench press would report
          as eight sets of chest. The band is the 10–20 hard sets a week most hypertrophy reviews
          converge on.
        </>
      }
    >
      {worked ? (
        <div className="space-y-0.5">
          {sets.map((group) => (
            <Bullet
              key={group.group}
              label={group.label}
              value={group.setsPerWeek}
              band={WEEKLY_SET_TARGET}
              ceiling={ceiling}
            />
          ))}
        </div>
      ) : (
        <EmptyChart>Nothing logged in this range.</EmptyChart>
      )}
    </Panel>
  );
}

/** Below this share of the longest arc, a name will not fit inside it. */
const LABEL_FLOOR = 0.4;

/**
 * The six groups as concentric arcs, longest on the outside.
 *
 * Angle is what compares across rings; radius is only stacking order. The arcs
 * take the group palette so this card and the drift chart agree on what colour
 * "back" is — the split and its history should not need two different keys.
 */
export function MuscleSplitCard({ groups }: { groups: MuscleGroupVolume[] }) {
  const total = groups.reduce((sum, group) => sum + group.volume, 0);

  if (total === 0) {
    return null;
  }

  const ceiling = Math.max(...groups.map((group) => group.volume));
  // A short arc has no room for a word, so its name only appears in the legend —
  // a clipped "Shoulders" is worse than no label at all.
  const ranked = [...groups]
    .sort((a, b) => a.volume - b.volume)
    .map((group) => ({
      ...group,
      arcLabel: group.volume / ceiling >= LABEL_FLOOR ? group.label : "",
      fill: GROUP_COLORS[group.group]
    }));
  const lead = ranked[ranked.length - 1];

  return (
    <Panel
      title="The split"
      caption={`${lead.label} takes the most at ${Math.round((lead.volume / total) * 100)}%`}
      note={
        <>
          Share of the range&apos;s volume by muscle group, weighted by how hard each lift works the
          group. This is the shape of your training right now; the drift chart above is how it got
          here. Legacy coarse muscle ids resolve into the current taxonomy, so old logs still count.
        </>
      }
    >
      <ResponsiveContainer width="100%" height={230}>
        <RadialBarChart
          data={ranked}
          innerRadius="24%"
          outerRadius="100%"
          startAngle={90}
          endAngle={-270}
          barSize={13}
        >
          <PolarAngleAxis type="number" domain={[0, ceiling]} tick={false} axisLine={false} />
          <Tooltip content={<ChartTooltip format={formatCompact} unit=" kg" />} />
          <RadialBar
            {...animationProps}
            dataKey="volume"
            name="Volume"
            background={{ fill: "rgba(255,255,255,0.04)" }}
            cornerRadius={6}
          >
            {ranked.map((group) => (
              <Cell key={group.group} fill={group.fill} />
            ))}
            <LabelList
              dataKey="arcLabel"
              position="insideStart"
              fill="rgba(255,255,255,0.92)"
              fontSize={9}
              fontFamily="var(--font-sans)"
              offset={8}
            />
          </RadialBar>
        </RadialBarChart>
      </ResponsiveContainer>

      {/* The arcs read by hover; this reads without it, and names the short ones. */}
      <ul className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1.5">
        {[...ranked].reverse().map((group) => (
          <li key={group.group} className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: group.fill }}
              aria-hidden
            />
            <span className="truncate text-[11px] text-muted-foreground">{group.label}</span>
            <span className="ml-auto shrink-0 text-[10px] tabular-nums">
              {Math.round((group.volume / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

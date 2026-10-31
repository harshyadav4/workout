"use client";

import { PainChart, painChartPoints } from "@/features/injuries/pain-chart";
import { Panel, SectionRule } from "@/features/progress/panel";
import { useWorkoutStore } from "@/features/workout/workout-store";
import { activeInjuries, injuryName, painChangeWords, painLogsFor, shouldSeePhysio } from "@/lib/injuries";

/**
 * Pain inside the Muscles card: one panel for each injury still hurting. No new
 * card or tab, and nothing at all for someone with no injury. If pain is no better
 * after 3 weeks, one plain line says to see a physio. A stop sign means the app
 * gives no advice, so that injury shows only its own numbers.
 */
export function PainPanels() {
  const injuries = useWorkoutStore((state) => state.injuries);
  const painLogs = useWorkoutStore((state) => state.painLogs);
  const today = useWorkoutStore((state) => state.activeDate);

  const shown = activeInjuries(injuries)
    .map((injury) => ({ injury, logs: painLogsFor(painLogs, injury.id) }))
    .filter(({ logs }) => logs.length > 0);

  if (shown.length === 0) {
    return null;
  }

  return (
    <>
      <SectionRule label="Pain" hint="your own 0 to 10 score" />
      {shown.map(({ injury, logs }) => {
        const points = painChartPoints(logs, today);
        const words = painChangeWords(points);
        const latest = logs[logs.length - 1];
        return (
          <Panel
            key={injury.id}
            title={injuryName(injury)}
            note={
              <>
                <p>This is the score you gave, from 0 (no pain) to 10 (the worst).</p>
                <p>Arise does not diagnose. If pain stays or gets worse, see a doctor or physio.</p>
              </>
            }
          >
            <p className="text-[30px] font-medium leading-tight tracking-tight tabular-nums">
              {latest.score}{" "}
              <span className="text-sm font-normal tracking-normal text-muted-foreground">
                of 10{words ? ` · ${words}` : ""}
              </span>
            </p>
            {points.length >= 2 ? (
              <div className="mt-2">
                <PainChart logs={logs} today={today} height={104} />
              </div>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">Log it each week, and your trend shows here.</p>
            )}
            {!injury.stopSign && shouldSeePhysio(injury, painLogs) ? (
              <p className="notice-line mt-3 font-medium">It is worth seeing a physio about this.</p>
            ) : null}
          </Panel>
        );
      })}
    </>
  );
}

"use client";

import { CHART, EmptyChart, useSection } from "@/features/progress/chart-theme";
import { Panel } from "@/features/progress/panel";
import { useDistanceUnit } from "@/features/workout/use-distance-unit";
import { formatDistance, type DistanceUnit } from "@/lib/cardio";
import { RIEGEL_EXPONENT, VDOT_MIN_KM, type BestVdot, type PaceZone, type RacePrediction } from "@/lib/cardio-science";
import { formatDayKey } from "@/lib/progress-metrics";
import { cn } from "@/lib/utils";

/** The Cardio group of the Progress science cards. Needs one run of at least 1.5 km with a time. */

function clockLong(seconds: number) {
  const whole = Math.round(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = whole % 60;
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}` : `${minutes}:${String(rest).padStart(2, "0")}`;
}

/** Seconds per km → "5:42" in the unit on screen. */
function paceLabel(secondsPerKm: number, unit: DistanceUnit) {
  const perUnit = Math.round(unit === "mi" ? secondsPerKm * 1.609344 : secondsPerKm);
  return `${Math.floor(perUnit / 60)}:${String(perUnit % 60).padStart(2, "0")}`;
}

const NEED = <EmptyChart>A timed run of at least {VDOT_MIN_KM} km.</EmptyChart>;

// -- VDOT -------------------------------------------------------------------------

export function VdotCard({ best }: { best?: BestVdot }) {
  const unit = useDistanceUnit();
  return (
    <Panel
      title="VO₂max estimate"
      caption={best ? `VDOT from your ${formatDistance(best.session.km, unit)} in ${clockLong(best.session.seconds)} on ${formatDayKey(best.session.date)}` : "Daniels' VDOT, from your best run"}
      note={
        <>
          Jack Daniels&apos; VDOT: the oxygen cost of your pace (Daniels &amp; Gilbert&apos;s running equation)
          divided by the share of VO₂max a runner can hold for that long. It is only right for an
          all-out effort, so it is taken from the run that scores highest and names it — if that was
          an easy jog, the real number is higher. Untrained adults sit around 35–40; 50 is a 20-minute
          5 km; elites are 70–85.
        </>
      }
    >
      {!best ? (
        NEED
      ) : (
        <div className="flex items-baseline gap-2">
          <span className="plot-n">{best.vdot.toFixed(1)}</span>
          <span className="text-sm text-muted-foreground">ml O₂ per kg per minute, estimated</span>
        </div>
      )}
    </Panel>
  );
}

// -- race predictor ---------------------------------------------------------------------

export function RacePredictorCard({ best, predictions }: { best?: BestVdot; predictions: RacePrediction[] }) {
  const unit = useDistanceUnit();
  return (
    <Panel
      title="Race predictor"
      caption={best ? `From your ${formatDistance(best.session.km, unit)} in ${clockLong(best.session.seconds)}` : "Riegel's formula, from your best run"}
      note={
        <>
          Riegel (1981): time for a new distance = your time × (new ÷ old)^{RIEGEL_EXPONENT}. It assumes
          you are trained for the longer distance; past about three times the distance it came from
          it flatters, and those rows say so. A 5 km in 20:00 predicts a 10 km in about 41:40.
        </>
      }
    >
      {!best ? (
        NEED
      ) : (
        <ul className="rows">
          {predictions.map((race) => (
            <li key={race.label} className="flex items-baseline justify-between gap-3 py-1.5">
              <span className="text-sm">
                {race.label}
                {race.stretch ? <span className="ml-1.5 text-[11px] text-muted-foreground">if trained for it</span> : null}
              </span>
              <span className={cn("text-sm font-semibold tabular-nums", race.stretch && "text-muted-foreground")}>{clockLong(race.seconds)}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

// -- pace zones ---------------------------------------------------------------------------

export function PaceZonesCard({ zones }: { zones: PaceZone[] }) {
  const unit = useDistanceUnit();
  const { heat } = useSection();
  const colors = [CHART.quiet, heat[0], heat[1], heat[2], heat[3]];
  const slowest = zones.length > 0 ? zones[0].slow : 1;
  const fastest = zones.length > 0 ? zones[zones.length - 1].fast : 0;
  const span = Math.max(1, slowest - fastest);
  return (
    <Panel
      title="Training paces"
      caption={zones.length > 0 ? `Per ${unit}, from your VDOT` : "Daniels' five zones, from your VDOT"}
      note={
        <>
          Daniels&apos; intensities as a share of VDOT, turned back into pace: Easy 59–74 % for the bulk
          of your running, Marathon 75–84 %, Threshold 83–88 % (comfortably hard, 20–60 minutes),
          Interval 95–100 % (3–5 minute reps), Repetition 105–110 % (short, fast, full recovery).
        </>
      }
    >
      {zones.length === 0 ? (
        NEED
      ) : (
        <ul className="space-y-2">
          {zones.map((zone, index) => (
            <li key={zone.id}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm">
                  <span className="mr-1.5 inline-block w-4 text-center font-semibold" style={{ color: colors[index] }}>{zone.id}</span>
                  {zone.label}
                </span>
                <span className="text-sm font-semibold tabular-nums">
                  {paceLabel(zone.fast, unit)}–{paceLabel(zone.slow, unit)}
                </span>
              </div>
              <div className="relative mt-1 h-2 rounded-full bg-track" aria-hidden>
                <span
                  className="absolute inset-y-0 rounded-full"
                  style={{
                    left: `${((slowest - zone.slow) / span) * 100}%`,
                    width: `${Math.max(2, ((zone.slow - zone.fast) / span) * 100)}%`,
                    backgroundColor: colors[index]
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

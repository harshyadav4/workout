"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";

import { Segmented } from "@/components/ui/segmented";
import { BackBody, FrontBody } from "@/features/body/lazy";
import {
  VIEW_SIZE,
  litMuscles,
  markPoints,
  nearestPlace,
  sideOfHalf,
  viewOfPlace,
  type BodyView
} from "@/features/injuries/body-places";
import { INJURY_PLACES, injuryName } from "@/lib/injuries";
import type { InjuryPlace, InjurySide } from "@/lib/types";

export interface BodyPick {
  place: InjuryPlace;
  /** Absent on a place on the body's middle line. */
  side?: InjurySide;
}

const SIDES: { id: InjurySide; label: string }[] = [
  { id: "left", label: "Left" },
  { id: "right", label: "Right" },
  { id: "both", label: "Both" }
];

const PLACE_OPTIONS = (Object.keys(INJURY_PLACES) as InjuryPlace[]).map((place) => ({
  place,
  label: injuryName({ place })
}));

/** Light the picked muscles, on the picked side only. The map's own props would light both sides. */
function paint(root: HTMLElement, view: BodyView, pick?: BodyPick) {
  const muscles = pick ? litMuscles(pick.place, view) : [];
  const middle = pick ? INJURY_PLACES[pick.place].middle : false;
  root.querySelectorAll<SVGGraphicsElement>("[data-muscle]").forEach((path) => {
    let lit = muscles.includes(path.getAttribute("data-muscle") as (typeof muscles)[number]);
    if (lit && !middle && pick?.side !== "both") {
      const box = path.getBBox();
      lit = sideOfHalf(view, box.x + box.width / 2 < VIEW_SIZE[view].width / 2) === pick?.side;
    }
    path.style.color = lit ? "var(--map-select)" : "";
  });
}

function Figure({
  view,
  pick,
  marked,
  onTap
}: {
  view: BodyView;
  pick?: BodyPick;
  /** The drawing that was tapped holds the mark, since a knee is on both. */
  marked: boolean;
  onTap: (view: BodyView, x: number, y: number) => void;
}) {
  const body = useRef<HTMLDivElement>(null);
  const Drawing = view === "front" ? FrontBody : BackBody;
  const { width, height } = VIEW_SIZE[view];

  // The drawing loads late on first use, so paint again when it arrives.
  useEffect(() => {
    const root = body.current;
    if (!root) {
      return;
    }
    paint(root, view, pick);
    const observer = new MutationObserver(() => paint(root, view, pick));
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pick, view]);

  const tap = (event: MouseEvent<HTMLDivElement>) => {
    const box = body.current?.getBoundingClientRect();
    if (box) {
      onTap(view, ((event.clientX - box.left) / box.width) * width, ((event.clientY - box.top) / box.height) * height);
    }
  };

  const marks = pick && marked ? markPoints(pick.place, pick.side, view) : [];
  const [yourLeft, yourRight] = view === "front" ? ["Right", "Left"] : ["Left", "Right"];

  return (
    <div className="min-w-0 cursor-pointer touch-manipulation select-none" onClick={tap} aria-hidden>
      <div className="flex justify-between px-3 pb-0.5 text-[11.5px] text-muted-foreground">
        <span>{yourLeft}</span>
        <span className="font-semibold">{view === "front" ? "Front" : "Back"}</span>
        <span>{yourRight}</span>
      </div>
      <div className="relative mx-auto h-[13.5rem]" style={{ aspectRatio: `${width} / ${height}` }}>
        <div ref={body} className="h-full w-full">
          <Drawing className="block h-full w-full" />
        </div>
        {marks.map(([x, y]) => (
          <span
            key={`${x}-${y}`}
            className="pointer-events-none absolute -ml-1.5 -mt-1.5 h-3 w-3 rounded-full bg-[var(--map-select)] shadow-[0_0_0_2px_hsl(var(--card)),0_0_0_4px_var(--map-select)]"
            style={{ left: `${(x / width) * 100}%`, top: `${(y / height) * 100}%` }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Tap where it hurts. The app's own two drawings; a tap goes to the nearest
 * place, and the name below says what the app understood, so a wrong side is
 * easy to see and fix. The drawings cannot be read by a screen reader or a
 * keyboard, so a real list of places sits behind them and does the same job.
 */
export function BodyPicker({ value, onChange }: { value?: BodyPick; onChange: (pick: BodyPick) => void }) {
  const [view, setView] = useState<BodyView>(() => (value ? viewOfPlace(value.place) : "front"));
  const middle = value ? INJURY_PLACES[value.place].middle : false;

  const tap = (tapped: BodyView, x: number, y: number) => {
    const { place, side } = nearestPlace(tapped, x, y);
    setView(tapped);
    onChange({ place, side });
  };

  return (
    <div>
      <select
        className="peer sr-only"
        aria-label="Where does it hurt?"
        value={value?.place ?? ""}
        onChange={(event) => {
          const place = event.target.value as InjuryPlace;
          setView(viewOfPlace(place));
          onChange({ place, side: INJURY_PLACES[place].middle ? undefined : value?.side ?? "left" });
        }}
      >
        <option value="" disabled>
          Choose a place
        </option>
        {PLACE_OPTIONS.map((option) => (
          <option key={option.place} value={option.place}>
            {option.label}
          </option>
        ))}
      </select>
      <div className="-mx-1.5 grid grid-cols-2 gap-0.5 rounded-2xl peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
        <Figure view="front" pick={value} marked={view === "front"} onTap={tap} />
        <Figure view="back" pick={value} marked={view === "back"} onTap={tap} />
      </div>
      {/* Side moves under the name when both cannot share a line. */}
      <div className="mt-1 flex min-h-12 flex-wrap items-center gap-x-2.5 gap-y-1">
        <p
          aria-live="polite"
          className={value ? "font-heading flex-[1_1_9rem] text-[23px] leading-tight" : "flex-[1_1_9rem] text-[15px] text-muted-foreground"}
        >
          {value ? injuryName(value) : "Nothing picked yet"}
        </p>
        {value && !middle ? (
          <Segmented
            quiet
            aria-label="Side"
            className="grow basis-[186px]"
            options={SIDES}
            value={value.side ?? "left"}
            onChange={(side) => onChange({ place: value.place, side })}
          />
        ) : null}
      </div>
    </div>
  );
}
